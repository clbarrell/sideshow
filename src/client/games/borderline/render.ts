import type { BorderlinePhase } from "./protocol";
import type { CampaignPlayer, ResolvedOrder } from "./rules";
import { factionFor } from "./rules";
import { BORDERLINE_TUTORIAL_STEPS, borderlineTutorialStep } from "./tutorial";
import { FACTIONS, type BorderlineWorld } from "./world";

export interface BorderlineRenderState {
  phase: BorderlinePhase;
  turn: number;
  seconds: number;
  phaseClock: number;
  players: CampaignPlayer[];
  owners: ReadonlyMap<number, string>;
  previousOwners: ReadonlyMap<number, string>;
  revealedOrders: readonly ResolvedOrder[];
  captures: readonly { province: number; from: string | null; to: string }[];
  world: BorderlineWorld;
  reducedMotion: boolean;
  oceanImage?: CanvasImageSource | null;
  paperImage?: CanvasImageSource | null;
}

const NAVY = "#082A3B";
const NAVY_DARK = "#041B27";
const PAPER = "#F5E5C6";
const INK = "#17242A";
const GOLD = "#F2C66D";

export function renderBorderline(c: CanvasRenderingContext2D, width: number, height: number, state: BorderlineRenderState) {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const scale = Math.min(w / 1920, h / 1080);
  c.save();
  c.fillStyle = NAVY;
  c.fillRect(0, 0, w, h);
  if (state.oceanImage) {
    c.save();
    c.globalAlpha = 0.82;
    c.drawImage(state.oceanImage, 0, 0, w, h);
    c.restore();
  }
  drawSea(c, w, h, scale);

  const headerH = 92 * scale;
  const railH = 126 * scale;
  const map = {
    x: 96 * scale,
    y: headerH + 14 * scale,
    w: w - 192 * scale,
    h: h - headerH - railH - 34 * scale,
  };
  drawHeader(c, w, headerH, scale, state);
  drawMap(c, map, scale, state);
  drawRoster(c, w, h - railH, railH, scale, state.players, state.turn);
  drawPhaseOverlay(c, w, h, map, scale, state);
  c.restore();
}

function drawSea(c: CanvasRenderingContext2D, w: number, h: number, scale: number) {
  c.save();
  const wash = c.createLinearGradient(0, 0, 0, h);
  wash.addColorStop(0, "rgba(255,255,255,.035)");
  wash.addColorStop(0.65, "rgba(0,0,0,0)");
  wash.addColorStop(1, "rgba(0,0,0,.2)");
  c.fillStyle = wash;
  c.fillRect(0, 0, w, h);
  c.restore();
}

function drawHeader(c: CanvasRenderingContext2D, w: number, headerH: number, scale: number, state: BorderlineRenderState) {
  c.save();
  c.fillStyle = PAPER;
  c.textBaseline = "middle";
  c.font = `400 ${54 * scale}px "Alfa Slab One", Georgia, serif`;
  c.fillText("BORDERLINE", 34 * scale, headerH * 0.5);
  c.fillStyle = "rgba(245,229,198,.44)";
  c.fillRect(460 * scale, headerH * 0.5 - scale, Math.max(40 * scale, w * .5 - 580 * scale), 2 * scale);
  c.fillRect(w * .5 + 120 * scale, headerH * 0.5 - scale, Math.max(40 * scale, w * .5 - 625 * scale), 2 * scale);
  c.fillStyle = PAPER;
  c.textAlign = "center";
  c.font = `800 ${24 * scale}px system-ui, sans-serif`;
  c.fillText(state.turn ? `TURN ${state.turn} / 9` : "FIELD SCHOOL", w * 0.5, headerH * 0.5);
  const pill = phaseLabel(state.phase);
  c.font = `900 ${19 * scale}px system-ui, sans-serif`;
  const pillW = Math.max(190 * scale, c.measureText(pill).width + 42 * scale);
  const pillX = Math.min(w - pillW - 28 * scale, w - 470 * scale);
  roundedPath(c, pillX, 18 * scale, pillW, 56 * scale, 8 * scale);
  c.fillStyle = state.phase === "planning" || state.phase === "practice" ? GOLD : PAPER;
  c.fill();
  c.fillStyle = INK;
  c.fillText(pill, pillX + pillW / 2, 46 * scale);
  c.restore();
}

function phaseLabel(phase: BorderlinePhase) {
  if (phase === "planning") return "ORDERS OPEN";
  if (phase === "practice") return "PRACTICE ORDER";
  if (phase === "reveal" || phase === "practiceReveal") return "ORDERS REVEALED";
  if (phase === "recap") return "BORDERS SETTLED";
  if (phase === "complete") return "CAMPAIGN COMPLETE";
  if (phase === "countdown") return "LOOK UP";
  return "HOW TO PLAY";
}

type MapBox = { x: number; y: number; w: number; h: number };
type Point = { x: number; y: number };
type AtlasProvince = { points: Point[]; center: Point; x: number; y: number; w: number; h: number };
const atlasLayers = new WeakMap<CanvasRenderingContext2D, { key: string; paper: CanvasImageSource | null | undefined; canvas: HTMLCanvasElement }>();

function drawMap(c: CanvasRenderingContext2D, map: MapBox, scale: number, state: BorderlineRenderState) {
  const shownOwners = (state.phase === "reveal" || state.phase === "practiceReveal") && state.phaseClock < 1.5 ? state.previousOwners : state.owners;
  const key = `${state.world.cols}x${state.world.rows}:${map.x},${map.y},${map.w},${map.h}:` + state.world.provinces.map(({ id }) => shownOwners.get(id) ?? "-").join(",") + state.players.map(p => `${p.player.id}:${p.player.name}:${p.player.color}:${p.factionIndex}:${p.portIndex}`).join(";");
  // Cache paper, coast, flags and lettering together. Only orders animate each frame.
  // Recording contexts in the public-seam tests deliberately have no real canvas.
  if (typeof c.canvas?.width === "number" && typeof document !== "undefined") {
    let layer = atlasLayers.get(c);
    if (!layer || layer.key !== key || layer.paper !== state.paperImage) {
      const canvas = document.createElement("canvas");
      canvas.width = c.canvas.width;
      canvas.height = c.canvas.height;
      const context = canvas.getContext("2d");
      if (context) {
        drawAtlas(context, map, scale, state, shownOwners);
        layer = { key, paper: state.paperImage, canvas };
        atlasLayers.set(c, layer);
      }
    }
    if (layer) c.drawImage(layer.canvas, 0, 0);
  } else drawAtlas(c, map, scale, state, shownOwners);
  if (state.phase === "reveal" || state.phase === "practiceReveal" || state.phase === "recap") drawOrders(c, map, scale, state);
}

