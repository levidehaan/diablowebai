/**
 * Procedural Dungeon Generator
 *
 * Generates dungeon layouts using various algorithms:
 * - BSP (Binary Space Partitioning) - Classic room+corridor dungeons
 * - Cellular Automata - Organic cave-like layouts
 * - Drunkard's Walk - Winding corridors and chambers
 * - Arena - Central combat areas with surrounding rooms
 *
 * Output is compatible with DUNParser and TileMapper.
 */

import { BINARY_MARKERS, getThemeForLevel } from './TileMapper';

// Room constraints
const ROOM_MIN_SIZE = 4;
const ROOM_MAX_SIZE = 12;
const CORRIDOR_WIDTH = 2;

/**
 * Random number generator with seed support
 */
class SeededRandom {
  constructor(seed = Date.now()) {
    this.seed = seed;
    this.current = seed;
  }

  next() {
    this.current = (this.current * 1103515245 + 12345) & 0x7fffffff;
    return this.current / 0x7fffffff;
  }

  nextInt(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

/**
 * BSP Tree Node
 */
class BSPNode {
  constructor(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.left = null;
    this.right = null;
    this.room = null;
  }

  split(rng) {
    // Already split
    if (this.left || this.right) return false;

    // Too small to split
    if (this.width < ROOM_MIN_SIZE * 2 + 2 || this.height < ROOM_MIN_SIZE * 2 + 2) {
      return false;
    }

    // Choose split direction
    const splitHorizontal = rng.next() > 0.5;

    let maxSplit;
    if (splitHorizontal) {
      maxSplit = this.height - ROOM_MIN_SIZE;
    } else {
      maxSplit = this.width - ROOM_MIN_SIZE;
    }

    if (maxSplit <= ROOM_MIN_SIZE) return false;

    const splitPos = rng.nextInt(ROOM_MIN_SIZE, maxSplit);

    if (splitHorizontal) {
      this.left = new BSPNode(this.x, this.y, this.width, splitPos);
      this.right = new BSPNode(this.x, this.y + splitPos, this.width, this.height - splitPos);
    } else {
      this.left = new BSPNode(this.x, this.y, splitPos, this.height);
      this.right = new BSPNode(this.x + splitPos, this.y, this.width - splitPos, this.height);
    }

    return true;
  }

  createRoom(rng) {
    if (this.left || this.right) {
      if (this.left) this.left.createRoom(rng);
      if (this.right) this.right.createRoom(rng);
    } else {
      // Leaf node - create room
      const roomWidth = rng.nextInt(ROOM_MIN_SIZE, Math.min(ROOM_MAX_SIZE, this.width - 2));
      const roomHeight = rng.nextInt(ROOM_MIN_SIZE, Math.min(ROOM_MAX_SIZE, this.height - 2));
      const roomX = rng.nextInt(1, this.width - roomWidth - 1) + this.x;
      const roomY = rng.nextInt(1, this.height - roomHeight - 1) + this.y;

      this.room = { x: roomX, y: roomY, width: roomWidth, height: roomHeight };
    }
  }

  getRoom() {
    if (this.room) return this.room;

    let leftRoom = null, rightRoom = null;
    if (this.left) leftRoom = this.left.getRoom();
    if (this.right) rightRoom = this.right.getRoom();

    if (!leftRoom && !rightRoom) return null;
    if (!leftRoom) return rightRoom;
    if (!rightRoom) return leftRoom;

    // Return random one
    return Math.random() > 0.5 ? leftRoom : rightRoom;
  }

  getRooms() {
    const rooms = [];
    if (this.room) rooms.push(this.room);
    if (this.left) rooms.push(...this.left.getRooms());
    if (this.right) rooms.push(...this.right.getRooms());
    return rooms;
  }
}

/**
 * Generate BSP dungeon
 * @param {number} width - Grid width
 * @param {number} height - Grid height
 * @param {Object} options - Generation options
 * @returns {Object} Generated dungeon data
 */
export function generateBSP(width, height, options = {}) {
  const {
    seed = Date.now(),
    splitIterations = 4,
    connectAllRooms = true,
  } = options;

  const rng = new SeededRandom(seed);
  const grid = createWallGrid(width, height);

  // Create BSP tree
  const root = new BSPNode(1, 1, width - 2, height - 2);

  // Split recursively
  const nodesToSplit = [root];
  for (let i = 0; i < splitIterations; i++) {
    const newNodes = [];
    for (const node of nodesToSplit) {
      if (node.split(rng)) {
        newNodes.push(node.left, node.right);
      }
    }
    nodesToSplit.push(...newNodes);
  }

  // Create rooms in leaf nodes
  root.createRoom(rng);

  // Carve rooms
  const rooms = root.getRooms();
  for (const room of rooms) {
    carveRoom(grid, room.x, room.y, room.width, room.height);
  }

  // Connect rooms with corridors
  if (connectAllRooms && rooms.length > 1) {
    connectRoomsWithCorridors(grid, rooms, rng);
  }

  // Place stairs
  const stairs = placeStairsInRooms(grid, rooms, rng);

  return {
    grid,
    width,
    height,
    rooms,
    stairs,
    algorithm: 'bsp',
    seed,
  };
}

/**
 * Generate cellular automata cave
 * @param {number} width - Grid width
 * @param {number} height - Grid height
 * @param {Object} options - Generation options
 * @returns {Object} Generated dungeon data
 */
export function generateCave(width, height, options = {}) {
  const {
    seed = Date.now(),
    fillProbability = 0.45,
    iterations = 5,
    wallThreshold = 5,
    floorThreshold = 4,
  } = options;

  const rng = new SeededRandom(seed);
  let grid = new Array(height).fill(null).map(() => new Array(width).fill(BINARY_MARKERS.WALL));

  // Initial random fill
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      grid[y][x] = rng.next() < fillProbability ? BINARY_MARKERS.FLOOR : BINARY_MARKERS.WALL;
    }
  }

