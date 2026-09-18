export const PROVINCE_COUNT = 24;

export interface ProvinceDefinition {
  id: number;
  x: number;
  y: number;
  neighbors: readonly number[];
}

export interface PortDefinition {
  home: number;
  entries: readonly [number, number];
  x: number;
  y: number;
}

export interface BorderlineWorld {
  cols: number;
  rows: number;
  provinces: readonly ProvinceDefinition[];
  ports: readonly PortDefinition[];
}

export const FACTIONS = [
  { id: "star", name: "Redstar", emblem: "star" },
  { id: "moon", name: "Moonkeep", emblem: "moon" },
  { id: "pine", name: "Pine March", emblem: "pine" },
  { id: "crown", name: "High Crown", emblem: "crown" },
  { id: "tide", name: "Blue Tide", emblem: "shield" },
  { id: "cross", name: "Crossland", emblem: "cross" },
  { id: "sun", name: "Sun Coast", emblem: "sun" },
  { id: "bloom", name: "Bloom Vale", emblem: "bloom" },
  { id: "storm", name: "Storm Reach", emblem: "bolt" },
  { id: "crystal", name: "Crystal Bay", emblem: "diamond" },
] as const;

export type FactionId = (typeof FACTIONS)[number]["id"];

const TEN_PLAYER_PORTS: readonly PortDefinition[] = [
  { home: 1, entries: [1, 2], x: 0.025, y: 0.13 },
  { home: 3, entries: [3, 4], x: 0.31, y: 0.035 },
  { home: 6, entries: [5, 6], x: 0.69, y: 0.035 },
  { home: 12, entries: [11, 12], x: 0.975, y: 0.13 },
  { home: 18, entries: [17, 18], x: 0.985, y: 0.36 },
  { home: 24, entries: [23, 24], x: 0.985, y: 0.64 },
  { home: 22, entries: [21, 22], x: 0.975, y: 0.87 },
  { home: 19, entries: [19, 20], x: 0.69, y: 0.955 },
  { home: 13, entries: [13, 14], x: 0.31, y: 0.955 },
  { home: 7, entries: [7, 8], x: 0.025, y: 0.87 },
];

const worlds = new Map<number, BorderlineWorld>();

/** The exact active atlas for a launch roster. */
export function worldForPlayerCount(playerCount: number): BorderlineWorld {
  const count = Math.max(3, Math.min(10, Math.floor(playerCount)));
  const cached = worlds.get(count);
  if (cached) return cached;
  const [cols, rows] = count <= 4 ? [4, 3] : count <= 6 ? [5, 3] : count <= 8 ? [6, 3] : [6, 4];
  const provinces = rectangularProvinces(cols, rows);
  const ports = count === 10 ? TEN_PLAYER_PORTS : sampledPorts(cols, rows, count);
  const world = { cols, rows, provinces, ports } satisfies BorderlineWorld;
  worlds.set(count, world);
  return world;
}

function rectangularProvinces(cols: number, rows: number): readonly ProvinceDefinition[] {
  return Array.from({ length: cols * rows }, (_, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const neighbors: number[] = [];
    if (col > 0) neighbors.push(index);
    if (col + 1 < cols) neighbors.push(index + 2);
    if (row > 0) neighbors.push(index + 1 - cols);
    if (row + 1 < rows) neighbors.push(index + 1 + cols);
    return {
      id: index + 1,
      x: (col + 0.5 + (row % 2 ? 0.06 : 0)) / cols,
      y: (row + 0.5) / rows,
      neighbors: neighbors.sort((a, b) => a - b),
    };
  });
}

function perimeter(cols: number, rows: number) {
  const cells: Array<{ id: number; side: "top" | "right" | "bottom" | "left" }> = [];
  for (let col = 0; col < cols; col += 1) cells.push({ id: col + 1, side: "top" });
  for (let row = 1; row < rows; row += 1) cells.push({ id: row * cols + cols, side: "right" });
  for (let col = cols - 2; col >= 0; col -= 1) cells.push({ id: (rows - 1) * cols + col + 1, side: "bottom" });
  for (let row = rows - 2; row > 0; row -= 1) cells.push({ id: row * cols + 1, side: "left" });
  return cells;
}

function sampledPorts(cols: number, rows: number, count: number): readonly PortDefinition[] {
  const ring = perimeter(cols, rows);
  const rotation = count === 8 || count === 9 ? 2 : 0;
  return Array.from({ length: count }, (_, index) => {
    const ringIndex = (rotation + Math.floor(index * ring.length / count)) % ring.length;
    const cell = ring[ringIndex];
    const next = ring[(ringIndex + 1) % ring.length];
    const row = Math.floor((cell.id - 1) / cols);
    const col = (cell.id - 1) % cols;
    const rawX = (col + 0.5) / cols;
    const topX = rawX > 0.3 && rawX < 0.7 ? (rawX < 0.5 ? 0.27 : rawX > 0.5 ? 0.73 : index % 2 ? 0.73 : 0.27) : rawX;
    const position = cell.side === "top" ? { x: topX, y: 0.035 }
      : cell.side === "right" ? { x: 0.985, y: (row + 0.5) / rows }
        : cell.side === "bottom" ? { x: (col + 0.5) / cols, y: 0.965 }
          : { x: 0.015, y: (row + 0.5) / rows };
    return { home: cell.id, entries: [cell.id, next.id] as const, ...position };
  });
}

const FULL_WORLD = worldForPlayerCount(10);

/** Full-size exports remain available for combat examples and ten-player compatibility. */
export const PROVINCES = FULL_WORLD.provinces;
export const PORTS = FULL_WORLD.ports;

export function seededFactionOrder(seed: number) {
  const result = Array.from({ length: FACTIONS.length }, (_, index) => index);
  let state = (seed ^ 0x9e3779b9) >>> 0;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    const random = ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    const swap = Math.floor(random * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}