function outline(c: CanvasRenderingContext2D, points: Point[]) {
  c.beginPath();
  points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
  c.closePath();
}

function drawAtlas(c: CanvasRenderingContext2D, map: MapBox, scale: number, state: BorderlineRenderState, owners: ReadonlyMap<number, string>) {
  const shapes = atlasGeometry(map, state.world);
  // A single coastal edge is laminated beneath every province. Shared interior
  // boundaries stay flat; the exposed cut edge has its own thickness and lighting.
  const coast = geometryCache!.coast;
  c.save();
  c.lineJoin = "round";
  const layers = [
    { depth: 19, color: "#6E5437" }, { depth: 16, color: "#AB8653" },
    { depth: 12, color: "#D0AC70" }, { depth: 9, color: "#A88755" },
    { depth: 5, color: "#E5C58B" }, { depth: 2, color: "#F5DDA8" },
  ];
  layers.forEach(({ depth, color }, layer) => {
    const edge = coast.map((point, index) => ({
      x: point.x + depth * .12 * scale,
      y: point.y + depth * (.92 + .09 * Math.sin(index * .21) + .05 * Math.sin(index * .73)) * scale,
    }));
    outline(c, edge);
    c.fillStyle = color; c.strokeStyle = color; c.lineWidth = 9 * scale;
    c.shadowColor = layer === 0 ? "rgba(0,8,13,.72)" : "transparent";
    c.shadowBlur = layer === 0 ? 24 * scale : 0;
    c.shadowOffsetY = layer === 0 ? 12 * scale : 0;
    c.shadowOffsetX = layer === 0 ? 3 * scale : 0;
    c.fill(); c.stroke();
  });
  c.shadowColor = "transparent";
  c.shadowOffsetY = 0; c.shadowOffsetX = 0;
  // Small exposed paper facets interrupt the strata like a hand-cut atlas edge.
  for (let i = 1; i < coast.length; i += 3) {
    const a = coast[i - 1], b = coast[i];
    if (b.x - a.x > 0 && b.y < map.y + map.h * .5) continue;
    const depth = (13 + hash(i * 31) % 7) * scale;
    c.fillStyle = i % 2 ? "rgba(75,51,29,.32)" : "rgba(255,230,175,.3)";
    c.beginPath(); c.moveTo(a.x, a.y + 2 * scale); c.lineTo(b.x, b.y + 2 * scale);
    c.lineTo(b.x + 2 * scale, b.y + depth); c.lineTo(a.x + 2 * scale, a.y + depth - 2 * scale); c.closePath(); c.fill();
  }
  outline(c, coast); c.strokeStyle = "#F7E3B9"; c.lineWidth = 11 * scale; c.stroke();
  c.restore();
  for (const definition of state.world.provinces) {
    const owner = playerById(state.players, owners.get(definition.id));
    drawProvince(c, shapes[definition.id - 1], definition.id, owner?.player.color ?? "#CABC9C", scale, owner, state.paperImage);
  }
  drawPorts(c, map, scale, state.players, state.world);
}

function drawProvince(c: CanvasRenderingContext2D, shape: AtlasProvince, id: number, fill: string, scale: number, owner?: CampaignPlayer, paperImage?: CanvasImageSource | null) {
  const { points, center, x, y, w, h } = shape;
  c.save();
  c.shadowColor = "transparent";
  c.shadowOffsetY = 0;
  c.lineJoin = "round";
  outline(c, points);
  c.fillStyle = fill;
  c.fill();
  c.save();
  c.clip();
  // The supplied fibres are material, while restrained light keeps the seat hues true.
  const light = c.createLinearGradient(x, y, x + w * .45, y + h);
  light.addColorStop(0, "rgba(255,244,209,.2)");
  light.addColorStop(.55, "rgba(255,244,209,.04)");
  light.addColorStop(1, "rgba(30,28,17,.19)");
  c.fillStyle = light;
  c.fillRect(x, y, w, h);
  if (paperImage) {
    const pattern = cachedPattern(c, paperImage);
    if (pattern) { c.globalCompositeOperation = "multiply"; c.globalAlpha = .23; c.fillStyle = pattern; c.fillRect(x, y, w, h); }
  }
  c.globalCompositeOperation = "source-over";
  c.globalAlpha = .09;
  c.fillStyle = INK;
  for (let i = 0; i < 140; i++) {
    const px = x + (hash(id * 997 + i * 71) % 1000) / 1000 * w;
    const py = y + (hash(id * 641 + i * 97) % 1000) / 1000 * h;
    c.fillRect(px, py, (1 + i % 3) * scale, scale);
  }
  c.globalAlpha = 1;
  drawTerrain(c, shape, id, scale);
  c.restore();
  outline(c, points);
  c.strokeStyle = "#F1DCB0";
  c.lineWidth = 5 * scale;
  c.stroke();
  c.strokeStyle = "rgba(72,52,29,.3)";
  c.lineWidth = .8 * scale;
  c.stroke();
  drawProvinceLabel(c, shape, id, scale, owner);
  c.restore();
}

function drawProvinceLabel(c: CanvasRenderingContext2D, shape: AtlasProvince, id: number, scale: number, owner?: CampaignPlayer) {
  const { x, y } = shape.center;
  c.save();
  c.shadowColor = "transparent";
  c.shadowOffsetY = 0;
  c.textAlign = "center";
  c.textBaseline = "middle";
  if (owner) drawFlag(c, factionFor(owner).emblem, x, y - 36 * scale, owner.player.color, scale);
  c.fillStyle = INK;
  c.font = `400 ${34 * scale}px "Alfa Slab One", Georgia, serif`;
  c.fillText(String(id).padStart(2, "0"), x, y + 7 * scale);
  c.font = `850 ${(owner ? 13 : 10) * scale}px system-ui, sans-serif`;
  c.fillStyle = owner ? INK : "#4E493D";
  c.fillText(owner ? owner.player.name.toUpperCase() : "OPEN", x, y + 38 * scale, 148 * scale);
  c.restore();
}

