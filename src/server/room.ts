import { Server, type Connection, type ConnectionContext } from "partyserver";
import {
  GRACE_MS,
  MAX_HISTORY,
  MAX_MESSAGE_BYTES,
  MAX_PLAYERS,
  PARTY_TTL_MS,
  SEAT_COLORS,
  type ClientMsg,
  type Player,
  type RoomState,
  type RoundResult,
  type ServerMsg,
} from "../shared/protocol";

interface ConnState {
  role: "pending" | "host" | "controller";
  playerId: string | null;
  /** Replaced sockets remain briefly visible while their close event arrives. */
  superseded: boolean;
  /** Used to evict unauthenticated sockets before they can occupy the room. */
  connectedAt: number;
  /** A known player without a current seat waits on this live socket. */
  waiting?: {
    playerId: string;
    key: string;
    name?: string;
    at: number;
  };
  rate?: RateState;
  writes?: RateState;
}

interface RateState {
  tokens: number;
  at: number;
}

const MAX_CONNECTIONS = 32;
const HELLO_TIMEOUT_MS = 10_000;
// Kart controllers intentionally coalesce at 20 Hz. Keep a little per-phone
// headroom, then size the room ceiling to the sum of ten phones plus the host.
const CONTROLLER_RATE = { refill: 22, burst: 44 };
const HOST_RATE = { refill: 30, burst: 60 };
const WRITE_RATE = { refill: 5, burst: 10 };
const ROOM_RATE = { refill: 260, burst: 520 };
const ROOM_CONTROLLER_WRITE_RATE = { refill: 10, burst: 40 };
const ROOM_HOST_WRITE_RATE = { refill: 5, burst: 10 };

/**
 * One Durable Object per party — not per game.
 *
 * The room code is minted once on the projector and stays live all night. Games
 * are loaded and unloaded inside it; the DO holds the roster, the running
 * leaderboard and the history of every round played, so a laptop refresh or a
 * cold Durable Object doesn't cost anyone their score.
 *
 * The DO is not the source of truth for any simulation — the host screen runs
 * that, and the DO just routes `g` messages to it.
 */
export class Room extends Server<Env> {
  static options = { hibernate: true };

  state: RoomState = freshState();

  /**
   * Device key -> player id. This is what makes identity durable: the phone
   * generates a key once and keeps it, so the same handset reclaims the same
   * name, colour and score after a lock screen, a reload, or a party that
   * picked back up the next evening.
   */
  private seats: Record<string, string> = {};
  /** Expired players keep their durable identity even after their seat is reused. */
  private archived: Record<string, Player> = {};
  /** Only a digest is durable; the host bearer is returned once at creation. */
  private hostTokenHash: ArrayBuffer | null = null;
  /** Aggregate budgets prevent reconnects from minting fresh socket bursts. */
  private roomRate: RateState | undefined;
  private roomControllerWrites: RateState | undefined;
  private roomHostWrites: RateState | undefined;
  /** The party remains recoverable until this persisted idle deadline. */
  private expiresAt = Date.now() + PARTY_TTL_MS;