  // Cellular automata iterations
  for (let i = 0; i < iterations; i++) {
    const newGrid = new Array(height).fill(null).map(() => new Array(width).fill(BINARY_MARKERS.WALL));

    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const neighbors = countWallNeighbors(grid, x, y);

        if (grid[y][x] === BINARY_MARKERS.WALL) {
          newGrid[y][x] = neighbors >= floorThreshold ? BINARY_MARKERS.WALL : BINARY_MARKERS.FLOOR;
        } else {
          newGrid[y][x] = neighbors >= wallThreshold ? BINARY_MARKERS.WALL : BINARY_MARKERS.FLOOR;
        }
      }
    }

    grid = newGrid;
  }

  // Find largest connected region
  const regions = findFloorRegions(grid);
  if (regions.length > 1) {
    // Keep only largest region
    regions.sort((a, b) => b.length - a.length);
    const keepRegion = new Set(regions[0].map(p => `${p.x},${p.y}`));

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (grid[y][x] === BINARY_MARKERS.FLOOR && !keepRegion.has(`${x},${y}`)) {
          grid[y][x] = BINARY_MARKERS.WALL;
        }
      }
    }
  }

  // Place stairs
  const stairs = placeStairsInCave(grid, rng);

  return {
    grid,
    width,
    height,
    rooms: [], // Caves don't have distinct rooms
    stairs,
    algorithm: 'cellular_automata',
    seed,
  };
}

/**
 * Generate drunkard's walk dungeon
 * @param {number} width - Grid width
 * @param {number} height - Grid height
 * @param {Object} options - Generation options
 * @returns {Object} Generated dungeon data
 */