function drawPorts(c: CanvasRenderingContext2D, map: { x: number; y: number; w: number; h: number }, scale: number, players: CampaignPlayer[], world: BorderlineWorld) {
  for (const player of players) {
    const port = world.ports[player.portIndex];
    const x = map.x + port.x * map.w;
    const y = map.y + port.y * map.h;
    c.save();
    c.fillStyle = NAVY_DARK;
    c.strokeStyle = player.player.color;
    c.lineWidth = 4 * scale;
    c.beginPath();
    c.arc(x, y, 19 * scale, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    drawEmblem(c, factionFor(player).emblem, x, y, 10 * scale, PAPER);
    c.fillStyle = NAVY_DARK;
    c.strokeStyle = player.player.color;
    c.lineWidth = 1.5 * scale;
    roundedPath(c, x - 30 * scale, y + 23 * scale, 60 * scale, 24 * scale, 5 * scale);
    c.fill();
    c.stroke();
    c.fillStyle = PAPER;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.font = `900 ${14 * scale}px system-ui, sans-serif`;
    c.fillText(`${port.entries[0]} · ${port.entries[1]}`, x, y + 35 * scale);
    c.restore();
  }
}

function drawOrders(c: CanvasRenderingContext2D, map: MapBox, scale: number, state: BorderlineRenderState) {
  const progress = state.reducedMotion ? 1 : Math.min(1, state.phaseClock / 1.1);
  const settled = Math.max(0, Math.min(1, (state.phaseClock - 1.3) / .65));
  const shapes = atlasGeometry(map, state.world);
  const badges: Array<{ x: number; y: number; force: number; emblem: string; color: string }> = [];
  for (const order of state.revealedOrders) {
    if (order.mode === "pass") continue;
    const player = playerById(state.players, order.playerId);
    if (!player) continue;
    const target = provinceCenter(map, state.world, order.target);
    const sameTarget = state.revealedOrders.filter(o => o.mode !== "pass" && o.target === order.target);
    const slot = sameTarget.indexOf(order);
    const badge = { x: target.x + (slot % 2 ? -78 : 78) * scale, y: target.y + (Math.floor(slot / 2) * 34 - 14) * scale };
    if (order.mode === "guard") {
      c.save();
      c.strokeStyle = player.player.color;
      c.lineWidth = 5 * scale;
      c.globalAlpha = .8;
      c.beginPath();
      c.arc(target.x, target.y, 62 * scale * (.9 + .1 * progress), 0, Math.PI * 2);
      c.stroke();
      c.restore();
      badges.push({ ...badge, force: order.force, emblem: factionFor(player).emblem, color: player.player.color });
      continue;
    }
    const port = state.world.ports[player.portIndex];
    const start = { x: map.x + port.x * map.w, y: map.y + port.y * map.h };
    const dx = badge.x - start.x, dy = badge.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const bend = (player.factionIndex % 2 ? 1 : -1) * Math.min(100 * scale, length * .18);
    const control = { x: (start.x + badge.x) / 2 - dy / length * bend, y: (start.y + badge.y) / 2 + dx / length * bend };
    c.save();
    // Carve out the complete label blocks before drawing routes. An invasion can
    // cross the map without drawing through another province's number or flag.
    c.beginPath();
    c.rect(map.x - 60 * scale, map.y - 60 * scale, map.w + 120 * scale, map.h + 120 * scale);
    for (const shape of shapes) c.rect(shape.center.x - 64 * scale, shape.center.y - 59 * scale, 128 * scale, 111 * scale);
    c.clip("evenodd");
    c.globalAlpha = state.reducedMotion ? .2 : 1 - settled * .82;
    drawPaperRibbon(c, start, control, badge, progress, order.force, player.player.color, scale, state.paperImage);
    c.restore();
    if (progress > .8) badges.push({ ...badge, force: order.force, emblem: factionFor(player).emblem, color: player.player.color });
  }
  // All stamps and port labels sit above every ribbon, including crossing routes.
  for (const badge of badges) drawOrderBadge(c, badge.x, badge.y, badge.force, badge.emblem, badge.color, scale);
  drawPorts(c, map, scale, state.players, state.world);
  if (state.phaseClock > 1.35 && !state.reducedMotion) {
    for (const capture of state.captures) {
      const center = provinceCenter(map, state.world, capture.province);
      c.save();
      c.globalAlpha = Math.max(0, 1 - (state.phaseClock - 1.35) / 1.4);
      c.strokeStyle = PAPER; c.lineWidth = 6 * scale;
      c.beginPath(); c.arc(center.x, center.y, 68 * scale + (state.phaseClock - 1.35) * 12 * scale, 0, Math.PI * 2); c.stroke(); c.restore();
    }
  }
}

function drawPaperRibbon(c: CanvasRenderingContext2D, start: Point, control: Point, target: Point, progress: number, force: number, color: string, scale: number, paperImage?: CanvasImageSource | null) {
  const left: Point[] = [], right: Point[] = [];
  const halfWidth = (8 + force * 2) * scale;
  const headStart = Math.max(0, progress - .065);
  const steps = 36;
  let tip = start, normal = { x: 0, y: 1 };
  for (let i = 0; i <= steps; i++) {
    const t = i / steps * progress, u = 1 - t;
    const point = { x: u * u * start.x + 2 * u * t * control.x + t * t * target.x, y: u * u * start.y + 2 * u * t * control.y + t * t * target.y };
    const dx = 2 * u * (control.x - start.x) + 2 * t * (target.x - control.x);
    const dy = 2 * u * (control.y - start.y) + 2 * t * (target.y - control.y);
    const length = Math.hypot(dx, dy) || 1;
    normal = { x: -dy / length, y: dx / length };
    const width = t > headStart ? halfWidth * (progress - t) / Math.max(.001, progress - headStart) * 2.2 : halfWidth;
    left.push({ x: point.x + normal.x * width, y: point.y + normal.y * width });
    right.push({ x: point.x - normal.x * width, y: point.y - normal.y * width });
    tip = point;
  }
  const points = [...left, tip, ...right.reverse()];
  c.save();
  outline(c, points);
  c.shadowColor = "rgba(7,18,22,.4)"; c.shadowBlur = 5 * scale; c.shadowOffsetY = 4 * scale;
  c.fillStyle = color; c.fill();
  c.shadowColor = "transparent"; c.shadowOffsetY = 0;
  c.strokeStyle = "rgba(60,39,20,.28)"; c.lineWidth = 1.3 * scale; c.stroke();
  c.save(); c.clip();
  const light = c.createLinearGradient(start.x, start.y, target.x, target.y);
  light.addColorStop(0, "rgba(245,225,183,.18)"); light.addColorStop(.35, "rgba(255,245,213,.34)"); light.addColorStop(.68, "rgba(66,43,19,.15)"); light.addColorStop(1, "rgba(255,239,191,.14)");
  c.fillStyle = light; c.fillRect(Math.min(start.x, control.x, target.x) - 80 * scale, Math.min(start.y, control.y, target.y) - 80 * scale, Math.abs(target.x - start.x) + Math.abs(control.x - start.x) + 160 * scale, Math.abs(target.y - start.y) + Math.abs(control.y - start.y) + 160 * scale);
  if (paperImage) { const pattern = cachedPattern(c, paperImage); if (pattern) { c.globalAlpha *= .2; c.globalCompositeOperation = "multiply"; c.fillStyle = pattern; c.fill(); } }
  c.restore();
  c.strokeStyle = "rgba(255,243,202,.5)"; c.lineWidth = 1.3 * scale;
  c.beginPath(); left.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke();
  c.restore();
}

function drawOrderBadge(c: CanvasRenderingContext2D, x: number, y: number, force: number, emblem: string, color: string, scale: number) {
  c.save();
  const points = [[-32,-20],[27,-21],[35,-13],[32,19],[-28,21],[-35,12]].map(([dx, dy]) => ({ x: x + dx * scale, y: y + dy * scale }));
  outline(c, points);
  c.shadowColor = "rgba(10,19,22,.35)"; c.shadowBlur = 5 * scale; c.shadowOffsetY = 4 * scale;
  c.fillStyle = "#F3DEB5"; c.fill();
  c.shadowColor = "transparent"; c.shadowOffsetY = 0;
  c.strokeStyle = "#8C714B"; c.lineWidth = 1.5 * scale; c.stroke();
  c.save(); c.clip();
  c.globalAlpha = .16; c.fillStyle = color; c.fill();
  c.globalAlpha = .12; c.fillStyle = INK;
  for (let i = 0; i < 12; i++) c.fillRect(x + ((hash(i * 39 + force) % 58) - 29) * scale, y + ((hash(i * 71) % 32) - 16) * scale, scale, scale);
  c.restore();
  c.strokeStyle = color; c.lineWidth = 3 * scale;
  c.beginPath(); c.moveTo(x - 26 * scale, y + 14 * scale); c.lineTo(x + 25 * scale, y + 13 * scale); c.stroke();
  drawEmblem(c, emblem, x - 15 * scale, y - scale, 11 * scale, INK);
  c.fillStyle = INK; c.font = `400 ${22 * scale}px "Alfa Slab One", Georgia, serif`; c.textAlign = "center"; c.textBaseline = "middle";
  c.fillText(String(force), x + 13 * scale, y);
  c.restore();
}

function drawRoster(c: CanvasRenderingContext2D, w: number, y: number, h: number, scale: number, players: CampaignPlayer[], turn: number) {
  c.save();
  c.fillStyle = "rgba(3, 20, 29, .96)";
  c.fillRect(0, y, w, h);
  c.fillStyle = "rgba(245,229,198,.5)";
  c.fillRect(0, y, w, 2 * scale);
  const cellW = w / Math.max(1, players.length);
  players.forEach((player, index) => {
    const x = index * cellW;
    if (index) {
      c.fillStyle = "rgba(245,229,198,.2)";
      c.fillRect(x, y + 18 * scale, scale, h - 36 * scale);
    }
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillStyle = PAPER;
    c.font = `900 ${20 * scale}px system-ui, sans-serif`;
    c.fillText(player.player.name.toUpperCase(), x + cellW / 2, y + 25 * scale, cellW - 14 * scale);
    drawEmblem(c, factionFor(player).emblem, x + cellW / 2 - 34 * scale, y + 61 * scale, 19 * scale, player.player.color);
    c.font = `400 ${34 * scale}px "Alfa Slab One", Georgia, serif`;
    c.fillText(String(player.score), x + cellW / 2 + 15 * scale, y + 62 * scale);
    c.font = `900 ${17 * scale}px system-ui, sans-serif`;
    [1, 2, 3].forEach((force, forceIndex) => {
      const available = player.available.includes(force as 1 | 2 | 3);
      const fx = x + cellW / 2 + (forceIndex - 1) * 37 * scale;
      c.fillStyle = available ? player.player.color : "rgba(245,229,198,.2)";
      roundedPath(c, fx - 12 * scale, y + 87 * scale, 24 * scale, 32 * scale, 3 * scale); c.fill();
      c.strokeStyle = available ? "rgba(245,229,198,.78)" : "rgba(245,229,198,.35)"; c.lineWidth = 1.5 * scale; c.stroke();
      c.fillStyle = available ? NAVY_DARK : "rgba(245,229,198,.7)";
      c.fillText(String(force), fx, y + 103 * scale);
      if (!available) {
        c.strokeStyle = PAPER; c.lineWidth = 2.5 * scale;
        c.beginPath(); c.moveTo(fx - 10 * scale, y + 90 * scale); c.lineTo(fx + 10 * scale, y + 116 * scale); c.stroke();
      }
    });
    if (turn > 0 && !player.connected) {
      c.fillStyle = "rgba(3,20,29,.76)";
      c.fillRect(x, y + 4 * scale, cellW, h - 4 * scale);
      c.fillStyle = PAPER;
      c.font = `800 ${12 * scale}px system-ui, sans-serif`;
      c.fillText("OFFLINE · ORDER SAFE", x + cellW / 2, y + h / 2);
    }
  });
  c.restore();
}

function drawPhaseOverlay(c: CanvasRenderingContext2D, w: number, h: number, map: { x: number; y: number; w: number; h: number }, scale: number, state: BorderlineRenderState) {
  if (state.phase === "planning" || state.phase === "practice") {
    const copy = state.phase === "practice" ? "TRY ONE · THIS MAP RESETS" : "MAKE A DEAL · ORDER ON YOUR PHONE";
    banner(c, w / 2, map.y + 18 * scale, copy, `${Math.ceil(state.seconds)}`, scale);
    return;
  }
  if (state.phase === "runway") {
    const lessonIndex = borderlineTutorialStep(state.phaseClock);
    const lesson = BORDERLINE_TUTORIAL_STEPS[lessonIndex];
    lessonCard(c, w, h, lesson.title, lesson.narration, scale, lessonIndex);
    return;
  }
  if (state.phase === "countdown") {
    lessonCard(c, w, h, state.seconds > 0.2 ? String(Math.ceil(state.seconds)) : "GO", "Phones ready. Eyes on the atlas.", scale);
    return;
  }
  if (state.phase === "practiceReveal") {
    banner(c, w / 2, map.y + 18 * scale, "PRACTICE ONLY · THE ATLAS RESETS", "LOOK UP", scale);
    return;
  }
  if (state.phase === "reveal") {
    banner(c, w / 2, map.y + 18 * scale, "EVERY ORDER LANDS TOGETHER", "REVEAL", scale);
    return;
  }
  if (state.phase === "recap") {
    const copy = state.turn === 3 || state.turn === 6 ? "ALL THREE STRENGTH CARDS RETURN" : "TERRITORY SCORED · PLAN YOUR NEXT DEAL";
    drawOutcomeLedger(c, map, scale, state.players);
    banner(c, w / 2, map.y + 18 * scale, copy, `${Math.ceil(state.seconds)}`, scale);
    return;
  }
  if (state.phase === "complete") {
    const top = [...state.players].sort((a, b) => b.score - a.score || a.player.seat - b.player.seat)[0];
    lessonCard(c, w, h, top ? `${top.player.name.toUpperCase()} DRAWS THE WORLD` : "CAMPAIGN COMPLETE", top ? `${top.score} territory points across nine turns` : "", scale);
  }
}

function drawOutcomeLedger(c: CanvasRenderingContext2D, map: { x: number; y: number; w: number; h: number }, scale: number, players: CampaignPlayer[]) {
  const rows = players.length <= 5 ? 1 : 2;
  const cols = Math.ceil(players.length / rows);
  const ledgerH = 61 * rows * scale;
  const x = map.x + 38 * scale;
  const y = map.y + map.h - ledgerH - 15 * scale;
  const width = map.w - 76 * scale;
  const cellH = ledgerH / rows;
  c.save();
  roundedPath(c, x, y, width, ledgerH, 10 * scale);
  c.fillStyle = "rgba(4,27,39,.96)";
  c.fill();
  c.strokeStyle = "rgba(245,229,198,.72)";
  c.lineWidth = 2 * scale;
  c.stroke();
  players.forEach((player, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const rowCount = Math.min(cols, players.length - row * cols);
    const cellW = width / rowCount;
    const cellX = x + col * cellW;
    const cellY = y + row * cellH;
    if (col) { c.fillStyle = "rgba(245,229,198,.13)"; c.fillRect(cellX, cellY + 10 * scale, scale, cellH - 20 * scale); }
    if (row) { c.fillStyle = "rgba(245,229,198,.13)"; c.fillRect(cellX + 10 * scale, cellY, cellW - 20 * scale, scale); }
    drawEmblem(c, factionFor(player).emblem, cellX + 24 * scale, cellY + 30 * scale, 11 * scale, player.player.color);
    c.textAlign = "left";
    c.textBaseline = "middle";
    c.fillStyle = PAPER;
    c.font = `900 ${13 * scale}px system-ui, sans-serif`;
    c.fillText(player.player.name.toUpperCase(), cellX + 43 * scale, cellY + 22 * scale, cellW - 54 * scale);
    c.fillStyle = GOLD;
    c.font = `850 ${12 * scale}px system-ui, sans-serif`;
    c.fillText(shortOutcome(player.outcome), cellX + 43 * scale, cellY + 41 * scale, cellW - 54 * scale);
  });
  c.restore();
}

function shortOutcome(outcome: string) {
  const province = outcome.match(/province (\d+)/i)?.[1] ?? outcome.match(/Province (\d+)/)?.[1];
  const territory = outcome.match(/\+(\d+) territory/i)?.[1];
  const score = territory ? ` · +${territory}` : "";
  if (/captured/i.test(outcome)) return `CAPTURED ${province ?? "LAND"}${score}`;
  if (/fell/i.test(outcome)) return `LOST ${province ?? "LAND"}${score}`;
  if (/tied|attackers tied/i.test(outcome)) return `TIE AT ${province ?? "BORDER"}${score}`;
  if (/held|stayed under/i.test(outcome)) return `HELD ${province ?? "LAND"}${score}`;
  if (/stronger/i.test(outcome)) return `OUTMUSCLED AT ${province ?? "BORDER"}${score}`;
  if (/port stays open/i.test(outcome)) return `PORT OPEN · PASSED${score}`;
  return `NO BORDER CHANGE${score}`;
}

function banner(c: CanvasRenderingContext2D, centerX: number, y: number, label: string, right: string, scale: number) {
  c.save();
  c.font = `900 ${17 * scale}px system-ui, sans-serif`;
  const width = Math.min(900 * scale, c.measureText(label).width + 220 * scale);
  roundedPath(c, centerX - width / 2, y, width, 50 * scale, 7 * scale);
  c.fillStyle = "rgba(4,27,39,.92)";
  c.fill();
  c.strokeStyle = "rgba(245,229,198,.75)";
  c.lineWidth = 2 * scale;
  c.stroke();
  c.fillStyle = PAPER;
  c.textBaseline = "middle";
  c.textAlign = "left";
  c.fillText(label, centerX - width / 2 + 20 * scale, y + 25 * scale);
  c.fillStyle = GOLD;
  c.textAlign = "right";
  c.font = `950 ${19 * scale}px system-ui, sans-serif`;
  c.fillText(right, centerX + width / 2 - 20 * scale, y + 25 * scale);
  c.restore();
}

function lessonCard(c: CanvasRenderingContext2D, w: number, h: number, title: string, detail: string, scale: number, lessonIndex?: number) {
  c.save();
  const cardW = Math.min(w - 80 * scale, 1100 * scale);
  const cardH = (lessonIndex === undefined ? 180 : 360) * scale;
  roundedPath(c, (w - cardW) / 2, (h - cardH) / 2 - 12 * scale, cardW, cardH, 12 * scale);
  c.fillStyle = "rgba(4,27,39,.95)";
  c.fill();
  c.strokeStyle = GOLD;
  c.lineWidth = 3 * scale;
  c.stroke();
  c.textAlign = "center";
  c.textBaseline = "middle";
  if (lessonIndex !== undefined) {
    c.fillStyle = GOLD;
    c.font = `900 ${18 * scale}px system-ui, sans-serif`;
    c.fillText(`STEP ${lessonIndex + 1} OF ${BORDERLINE_TUTORIAL_STEPS.length}`, w / 2, h / 2 - 142 * scale);
  }
  c.fillStyle = PAPER;
  c.font = `950 ${Math.min(48, title.length > 24 ? 38 : 48) * scale}px system-ui, sans-serif`;
  c.fillText(title, w / 2, h / 2 - (lessonIndex === undefined ? 30 : 101) * scale);
  c.fillStyle = GOLD;
  c.font = `750 ${(lessonIndex === undefined ? 22 : 20) * scale}px system-ui, sans-serif`;
  if (lessonIndex === undefined) c.fillText(detail, w / 2, h / 2 + 34 * scale);
  else drawCenteredLines(c, detail, w / 2, h / 2 + 110 * scale, cardW - 110 * scale, 26 * scale);
  if (lessonIndex !== undefined) drawLessonDiagram(c, w / 2, h / 2 - 8 * scale, lessonIndex, scale);
  c.restore();
}

function drawCenteredLines(c: CanvasRenderingContext2D, text: string, x: number, centerY: number, maxWidth: number, lineHeight: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && c.measureText(candidate).width > maxWidth) { lines.push(line); line = word; }
    else line = candidate;
  }
  if (line) lines.push(line);
  const startY = centerY - (lines.length - 1) * lineHeight / 2;
  lines.forEach((value, index) => c.fillText(value, x, startY + index * lineHeight));
}