  async onStart() {
    const saved = await this.ctx.storage.get<RoomState>("state");
    const seats = await this.ctx.storage.get<Record<string, string>>("seats");
    const archived = await this.ctx.storage.get<Record<string, Player>>("archived");
    const hostTokenHash = await this.ctx.storage.get<ArrayBuffer>("hostTokenHash");
    const expiresAt = await this.ctx.storage.get<number>("expiresAt");
    if (saved) this.state = saved;
    if (seats) this.seats = seats;
    if (archived) this.archived = archived;
    if (hostTokenHash) this.hostTokenHash = hostTokenHash;
    const migratedExpiry = !expiresAt;
    if (expiresAt) this.expiresAt = expiresAt;
    this.state.activeRound ??= null;
    this.state.code = this.name;

    // Hibernating sockets retain ConnState in their attachment. Rebuild
    // presence from those attachments instead of assuming a cold DO has no
    // clients, while treating a truly missing socket as a fresh disconnect.
    const live = new Set<string>();
    for (const c of this.getConnections<ConnState>()) {
      const cs = c.state;
      if (cs?.role === "controller" && cs.playerId && !cs.superseded) live.add(cs.playerId);
    }
    let changed = false;
    for (const p of this.state.players) {
      if (live.has(p.id)) {
        if (!p.connected || p.awayAt !== null) {
          p.connected = true;
          p.awayAt = null;
          changed = true;
        }
      } else if (p.connected) {
        p.connected = false;
        p.awayAt = Date.now();
        changed = true;
      }
    }
    if (changed) {
      await this.save();
    } else if (migratedExpiry) {
      await this.ctx.storage.put("expiresAt", this.expiresAt);
      await this.ctx.storage.setAlarm(this.nextAlarmAt());
    }
  }

  /** Atomically reserve a fresh named room before its first socket connects. */
  async provision(hostTokenHash: ArrayBuffer): Promise<boolean> {
    const [existingToken, existingState] = await Promise.all([
      this.ctx.storage.get("hostTokenHash"),
      this.ctx.storage.get("state"),
    ]);
    if (existingToken || existingState) return false;

    this.hostTokenHash = hostTokenHash;
    this.expiresAt = Date.now() + PARTY_TTL_MS;
    await this.ctx.storage.put({ hostTokenHash, expiresAt: this.expiresAt });
    await this.ctx.storage.setAlarm(this.expiresAt);
    return true;
  }

  private async save() {
    this.expiresAt = Date.now() + PARTY_TTL_MS;
    await this.ctx.storage.put({
      state: this.state,
      seats: this.seats,
      archived: this.archived,
      hostTokenHash: this.hostTokenHash,
      expiresAt: this.expiresAt,
    } as Record<string, unknown>);
    await this.ctx.storage.setAlarm(this.nextAlarmAt());
  }

  async onAlarm() {
    const hasWaiters = [...this.waiters()].length > 0;
    const reclaimed = hasWaiters && this.reclaimSeats();
    const admitted = hasWaiters && this.admitWaiters();
    const changed = reclaimed || admitted;
    if (changed) {
      await this.save();
      this.pushState();
    } else if (Date.now() >= this.expiresAt) {
      if ([...this.getConnections()].length === 0) {
        await this.ctx.storage.deleteAll();
        this.reset();
      } else {
        await this.save();
      }
    } else {
      await this.ctx.storage.setAlarm(this.nextAlarmAt());
    }
  }

  private send(conn: Connection, msg: ServerMsg) {
    conn.send(JSON.stringify(msg));
  }

  private pushState() {
    this.broadcastCurrent(JSON.stringify({ t: "state", state: this.state } satisfies ServerMsg));
  }

  private broadcastCurrent(message: string) {
    for (const conn of this.getConnections<ConnState>()) {
      if (this.isAudience(conn)) conn.send(message);
    }
  }

  private host(): Connection<ConnState> | null {
    for (const c of this.getConnections<ConnState>()) {
      if (this.isCurrent(c) && c.state?.role === "host") return c;
    }
    return null;
  }

  private connFor(playerId: string): Connection<ConnState> | null {
    for (const c of this.getConnections<ConnState>()) {
      if (this.isCurrent(c) && c.state?.playerId === playerId) return c;
    }
    return null;
  }

  onConnect(conn: Connection<ConnState>, _ctx: ConnectionContext) {
    const now = Date.now();
    for (const existing of this.getConnections<ConnState>()) {
      const state = existing.state;
      if (existing !== conn && state?.role === "pending" && now - state.connectedAt >= HELLO_TIMEOUT_MS) {
        existing.setState({ ...state, superseded: true });
        existing.close(1008, "Hello timed out");
      }
    }
    if ([...this.getConnections()].length > MAX_CONNECTIONS) {
      conn.setState({ role: "pending", playerId: null, superseded: true, connectedAt: now });
      conn.close(1013, "Room connection limit reached");
      return;
    }
    // Wait for `hello` before we know what this connection is.
    conn.setState({ role: "pending", playerId: null, superseded: false, connectedAt: now });
  }