export function generateDrunkardWalk(width, height, options = {}) {
  const {
    seed = Date.now(),
    floorPercent = 0.35,
    maxTunnelLength = 8,
    roomChance = 0.15,
  } = options;

  const rng = new SeededRandom(seed);
  const grid = createWallGrid(width, height);
  const targetFloors = Math.floor(width * height * floorPercent);
  const rooms = [];

  let currentFloors = 0;
  let x = Math.floor(width / 2);
  let y = Math.floor(height / 2);

  // Start with small room at center
  const startRoom = { x: x - 2, y: y - 2, width: 5, height: 5 };
  carveRoom(grid, startRoom.x, startRoom.y, startRoom.width, startRoom.height);
  rooms.push(startRoom);
  currentFloors += 25;

  const directions = [
    { dx: 0, dy: -1 }, // Up
    { dx: 0, dy: 1 },  // Down
    { dx: -1, dy: 0 }, // Left
    { dx: 1, dy: 0 },  // Right
  ];

  while (currentFloors < targetFloors) {
    // Pick random direction
    const dir = directions[rng.nextInt(0, 3)];
    const tunnelLength = rng.nextInt(1, maxTunnelLength);

    for (let i = 0; i < tunnelLength; i++) {
      x += dir.dx;
      y += dir.dy;

      // Clamp to bounds
      x = Math.max(2, Math.min(width - 3, x));
      y = Math.max(2, Math.min(height - 3, y));

      if (grid[y][x] === BINARY_MARKERS.WALL) {
        grid[y][x] = BINARY_MARKERS.FLOOR;
        currentFloors++;

        // Maybe carve a room
        if (rng.next() < roomChance) {
          const roomW = rng.nextInt(3, 6);
          const roomH = rng.nextInt(3, 6);
          const roomX = x - Math.floor(roomW / 2);
          const roomY = y - Math.floor(roomH / 2);

          if (roomX > 1 && roomY > 1 &&
              roomX + roomW < width - 1 && roomY + roomH < height - 1) {
            carveRoom(grid, roomX, roomY, roomW, roomH);
            rooms.push({ x: roomX, y: roomY, width: roomW, height: roomH });
            currentFloors += roomW * roomH;
          }
        }
      }
    }
  }

  // Place stairs
  const stairs = rooms.length > 0
    ? placeStairsInRooms(grid, rooms, rng)
    : placeStairsInCave(grid, rng);

  return {
    grid,
    width,
    height,
    rooms,
    stairs,
    algorithm: 'drunkard_walk',
    seed,
  };
}

/**
 * Generate arena-style dungeon
 * @param {number} width - Grid width
 * @param {number} height - Grid height
 * @param {Object} options - Generation options
 * @returns {Object} Generated dungeon data
 */
export function generateArena(width, height, options = {}) {
  const {
    seed = Date.now(),
    arenaSize = 0.4, // Portion of map for central arena
    surroundingRooms = 4,
  } = options;

  const rng = new SeededRandom(seed);
  const grid = createWallGrid(width, height);
  const rooms = [];

  // Central arena
  const arenaW = Math.floor(width * arenaSize);
  const arenaH = Math.floor(height * arenaSize);
  const arenaX = Math.floor((width - arenaW) / 2);
  const arenaY = Math.floor((height - arenaH) / 2);

  carveRoom(grid, arenaX, arenaY, arenaW, arenaH);
  rooms.push({
    x: arenaX, y: arenaY, width: arenaW, height: arenaH,
    type: 'arena',
  });

  // Add pillars in arena
  if (arenaW > 8 && arenaH > 8) {
    const pillarSpacing = 4;
    for (let py = arenaY + 2; py < arenaY + arenaH - 2; py += pillarSpacing) {
      for (let px = arenaX + 2; px < arenaX + arenaW - 2; px += pillarSpacing) {
        if (rng.next() < 0.6) {
          grid[py][px] = BINARY_MARKERS.PILLAR;
        }
      }
    }
  }

  // Surrounding rooms
  const positions = [
    { side: 'top', x: Math.floor(width / 2), y: 2 },
    { side: 'bottom', x: Math.floor(width / 2), y: height - 6 },
    { side: 'left', x: 2, y: Math.floor(height / 2) },
    { side: 'right', x: width - 6, y: Math.floor(height / 2) },
  ];

  for (let i = 0; i < Math.min(surroundingRooms, positions.length); i++) {
    const pos = positions[i];
    const roomW = rng.nextInt(4, 7);
    const roomH = rng.nextInt(4, 7);

    carveRoom(grid, pos.x - Math.floor(roomW / 2), pos.y, roomW, roomH);
    rooms.push({
      x: pos.x - Math.floor(roomW / 2),
      y: pos.y,
      width: roomW,
      height: roomH,
      type: pos.side,
    });
  }

  // Connect rooms to arena
  connectRoomsWithCorridors(grid, rooms, rng);

  // Place stairs in outer rooms
  const stairs = placeStairsInRooms(grid, rooms.slice(1), rng);

  return {
    grid,
    width,
    height,
    rooms,
    stairs,
    algorithm: 'arena',
    seed,
  };
}

