import type { Player, RoundResult } from "../../../shared/protocol";
import type { GameHost, HostContext } from "../registry";

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
  let countdown = 3.2;
  let firstFinish: number | null = null;
  let over = false;
  let startFlash = 0;
  let shake = 0;
  let finalLapCalled = false;
  const particles: Particle[] = [];
  const callouts: Callout[] = [];
  const cam = { x: 0, y: 0, z: 0.3 };
  const reducedMotion = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  const announce = (text: string, color = "#FFC24A") => {
    callouts.unshift({ text, color, life: 1.5 });
    callouts.length = Math.min(callouts.length, 3);
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

    tick(dt) {
      if (countdown > 0) {
        countdown -= dt;
        if (countdown <= 0) {
          startFlash = 0.85;
          announce("GO!", "#78F2B3");
        }
        return;
      }
      clock += dt;

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
          }

          if (near.dist > ROAD_HALF * 2.6) c.rescue += dt;
          else c.rescue = 0;
          if (c.rescue > 1.25) {
            const here = track.pts[near.idx];
            const next = track.pts[(near.idx + 1) % track.pts.length];
            c.x = here.x;
            c.y = here.y;
            c.a = Math.atan2(next.y - here.y, next.x - here.x);
            c.v = 150;
            c.boost = 0;
            c.rescue = 0;
            burst(c.x, c.y, "#F6EFE2", 12, 180);
            announce(`${c.name.toUpperCase()} RESCUED`, c.color);
          }

          const maxV = (offRoad ? 210 : 540) * (c.boost > 0 ? 1.45 : 1);
          const accel = c.input.t > 0 ? 700 : c.input.t < 0 ? -520 : 0;
          c.v += accel * c.input.t * dt * (c.input.t > 0 ? 1 : -1);
          c.v -= c.v * (offRoad ? 1.9 : 0.65) * dt;
          c.v = clamp(c.v, -180, maxV);

          const grip = Math.min(1, Math.abs(c.v) / 130);
          c.a += c.input.s * 2.7 * grip * dt * Math.sign(c.v || 1);

          c.x += Math.cos(c.a) * c.v * dt;
          c.y += Math.sin(c.a) * c.v * dt;

          // Checkpoint / lap progress
          const cpIdx = track.checkpoints[c.cp];
          const cpP = track.pts[cpIdx];
          if (Math.hypot(cpP.x - c.x, cpP.y - c.y) < 260) {
            c.cp += 1;
            if (c.cp >= track.checkpoints.length) {
              c.cp = 0;
              c.lap += 1;
              if (c.lap === LAPS - 1 && !finalLapCalled) {
                finalLapCalled = true;
                announce("FINAL LAP!", "#FF6B57");
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
        }
      }

      // Bump cars apart. Contact is most of the comedy.
      const list = [...cars.values()];
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 1;
          if (d < 62) {
            const push = (62 - d) / 2;
            const nx = dx / d;
            const ny = dy / d;
            a.x -= nx * push;
            a.y -= ny * push;
            b.x += nx * push;
            b.y += ny * push;
            const avx = Math.cos(a.a) * a.v;
            const avy = Math.sin(a.a) * a.v;
            const bvx = Math.cos(b.a) * b.v;
            const bvy = Math.sin(b.a) * b.v;
            const impact = Math.hypot(avx - bvx, avy - bvy);
            a.v *= 0.88;
            b.v *= 0.88;
            if (impact > 115 && a.hitCool <= 0 && b.hitCool <= 0) {
              burst((a.x + b.x) / 2, (a.y + b.y) / 2, "#F6EFE2", 10, 240);
              a.hitCool = 0.45;
              b.hitCool = 0.45;
              shake = Math.min(1, shake + impact / 650);
              const attacker = a.boost > 0 ? a : b.boost > 0 ? b : null;
              const bumped = attacker === a ? b : attacker === b ? a : null;
              if (attacker && bumped) {
                bumped.x += nx * (attacker === a ? 26 : -26);
                bumped.y += ny * (attacker === a ? 26 : -26);
                bumped.a += (attacker === a ? 1 : -1) * 0.38;
                bumped.v *= 0.72;
                announce(`${attacker.name.toUpperCase()} BUMPS ${bumped.name.toUpperCase()}!`, attacker.color);
              }
            }
          }
        }
      }

      const active = [...cars.values()].filter((c) => c.finished === null);
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
        g.scale(entityScale, entityScale);
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
        g.fillStyle = "rgba(246,239,226,0.9)";
        g.fillRect(-8, -18, 8, 36);
        g.fillStyle = "rgba(14,34,38,0.5)";
        roundRect(g, 0, -11, 17, 22, 5);
        g.fill();
        g.fillStyle = "#F6EFE2";
        g.font = "800 18px Archivo, system-ui, sans-serif";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(String(c.seat + 1), 8, 0);
        g.restore();

        const labelLift = (50 + (c.seat % 3) * 16) * entityScale;
        g.font = `700 ${Math.round(32 * entityScale)}px Archivo, system-ui, sans-serif`;
        const labelWidth = Math.max(94 * entityScale, g.measureText(c.name).width + 34 * entityScale);
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
        g.fillText(c.name, c.x, c.y - labelLift);
        if (c.cool <= 0 && c.finished === null) {
          g.strokeStyle = "#FFC24A";
          g.lineWidth = 6 * entityScale;
          g.beginPath();
          g.arc(c.x, c.y, 43 * entityScale, 0, Math.PI * 2);
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
      const boardX = 28 * hudScale;
      const boardWidth = Math.min(620 * hudScale, w - 56 * hudScale);
      g.font = `700 ${Math.round(32 * hudScale)}px Archivo, system-ui, sans-serif`;
      g.textAlign = "left";
      board.forEach((c, i) => {
        const y = (56 + i * 56) * hudScale;
        const turbo = c.cool <= 0 ? "TURBO" : `${Math.ceil(c.cool)}s`;
        const status = c.finished !== null ? "DONE" : `L${Math.min(c.lap + 1, LAPS)} · ${turbo}`;
        const nameX = 78 * hudScale;
        const nameWidth = boardX + boardWidth - 32 * hudScale - g.measureText(status).width - nameX;
        g.fillStyle = "rgba(14,34,38,0.72)";
        roundRect(g, boardX, y - 37 * hudScale, boardWidth, 48 * hudScale, 24 * hudScale);
        g.fill();
        g.fillStyle = c.color;
        g.beginPath();
        g.arc(52 * hudScale, y - 13 * hudScale, 12 * hudScale, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = "#F6EFE2";
        g.fillText(fitText(g, `${i + 1}  ${c.name}`, nameWidth), nameX, y);
        g.textAlign = "right";
        g.fillStyle = "rgba(246,239,226,0.82)";
        g.fillText(status, boardX + boardWidth - 16 * hudScale, y);
        g.textAlign = "left";
      });

      g.textAlign = "right";
      g.fillStyle = "rgba(14,34,38,0.78)";
      roundRect(g, w - 244 * hudScale, 104 * hudScale, 216 * hudScale, 74 * hudScale, 26 * hudScale);
      g.fill();
      g.fillStyle = "#F6EFE2";
      g.font = `800 ${Math.round(38 * hudScale)}px Archivo, system-ui, sans-serif`;
      g.fillText(formatClock(clock), w - 50 * hudScale, 154 * hudScale);

      callouts.forEach((callout, index) => {
        const alpha = clamp(callout.life * 2, 0, 1);
        g.globalAlpha = alpha;
        g.textAlign = "center";
        g.font = `900 ${Math.round((index === 0 ? 68 : 42) * hudScale)}px Archivo, system-ui, sans-serif`;
        g.lineWidth = 12 * hudScale;
        g.strokeStyle = "rgba(14,34,38,0.9)";
        g.strokeText(callout.text, w / 2, (120 + index * 66) * hudScale);
        g.fillStyle = callout.color;
        g.fillText(callout.text, w / 2, (120 + index * 66) * hudScale);
      });
      g.globalAlpha = 1;

      if (countdown > 0) {
        const n = Math.min(3, Math.ceil(countdown));
        g.textAlign = "center";
        g.fillStyle = "#FFC24A";
        g.font = `800 ${Math.round(h * 0.3)}px Archivo, system-ui, sans-serif`;
        g.fillText(String(n), w / 2, h / 2 + h * 0.1);
        g.fillStyle = "#F6EFE2";
        g.font = `800 ${Math.round(30 * hudScale)}px Archivo, system-ui, sans-serif`;
        g.fillText("DRAG TO DRIVE  ·  TAP BOOST", w / 2, h / 2 + h * 0.2);
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
  };
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

function circularDistance(a: number, b: number, length: number) {
  const direct = Math.abs(a - b);
  return Math.min(direct, length - direct);
}

function formatClock(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  const tenths = Math.floor((seconds % 1) * 10);
  return `${mins}:${secs}.${tenths}`;
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