  async onMessage(conn: Connection<ConnState>, raw: string | ArrayBuffer) {
    if (typeof raw !== "string") return this.reject(conn, 1003, "Text messages only");
    if (raw.length > MAX_MESSAGE_BYTES || new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES) {
      return this.reject(conn, 1009, "Message too large");
    }
    if (!this.consumeRoomMessage() || !this.consume(conn, false)) {
      return this.reject(conn, 1008, "Message rate exceeded");
    }
    const msg = parseClientMsg(raw);
    if (!msg) return this.reject(conn, 1008, "Invalid message");

    const cs = conn.state ?? { role: "pending", playerId: null, superseded: false, connectedAt: Date.now() };
    if (cs.role === "pending" && msg.t !== "hello") {
      return this.reject(conn, 1008, "Hello required");
    }
    if (!this.allowed(conn, cs, msg)) {
      return this.reject(conn, 1008, "Message not allowed for this connection");
    }
    const writeRole = msg.t === "hello" ? msg.role : cs.role === "host" ? "host" : "controller";
    if (isWrite(msg) && (!this.consumeRoomWrite(writeRole) || !this.consume(conn, true))) {
      return this.reject(conn, 1008, "Write rate exceeded");
    }

    switch (msg.t) {
      case "hello":
        return this.onHello(conn, msg);

      case "rename": {
        const p = this.currentPlayer(conn, cs);
        if (!p) return;
        const name = clean(msg.name) || p.name;
        if (name === p.name) return;
        p.name = name;
        await this.save();
        return this.pushState();
      }

      case "ready": {
        const p = this.currentPlayer(conn, cs);
        if (!p) return;
        if (p.ready === msg.ready) return;
        p.ready = msg.ready;
        await this.save();
        return this.pushState();
      }

      case "pick": {
        if (!this.isCurrentHost(conn, cs)) return;
        if (this.state.gameId === msg.gameId) return;
        this.state.gameId = msg.gameId;
        await this.save();
        return this.pushState();
      }

      case "launch": {
        if (!this.isCurrentHost(conn, cs) || !this.state.gameId || this.state.phase === "playing") return;
        const seed = Math.floor(Math.random() * 2 ** 31);
        this.state.phase = "playing";
        this.state.round += 1;
        this.state.activeRound = { gameId: this.state.gameId, seed };
        for (const p of this.state.players) p.ready = false;
        await this.save();
        this.broadcastCurrent(
          JSON.stringify({
            t: "launch",
            gameId: this.state.gameId,
            seed,
          } satisfies ServerMsg),
        );
        return this.pushState();
      }

      case "roundOver": {
        if (!this.isCurrentHost(conn, cs) || this.state.phase !== "playing" || !this.state.activeRound) return;
        const results = msg.results;
        if (!this.validResults(results)) return this.reject(conn, 1008, "Invalid results");
        this.state.phase = "standings";
        this.state.activeRound = null;
        this.state.history.push({
          round: this.state.round,
          gameId: this.state.gameId ?? "unknown",
          gameName: msg.gameName,
          at: Date.now(),
          results,
        });
        if (this.state.history.length > MAX_HISTORY) this.state.history.shift();
        for (const r of results) {
          this.state.totals[r.id] = (this.state.totals[r.id] ?? 0) + r.score;
        }
        await this.save();
        return this.pushState();
      }

      case "backToLobby": {
        if (!this.isCurrentHost(conn, cs)) return;
        if (this.state.phase === "lobby") return;
        if (this.state.phase === "playing") this.state.round = Math.max(0, this.state.round - 1);
        this.state.phase = "lobby";
        this.state.activeRound = null;
        await this.save();
        return this.pushState();
      }

      case "resetParty": {
        if (!this.isCurrentHost(conn, cs)) return;
        // Keep the seats and the code, wipe the scoreboard. Same night, new
        // tournament — nobody has to re-scan.
        this.state.totals = {};
        this.state.history = [];
        this.state.round = 0;
        this.state.phase = "lobby";
        this.state.activeRound = null;
        this.state.startedAt = Date.now();
        await this.save();
        return this.pushState();
      }

      case "g": {
        // Opaque game traffic. The shell never inspects `d`.
        if (cs.role === "controller") {
          const player = this.currentPlayer(conn, cs);
          if (!player || this.state.phase !== "playing") return;
          const host = this.host();
          if (host) this.send(host, { t: "g", from: player.id, d: msg.d });
          return;
        }
        if (!this.isCurrentHost(conn, cs)) return;
        if (msg.to && !this.player(msg.to)) return this.reject(conn, 1008, "Invalid recipient");
        const out = JSON.stringify({ t: "g", from: "host", d: msg.d } satisfies ServerMsg);
        if (msg.to) {
          this.connFor(msg.to)?.send(out);
        } else {
          for (const c of this.getConnections<ConnState>()) {
            if (this.isCurrent(c) && c.state?.role === "controller" && c.state.playerId) c.send(out);
          }
        }
        return;
      }
    }
  }