// ========== Helper Functions ==========

function createWallGrid(width, height) {
  return new Array(height).fill(null).map(() =>
    new Array(width).fill(BINARY_MARKERS.WALL)
  );
}

function carveRoom(grid, x, y, width, height) {
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      if (y + dy > 0 && y + dy < grid.length - 1 &&
          x + dx > 0 && x + dx < grid[0].length - 1) {
        grid[y + dy][x + dx] = BINARY_MARKERS.FLOOR;
      }
    }
  }
}

function connectRoomsWithCorridors(grid, rooms, rng) {
  const connected = new Set([0]);
  const remaining = new Set(rooms.map((_, i) => i).slice(1));

  while (remaining.size > 0) {
    let bestDist = Infinity;
    let bestFrom = -1;
    let bestTo = -1;

    // Find closest pair
    for (const from of connected) {
      for (const to of remaining) {
        const dist = roomDistance(rooms[from], rooms[to]);
        if (dist < bestDist) {
          bestDist = dist;
          bestFrom = from;
          bestTo = to;
        }
      }
    }

    if (bestTo === -1) break;

    // Connect with corridor
    const fromRoom = rooms[bestFrom];
    const toRoom = rooms[bestTo];
    carveCorridor(grid, fromRoom, toRoom, rng);

    connected.add(bestTo);
    remaining.delete(bestTo);
  }
}

function roomDistance(room1, room2) {
  const cx1 = room1.x + room1.width / 2;
  const cy1 = room1.y + room1.height / 2;
  const cx2 = room2.x + room2.width / 2;
  const cy2 = room2.y + room2.height / 2;

  return Math.abs(cx1 - cx2) + Math.abs(cy1 - cy2);
}

function carveCorridor(grid, room1, room2, rng) {
  // Get room centers
  const x1 = Math.floor(room1.x + room1.width / 2);
  const y1 = Math.floor(room1.y + room1.height / 2);
  const x2 = Math.floor(room2.x + room2.width / 2);
  const y2 = Math.floor(room2.y + room2.height / 2);

  // L-shaped corridor
  const goHorizontalFirst = rng.next() > 0.5;

  if (goHorizontalFirst) {
    carveHorizontalLine(grid, x1, x2, y1);
    carveVerticalLine(grid, y1, y2, x2);
  } else {
    carveVerticalLine(grid, y1, y2, x1);
    carveHorizontalLine(grid, x1, x2, y2);
  }
}

function carveHorizontalLine(grid, x1, x2, y) {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);

  for (let x = minX; x <= maxX; x++) {
    if (y > 0 && y < grid.length - 1 && x > 0 && x < grid[0].length - 1) {
      grid[y][x] = BINARY_MARKERS.FLOOR;
      // Widen corridor
      if (y > 1) grid[y - 1][x] = BINARY_MARKERS.FLOOR;
    }
  }
}

function carveVerticalLine(grid, y1, y2, x) {
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  for (let y = minY; y <= maxY; y++) {
    if (y > 0 && y < grid.length - 1 && x > 0 && x < grid[0].length - 1) {
      grid[y][x] = BINARY_MARKERS.FLOOR;
      // Widen corridor
      if (x > 1) grid[y][x - 1] = BINARY_MARKERS.FLOOR;
    }
  }
}

function countWallNeighbors(grid, x, y) {
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const ny = y + dy;
      const nx = x + dx;

      if (ny < 0 || ny >= grid.length || nx < 0 || nx >= grid[0].length) {
        count++;
      } else if (grid[ny][nx] === BINARY_MARKERS.WALL) {
        count++;
      }
    }
  }
  return count;
}