function drawLessonDiagram(c: CanvasRenderingContext2D, centerX: number, centerY: number, lesson: number, scale: number) {
  const left = centerX - 150 * scale;
  const right = centerX + 150 * scale;
  c.save();
  c.textAlign = "center";
  c.textBaseline = "middle";
  if (lesson === 0) {
    c.strokeStyle = PAPER; c.lineWidth = 4 * scale;
    c.beginPath(); c.arc(centerX, centerY, 45 * scale, 0, Math.PI * 2); c.stroke();
    drawEmblem(c, "star", centerX, centerY, 20 * scale, "#FF5A47");
    c.fillStyle = GOLD; c.font = `950 ${22 * scale}px system-ui, sans-serif`;
    c.fillText("+1 POINT EACH TURN", centerX, centerY + 64 * scale);
    c.strokeStyle = PAPER; c.beginPath(); c.arc(left, centerY, 27 * scale, 0, Math.PI * 2); c.stroke();
    c.font = `900 ${12 * scale}px system-ui, sans-serif`; c.fillStyle = PAPER; c.fillText("HOME PORT", left, centerY + 45 * scale);
  } else if (lesson === 1) {
    [1, 2, 3].forEach((strength, index) => drawStrengthCard(c, centerX + (index - 1) * 105 * scale, centerY, strength, scale));
  } else if (lesson === 2) {
    const steps = ["1 · INVADE / GUARD", "2 · PROVINCE 12", "3 · STRENGTH 2"];
    steps.forEach((label, index) => {
      const x = centerX + (index - 1) * 290 * scale;
      roundedPath(c, x - 124 * scale, centerY - 32 * scale, 248 * scale, 64 * scale, 8 * scale);
      c.fillStyle = index === 2 ? GOLD : PAPER; c.fill();
      c.fillStyle = INK; c.font = `950 ${18 * scale}px system-ui, sans-serif`; c.fillText(label, x, centerY);
      if (index < 2) { c.fillStyle = GOLD; c.font = `950 ${28 * scale}px system-ui, sans-serif`; c.fillText("→", x + 145 * scale, centerY); }
    });
  } else if (lesson === 3) {
    roundedPath(c, centerX - 142 * scale, centerY - 30 * scale, 284 * scale, 60 * scale, 10 * scale);
    c.fillStyle = GOLD; c.fill();
    c.fillStyle = INK; c.font = `950 ${22 * scale}px system-ui, sans-serif`; c.fillText("CONFIRM ORDER", centerX, centerY);
    c.fillStyle = PAPER; c.font = `900 ${15 * scale}px system-ui, sans-serif`; c.fillText("CONFIRMED  ✓   ·   EDIT", centerX, centerY + 54 * scale);
  } else {
    c.fillStyle = "#CABFAD"; c.strokeStyle = PAPER; c.lineWidth = 4 * scale;
    c.beginPath(); c.arc(centerX, centerY, 45 * scale, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = INK; c.font = `950 ${27 * scale}px system-ui, sans-serif`; c.fillText("12", centerX, centerY + 2 * scale);
    drawTeachingArrow(c, left, centerY, centerX - 50 * scale, centerY, "#FF5A47", scale);
    drawTeachingArrow(c, right, centerY, centerX + 50 * scale, centerY, "#52E0B0", scale);
    drawForceToken(c, left, centerY, 3, "#FF5A47", scale);
    drawForceToken(c, right, centerY, 3, "#52E0B0", scale);
    c.fillStyle = GOLD; c.font = `950 ${13 * scale}px system-ui, sans-serif`; c.fillText("TIE · FLAG STAYS", centerX, centerY + 66 * scale);
  }
  c.restore();
}

function drawStrengthCard(c: CanvasRenderingContext2D, x: number, y: number, strength: number, scale: number) {
  roundedPath(c, x - 42 * scale, y - 51 * scale, 84 * scale, 102 * scale, 9 * scale);
  c.fillStyle = GOLD; c.fill(); c.strokeStyle = PAPER; c.lineWidth = 3 * scale; c.stroke();
  c.fillStyle = INK; c.font = `900 ${12 * scale}px system-ui, sans-serif`; c.fillText("STRENGTH", x, y - 26 * scale);
  c.font = `950 ${40 * scale}px Georgia, serif`; c.fillText(String(strength), x, y + 10 * scale);
  c.font = `900 ${10 * scale}px system-ui, sans-serif`; c.fillText("AVAILABLE", x, y + 37 * scale);
}

function drawTeachingArrow(c: CanvasRenderingContext2D, fromX: number, fromY: number, toX: number, toY: number, color: string, scale: number) {
  c.save();
  c.strokeStyle = color; c.fillStyle = color; c.lineWidth = 8 * scale; c.lineCap = "round";
  c.beginPath(); c.moveTo(fromX, fromY); c.lineTo(toX, toY); c.stroke();
  const direction = Math.sign(toX - fromX) || 1;
  c.beginPath(); c.moveTo(toX, toY); c.lineTo(toX - direction * 19 * scale, toY - 13 * scale); c.lineTo(toX - direction * 19 * scale, toY + 13 * scale); c.closePath(); c.fill();
  c.restore();
}

function drawForceToken(c: CanvasRenderingContext2D, x: number, y: number, force: number, color: string, scale: number) {
  c.save();
  c.fillStyle = color;
  c.strokeStyle = PAPER;
  c.lineWidth = 3 * scale;
  c.beginPath();
  c.arc(x, y, 15 * scale, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.fillStyle = NAVY_DARK;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = `950 ${14 * scale}px system-ui, sans-serif`;
  c.fillText(String(force), x, y);
  c.restore();
}

function drawEmblem(c: CanvasRenderingContext2D, emblem: string, x: number, y: number, radius: number, color: string) {
  c.save();
  c.translate(x, y);
  c.fillStyle = color;
  c.strokeStyle = color;
  c.lineWidth = Math.max(2, radius * 0.23);
  c.lineJoin = "round";
  if (emblem === "star") {
    c.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const angle = -Math.PI / 2 + i * Math.PI / 5;
      const r = i % 2 ? radius * 0.44 : radius;
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (!i) c.moveTo(px, py); else c.lineTo(px, py);
    }
    c.closePath(); c.fill();
  } else if (emblem === "moon") {
    c.beginPath(); c.arc(0, 0, radius, -Math.PI / 2, Math.PI / 2, true); c.bezierCurveTo(-radius * .35, radius * .6, -radius * .35, -radius * .6, 0, -radius); c.closePath(); c.fill();
  } else if (emblem === "pine") {
    c.beginPath(); c.moveTo(0, -radius); c.lineTo(radius, radius); c.lineTo(-radius, radius); c.closePath(); c.fill();
  } else if (emblem === "crown") {
    c.beginPath(); c.moveTo(-radius, radius * 0.65); c.lineTo(-radius, -radius * 0.5); c.lineTo(-radius * 0.35, 0); c.lineTo(0, -radius); c.lineTo(radius * 0.35, 0); c.lineTo(radius, -radius * 0.5); c.lineTo(radius, radius * 0.65); c.closePath(); c.fill();
  } else if (emblem === "shield") {
    c.beginPath(); c.moveTo(-radius, -radius * 0.7); c.lineTo(radius, -radius * 0.7); c.lineTo(radius * 0.75, radius * 0.45); c.lineTo(0, radius); c.lineTo(-radius * 0.75, radius * 0.45); c.closePath(); c.fill();
  } else if (emblem === "cross") {
    c.fillRect(-radius * 0.32, -radius, radius * 0.64, radius * 2); c.fillRect(-radius, -radius * 0.32, radius * 2, radius * 0.64);
  } else if (emblem === "sun") {
    c.beginPath(); c.arc(0, 0, radius * 0.72, 0, Math.PI * 2); c.fill();
    for (let i = 0; i < 8; i += 1) { c.rotate(Math.PI / 4); c.beginPath(); c.moveTo(0, -radius * 0.78); c.lineTo(0, -radius * 1.2); c.stroke(); }
  } else if (emblem === "bloom") {
    for (let i = 0; i < 5; i += 1) { c.rotate(Math.PI * 2 / 5); c.beginPath(); c.arc(0, -radius * 0.55, radius * 0.48, 0, Math.PI * 2); c.fill(); }
    c.beginPath(); c.arc(0, 0, radius * 0.34, 0, Math.PI * 2); c.fill();
  } else if (emblem === "bolt") {
    c.beginPath(); c.moveTo(radius * 0.15, -radius); c.lineTo(-radius * 0.7, radius * 0.1); c.lineTo(-radius * 0.1, radius * 0.05); c.lineTo(-radius * 0.3, radius); c.lineTo(radius * 0.75, -radius * 0.25); c.lineTo(radius * 0.1, -radius * 0.15); c.closePath(); c.fill();
  } else {
    c.rotate(Math.PI / 4); c.fillRect(-radius * 0.7, -radius * 0.7, radius * 1.4, radius * 1.4);
  }
  c.restore();
}

function provinceCenter(map: MapBox, world: BorderlineWorld, id: number) {
  return atlasGeometry(map, world)[id - 1].center;
}

function playerById(players: CampaignPlayer[], id?: string | null) {
  return id ? players.find((player) => player.player.id === id) : undefined;
}

function roundedPath(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  const r = Math.min(radius, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

function hash(value: number) {
  let result = value | 0;
  result = Math.imul(result ^ (result >>> 16), 0x45d9f3b);
  result = Math.imul(result ^ (result >>> 16), 0x45d9f3b);
  return (result ^ (result >>> 16)) >>> 0;
}

const paperPatterns = new WeakMap<CanvasRenderingContext2D, { image: CanvasImageSource; pattern: CanvasPattern | null }>();

function cachedPattern(c: CanvasRenderingContext2D, image: CanvasImageSource) {
  const cached = paperPatterns.get(c);
  if (cached?.image === image) return cached.pattern;
  const pattern = c.createPattern(image, "repeat");
  paperPatterns.set(c, { image, pattern });
  return pattern;
}

let geometryCache: { key: string; shapes: AtlasProvince[]; coast: Point[] } | undefined;

function atlasGeometry(map: MapBox, world: BorderlineWorld): AtlasProvince[] {
  const key = `${world.cols}x${world.rows}:${map.x},${map.y},${map.w},${map.h}`;
  if (geometryCache?.key === key) return geometryCache.shapes;
  // Keep the accepted ten-player silhouette. Smaller tiers use the same shared
  // ragged-edge construction over their exact rectangular graph.
  const authored = world.cols === 6 && world.rows === 4;
  const xs = authored ? [
    [.095,.235,.40,.535,.685,.815,.90], [.055,.205,.35,.505,.655,.805,.95],
    [.075,.195,.365,.495,.675,.815,.94], [.05,.235,.365,.545,.685,.825,.955],
    [.105,.25,.40,.555,.70,.83,.905],
  ] : Array.from({ length: world.rows + 1 }, (_, row) => Array.from({ length: world.cols + 1 }, (_, col) => {
    const base = .075 + col / world.cols * .85;
    const jitter = ((hash(row * 83 + col * 47 + 19) % 2001) / 1000 - 1) * (.85 / world.cols) * .11;
    return base + jitter;
  }));
  const ys = authored ? [
    [.16,.105,.13,.09,.125,.10,.175], [.335,.35,.315,.36,.325,.355,.335],
    [.535,.51,.555,.52,.55,.52,.555], [.69,.72,.72,.755,.725,.71,.68],
    [.91,.945,.885,.94,.905,.94,.915],
  ] : Array.from({ length: world.rows + 1 }, (_, row) => Array.from({ length: world.cols + 1 }, (_, col) => {
    const base = .12 + row / world.rows * .79;
    const jitter = ((hash(row * 61 + col * 109 + 37) % 2001) / 1000 - 1) * (.79 / world.rows) * .1;
    return base + jitter;
  }));
  const junction = (row: number, col: number): Point => ({ x: map.x + xs[row][col] * map.w, y: map.y + ys[row][col] * map.h });
  const edge = (a: Point, b: Point, seed: number, coast: boolean): Point[] => {
    const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
    const scale = map.w / 1728;
    const amplitude = (coast ? 32 : 29) * scale;
    const sign = seed % 2 ? 1 : -1;
    const steps = Math.max(24, Math.ceil(length / (5 * scale)));
    return Array.from({ length: steps + 1 }, (_, i) => {
      const t = i / steps;
      const envelope = Math.sin(Math.PI * t);
      const broad = Math.sin(t * Math.PI * 2 + seed) * .63 + sign * Math.sin(t * Math.PI) * .65;
      const fine = Math.sin(t * 31 + seed * .7) * .22 + Math.sin(t * 71 + seed * 2) * .11;
      const offset = envelope * amplitude * (broad + fine);
      return { x: a.x + dx * t - dy / length * offset, y: a.y + dy * t + dx / length * offset };
    });
  };
  const horizontal = Array.from({ length: world.rows + 1 }, (_, row) => Array.from({ length: world.cols }, (_, col) => edge(junction(row, col), junction(row, col + 1), row * 37 + col * 19, row === 0 || row === world.rows)));
  const vertical = Array.from({ length: world.rows }, (_, row) => Array.from({ length: world.cols + 1 }, (_, col) => edge(junction(row, col), junction(row + 1, col), row * 29 + col * 53 + 101, col === 0 || col === world.cols)));
  const shapes = world.provinces.map(({ id }) => {
    const row = Math.floor((id - 1) / world.cols), col = (id - 1) % world.cols;
    const points = [...horizontal[row][col], ...vertical[row][col + 1].slice(1), ...horizontal[row + 1][col].slice().reverse().slice(1), ...vertical[row][col].slice().reverse().slice(1)];
    const x = Math.min(...points.map(p => p.x)), y = Math.min(...points.map(p => p.y));
    const w = Math.max(...points.map(p => p.x)) - x, h = Math.max(...points.map(p => p.y)) - y;
    // Maximise clearance of the entire flag/number/name block, rather than averaging
    // vertices (which put the old corner labels outside their tapered provinces).
    let center = { x: x + w / 2, y: y + h / 2 }, best = -Infinity;
    const unit = map.w / 1728;
    for (let cy = y + 48 * unit; cy < y + h - 42 * unit; cy += 5 * unit) {
      for (let cx = x + 55 * unit; cx < x + w - 55 * unit; cx += 5 * unit) {
        let clearance = Infinity;
        for (const [ox, oy] of [[-30,-58],[30,-58],[-72,48],[72,48],[-42,22],[42,22]]) {
          const p = { x: cx + ox * unit, y: cy + oy * unit };
          if (!insidePolygon(p, points)) { clearance = -Infinity; break; }
          for (let i = 0; i < points.length; i++) clearance = Math.min(clearance, segmentDistance(p, points[i], points[(i + 1) % points.length]));
        }
        const score = clearance - Math.hypot(cx - (x + w / 2), cy - (y + h / 2)) * .05;
        if (score > best) { best = score; center = { x: cx, y: cy }; }
      }
    }
    return { points, center, x, y, w, h };
  });
  const coast = [
    ...horizontal[0].flat(),
    ...vertical.flatMap(row => row[world.cols]),
    ...horizontal[world.rows].slice().reverse().flatMap(edge => edge.slice().reverse()),
    ...vertical.slice().reverse().flatMap(row => row[0].slice().reverse()),
  ];
  geometryCache = { key, shapes, coast };
  return shapes;
}

function insidePolygon(p: Point, points: Point[]) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function segmentDistance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

function drawTerrain(c: CanvasRenderingContext2D, shape: AtlasProvince, id: number, scale: number) {
  c.save();
  c.strokeStyle = INK;
  c.fillStyle = INK;
  c.globalAlpha = .27;
  c.lineWidth = 1.5 * scale;
  // Ornaments occupy the outer geography, with a clear rectangle for live labels.
  for (let patch = 0; patch < 3; patch++) {
    const px = shape.x + shape.w * (.18 + (patch % 2) * .62);
    const py = shape.y + shape.h * (.26 + Math.floor(patch / 2) * .49);
    if (Math.abs(px - shape.center.x) < 100 * scale && Math.abs(py - shape.center.y) < 72 * scale) continue;
    if (id % 3 !== 2) {
      for (let tree = 0; tree < 4; tree++) {
        const tx = px + (tree % 2) * 13 * scale, ty = py + Math.floor(tree / 2) * 15 * scale;
        c.beginPath(); c.moveTo(tx, ty + 10 * scale); c.lineTo(tx, ty - 14 * scale); c.stroke();
        for (let branch = 0; branch < 3; branch++) {
          const by = ty - (9 - branch * 6) * scale, spread = (4 + branch * 2) * scale;
          c.beginPath(); c.moveTo(tx - spread, by + 7 * scale); c.lineTo(tx, by); c.lineTo(tx + spread, by + 7 * scale); c.stroke();
        }
      }
    } else {
      c.beginPath(); c.moveTo(px - 24 * scale, py + 13 * scale); c.lineTo(px - 4 * scale, py - 17 * scale); c.lineTo(px + 7 * scale, py - 2 * scale); c.lineTo(px + 15 * scale, py - 10 * scale); c.lineTo(px + 33 * scale, py + 13 * scale); c.stroke();
      c.beginPath(); c.moveTo(px - 4 * scale, py - 17 * scale); c.lineTo(px - 5 * scale, py - 2 * scale); c.lineTo(px + 3 * scale, py + 13 * scale); c.moveTo(px + 15 * scale, py - 10 * scale); c.lineTo(px + 14 * scale, py + 3 * scale); c.stroke();
      for (let hatch = 0; hatch < 5; hatch++) { c.beginPath(); c.moveTo(px - (6 + hatch * 3) * scale, py + (hatch * 4 - 6) * scale); c.lineTo(px - (3 + hatch * 3) * scale, py + (hatch * 4) * scale); c.stroke(); }
    }
  }
  c.restore();
}

function drawFlag(c: CanvasRenderingContext2D, emblem: string, x: number, y: number, color: string, scale: number) {
  c.save();
  c.strokeStyle = INK;
  c.lineWidth = 3 * scale;
  c.beginPath(); c.moveTo(x - 24 * scale, y - 18 * scale); c.lineTo(x - 24 * scale, y + 27 * scale); c.stroke();
  c.shadowColor = "rgba(0,0,0,.35)";
  c.shadowBlur = 5 * scale;
  c.shadowOffsetY = 3 * scale;
  c.fillStyle = color;
  c.beginPath(); c.moveTo(x - 22 * scale, y - 17 * scale); c.quadraticCurveTo(x, y - 24 * scale, x + 25 * scale, y - 15 * scale); c.lineTo(x + 21 * scale, y + 16 * scale); c.quadraticCurveTo(x, y + 11 * scale, x - 22 * scale, y + 16 * scale); c.closePath(); c.fill();
  c.shadowColor = "transparent"; c.shadowOffsetY = 0; c.stroke();
  c.save(); c.clip(); c.fillStyle = "rgba(0,0,0,.22)"; c.fillRect(x - 22 * scale, y - 22 * scale, 7 * scale, 45 * scale); c.restore();
  drawEmblem(c, emblem, x + 2 * scale, y - scale, 12 * scale, PAPER);
  c.restore();
}

export { FACTIONS };