  private async onHello(conn: Connection<ConnState>, msg: Extract<ClientMsg, { t: "hello" }>) {
    if (!this.hostTokenHash) {
      this.send(conn, { t: "error", message: "This party doesn't exist." });
      return this.reject(conn, 4004, "Party not found");
    }

    if (msg.role === "host") {
      if (!(await verifyToken(msg.token, this.hostTokenHash))) {
        return this.reject(conn, 4003, "Invalid host key");
      }
      this.activate(conn, { role: "host", playerId: null, superseded: false, connectedAt: conn.state?.connectedAt ?? Date.now() });
      await this.save();
      this.send(conn, { t: "welcome", you: hostStub(), state: this.state });
      return this.pushState();
    }

    const key = msg.key;
    const id = key ? this.seats[key] : undefined;
    let player = this.player(id);
    let archived = id ? this.archived[id] : undefined;

    if (!player) {
      this.reclaimSeats();
      const admitted = this.admitWaiters();
      if (admitted) {
        await this.save();
        this.pushState();
      }
      player = this.player(id);
      archived = id ? this.archived[id] : undefined;
    }

    if (!player) {
      if (this.state.players.length >= MAX_PLAYERS) {
        if (key && archived) {
          this.wait(conn, archived, key, msg.name);
          await this.save();
          this.pushState();
          this.send(conn, { t: "waiting", message: "You're back. Waiting for the next open seat." });
          return;
        }
        this.send(conn, { t: "error", message: "This party is full." });
        return this.reject(conn, 1008, "Party full");
      }
      if (archived) {
        player = this.restore(archived);
      } else {
        const seat = this.freeSeat();
        player = {
          id: crypto.randomUUID(),
          name: clean(msg.name ?? "") || `Player ${seat + 1}`,
          seat,
          color: SEAT_COLORS[seat % SEAT_COLORS.length],
          connected: true,
          ready: false,
          awayAt: null,
        };
        this.state.players.push(player);
        if (key) this.seats[key] = player.id;
      }
    }

    if (msg.name) player.name = clean(msg.name) || player.name;
    player.connected = true;
    player.awayAt = null;
    this.activate(conn, { role: "controller", playerId: player.id, superseded: false, connectedAt: conn.state?.connectedAt ?? Date.now() });
    await this.save();

    this.send(conn, { t: "welcome", you: player, state: this.state });
    this.pushState();
  }

