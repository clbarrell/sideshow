import type { Player, RoundResult } from "../../../shared/protocol";
import type { GameHost, HostContext } from "../registry";

const LAPS = 3;
const ROAD_HALF = 150;
const CP_EVERY = 12;
const PLACE_POINTS = [10, 8, 6, 5, 4, 3, 2, 1, 1, 1];

export interface KartInput {
  s: number; // steer, -1..1
  t: number; // throttle, -1..1
  b: boolean; // boost
}

interface Car {
  id: string;
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
  finished: number | null; // race clock at finish
  input: KartInput;
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
  const cam = { x: 0, y: 0, z: 0.3 };

  // Grid: stagger cars back along the track from the start line.
  const spawn = (p: Player, i: number) => {
    const idx = (track.pts.length - 6 - i * 3) % track.pts.length;
    const here = track.pts[idx];
    const next = track.pts[(idx + 1) % track.pts.length];
    const a = Math.atan2(next.y - here.y, next.x - here.x);
    const off = (i % 2 === 0 ? -1 : 1) * 55;
    return {
      id: p.id,
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
      if (!car) return;
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
        return;
      }
      clock += dt;

      for (const c of cars.values()) {
        if (c.finished !== null) {
          c.v *= 1 - 2.5 * dt;
        } else {
          const near = nearestSample(c.x, c.y);
          const offRoad = near.dist > ROAD_HALF;

          if (c.cool > 0) c.cool -= dt;
          if (c.input.b && c.boost <= 0 && c.cool <= 0) {
            c.boost = 1.1;
            c.cool = 5;
          }
          if (c.boost > 0) c.boost -= dt;

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
              if (c.lap >= LAPS) {
                c.finished = clock;
                if (firstFinish === null) firstFinish = clock;
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
            a.v *= 0.9;
            b.v *= 0.9;
          }
        }
      }

      const active = [...cars.values()].filter((c) => c.finished === null);
      if (cars.size > 0 && active.length === 0) over = true;
      if (firstFinish !== null && clock - firstFinish > 30) over = true;
    },

    resize() {
      /* camera recalculates every frame */
    },

    render(g, w, h) {
      g.save();
      g.fillStyle = "#0E2226";
      g.fillRect(0, 0, w, h);

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
        const tz = clamp(Math.min(w / (maxX - minX), h / (maxY - minY)), 0.13, 0.85);
        cam.x += ((minX + maxX) / 2 - cam.x) * 0.09;
        cam.y += ((minY + maxY) / 2 - cam.y) * 0.09;
        cam.z += (tz - cam.z) * 0.06;
      }

      g.translate(w / 2, h / 2);
      g.scale(cam.z, cam.z);
      g.translate(-cam.x, -cam.y);

      // Road
      g.lineJoin = "round";
      g.lineCap = "round";
      g.beginPath();
      track.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
      g.closePath();
      g.strokeStyle = "#1D4149";
      g.lineWidth = ROAD_HALF * 2 + 26;
      g.stroke();
      g.strokeStyle = "#22333A";
      g.lineWidth = ROAD_HALF * 2;
      g.stroke();

      g.setLineDash([70, 90]);
      g.strokeStyle = "rgba(246,239,226,0.28)";
      g.lineWidth = 7;
      g.stroke();
      g.setLineDash([]);

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
      for (const c of standings().reverse()) {
        g.save();
        g.translate(c.x, c.y);
        g.rotate(c.a);
        if (c.boost > 0) {
          g.fillStyle = "rgba(255,194,74,0.5)";
          g.beginPath();
          g.ellipse(-46, 0, 34, 13, 0, 0, Math.PI * 2);
          g.fill();
        }
        g.fillStyle = c.color;
        roundRect(g, -26, -16, 52, 32, 9);
        g.fill();
        g.fillStyle = "rgba(14,34,38,0.5)";
        roundRect(g, 0, -11, 17, 22, 5);
        g.fill();
        g.restore();

        g.fillStyle = "#F6EFE2";
        g.font = "600 34px Archivo, system-ui, sans-serif";
        g.textAlign = "center";
        g.fillText(c.name, c.x, c.y - 40);
      }
      g.restore();

      // HUD
      const board = standings();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const hudScale = dpr * clamp(Math.min(w / dpr / 1280, h / dpr / 720), 1, 1.5);
      const boardX = 28 * hudScale;
      const boardWidth = Math.min(620 * hudScale, w - 56 * hudScale);
      g.font = `700 ${Math.round(32 * hudScale)}px Archivo, system-ui, sans-serif`;
      g.textAlign = "left";
      board.forEach((c, i) => {
        const y = (56 + i * 56) * hudScale;
        const status = c.finished !== null ? "done" : `lap ${Math.min(c.lap + 1, LAPS)}/${LAPS}`;
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

      if (countdown > 0) {
        const n = Math.ceil(countdown);
        g.textAlign = "center";
        g.fillStyle = "#FFC24A";
        g.font = `800 ${Math.round(h * 0.3)}px Archivo, system-ui, sans-serif`;
        g.fillText(n > 3 ? "GET SET" : n > 0 ? String(n) : "GO", w / 2, h / 2 + h * 0.1);
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