function findFloorRegions(grid) {
  const visited = new Set();
  const regions = [];

  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[0].length; x++) {
      if (grid[y][x] === BINARY_MARKERS.FLOOR && !visited.has(`${x},${y}`)) {
        const region = [];
        const queue = [{ x, y }];

        while (queue.length > 0) {
          const pos = queue.shift();
          const key = `${pos.x},${pos.y}`;

          if (visited.has(key)) continue;
          visited.add(key);
          region.push(pos);

          const neighbors = [
            { x: pos.x - 1, y: pos.y },
            { x: pos.x + 1, y: pos.y },
            { x: pos.x, y: pos.y - 1 },
            { x: pos.x, y: pos.y + 1 },
          ];

          for (const n of neighbors) {
            if (n.x >= 0 && n.x < grid[0].length &&
                n.y >= 0 && n.y < grid.length &&
                grid[n.y][n.x] === BINARY_MARKERS.FLOOR &&
                !visited.has(`${n.x},${n.y}`)) {
              queue.push(n);
            }
          }
        }

        regions.push(region);
      }
    }
  }

  return regions;
}

function placeStairsInRooms(grid, rooms, rng) {
  if (rooms.length < 1) return { up: null, down: null };

  const shuffled = rng.shuffle([...rooms]);
  const upRoom = shuffled[0];
  const downRoom = shuffled.length > 1 ? shuffled[shuffled.length - 1] : shuffled[0];

  const upPos = {
    x: upRoom.x + Math.floor(upRoom.width / 2),
    y: upRoom.y + Math.floor(upRoom.height / 2),
  };

  const downPos = {
    x: downRoom.x + Math.floor(downRoom.width / 2),
    y: downRoom.y + Math.floor(downRoom.height / 2),
  };

  // Ensure different positions
  if (upPos.x === downPos.x && upPos.y === downPos.y) {
    downPos.x = Math.min(downPos.x + 2, grid[0].length - 2);
  }

  grid[upPos.y][upPos.x] = BINARY_MARKERS.STAIRS_UP;
  grid[downPos.y][downPos.x] = BINARY_MARKERS.STAIRS_DOWN;

  return { up: upPos, down: downPos };
}

function placeStairsInCave(grid, rng) {
  // Find floor positions
  const floors = [];
  for (let y = 2; y < grid.length - 2; y++) {
    for (let x = 2; x < grid[0].length - 2; x++) {
      if (grid[y][x] === BINARY_MARKERS.FLOOR) {
        floors.push({ x, y });
      }
    }
  }

  if (floors.length < 2) return { up: null, down: null };

  // Place stairs far apart
  const shuffled = rng.shuffle(floors);
  const upPos = shuffled[0];

  // Find position farthest from up
  let maxDist = 0;
  let downPos = shuffled[1];

  for (const pos of floors) {
    const dist = Math.abs(pos.x - upPos.x) + Math.abs(pos.y - upPos.y);
    if (dist > maxDist) {
      maxDist = dist;
      downPos = pos;
    }
  }

  grid[upPos.y][upPos.x] = BINARY_MARKERS.STAIRS_UP;
  grid[downPos.y][downPos.x] = BINARY_MARKERS.STAIRS_DOWN;

  return { up: upPos, down: downPos };
}

/**
 * Visualize generated dungeon as ASCII
 */
export function visualizeDungeon(dungeon) {
  const chars = {
    [BINARY_MARKERS.WALL]: '#',
    [BINARY_MARKERS.FLOOR]: '.',
    [BINARY_MARKERS.STAIRS_UP]: '<',
    [BINARY_MARKERS.STAIRS_DOWN]: '>',
    [BINARY_MARKERS.DOOR]: '+',
    [BINARY_MARKERS.PILLAR]: 'O',
  };

  return dungeon.grid.map(row =>
    row.map(cell => chars[cell] || '?').join('')
  ).join('\n');
}

/**
 * Generate dungeon based on theme
 */
export function generateForTheme(width, height, dungeonLevel, options = {}) {
  const theme = getThemeForLevel(dungeonLevel);

  switch (theme) {
    case 'cathedral':
      return generateBSP(width, height, options);

    case 'catacombs':
      return generateDrunkardWalk(width, height, options);

    case 'caves':
      return generateCave(width, height, options);

    case 'hell':
      return generateArena(width, height, options);

    default:
      return generateBSP(width, height, options);
  }
}

// Default export
const ProceduralGenerator = {
  generateBSP,
  generateCave,
  generateDrunkardWalk,
  generateArena,
  generateForTheme,
  visualizeDungeon,
  SeededRandom,
};

export default ProceduralGenerator;