  async onClose(conn: Connection<ConnState>) {
    const cs = conn.state;
    if (!this.isCurrent(conn, cs)) return;
    const p = this.player(cs?.playerId);
    if (!p) {
      if (cs?.waiting) await this.ctx.storage.setAlarm(this.nextAlarmAt(conn));
      return;
    }
    p.connected = false;
    p.awayAt = Date.now();
    await this.save();
    this.pushState();
  }

  /**
   * Free up seats lazily rather than on a timer — hibernation eats timers, and
   * a seat only actually matters when someone new is trying to sit down.
   */
  private reclaimSeats(): boolean {
    if (this.state.players.length < MAX_PLAYERS) return false;
    const now = Date.now();
    const expired = this.state.players.filter((p) => !p.connected && p.awayAt && now - p.awayAt >= GRACE_MS);
    if (expired.length === 0) return false;
    const expiredIds = new Set(expired.map((p) => p.id));
    for (const p of expired) {
      p.ready = false;
      this.archived[p.id] = p;
    }
    this.state.players = this.state.players.filter((p) => !expiredIds.has(p.id));
    return true;
  }

  /** Mark an attachment current before closing its predecessor. */
  private activate(conn: Connection<ConnState>, next: ConnState) {
    const current = conn.state;
    conn.setState({
      ...next,
      rate: next.rate ?? current?.rate,
      writes: next.writes ?? current?.writes,
    });
    for (const other of this.getConnections<ConnState>()) {
      const state = other.state;
      const sameHost = next.role === "host" && state?.role === "host";
      const samePlayer = next.playerId !== null && state?.playerId === next.playerId;
      const sameWaiter = next.waiting && state?.waiting?.playerId === next.waiting.playerId;
      if (other !== conn && !state?.superseded && (sameHost || samePlayer || sameWaiter)) {
        other.setState({ ...state, superseded: true });
        other.close(4001, "Replaced by a newer connection");
      }
    }
  }

  private wait(conn: Connection<ConnState>, player: Player, key: string, name?: string) {
    this.activate(conn, {
      role: "controller",
      playerId: null,
      superseded: false,
      connectedAt: conn.state?.connectedAt ?? Date.now(),
      waiting: { playerId: player.id, key, name, at: Date.now() },
    });
  }

  private restore(archived: Player): Player {
    const seat = this.freeSeat(archived.seat);
    const player = {
      ...archived,
      seat,
      color: SEAT_COLORS[seat % SEAT_COLORS.length],
      connected: true,
      ready: false,
      awayAt: null,
    };
    delete this.archived[player.id];
    this.state.players.push(player);
    return player;
  }

  /** Promote waiting returning identities in arrival order as seats free up. */
  private admitWaiters(): boolean {
    let changed = false;
    for (const conn of this.waiters()) {
      if (this.state.players.length >= MAX_PLAYERS) break;
      const waiting = conn.state?.waiting;
      if (!waiting) continue;
      const archived = this.archived[waiting.playerId];
      if (!archived || this.seats[waiting.key] !== archived.id) continue;
      const player = this.restore(archived);
      if (waiting.name) player.name = clean(waiting.name) || player.name;
      this.activate(conn, { role: "controller", playerId: player.id, superseded: false, connectedAt: conn.state?.connectedAt ?? Date.now() });
      this.send(conn, { t: "welcome", you: player, state: this.state });
      changed = true;
    }
    return changed;
  }

  private *waiters(): Iterable<Connection<ConnState>> {
    yield* [...this.getConnections<ConnState>()]
      .filter((c) => this.isCurrent(c) && c.state?.waiting)
      .sort((a, b) => (a.state?.waiting?.at ?? 0) - (b.state?.waiting?.at ?? 0));
  }

  private nextAlarmAt(exclude?: Connection<ConnState>): number {
    if (![...this.waiters()].some((conn) => conn !== exclude)) return this.expiresAt;
    let earliest = this.expiresAt;
    for (const player of this.state.players) {
      if (!player.connected && player.awayAt) earliest = Math.min(earliest, player.awayAt + GRACE_MS);
    }
    return earliest;
  }

