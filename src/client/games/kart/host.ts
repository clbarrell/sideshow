import type { Player, RoundResult } from "../../../shared/protocol";
import type { GameHost, HostContext } from "../registry";
import { KartSound, type KartAudioFrame, type KartAudioBatch } from "./sound";
import { drive, KART_RADIUS, separateBumpers } from "./physics";

const LAPS = 3;
const ROAD_HALF = 160;
const CP_EVERY = 12;
const FINISH_GRACE = 15;
const ROUND_LIMIT = 90;
const BOOST_PAD_SAMPLES = [36, 96, 156, 216];
const PLACE_POINTS = [10, 8, 6, 5, 4, 3, 2, 1, 1, 1];

export interface KartInput {
  s: number; // steer, -1..1
  t: number; // throttle, -1..1
  b: boolean; // boost
}

interface Car {
  id: string;
  seat: number;
  name: string;
  color: string;
  x: number;
  y: number;
  a: number; // heading
  v: number; // speed along heading
  slip: number;
  steer: number;
  missed: boolean;
  lap: number;
  cp: number; // next checkpoint index
  boost: number; // seconds of boost left
  cool: number; // boost cooldown
  gateCool: number;
  rescue: number;
  hitCool: number;
  finished: number | null; // race clock at finish
  input: KartInput;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface Callout {
  text: string;
  color: string;
  life: number;
  kind: "event" | "bump";
}

export function boostCooldownForPlace(place: number, playerCount: number) {
  if (playerCount <= 1) return 4.5;
  const trailing = clamp((place - 1) / (playerCount - 1), 0, 1);
  return 6.2 - trailing * 3.2;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildTrack(seed: number) {
  const rnd = mulberry32(seed);
  const base = 1500;
  const w1 = 0.22 + rnd() * 0.12;
  const w2 = 0.1 + rnd() * 0.1;
  const p1 = rnd() * Math.PI * 2;
  const p2 = rnd() * Math.PI * 2;
  const lobes = 3 + Math.floor(rnd() * 2);

  const pts: { x: number; y: number }[] = [];
  const N = 240;
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    const r = base * (1 + w1 * Math.sin(lobes * th + p1) + w2 * Math.sin(5 * th + p2));
    pts.push({ x: Math.cos(th) * r, y: Math.sin(th) * r * 0.72 });
  }
  const checkpoints: number[] = [];
  for (let i = 0; i < N; i += CP_EVERY) checkpoints.push(i);
  return { pts, checkpoints };
}

export function createHost(ctx: HostContext): GameHost {
  const track = buildTrack(ctx.seed);
  const cars = new Map<string, Car>();
  let clock = 0;
  // Ten seconds gives every phone time to load the game chunk, present the
  // rotate prompt, and let players settle both thumbs before the grid moves.
  let countdown = 10;
  let firstFinish: number | null = null;
  let over = false;
  let startFlash = 0;
  let shake = 0;
  const particles: Particle[] = [];
  const callouts: Callout[] = [];
  const sound = typeof AudioContext === "undefined" ? null : new KartSound("host");
  const pendingAudio = new Map<string, Pick<KartAudioFrame, "boost" | "crash">>();
  let audioSendClock = 0;
  const cam = { x: 0, y: 0, z: 0.3 };
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const announce = (text: string, color = "#FFC24A", kind: Callout["kind"] = "event") => {
    // Repeated bump reports are fun, but a pile-up must not turn the shared
    // screen into a stack of competing headlines.
    if (kind === "bump") {
      const previousBump = callouts.findIndex((callout) => callout.kind === "bump");
      if (previousBump >= 0) callouts.splice(previousBump, 1);
    }
    callouts.unshift({ text, color, life: kind === "bump" ? 1.1 : 1.5, kind });
    callouts.length = Math.min(callouts.length, 3);
  };

  const markAudio = (id: string, event: Pick<KartAudioFrame, "boost" | "crash">) => {
    pendingAudio.set(id, { ...pendingAudio.get(id), ...event });
  };

  const burst = (x: number, y: number, color: string, count: number, force = 220) => {
    if (reducedMotion) return;
    for (let i = 0; i < count && particles.length < 180; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.45;
      const speed = force * (0.45 + Math.random() * 0.7);
      const life = 0.35 + Math.random() * 0.35;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        color,
        size: 8 + Math.random() * 10,
      });
    }
  };

  // Grid: stagger cars back along the track from the start line.
  const spawn = (p: Player, i: number) => {
    const idx = (track.pts.length - 6 - i * 3) % track.pts.length;
    const here = track.pts[idx];
    const next = track.pts[(idx + 1) % track.pts.length];
    const a = Math.atan2(next.y - here.y, next.x - here.x);
    const off = (i % 2 === 0 ? -1 : 1) * 55;
    return {
      id: p.id,
      seat: p.seat,
      name: p.name,
      color: p.color,
      x: here.x + Math.cos(a + Math.PI / 2) * off,
      y: here.y + Math.sin(a + Math.PI / 2) * off,
      a,
      v: 0,
      slip: 0,
      steer: 0,
      missed: false,
      lap: 0,
      cp: 0,
      boost: 0,
      cool: 0,
      gateCool: 0,
      rescue: 0,
      hitCool: 0,
      finished: null,
      input: { s: 0, t: 0, b: false },
    } satisfies Car;
  };

  ctx.players.forEach((p, i) => cars.set(p.id, spawn(p, i)));

  function nearestSample(x: number, y: number) {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < track.pts.length; i++) {
      const dx = track.pts[i].x - x;
      const dy = track.pts[i].y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return { idx: best, dist: Math.sqrt(bestD) };
  }

  function progress(c: Car) {
    return c.lap * track.checkpoints.length + c.cp;
  }

  function standings(): Car[] {
    return [...cars.values()].sort((a, b) => {
      if (a.finished !== null || b.finished !== null) {
        if (a.finished === null) return 1;
        if (b.finished === null) return -1;
        return a.finished - b.finished;
      }
      return progress(b) - progress(a);
    });
  }

  return {
    onJoin(p) {
      // Late joiners get dropped onto the grid rather than turned away.
      if (!cars.has(p.id)) cars.set(p.id, spawn(p, cars.size));
    },

    onLeave(id) {
      cars.delete(id);
      pendingAudio.delete(id);
    },

    onConnectionChange(id, connected) {
      if (connected) return;
      const car = cars.get(id);
      if (car) car.input = { s: 0, t: 0, b: false };
    },

    onInput(playerId, d) {
      const car = cars.get(playerId);
      if (!car || !d || typeof d !== "object" || Array.isArray(d)) return;
      const i = d as Partial<KartInput>;
      car.input = {
        s: clamp(Number(i.s) || 0, -1, 1),
        t: clamp(Number(i.t) || 0, -1, 1),
        b: Boolean(i.b),
      };
    },

    tick(elapsed) {
      const dt = Math.min(elapsed, 0.1);
      if (countdown > 0) {
        countdown -= elapsed;
        audioSendClock += elapsed;
        if (audioSendClock >= 0.1) {
          audioSendClock %= 0.1;
          ctx.send({ t: "kartAudioBatch", players: Object.fromEntries([...cars.values()].map((car) => [car.id,
            { t: "kartAudio", speed: 0, ready: false, recharge: 0, lap: 1, finished: false, racing: false },
          ])) } satisfies KartAudioBatch);
        }
        if (countdown <= 0) {
          startFlash = 0.85;
          announce("GO!", "#78F2B3");
        }
        return;
      }
      clock += elapsed;

      startFlash = Math.max(0, startFlash - dt);
      shake = Math.max(0, shake - dt * 2.6);
      for (const callout of callouts) callout.life -= dt;
      while (callouts.length && callouts[callouts.length - 1].life <= 0) callouts.pop();
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          particles.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - Math.min(0.95, dt * 3.5);
        p.vy *= 1 - Math.min(0.95, dt * 3.5);
      }

      const places = new Map(standings().map((car, index) => [car.id, index + 1]));

      for (const c of cars.values()) {
        c.hitCool = Math.max(0, c.hitCool - dt);
        c.gateCool = Math.max(0, c.gateCool - dt);
        if (c.finished !== null) {
          c.v *= 1 - 2.5 * dt;
        } else {
          const near = nearestSample(c.x, c.y);
          const offRoad = near.dist > ROAD_HALF;

          if (c.cool > 0) c.cool -= dt;
          if (c.input.b && c.boost <= 0 && c.cool <= 0) {
            c.boost = 1.1;
            c.cool = boostCooldownForPlace(places.get(c.id) ?? 1, cars.size);
            burst(c.x - Math.cos(c.a) * 30, c.y - Math.sin(c.a) * 30, "#FFC24A", 10, 270);
            markAudio(c.id, { boost: true });
            sound?.boost();
          }
          // Boost is an event, not held state. Consuming it here prevents one
          // phone press from firing again when the cooldown expires.
          c.input.b = false;
          if (c.boost > 0) c.boost -= dt;

          const onBoostPad = BOOST_PAD_SAMPLES.some((idx) => circularDistance(near.idx, idx, track.pts.length) <= 3);
          if (onBoostPad && near.dist < ROAD_HALF && c.gateCool <= 0) {
            c.boost = Math.max(c.boost, 0.75);
            c.gateCool = 1.2;
            burst(c.x, c.y, "#78F2B3", 8, 210);
            markAudio(c.id, { boost: true });
            sound?.boost();
          }

          if (near.dist > ROAD_HALF * 2.6) c.rescue += dt;
          else c.rescue = 0;
          if (c.rescue > 1.25) {
            // Return before the outstanding checkpoint, never beyond it.
            const resetIdx = (track.checkpoints[c.cp] - 3 + track.pts.length) % track.pts.length;
            const here = track.pts[resetIdx];
            const next = track.pts[(resetIdx + 1) % track.pts.length];
            c.x = here.x;
            c.y = here.y;
            c.a = Math.atan2(next.y - here.y, next.x - here.x);
            c.v = 100;
            c.slip = 0;
            c.steer = 0;
            c.boost = 0;
            c.rescue = 0;
            burst(c.x, c.y, "#F6EFE2", 12, 180);
            announce(`${c.name.toUpperCase()} RESCUED`, c.color);
          }

          drive(c, c.input.s, c.input.t, c.boost > 0, offRoad, dt);

          // Checkpoint / lap progress
          const cpIdx = track.checkpoints[c.cp];
          const cpP = track.pts[cpIdx];
          if (Math.hypot(cpP.x - c.x, cpP.y - c.y) < 260) {
            c.cp += 1;
            if (c.cp >= track.checkpoints.length) {
              c.cp = 0;
              c.lap += 1;
              if (c.lap === LAPS - 1) {
                announce(`${c.name.toUpperCase()} · FINAL LAP`, c.color);
              }
              if (c.lap >= LAPS) {
                c.finished = clock;
                burst(c.x, c.y, c.color, 28, 340);
                if (firstFinish === null) {
                  firstFinish = clock;
                  announce(`${c.name.toUpperCase()} WINS!`, c.color);
                } else {
                  announce(`${c.name.toUpperCase()} FINISHES`, c.color);
                }
              }
            }
          }
          const target = track.checkpoints[c.cp];
          const ahead = (near.idx - target + track.pts.length) % track.pts.length;
          const behind = (target - near.idx + track.pts.length) % track.pts.length;
          c.missed = c.finished === null && (c.rescue > 0 ||
            (Math.hypot(track.pts[target].x - c.x, track.pts[target].y - c.y) > 300 &&
              (ahead < track.pts.length / 2 || (c.input.t > 0 && Math.cos(c.a - Math.atan2(
                track.pts[(near.idx + 1) % track.pts.length].y - track.pts[near.idx].y,
                track.pts[(near.idx + 1) % track.pts.length].x - track.pts[near.idx].x)) < -0.3 && behind < CP_EVERY * 2))));
        }
      }

      // Bump cars apart. Contact is most of the comedy.
      const list = [...cars.values()];
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          const contact = separateBumpers(a, b);
          if (contact) {
            const { nx, ny } = contact;
            const avx = Math.cos(a.a) * a.v - Math.sin(a.a) * a.slip;
            const avy = Math.sin(a.a) * a.v + Math.cos(a.a) * a.slip;
            const bvx = Math.cos(b.a) * b.v - Math.sin(b.a) * b.slip;
            const bvy = Math.sin(b.a) * b.v + Math.cos(b.a) * b.slip;
            const impact = Math.hypot(avx - bvx, avy - bvy);
            a.v *= 0.88;
            b.v *= 0.88;
            if (impact > 115 && a.hitCool <= 0 && b.hitCool <= 0) {
              burst((a.x + b.x) / 2, (a.y + b.y) / 2, "#F6EFE2", 10, 240);
              a.hitCool = 0.45;
              b.hitCool = 0.45;
              shake = Math.min(1, shake + impact / 650);
              const crashIntensity = clamp((impact - 115) / 420, 0, 1);
              markAudio(a.id, { crash: crashIntensity });
              markAudio(b.id, { crash: crashIntensity });
              sound?.crash(crashIntensity);
              const attacker = a.boost > 0 ? a : b.boost > 0 ? b : null;
              const bumped = attacker === a ? b : attacker === b ? a : null;
              if (attacker && bumped) {
                bumped.x += nx * (attacker === a ? 26 : -26);
                bumped.y += ny * (attacker === a ? 26 : -26);
                bumped.a += (attacker === a ? 1 : -1) * 0.38;
                bumped.v *= 0.72;
                announce(`${attacker.name.toUpperCase()} BUMPS ${bumped.name.toUpperCase()}!`, attacker.color, "bump");
              }
            }
          }
        }
      }

      const active = [...cars.values()].filter((c) => c.finished === null);
      const fastest = active.reduce((speed, car) => Math.max(speed, Math.abs(car.v) / 783), 0);
      sound?.setSpeed(fastest);
      audioSendClock += elapsed;
      if (audioSendClock >= 0.1) {
        audioSendClock %= 0.1;
        // All values are public race state. A single opaque batch keeps ten
        // racers' 10 Hz feedback below the router's 30-message host budget.
        const players: KartAudioBatch["players"] = {};
        for (const car of cars.values()) {
          players[car.id] = {
            t: "kartAudio",
            speed: clamp(Math.abs(car.v) / 783, 0, 1),
            ready: car.cool <= 0 && car.boost <= 0 && car.finished === null,
            recharge: Math.max(0, car.cool, car.boost),
            lap: Math.min(LAPS, car.lap + 1),
            finished: car.finished !== null,
            racing: !over,
            ...pendingAudio.get(car.id),
          };
        }
        ctx.send({ t: "kartAudioBatch", players } satisfies KartAudioBatch);
        pendingAudio.clear();
      }
      if (active.length === 0 || clock >= ROUND_LIMIT) over = true;
      if (firstFinish !== null && clock - firstFinish > FINISH_GRACE) over = true;
    },

    resize() {
      /* camera recalculates every frame */
    },

    render(g, w, h) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      g.save();
      g.fillStyle = "#0E2226";
      g.fillRect(0, 0, w, h);

      if (!reducedMotion && shake > 0) {
        g.translate((Math.random() - 0.5) * 14 * shake, (Math.random() - 0.5) * 14 * shake);
      }

      // Shared camera: frame every car, clamped so a leader can't shrink the
      // pack into dots and a lone car can't zoom to the moon.
      const list = [...cars.values()];
      if (list.length) {
        const xs = list.map((c) => c.x);
        const ys = list.map((c) => c.y);
        const minX = Math.min(...xs) - 400;
        const maxX = Math.max(...xs) + 400;
        const minY = Math.min(...ys) - 400;
        const maxY = Math.max(...ys) + 400;
        const tz = clamp(Math.min(w / (maxX - minX), h / (maxY - minY)), 0.16 * dpr, 0.85 * dpr);
        cam.x += ((minX + maxX) / 2 - cam.x) * 0.09;
        cam.y += ((minY + maxY) / 2 - cam.y) * 0.09;
        cam.z += (tz - cam.z) * 0.06;
      }

      g.translate(w / 2, h / 2);
      g.scale(cam.z, cam.z);
      g.translate(-cam.x, -cam.y);

      // Warm, graphic backyard texture. It stays low contrast so the road and
      // player silhouettes remain the only things demanding attention.
      g.fillStyle = "#183F38";
      for (let x = -2600; x <= 2600; x += 180) {
        for (let y = -2200; y <= 2200; y += 180) {
          const wobble = ((x * 17 + y * 31) % 73) - 36;
          g.beginPath();
          g.arc(x + wobble, y - wobble * 0.5, 9, 0, Math.PI * 2);
          g.fill();
        }
      }

      // Road
      g.lineJoin = "round";
      g.lineCap = "round";
      g.beginPath();
      track.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.closePath();
      g.strokeStyle = "#1D4149";
      g.lineWidth = ROAD_HALF * 2 + 26;
      g.stroke();
      g.setLineDash([42, 42]);
      g.strokeStyle = "#F06A55";
      g.lineWidth = ROAD_HALF * 2 + 18;
      g.stroke();
      g.setLineDash([0, 84]);
      g.strokeStyle = "#F6EFE2";
      g.stroke();
      g.setLineDash([]);
      g.strokeStyle = "#22333A";
      g.lineWidth = ROAD_HALF * 2;
      g.stroke();

      g.setLineDash([70, 90]);
      g.strokeStyle = "rgba(246,239,226,0.28)";
      g.lineWidth = 7;
      g.stroke();
      g.setLineDash([]);

      // Shared turbo gates create predictable bunching and visible comeback
      // opportunities without asking anyone to look down at their phone.
      for (const idx of BOOST_PAD_SAMPLES) {
        const p = track.pts[idx];
        const next = track.pts[(idx + 1) % track.pts.length];
        const angle = Math.atan2(next.y - p.y, next.x - p.x);
        g.save();
        g.translate(p.x, p.y);
        g.rotate(angle);
        g.fillStyle = "rgba(120,242,179,0.24)";
        roundRect(g, -58, -ROAD_HALF + 20, 116, ROAD_HALF * 2 - 40, 24);
        g.fill();
        g.fillStyle = "#78F2B3";
        for (let y = -ROAD_HALF + 48; y < ROAD_HALF - 30; y += 58) {
          g.beginPath();
          g.moveTo(-24, y);
          g.lineTo(12, y + 18);
          g.lineTo(-24, y + 36);
          g.lineTo(-8, y + 18);
          g.closePath();
          g.fill();
        }
        g.restore();
      }

      // Start / finish
      const s0 = track.pts[0];
      const s1 = track.pts[1];
      const sa = Math.atan2(s1.y - s0.y, s1.x - s0.x) + Math.PI / 2;
      g.save();
      g.translate(s0.x, s0.y);
      g.rotate(sa);
      for (let i = -5; i < 5; i++) {
        g.fillStyle = i % 2 === 0 ? "#F6EFE2" : "#0E2226";
        g.fillRect(i * 30, -18, 30, 36);
      }
      g.restore();

      // Cars
      const entityScale = clamp((0.85 * dpr) / cam.z, 1, 5.4);
      for (const c of standings().reverse()) {
        g.save();
        g.translate(c.x, c.y);
        g.rotate(c.a);
        // A world-size rubber bumper is the actual contact footprint.
        g.fillStyle = "#0C191D";
        g.beginPath();
        g.arc(0, 0, KART_RADIUS, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = c.color;
        g.lineWidth = 4;
        g.stroke();
        g.fillStyle = "rgba(0,0,0,0.32)";
        g.beginPath();
        g.ellipse(2, 5, 35, 22, 0, 0, Math.PI * 2);
        g.fill();
        if (c.boost > 0) {
          g.fillStyle = "rgba(255,194,74,0.72)";
          g.beginPath();
          g.moveTo(-24, -11);
          g.lineTo(-74 - Math.random() * 18, 0);
          g.lineTo(-24, 11);
          g.closePath();
          g.fill();
        }
        g.fillStyle = "#13282D";
        roundRect(g, -20, -23, 14, 46, 5);
        g.fill();
        roundRect(g, 12, -23, 14, 46, 5);
        g.fill();
        g.fillStyle = c.color;
        roundRect(g, -29, -18, 58, 36, 10);
        g.fill();
        // The pointed nose and large front windshield make heading readable
        // even when ten cars are tiny. Tail lights stay red at the rear and
        // brighten under reverse/braking input.
        g.beginPath();
        g.moveTo(20, -18);
        g.lineTo(38, 0);
        g.lineTo(20, 18);
        g.closePath();
        g.fill();
        g.fillStyle = "#9ED8D0";
        roundRect(g, 3, -14, 23, 28, 7);
        g.fill();
        g.fillStyle = "rgba(14,34,38,0.42)";
        roundRect(g, 9, -10, 12, 20, 4);
        g.fill();
        g.fillStyle = "#F6EFE2";
        g.fillRect(27, -12, 5, 8);
        g.fillRect(27, 4, 5, 8);
        g.fillStyle = c.input.t < 0 ? "#FF3B30" : "#B82222";
        g.fillRect(-30, -13, 6, 9);
        g.fillRect(-30, 4, 6, 9);
        g.fillStyle = "rgba(246,239,226,0.9)";
        g.fillRect(-7, -18, 7, 36);
        g.fillStyle = "#F6EFE2";
        g.font = "800 18px Archivo, system-ui, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(String(c.seat + 1), -3, 0);
        g.restore();

        // This is a screen-legible heading flag, tethered to the front of the
        // kart. It is deliberately not part of the 44-unit bumper silhouette.
        g.save();
        g.translate(c.x, c.y);
        g.rotate(c.a);
        const headingStart = KART_RADIUS + 10;
        const headingLength = 26 * entityScale;
        const headingHalfWidth = 12 * entityScale;
        g.strokeStyle = c.color;
        g.lineWidth = 2 * entityScale;
        g.beginPath();
        g.moveTo(KART_RADIUS, 0);
        g.lineTo(headingStart + 3 * entityScale, 0);
        g.stroke();
        g.fillStyle = "#F6EFE2";
        g.strokeStyle = "#0E2226";
        g.lineWidth = 3 * entityScale;
        g.beginPath();
        g.moveTo(headingStart + headingLength, 0);
        g.lineTo(headingStart, -headingHalfWidth);
        g.lineTo(headingStart, headingHalfWidth);
        g.closePath();
        g.stroke();
        g.fill();
        g.restore();

        const labelLift = (50 + (c.seat % 3) * 16) * entityScale;
        g.font = `700 ${Math.round(32 * entityScale)}px Archivo, system-ui, sans-serif`;
        const labelWidth = Math.max(94 * entityScale, g.measureText(`${c.seat + 1} ${c.name}`).width + 34 * entityScale);
        g.fillStyle = "rgba(14,34,38,0.82)";
        roundRect(
          g,
          c.x - labelWidth / 2,
          c.y - labelLift - 31 * entityScale,
          labelWidth,
          42 * entityScale,
          21 * entityScale,
        );
        g.fill();
        g.fillStyle = "#F6EFE2";
        g.textAlign = "center";
        g.textBaseline = "alphabetic";
        g.fillText(`${c.seat + 1} ${c.name}`, c.x, c.y - labelLift);
        // The leader line associates the readable identity tag with its small
        // physical bumper; the tag does not imply a larger collision body.
        g.strokeStyle = c.color;
        g.lineWidth = 2 * entityScale;
        g.beginPath();
        g.moveTo(c.x, c.y - labelLift + 12 * entityScale);
        g.lineTo(c.x, c.y - KART_RADIUS);
        g.stroke();
        if (countdown <= 0 && c.missed) {
          const target = track.pts[track.checkpoints[c.cp]];
          g.save();
          g.translate(c.x, c.y);
          g.rotate(Math.atan2(target.y - c.y, target.x - c.x));
          g.strokeStyle = "#FFC24A";
          g.lineWidth = 5 * entityScale;
          g.beginPath();
          g.moveTo(55, 0);
          g.lineTo(110 * entityScale, 0);
          g.lineTo(93 * entityScale, -12 * entityScale);
          g.moveTo(110 * entityScale, 0);
          g.lineTo(93 * entityScale, 12 * entityScale);
          g.stroke();
          g.restore();
          g.strokeStyle = c.color;
          g.lineWidth = 7;
          g.beginPath();
          g.arc(target.x, target.y, 110, 0, Math.PI * 2);
          g.stroke();
        }
        if (c.cool <= 0 && c.boost <= 0 && c.finished === null) {
          g.strokeStyle = "#FFC24A";
          g.lineWidth = 3;
          g.beginPath();
          g.arc(c.x, c.y, KART_RADIUS + 7, 0, Math.PI * 2);
          g.stroke();
        }
      }

      for (const p of particles) {
        g.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
        g.fillStyle = p.color;
        g.beginPath();
        g.arc(p.x, p.y, p.size * (0.5 + p.life / p.maxLife), 0, Math.PI * 2);
        g.fill();
      }
      g.globalAlpha = 1;
      g.restore();

      // HUD
      const board = standings();
      const hudScale = dpr * clamp(Math.min(w / dpr / 1280, h / dpr / 720), 1, 1.5);
      const tickerMargin = 20 * hudScale;
      const denseTicker = board.length >= 8;
      const tickerGap = (denseTicker ? 5 : 8) * hudScale;
      const tickerHeight = 74 * hudScale;
      const tickerY = h - tickerMargin - tickerHeight;
      const tickerWidth = w - tickerMargin * 2;
      const availablePillWidth = board.length
        ? (tickerWidth - tickerGap * Math.max(0, board.length - 1)) / board.length
        : tickerWidth;
      const pillWidth = Math.min(220 * hudScale, availablePillWidth);
      board.forEach((c, i) => {
        const x = tickerMargin + i * (pillWidth + tickerGap);
        g.fillStyle = "rgba(14,34,38,0.9)";
        roundRect(g, x, tickerY, pillWidth, tickerHeight, tickerHeight / 2);
        g.fill();
        g.fillStyle = c.color;
        g.beginPath();
        g.arc(
          x + (denseTicker ? pillWidth / 2 - 13 * hudScale : 20 * hudScale),
          tickerY + tickerHeight / 2 - (denseTicker ? 10 * hudScale : 0),
          (denseTicker ? 6 : 9) * hudScale,
          0,
          Math.PI * 2,
        );
        g.fill();
        g.fillStyle = "#F6EFE2";
        g.textBaseline = "middle";
        if (denseTicker) {
          g.textAlign = "left";
          g.font = `900 ${Math.round(14 * hudScale)}px Archivo, system-ui, sans-serif`;
          g.fillText(String(i + 1), x + pillWidth / 2 - 4 * hudScale, tickerY + tickerHeight / 2 - 10 * hudScale);
          g.textAlign = "center";
          g.font = `750 ${Math.round(14 * hudScale)}px Archivo, system-ui, sans-serif`;
          g.fillText(
            fitText(g, c.name, Math.max(0, pillWidth - 16 * hudScale)),
            x + pillWidth / 2,
            tickerY + tickerHeight / 2 + 10 * hudScale,
          );
        } else {
          g.textAlign = "left";
          g.font = `900 ${Math.round(22 * hudScale)}px Archivo, system-ui, sans-serif`;
          g.fillText(String(i + 1), x + 34 * hudScale, tickerY + tickerHeight / 2);
          g.font = `750 ${Math.round(21 * hudScale)}px Archivo, system-ui, sans-serif`;
          g.fillText(
            fitText(g, c.name, Math.max(0, pillWidth - 68 * hudScale)),
            x + 57 * hudScale,
            tickerY + tickerHeight / 2,
          );
        }
        g.textAlign = "center";
        g.font = `800 ${Math.round(14 * hudScale)}px Archivo, system-ui, sans-serif`;
        g.fillStyle = c.finished !== null ? "#78F2B3" : "#FFC24A";
        g.fillText(c.finished !== null ? "FINISHED" : `LAP ${Math.min(LAPS, c.lap + 1)}/${LAPS}`, x + pillWidth / 2, tickerY + tickerHeight - 9 * hudScale);
      });

      g.textAlign = "right";
      g.fillStyle = "rgba(14,34,38,0.78)";
      roundRect(g, w - 244 * hudScale, 104 * hudScale, 216 * hudScale, 74 * hudScale, 26 * hudScale);
      g.fill();
      g.fillStyle = "#F6EFE2";
      g.font = `800 ${Math.round(38 * hudScale)}px Archivo, system-ui, sans-serif`;
      const remaining = Math.max(0, Math.min(ROUND_LIMIT - clock, firstFinish === null ? ROUND_LIMIT : FINISH_GRACE - (clock - firstFinish)));
      g.fillText(`${Math.ceil(remaining)}s`, w - 50 * hudScale, 154 * hudScale);
      g.font = `800 ${Math.round(15 * hudScale)}px Archivo, system-ui, sans-serif`;
      g.fillText(firstFinish === null ? "RACE TIME LEFT" : "WINNER HOME · FINISH NOW", w - 40 * hudScale, 123 * hudScale);

      const recovering = board.filter((c) => c.missed && c.finished === null);
      if (recovering.length) {
        const railX = 24 * hudScale;
        const railY = 108 * hudScale;
        const railWidth = 248 * hudScale;
        const rowHeight = 22 * hudScale;
        const railHeight = (52 + recovering.length * 22) * hudScale;
        g.fillStyle = "rgba(14,34,38,0.9)";
        roundRect(g, railX, railY, railWidth, railHeight, 18 * hudScale);
        g.fill();
        g.textAlign = "left";
        g.textBaseline = "middle";
        g.fillStyle = "#FFC24A";
        g.font = `800 ${Math.round(13 * hudScale)}px Archivo, system-ui, sans-serif`;
        g.fillText("MISSED GATE", railX + 14 * hudScale, railY + 16 * hudScale);
        g.fillText("FOLLOW YOUR YELLOW ARROW", railX + 14 * hudScale, railY + 34 * hudScale);
        recovering.forEach((c, index) => {
          const y = railY + 52 * hudScale + index * rowHeight;
          g.fillStyle = c.color;
          g.beginPath();
          g.arc(railX + 18 * hudScale, y, 5 * hudScale, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = "#F6EFE2";
          g.font = `750 ${Math.round(15 * hudScale)}px Archivo, system-ui, sans-serif`;
          g.fillText(`${c.seat + 1} ${fitText(g, c.name, railWidth - 48 * hudScale)}`, railX + 30 * hudScale, y);
        });
      }

      callouts.forEach((callout, index) => {
        const alpha = clamp(callout.life * 2, 0, 1);
        g.globalAlpha = alpha;
        g.textAlign = "center";
        const bump = callout.kind === "bump";
        const fontSize = bump ? (index === 0 ? 44 : 30) : (index === 0 ? 68 : 42);
        const maxWidth = bump ? Math.min(w * 0.64, 720 * hudScale) : w - 80 * hudScale;
        g.font = `900 ${Math.round(fontSize * hudScale)}px Archivo, system-ui, sans-serif`;
        const text = fitText(g, callout.text, maxWidth);
        g.lineWidth = (bump ? 8 : 12) * hudScale;
        g.strokeStyle = "rgba(14,34,38,0.9)";
        const y = (bump ? 106 + index * 52 : 120 + index * 66) * hudScale;
        g.strokeText(text, w / 2, y);
        g.fillStyle = callout.color;
        g.fillText(text, w / 2, y);
      });
      g.globalAlpha = 1;

      if (countdown > 0) {
        const n = Math.ceil(countdown);
        g.textAlign = "center";
        g.fillStyle = "#FFC24A";
        g.font = `800 ${Math.round(h * 0.3)}px Archivo, system-ui, sans-serif`;
        g.fillText(String(n), w / 2, h / 2 + h * 0.1);
        g.fillStyle = "#F6EFE2";
        g.font = `800 ${Math.round(30 * hudScale)}px Archivo, system-ui, sans-serif`;
        g.fillText(
          n > 3
            ? "GET YOUR CONTROLS READY  ·  TURN PHONE SIDEWAYS"
            : "HANDS READY  ·  HOLD GO AFTER THE COUNT",
          w / 2,
          h / 2 + h * 0.2,
        );
        g.font = `800 ${Math.round(22 * hudScale)}px Archivo, system-ui, sans-serif`;
        g.fillText("3 LAPS · FINISH ORDER WINS · 90 SECOND LIMIT", w / 2, h / 2 + h * 0.27);
        g.fillText("GOLD RING = BOOST READY · 15s TO FINISH AFTER THE WINNER", w / 2, h / 2 + h * 0.32);
      } else if (startFlash > 0) {
        g.globalAlpha = clamp(startFlash * 2, 0, 1);
        g.textAlign = "center";
        g.fillStyle = "#78F2B3";
        g.font = `900 ${Math.round(h * 0.25)}px Archivo, system-ui, sans-serif`;
        g.fillText("GO!", w / 2, h / 2 + h * 0.08);
        g.globalAlpha = 1;
      }
    },

    isOver: () => over,

    results(): RoundResult[] {
      return standings().map((c, i) => ({
        id: c.id,
        place: i + 1,
        score: PLACE_POINTS[Math.min(i, PLACE_POINTS.length - 1)],
        detail: c.finished !== null ? `${c.finished.toFixed(1)}s` : `lap ${c.lap + 1}`,
      }));
    },

    destroy() {
      sound?.destroy();
    },
  };
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function circularDistance(a: number, b: number, length: number) {
  const direct = Math.abs(a - b);
  return Math.min(direct, length - direct);
}

function fitText(g: CanvasRenderingContext2D, text: string, maxWidth: number) {
  if (g.measureText(text).width <= maxWidth) return text;
  let clipped = text;
  while (clipped && g.measureText(`${clipped}…`).width > maxWidth) clipped = clipped.slice(0, -1);
  return `${clipped}…`;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