  private isCurrent(conn: Connection<ConnState>, state = conn.state): boolean {
    return Boolean(state && !state.superseded);
  }

  private isAudience(conn: Connection<ConnState>): boolean {
    const state = conn.state;
    return Boolean(
      this.isCurrent(conn, state) &&
        (state?.role === "host" || state?.playerId || state?.waiting),
    );
  }

  private isCurrentHost(conn: Connection<ConnState>, state = conn.state): boolean {
    return this.isCurrent(conn, state) && state?.role === "host";
  }

  private currentPlayer(conn: Connection<ConnState>, state = conn.state): Player | null {
    if (!this.isCurrent(conn, state) || state?.role !== "controller") return null;
    return this.player(state.playerId);
  }

  private player(id: string | null | undefined): Player | null {
    if (!id) return null;
    return this.state.players.find((p) => p.id === id) ?? null;
  }

  private freeSeat(preferred?: number): number {
    const taken = new Set(this.state.players.map((p) => p.seat));
    if (preferred !== undefined && !taken.has(preferred)) return preferred;
    for (let i = 0; i < MAX_PLAYERS; i++) if (!taken.has(i)) return i;
    return this.state.players.length;
  }

  private validResults(results: RoundResult[]): boolean {
    const known = new Set(this.state.players.map((player) => player.id));
    const seen = new Set<string>();
    return results.every((result) => {
      if (!known.has(result.id) || seen.has(result.id)) return false;
      seen.add(result.id);
      return true;
    });
  }

  /** Reject role-confused traffic before it can consume the durable write budget. */
  private allowed(conn: Connection<ConnState>, state: ConnState, msg: ClientMsg): boolean {
    switch (msg.t) {
      case "hello":
        return state.role === "pending" && !state.playerId && !state.waiting && !state.superseded;
      case "rename":
      case "ready":
        return this.currentPlayer(conn, state) !== null;
      case "pick":
      case "launch":
      case "roundOver":
      case "backToLobby":
      case "resetParty":
        return this.isCurrentHost(conn, state);
      case "g":
        return this.isCurrentHost(conn, state) || this.currentPlayer(conn, state) !== null;
    }
  }

  private consume(conn: Connection<ConnState>, write: boolean): boolean {
    const state = conn.state;
    if (!state || state.superseded) return false;
    const now = Date.now();
    const key = write ? "writes" : "rate";
    const limits = write ? WRITE_RATE : state.role === "host" ? HOST_RATE : CONTROLLER_RATE;
    const previous = state[key] ?? { tokens: limits.burst, at: now };
    const tokens = Math.min(limits.burst, previous.tokens + ((now - previous.at) / 1000) * limits.refill);
    if (tokens < 1) return false;
    conn.setState({ ...state, [key]: { tokens: tokens - 1, at: now } });
    return true;
  }

  private consumeRoomMessage(): boolean {
    const now = Date.now();
    const limits = ROOM_RATE;
    const previous = this.roomRate ?? { tokens: limits.burst, at: now };
    const tokens = Math.min(limits.burst, previous.tokens + ((now - previous.at) / 1000) * limits.refill);
    if (tokens < 1) return false;
    this.roomRate = { tokens: tokens - 1, at: now };
    return true;
  }

  private consumeRoomWrite(role: "host" | "controller"): boolean {
    const now = Date.now();
    const host = role === "host";
    const limits = host ? ROOM_HOST_WRITE_RATE : ROOM_CONTROLLER_WRITE_RATE;
    const previous = (host ? this.roomHostWrites : this.roomControllerWrites) ?? { tokens: limits.burst, at: now };
    const tokens = Math.min(limits.burst, previous.tokens + ((now - previous.at) / 1000) * limits.refill);
    if (tokens < 1) return false;
    if (host) this.roomHostWrites = { tokens: tokens - 1, at: now };
    else this.roomControllerWrites = { tokens: tokens - 1, at: now };
    return true;
  }

  private reject(conn: Connection<ConnState>, code: number, reason: string) {
    conn.close(code, reason);
  }

  private reset() {
    this.state = freshState();
    this.seats = {};
    this.archived = {};
    this.hostTokenHash = null;
    this.roomRate = undefined;
    this.roomControllerWrites = undefined;
    this.roomHostWrites = undefined;
    this.expiresAt = Date.now() + PARTY_TTL_MS;
  }
}

function freshState(): RoomState {
  return {
    code: "",
    phase: "lobby",
    gameId: null,
    activeRound: null,
    players: [],
    totals: {},
    history: [],
    round: 0,
    startedAt: Date.now(),
  };
}

export function hashToken(token: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
}

async function verifyToken(token: string, expectedHash: ArrayBuffer): Promise<boolean> {
  const subtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual(a: BufferSource, b: BufferSource): boolean;
  };
  return subtle.timingSafeEqual(await hashToken(token), expectedHash);
}

function parseClientMsg(raw: string): ClientMsg | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!record(value) || typeof value.t !== "string") return null;

  switch (value.t) {
    case "hello":
      if (value.role === "host") {
        return only(value, "t", "role", "token") && (value.token === undefined || (typeof value.token === "string" && value.token.length <= 128))
          ? { t: "hello", role: "host", token: value.token ?? "" }
          : null;
      }
      return value.role === "controller" && only(value, "t", "role", "key", "name") && short(value.key, 128) && optionalShort(value.name, 64)
        ? { t: "hello", role: "controller", key: value.key, ...(value.name === undefined ? {} : { name: value.name }) }
        : null;
    case "rename":
      return only(value, "t", "name") && short(value.name, 64) ? { t: "rename", name: value.name } : null;
    case "ready":
      return only(value, "t", "ready") && typeof value.ready === "boolean" ? { t: "ready", ready: value.ready } : null;
    case "pick":
      return only(value, "t", "gameId") && typeof value.gameId === "string" && /^[a-z0-9][a-z0-9-]{0,31}$/.test(value.gameId)
        ? { t: "pick", gameId: value.gameId }
        : null;
    case "launch":
    case "backToLobby":
    case "resetParty":
      return only(value, "t") ? { t: value.t } : null;
    case "roundOver":
      return only(value, "t", "results", "gameName") && short(value.gameName, 64) && Array.isArray(value.results) && value.results.length <= MAX_PLAYERS && value.results.every(roundResult)
        ? { t: "roundOver", results: value.results, gameName: value.gameName }
        : null;
    case "g":
      return only(value, "t", "to", "d") && Object.hasOwn(value, "d") && optionalShort(value.to, 64)
        ? { t: "g", d: value.d, ...(value.to === undefined ? {} : { to: value.to }) }
        : null;
    default:
      return null;
  }
}

function roundResult(value: unknown): value is RoundResult {
  return Boolean(
    record(value) &&
      only(value, "id", "place", "score", "detail") &&
      short(value.id, 64) &&
      Number.isInteger(value.place) &&
      (value.place as number) >= 1 &&
      (value.place as number) <= MAX_PLAYERS &&
      Number.isSafeInteger(value.score) &&
      (value.score as number) >= -10_000 &&
      (value.score as number) <= 10_000 &&
      optionalShort(value.detail, 64),
  );
}

function isWrite(msg: ClientMsg): boolean {
  return msg.t !== "g";
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function only(value: Record<string, unknown>, ...keys: string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

function short(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

function optionalShort(value: unknown, max: number): value is string | undefined {
  return value === undefined || short(value, max);
}


function hostStub(): Player {
  return {
    id: "host",
    name: "Big screen",
    seat: -1,
    color: "#F6EFE2",
    connected: true,
    ready: true,
    awayAt: null,
  };
}

function clean(name: string): string {
  return name.replace(/\s+/g, " ").trim().slice(0, 12);
}
