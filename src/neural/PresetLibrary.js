/**
 * Preset Asset Library with Parametric Instantiation
 *
 * Stores pre-built, serialized presets for common game elements.
 * AI generates short calls like {preset: "town_cluster", params: {count: 8, radius: 5, seed: 42}}
 * and the library instantiates full structures using math functions.
 *
 * Features:
 * - Poisson disk sampling for natural grouping
 * - Voronoi-based spacing for entities
 * - Seeded random for deterministic generation
 * - Preset caching and IndexedDB storage
 * - Automatic DUN/TSV conversion
 */

import DUNParser from './DUNParser';
import { BINARY_MARKERS } from './TileMapper';
import { TOWN_TILES } from './TownGenerator';

// ============================================================================
// SEEDED RANDOM NUMBER GENERATOR
// ============================================================================

/**
 * Mulberry32 PRNG - Fast, high-quality seeded random
 */
export class SeededRandom {
  constructor(seed = Date.now()) {
    this.seed = seed >>> 0; // Ensure 32-bit unsigned
    this.state = this.seed;
  }

  /** Get next random float [0, 1) */
  next() {
    let t = (this.state += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Get random integer in range [min, max] inclusive */
  nextInt(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Get random float in range [min, max) */
  nextFloat(min, max) {
    return this.next() * (max - min) + min;
  }

  /** Pick random element from array */
  pick(array) {
    return array[Math.floor(this.next() * array.length)];
  }

  /** Shuffle array (Fisher-Yates) */
  shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /** Get random point in circle */
  pointInCircle(centerX, centerY, radius) {
    const angle = this.next() * Math.PI * 2;
    const r = Math.sqrt(this.next()) * radius;
    return {
      x: Math.round(centerX + r * Math.cos(angle)),
      y: Math.round(centerY + r * Math.sin(angle)),
    };
  }
}

// ============================================================================
// SPATIAL ALGORITHMS
// ============================================================================

/**
 * Poisson Disk Sampling - Creates naturally distributed points
 * @param {number} width - Area width
 * @param {number} height - Area height
 * @param {number} minDistance - Minimum distance between points
 * @param {number} maxAttempts - Max attempts per point (default 30)
 * @param {SeededRandom} rng - Random generator
 * @returns {Array<{x: number, y: number}>} - Distributed points
 */
export function poissonDiskSampling(width, height, minDistance, maxAttempts = 30, rng = new SeededRandom()) {
  const cellSize = minDistance / Math.sqrt(2);
  const gridWidth = Math.ceil(width / cellSize);
  const gridHeight = Math.ceil(height / cellSize);

  // Background grid for fast spatial lookup
  const grid = new Array(gridWidth * gridHeight).fill(-1);
  const points = [];
  const activeList = [];

  // Helper to get grid index
  const gridIndex = (x, y) => {
    const gx = Math.floor(x / cellSize);
    const gy = Math.floor(y / cellSize);
    if (gx < 0 || gx >= gridWidth || gy < 0 || gy >= gridHeight) return -1;
    return gy * gridWidth + gx;
  };

  // Check if point is valid (not too close to existing points)
  const isValid = (x, y) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;

    const gx = Math.floor(x / cellSize);
    const gy = Math.floor(y / cellSize);

    // Check 5x5 neighborhood
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = gx + dx;
        const ny = gy + dy;
        if (nx >= 0 && nx < gridWidth && ny >= 0 && ny < gridHeight) {
          const idx = ny * gridWidth + nx;
          if (grid[idx] !== -1) {
            const other = points[grid[idx]];
            const distSq = (x - other.x) ** 2 + (y - other.y) ** 2;
            if (distSq < minDistance ** 2) return false;
          }
        }
      }
    }
    return true;
  };

  // Add initial point
  const startX = rng.nextFloat(0, width);
  const startY = rng.nextFloat(0, height);
  points.push({ x: startX, y: startY });
  activeList.push(0);
  grid[gridIndex(startX, startY)] = 0;

  // Process active list
  while (activeList.length > 0) {
    const activeIdx = rng.nextInt(0, activeList.length - 1);
    const current = points[activeList[activeIdx]];
    let found = false;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const angle = rng.next() * Math.PI * 2;
      const distance = minDistance + rng.next() * minDistance;
      const newX = current.x + Math.cos(angle) * distance;
      const newY = current.y + Math.sin(angle) * distance;

      if (isValid(newX, newY)) {
        const newIdx = points.length;
        points.push({ x: newX, y: newY });
        activeList.push(newIdx);
        grid[gridIndex(newX, newY)] = newIdx;
        found = true;
        break;
      }
    }

    if (!found) {
      activeList.splice(activeIdx, 1);
    }
  }

  return points.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }));
}

/**
 * Simple Voronoi-based region assignment
 * Assigns each grid cell to the nearest seed point
 * @param {number} width - Grid width
 * @param {number} height - Grid height
 * @param {Array<{x: number, y: number}>} seeds - Seed points
 * @returns {number[][]} - Grid of region indices
 */
export function voronoiRegions(width, height, seeds) {
  const regions = [];

  for (let y = 0; y < height; y++) {
    regions[y] = [];
    for (let x = 0; x < width; x++) {
      let minDist = Infinity;
      let closestIdx = 0;

      for (let i = 0; i < seeds.length; i++) {
        const dist = Math.abs(x - seeds[i].x) + Math.abs(y - seeds[i].y); // Manhattan distance
        if (dist < minDist) {
          minDist = dist;
          closestIdx = i;
        }
      }

      regions[y][x] = closestIdx;
    }
  }

  return regions;
}

/**
 * Perlin-like noise using permutation table
 */
export class PerlinNoise {
  constructor(seed = 0) {
    this.rng = new SeededRandom(seed);
    this.perm = new Uint8Array(512);
    const p = new Uint8Array(256);

    // Initialize permutation
    for (let i = 0; i < 256; i++) p[i] = i;

    // Shuffle with seeded random
    for (let i = 255; i > 0; i--) {
      const j = this.rng.nextInt(0, i);
      [p[i], p[j]] = [p[j], p[i]];
    }

    // Duplicate
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
    }
  }

  fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  lerp(a, b, t) {
    return a + t * (b - a);
  }

  grad(hash, x, y) {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -2 * v : 2 * v);
  }

  noise2D(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;

    x -= Math.floor(x);
    y -= Math.floor(y);

    const u = this.fade(x);
    const v = this.fade(y);

    const A = this.perm[X] + Y;
    const B = this.perm[X + 1] + Y;

    return this.lerp(
      this.lerp(this.grad(this.perm[A], x, y), this.grad(this.perm[B], x - 1, y), u),
      this.lerp(this.grad(this.perm[A + 1], x, y - 1), this.grad(this.perm[B + 1], x - 1, y - 1), u),
      v
    );
  }

  /** Get octave noise value [0, 1] */
  octaveNoise(x, y, octaves = 4, persistence = 0.5) {
    let total = 0;
    let frequency = 1;
    let amplitude = 1;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      total += this.noise2D(x * frequency, y * frequency) * amplitude;
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= 2;
    }

    return (total / maxValue + 1) / 2; // Normalize to [0, 1]
  }
}

// ============================================================================
// PRESET DEFINITIONS
// ============================================================================

/**
 * Preset template schema
 */
export const PRESET_SCHEMA = {
  name: 'string',
  description: 'string',
  category: 'string', // 'town', 'dungeon', 'nature', 'entity', 'composite'
  params: 'object',   // Parameter definitions with defaults
  tiles: 'object',    // Tile patterns
  entities: 'array',  // Entity placements
  generate: 'function', // Generation function
};

/**
 * Built-in preset library
 */
export const PRESET_LIBRARY = {
  // ==========================================================================
  // TOWN PRESETS
  // ==========================================================================

  /**
   * Small Town Cluster - Group of houses with paths
   */
  town_cluster: {
    name: 'town_cluster',
    description: 'A cluster of houses arranged naturally with connecting paths',
    category: 'town',
    params: {
      count: { type: 'number', default: 8, min: 3, max: 20, description: 'Number of houses' },
      radius: { type: 'number', default: 6, min: 3, max: 15, description: 'Cluster radius' },
      centerX: { type: 'number', default: null, description: 'Center X (defaults to grid center)' },
      centerY: { type: 'number', default: null, description: 'Center Y (defaults to grid center)' },
      houseMinSize: { type: 'number', default: 3, min: 2, max: 5 },
      houseMaxSize: { type: 'number', default: 5, min: 3, max: 8 },
      hasWell: { type: 'boolean', default: true },
      pathWidth: { type: 'number', default: 2, min: 1, max: 3 },
      seed: { type: 'number', default: null },
    },

    generate(grid, params, rng) {
      const {
        count = 8,
        radius = 6,
        centerX = Math.floor(grid.width / 2),
        centerY = Math.floor(grid.height / 2),
        houseMinSize = 3,
        houseMaxSize = 5,
        hasWell = true,
        pathWidth = 2,
      } = params;

      const houses = [];
      const placedBuildings = [];

      // Use Poisson disk sampling for house positions
      const buildingRadius = Math.max(houseMaxSize + 1, 4);
      const positions = poissonDiskSampling(
        radius * 2, radius * 2,
        buildingRadius,
        30,
        rng
      );

      // Offset positions to center
      const offsetX = centerX - radius;
      const offsetY = centerY - radius;

      // Place houses at Poisson points
      for (let i = 0; i < Math.min(count, positions.length); i++) {
        const pos = positions[i];
        const houseW = rng.nextInt(houseMinSize, houseMaxSize);
        const houseH = rng.nextInt(houseMinSize, houseMaxSize);
        const houseX = Math.floor(offsetX + pos.x - houseW / 2);
        const houseY = Math.floor(offsetY + pos.y - houseH / 2);

        // Check bounds
        if (houseX < 1 || houseY < 1 ||
            houseX + houseW >= grid.width - 1 ||
            houseY + houseH >= grid.height - 1) {
          continue;
        }

        // Draw house
        this._drawBuilding(grid, houseX, houseY, houseW, houseH, rng);
        houses.push({ x: houseX, y: houseY, width: houseW, height: houseH });
        placedBuildings.push({ x: houseX + houseW / 2, y: houseY + houseH / 2 });
      }

      // Connect houses with paths using minimum spanning tree
      if (houses.length > 1) {
        const edges = this._computeMST(placedBuildings);
        for (const edge of edges) {
          this._drawPath(grid, edge.from, edge.to, pathWidth, rng);
        }
      }

      // Add well in center if requested
      if (hasWell && grid.tiles[centerY] && grid.tiles[centerY][centerX] !== undefined) {
        grid.tiles[centerY][centerX] = TOWN_TILES.well;
        // Clear small area around well
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const wx = centerX + dx;
            const wy = centerY + dy;
            if (grid.tiles[wy] && grid.tiles[wy][wx] !== undefined) {
              if (dx === 0 && dy === 0) continue;
              grid.tiles[wy][wx] = rng.pick(TOWN_TILES.cobblestone);
            }
          }
        }
      }

      return {
        houses,
        houseCount: houses.length,
        center: { x: centerX, y: centerY },
      };
    },

    _drawBuilding(grid, x, y, w, h, rng) {
      // Walls
      for (let bx = x; bx < x + w; bx++) {
        for (let by = y; by < y + h; by++) {
          if (by >= 0 && by < grid.height && bx >= 0 && bx < grid.width) {
            if (bx === x || bx === x + w - 1 || by === y || by === y + h - 1) {
              grid.tiles[by][bx] = rng.pick(TOWN_TILES.wall_stone);
            } else {
              grid.tiles[by][bx] = rng.pick(TOWN_TILES.cobblestone);
            }
          }
        }
      }

      // Door at bottom center
      const doorX = x + Math.floor(w / 2);
      const doorY = y + h - 1;
      if (grid.tiles[doorY] && grid.tiles[doorY][doorX] !== undefined) {
        grid.tiles[doorY][doorX] = TOWN_TILES.door[0];
      }
    },

    _drawPath(grid, from, to, width, rng) {
      // Simple L-shaped path
      const midX = Math.round((from.x + to.x) / 2);

      // Horizontal segment
      const minX = Math.min(Math.round(from.x), midX);
      const maxX = Math.max(Math.round(from.x), midX);
      for (let x = minX; x <= maxX; x++) {
        for (let w = 0; w < width; w++) {
          const py = Math.round(from.y) + w;
          if (grid.tiles[py] && grid.tiles[py][x] !== undefined) {
            const current = grid.tiles[py][x];
            // Don't overwrite buildings
            if (!TOWN_TILES.wall_stone.includes(current) &&
                !TOWN_TILES.door.includes(current)) {
              grid.tiles[py][x] = rng.pick(TOWN_TILES.dirt);
            }
          }
        }
      }

      // Vertical segment
      const minY = Math.min(Math.round(from.y), Math.round(to.y));
      const maxY = Math.max(Math.round(from.y), Math.round(to.y));
      for (let y = minY; y <= maxY; y++) {
        for (let w = 0; w < width; w++) {
          const px = midX + w;
          if (grid.tiles[y] && grid.tiles[y][px] !== undefined) {
            const current = grid.tiles[y][px];
            if (!TOWN_TILES.wall_stone.includes(current) &&
                !TOWN_TILES.door.includes(current)) {
              grid.tiles[y][px] = rng.pick(TOWN_TILES.dirt);
            }
          }
        }
      }

      // Horizontal to target
      const minX2 = Math.min(midX, Math.round(to.x));
      const maxX2 = Math.max(midX, Math.round(to.x));
      for (let x = minX2; x <= maxX2; x++) {
        for (let w = 0; w < width; w++) {
          const py = Math.round(to.y) + w;
          if (grid.tiles[py] && grid.tiles[py][x] !== undefined) {
            const current = grid.tiles[py][x];
            if (!TOWN_TILES.wall_stone.includes(current) &&
                !TOWN_TILES.door.includes(current)) {
              grid.tiles[py][x] = rng.pick(TOWN_TILES.dirt);
            }
          }
        }
      }
    },

    _computeMST(points) {
      if (points.length < 2) return [];

      const edges = [];
      const inMST = new Set([0]);

      while (inMST.size < points.length) {
        let minDist = Infinity;
        let minEdge = null;

        for (const i of inMST) {
          for (let j = 0; j < points.length; j++) {
            if (inMST.has(j)) continue;

            const dist = Math.hypot(
              points[i].x - points[j].x,
              points[i].y - points[j].y
            );

            if (dist < minDist) {
              minDist = dist;
              minEdge = { from: points[i], to: points[j], fromIdx: i, toIdx: j };
            }
          }
        }

        if (minEdge) {
          edges.push(minEdge);
          inMST.add(minEdge.toIdx);
        } else {
          break;
        }
      }

      return edges;
    },
  },

  // ==========================================================================
  // NATURE PRESETS
  // ==========================================================================

  /**
   * Forest Patch - Randomized trees and rocks
   */
  forest_patch: {
    name: 'forest_patch',
    description: 'A natural cluster of trees with optional rocks and undergrowth',
    category: 'nature',
    params: {
      density: { type: 'number', default: 0.3, min: 0.1, max: 0.8, description: 'Tree density (0-1)' },
      width: { type: 'number', default: 10, min: 5, max: 30 },
      height: { type: 'number', default: 10, min: 5, max: 30 },
      startX: { type: 'number', default: 0 },
      startY: { type: 'number', default: 0 },
      hasRocks: { type: 'boolean', default: true },
      hasFlowers: { type: 'boolean', default: false },
      rockDensity: { type: 'number', default: 0.1, min: 0, max: 0.3 },
      treeTypes: { type: 'array', default: null, description: 'Specific tree tile IDs' },
      seed: { type: 'number', default: null },
    },

    generate(grid, params, rng) {
      const {
        density = 0.3,
        width = 10,
        height = 10,
        startX = 0,
        startY = 0,
        hasRocks = true,
        hasFlowers = false,
        rockDensity = 0.1,
        treeTypes = TOWN_TILES.tree,
      } = params;

      const placed = { trees: 0, rocks: 0, flowers: 0 };
      const noise = new PerlinNoise(rng.seed);

      // Use noise-based placement for natural look
      for (let y = startY; y < startY + height && y < grid.height; y++) {
        for (let x = startX; x < startX + width && x < grid.width; x++) {
          if (!grid.tiles[y] || grid.tiles[y][x] === undefined) continue;

          // Skip if not empty/grass
          const current = grid.tiles[y][x];
          if (current !== 0 && !TOWN_TILES.grass.includes(current)) continue;

          const noiseVal = noise.octaveNoise(x * 0.15, y * 0.15, 3, 0.5);

          // Trees - use noise for natural clustering
          if (noiseVal > (1 - density)) {
            grid.tiles[y][x] = rng.pick(treeTypes);
            placed.trees++;
          }
          // Rocks in low-noise areas
          else if (hasRocks && noiseVal < rockDensity) {
            grid.tiles[y][x] = rng.pick(TOWN_TILES.rubble);
            placed.rocks++;
          }
          // Flowers in medium-noise areas
          else if (hasFlowers && noiseVal > 0.4 && noiseVal < 0.5 && rng.next() < 0.3) {
            grid.tiles[y][x] = rng.pick(TOWN_TILES.flowers);
            placed.flowers++;
          }
          // Default to grass
          else if (rng.next() < 0.5) {
            grid.tiles[y][x] = rng.pick(TOWN_TILES.grass);
          }
        }
      }

      return placed;
    },
  },

  /**
   * Trail Segment - Winding path through terrain
   */
  trail_segment: {
    name: 'trail_segment',
    description: 'A winding trail segment with optional decorations',
    category: 'nature',
    params: {
      startX: { type: 'number', required: true },
      startY: { type: 'number', required: true },
      endX: { type: 'number', required: true },
      endY: { type: 'number', required: true },
      width: { type: 'number', default: 2, min: 1, max: 4 },
      curviness: { type: 'number', default: 0.3, min: 0, max: 1, description: 'How much the path curves' },
      material: { type: 'string', default: 'dirt', enum: ['dirt', 'cobblestone', 'grass'] },
      addTrees: { type: 'boolean', default: true },
      treeDensity: { type: 'number', default: 0.15 },
      seed: { type: 'number', default: null },
    },

    generate(grid, params, rng) {
      const {
        startX, startY, endX, endY,
        width = 2,
        curviness = 0.3,
        material = 'dirt',
        addTrees = true,
        treeDensity = 0.15,
      } = params;

      // Get material tiles
      const materialTiles = {
        dirt: TOWN_TILES.dirt,
        cobblestone: TOWN_TILES.cobblestone,
        grass: TOWN_TILES.grass,
      }[material] || TOWN_TILES.dirt;

      const pathPoints = [];

      // Generate curved path using Bezier-like interpolation
      const dx = endX - startX;
      const dy = endY - startY;
      const length = Math.hypot(dx, dy);
      const steps = Math.ceil(length * 2);

      // Control points for curve
      const perpX = -dy / length;
      const perpY = dx / length;
      const curveAmount = length * curviness * (rng.next() - 0.5) * 2;

      const midX = (startX + endX) / 2 + perpX * curveAmount;
      const midY = (startY + endY) / 2 + perpY * curveAmount;

      // Generate path points using quadratic Bezier
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const t1 = 1 - t;

        const x = t1 * t1 * startX + 2 * t1 * t * midX + t * t * endX;
        const y = t1 * t1 * startY + 2 * t1 * t * midY + t * t * endY;

        pathPoints.push({ x: Math.round(x), y: Math.round(y) });
      }

      // Draw path with width
      const pathTiles = new Set();
      for (const point of pathPoints) {
        for (let wy = -Math.floor(width / 2); wy <= Math.floor(width / 2); wy++) {
          for (let wx = -Math.floor(width / 2); wx <= Math.floor(width / 2); wx++) {
            const px = point.x + wx;
            const py = point.y + wy;

            if (py >= 0 && py < grid.height && px >= 0 && px < grid.width) {
              if (grid.tiles[py] && grid.tiles[py][px] !== undefined) {
                grid.tiles[py][px] = rng.pick(materialTiles);
                pathTiles.add(`${px},${py}`);
              }
            }
          }
        }
      }

      // Add trees along path
      if (addTrees) {
        for (const point of pathPoints) {
          // Trees on sides of path
          for (const side of [-1, 1]) {
            const offset = width + 1 + rng.nextInt(0, 2);
            const treeX = point.x + perpX * offset * side;
            const treeY = point.y + perpY * offset * side;

            const tx = Math.round(treeX);
            const ty = Math.round(treeY);

            if (ty >= 0 && ty < grid.height && tx >= 0 && tx < grid.width) {
              if (grid.tiles[ty] && grid.tiles[ty][tx] !== undefined) {
                if (!pathTiles.has(`${tx},${ty}`) && rng.next() < treeDensity) {
                  grid.tiles[ty][tx] = rng.pick(TOWN_TILES.tree);
                }
              }
            }
          }
        }
      }

      return {
        pathLength: pathPoints.length,
        pathWidth: width,
        tilesModified: pathTiles.size,
      };
    },
  },

  // ==========================================================================
  // DUNGEON PRESETS
  // ==========================================================================

  /**
   * Room Cluster - Connected dungeon rooms
   */
  room_cluster: {
    name: 'room_cluster',
    description: 'A cluster of connected dungeon rooms',
    category: 'dungeon',
    params: {
      roomCount: { type: 'number', default: 5, min: 2, max: 12 },
      roomMinSize: { type: 'number', default: 4, min: 3, max: 8 },
      roomMaxSize: { type: 'number', default: 8, min: 4, max: 15 },
      centerX: { type: 'number', default: null },
      centerY: { type: 'number', default: null },
      spread: { type: 'number', default: 10, min: 5, max: 20 },
      corridorWidth: { type: 'number', default: 2, min: 1, max: 3 },
      addDoors: { type: 'boolean', default: true },
      seed: { type: 'number', default: null },
    },

    generate(grid, params, rng) {
      const {
        roomCount = 5,
        roomMinSize = 4,
        roomMaxSize = 8,
        centerX = Math.floor(grid.width / 2),
        centerY = Math.floor(grid.height / 2),
        spread = 10,
        corridorWidth = 2,
        addDoors = true,
      } = params;

      const rooms = [];

      // Generate room positions using Poisson disk
      const positions = poissonDiskSampling(
        spread * 2, spread * 2,
        roomMaxSize + 2,
        30,
        rng
      );

      const offsetX = centerX - spread;
      const offsetY = centerY - spread;

      // Create rooms at positions
      for (let i = 0; i < Math.min(roomCount, positions.length); i++) {
        const pos = positions[i];
        const roomW = rng.nextInt(roomMinSize, roomMaxSize);
        const roomH = rng.nextInt(roomMinSize, roomMaxSize);
        const roomX = Math.floor(offsetX + pos.x - roomW / 2);
        const roomY = Math.floor(offsetY + pos.y - roomH / 2);

        // Check bounds
        if (roomX < 1 || roomY < 1 ||
            roomX + roomW >= grid.width - 1 ||
            roomY + roomH >= grid.height - 1) {
          continue;
        }

        // Carve room
        for (let y = roomY; y < roomY + roomH; y++) {
          for (let x = roomX; x < roomX + roomW; x++) {
            if (grid.tiles[y] && grid.tiles[y][x] !== undefined) {
              grid.tiles[y][x] = BINARY_MARKERS.FLOOR;
            }
          }
        }

        rooms.push({
          x: roomX, y: roomY,
          width: roomW, height: roomH,
          centerX: roomX + roomW / 2,
          centerY: roomY + roomH / 2,
        });
      }

      // Connect rooms with corridors (MST)
      if (rooms.length > 1) {
        const edges = this._computeRoomMST(rooms);

        for (const edge of edges) {
          this._carveCorridorBetweenRooms(
            grid, edge.from, edge.to, corridorWidth, addDoors, rng
          );
        }
      }

      return {
        rooms,
        roomCount: rooms.length,
      };
    },

    _computeRoomMST(rooms) {
      if (rooms.length < 2) return [];

      const edges = [];
      const inMST = new Set([0]);

      while (inMST.size < rooms.length) {
        let minDist = Infinity;
        let minEdge = null;

        for (const i of inMST) {
          for (let j = 0; j < rooms.length; j++) {
            if (inMST.has(j)) continue;

            const dist = Math.hypot(
              rooms[i].centerX - rooms[j].centerX,
              rooms[i].centerY - rooms[j].centerY
            );

            if (dist < minDist) {
              minDist = dist;
              minEdge = { from: rooms[i], to: rooms[j], fromIdx: i, toIdx: j };
            }
          }
        }

        if (minEdge) {
          edges.push(minEdge);
          inMST.add(minEdge.toIdx);
        } else {
          break;
        }
      }

      return edges;
    },

    _carveCorridorBetweenRooms(grid, room1, room2, width, addDoors, rng) {
      const x1 = Math.floor(room1.centerX);
      const y1 = Math.floor(room1.centerY);
      const x2 = Math.floor(room2.centerX);
      const y2 = Math.floor(room2.centerY);

      // L-shaped corridor
      const goHorizontalFirst = rng.next() > 0.5;

      if (goHorizontalFirst) {
        // Horizontal then vertical
        this._carveHorizontalCorridor(grid, x1, x2, y1, width);
        this._carveVerticalCorridor(grid, y1, y2, x2, width);
      } else {
        // Vertical then horizontal
        this._carveVerticalCorridor(grid, y1, y2, x1, width);
        this._carveHorizontalCorridor(grid, x1, x2, y2, width);
      }

      // Add doors at room entrances if requested
      if (addDoors) {
        // Place door at corridor entrance to first room
        const door1X = goHorizontalFirst
          ? (x1 < x2 ? room1.x + room1.width : room1.x - 1)
          : x1;
        const door1Y = goHorizontalFirst
          ? y1
          : (y1 < y2 ? room1.y + room1.height : room1.y - 1);

        if (door1Y >= 0 && door1Y < grid.height &&
            door1X >= 0 && door1X < grid.width &&
            grid.tiles[door1Y] && grid.tiles[door1Y][door1X] !== undefined) {
          grid.tiles[door1Y][door1X] = BINARY_MARKERS.DOOR;
        }
      }
    },

    _carveHorizontalCorridor(grid, x1, x2, y, width) {
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);

      for (let x = minX; x <= maxX; x++) {
        for (let w = 0; w < width; w++) {
          const py = y + w - Math.floor(width / 2);
          if (py >= 0 && py < grid.height && x >= 0 && x < grid.width) {
            if (grid.tiles[py] && grid.tiles[py][x] !== undefined) {
              grid.tiles[py][x] = BINARY_MARKERS.FLOOR;
            }
          }
        }
      }
    },

    _carveVerticalCorridor(grid, y1, y2, x, width) {
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);

      for (let y = minY; y <= maxY; y++) {
        for (let w = 0; w < width; w++) {
          const px = x + w - Math.floor(width / 2);
          if (y >= 0 && y < grid.height && px >= 0 && px < grid.width) {
            if (grid.tiles[y] && grid.tiles[y][px] !== undefined) {
              grid.tiles[y][px] = BINARY_MARKERS.FLOOR;
            }
          }
        }
      }
    },
  },

  /**
   * Arena Chamber - Combat arena with features
   */
  arena_chamber: {
    name: 'arena_chamber',
    description: 'A combat arena with pillars and optional features',
    category: 'dungeon',
    params: {
      width: { type: 'number', default: 16, min: 10, max: 30 },
      height: { type: 'number', default: 16, min: 10, max: 30 },
      centerX: { type: 'number', default: null },
      centerY: { type: 'number', default: null },
      pillarSpacing: { type: 'number', default: 4, min: 3, max: 8 },
      hasPillars: { type: 'boolean', default: true },
      entrances: { type: 'number', default: 4, min: 1, max: 4 },
      entranceWidth: { type: 'number', default: 3, min: 2, max: 5 },
      seed: { type: 'number', default: null },
    },

    generate(grid, params, rng) {
      const {
        width = 16,
        height = 16,
        centerX = Math.floor(grid.width / 2),
        centerY = Math.floor(grid.height / 2),
        pillarSpacing = 4,
        hasPillars = true,
        entrances = 4,
        entranceWidth = 3,
      } = params;

      const arenaX = centerX - Math.floor(width / 2);
      const arenaY = centerY - Math.floor(height / 2);

      // Carve arena floor
      for (let y = arenaY; y < arenaY + height && y < grid.height; y++) {
        for (let x = arenaX; x < arenaX + width && x < grid.width; x++) {
          if (y >= 0 && x >= 0 && grid.tiles[y] && grid.tiles[y][x] !== undefined) {
            grid.tiles[y][x] = BINARY_MARKERS.FLOOR;
          }
        }
      }

      // Add pillars
      const pillars = [];
      if (hasPillars) {
        for (let y = arenaY + 2; y < arenaY + height - 2; y += pillarSpacing) {
          for (let x = arenaX + 2; x < arenaX + width - 2; x += pillarSpacing) {
            if (y >= 0 && y < grid.height && x >= 0 && x < grid.width) {
              if (grid.tiles[y] && grid.tiles[y][x] !== undefined) {
                // Skip center area
                const distFromCenter = Math.hypot(x - centerX, y - centerY);
                if (distFromCenter > 3) {
                  grid.tiles[y][x] = BINARY_MARKERS.PILLAR;
                  pillars.push({ x, y });
                }
              }
            }
          }
        }
      }

      // Add entrances
      const entrancePositions = [];
      const entranceDirs = [
        { dx: 0, dy: -1, name: 'north' },  // Top
        { dx: 0, dy: 1, name: 'south' },   // Bottom
        { dx: -1, dy: 0, name: 'west' },   // Left
        { dx: 1, dy: 0, name: 'east' },    // Right
      ];

      const shuffledDirs = rng.shuffle(entranceDirs);
      for (let i = 0; i < Math.min(entrances, shuffledDirs.length); i++) {
        const dir = shuffledDirs[i];
        let entranceX, entranceY;

        if (dir.dx === 0) {
          // Horizontal entrance (top/bottom)
          entranceX = centerX - Math.floor(entranceWidth / 2);
          entranceY = dir.dy < 0 ? arenaY - 1 : arenaY + height;
        } else {
          // Vertical entrance (left/right)
          entranceX = dir.dx < 0 ? arenaX - 1 : arenaX + width;
          entranceY = centerY - Math.floor(entranceWidth / 2);
        }

        // Carve entrance
        for (let w = 0; w < entranceWidth; w++) {
          const ex = entranceX + (dir.dx === 0 ? w : 0);
          const ey = entranceY + (dir.dy === 0 ? w : 0);

          if (ey >= 0 && ey < grid.height && ex >= 0 && ex < grid.width) {
            if (grid.tiles[ey] && grid.tiles[ey][ex] !== undefined) {
              grid.tiles[ey][ex] = BINARY_MARKERS.FLOOR;
            }
          }
        }

        entrancePositions.push({
          x: entranceX, y: entranceY,
          direction: dir.name,
        });
      }

      return {
        arena: { x: arenaX, y: arenaY, width, height },
        center: { x: centerX, y: centerY },
        pillars,
        entrances: entrancePositions,
      };
    },
  },

  // ==========================================================================
  // ENTITY PRESETS
  // ==========================================================================

  /**
   * Monster Group - Group of monsters with formation
   */
  monster_group: {
    name: 'monster_group',
    description: 'A group of monsters with various formations',
    category: 'entity',
    params: {
      count: { type: 'number', default: 5, min: 1, max: 20 },
      centerX: { type: 'number', required: true },
      centerY: { type: 'number', required: true },
      radius: { type: 'number', default: 3, min: 1, max: 10 },
      formation: {
        type: 'string',
        default: 'cluster',
        enum: ['cluster', 'circle', 'line', 'square', 'random'],
      },
      monsterType: { type: 'number', default: 1, description: 'Monster type ID' },
      hasLeader: { type: 'boolean', default: false },
      leaderType: { type: 'number', default: null, description: 'Leader monster type ID' },
      seed: { type: 'number', default: null },
    },

    generate(grid, params, rng) {
      const {
        count = 5,
        centerX,
        centerY,
        radius = 3,
        formation = 'cluster',
        monsterType = 1,
        hasLeader = false,
        leaderType = null,
      } = params;

      // Ensure monster layer exists
      if (!grid.monsters) {
        grid.monsters = [];
        for (let y = 0; y < grid.height * 2; y++) {
          grid.monsters[y] = new Array(grid.width * 2).fill(0);
        }
        grid.hasMonsters = true;
      }

      const placements = [];

      // Generate positions based on formation
      let positions;
      switch (formation) {
        case 'circle':
          positions = this._circleFormation(centerX, centerY, radius, count);
          break;
        case 'line':
          positions = this._lineFormation(centerX, centerY, count, rng);
          break;
        case 'square':
          positions = this._squareFormation(centerX, centerY, count);
          break;
        case 'random':
          positions = this._randomFormation(centerX, centerY, radius, count, rng);
          break;
        case 'cluster':
        default:
          positions = poissonDiskSampling(radius * 2, radius * 2, 1.5, 30, rng)
            .slice(0, count)
            .map(p => ({
              x: centerX - radius + p.x,
              y: centerY - radius + p.y,
            }));
          break;
      }

      // Place monsters
      for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        const mx = Math.round(pos.x * 2); // Convert to sub-tile coords
        const my = Math.round(pos.y * 2);

        if (my >= 0 && my < grid.monsters.length &&
            mx >= 0 && mx < grid.monsters[0].length) {
          const type = (i === 0 && hasLeader && leaderType) ? leaderType : monsterType;
          grid.monsters[my][mx] = type;
          placements.push({
            x: pos.x, y: pos.y,
            type,
            isLeader: i === 0 && hasLeader,
          });
        }
      }

      return {
        placements,
        count: placements.length,
        formation,
      };
    },

    _circleFormation(cx, cy, radius, count) {
      const positions = [];
      for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        positions.push({
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
        });
      }
      return positions;
    },

    _lineFormation(cx, cy, count, rng) {
      const positions = [];
      const angle = rng.next() * Math.PI;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const spacing = 1.5;

      for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) / 2) * spacing;
        positions.push({
          x: cx + dx * offset,
          y: cy + dy * offset,
        });
      }
      return positions;
    },

    _squareFormation(cx, cy, count) {
      const positions = [];
      const side = Math.ceil(Math.sqrt(count));
      const spacing = 1.5;

      let placed = 0;
      for (let row = 0; row < side && placed < count; row++) {
        for (let col = 0; col < side && placed < count; col++) {
          positions.push({
            x: cx + (col - (side - 1) / 2) * spacing,
            y: cy + (row - (side - 1) / 2) * spacing,
          });
          placed++;
        }
      }
      return positions;
    },

    _randomFormation(cx, cy, radius, count, rng) {
      const positions = [];
      for (let i = 0; i < count; i++) {
        positions.push(rng.pointInCircle(cx, cy, radius));
      }
      return positions;
    },
  },

  /**
   * Treasure Room - Chests and loot containers
   */
  treasure_room: {
    name: 'treasure_room',
    description: 'A treasure room with chests and containers',
    category: 'entity',
    params: {
      chestCount: { type: 'number', default: 3, min: 1, max: 10 },
      barrelCount: { type: 'number', default: 5, min: 0, max: 15 },
      centerX: { type: 'number', required: true },
      centerY: { type: 'number', required: true },
      radius: { type: 'number', default: 4, min: 2, max: 10 },
      hasMainChest: { type: 'boolean', default: true },
      seed: { type: 'number', default: null },
    },

    generate(grid, params, rng) {
      const {
        chestCount = 3,
        barrelCount = 5,
        centerX,
        centerY,
        radius = 4,
        hasMainChest = true,
      } = params;

      // Ensure objects layer exists
      if (!grid.objects) {
        grid.objects = [];
        for (let y = 0; y < grid.height * 2; y++) {
          grid.objects[y] = new Array(grid.width * 2).fill(0);
        }
        grid.hasObjects = true;
      }

      const placements = [];

      // Place main chest at center
      if (hasMainChest) {
        const ox = Math.round(centerX * 2);
        const oy = Math.round(centerY * 2);
        if (oy >= 0 && oy < grid.objects.length &&
            ox >= 0 && ox < grid.objects[0].length) {
          grid.objects[oy][ox] = 50; // Large chest ID
          placements.push({ x: centerX, y: centerY, type: 'large_chest' });
        }
      }

      // Place smaller chests around
      const chestPositions = poissonDiskSampling(
        radius * 2, radius * 2,
        2,
        30,
        rng
      ).slice(0, chestCount);

      for (const pos of chestPositions) {
        const x = centerX - radius + pos.x;
        const y = centerY - radius + pos.y;
        const ox = Math.round(x * 2);
        const oy = Math.round(y * 2);

        if (oy >= 0 && oy < grid.objects.length &&
            ox >= 0 && ox < grid.objects[0].length &&
            grid.objects[oy][ox] === 0) {
          grid.objects[oy][ox] = 51; // Small chest ID
          placements.push({ x, y, type: 'chest' });
        }
      }

      // Place barrels
      const barrelPositions = poissonDiskSampling(
        radius * 2, radius * 2,
        1.5,
        30,
        rng
      ).slice(0, barrelCount);

      for (const pos of barrelPositions) {
        const x = centerX - radius + pos.x;
        const y = centerY - radius + pos.y;
        const ox = Math.round(x * 2);
        const oy = Math.round(y * 2);

        if (oy >= 0 && oy < grid.objects.length &&
            ox >= 0 && ox < grid.objects[0].length &&
            grid.objects[oy][ox] === 0) {
          grid.objects[oy][ox] = 52; // Barrel ID
          placements.push({ x, y, type: 'barrel' });
        }
      }

      return {
        placements,
        totalObjects: placements.length,
      };
    },
  },
};

// ============================================================================
// PRESET ENGINE
// ============================================================================

/**
 * PresetEngine - Main interface for instantiating presets
 */
export class PresetEngine {
  constructor() {
    this.presets = { ...PRESET_LIBRARY };
    this.customPresets = new Map();
    this.cache = new Map();
    this.maxCacheSize = 100;
  }

  /**
   * Register a custom preset
   * @param {string} name - Preset name
   * @param {Object} definition - Preset definition
   */
  registerPreset(name, definition) {
    if (!definition.generate || typeof definition.generate !== 'function') {
      throw new Error('Preset must have a generate function');
    }
    this.customPresets.set(name, definition);
  }

  /**
   * Get preset by name
   * @param {string} name - Preset name
   * @returns {Object|null} - Preset definition or null
   */
  getPreset(name) {
    return this.presets[name] || this.customPresets.get(name) || null;
  }

  /**
   * List all available presets
   * @param {string} category - Optional category filter
   * @returns {Array} - List of preset info
   */
  listPresets(category = null) {
    const allPresets = {
      ...this.presets,
      ...Object.fromEntries(this.customPresets),
    };

    return Object.entries(allPresets)
      .filter(([_, def]) => !category || def.category === category)
      .map(([name, def]) => ({
        name,
        description: def.description,
        category: def.category,
        params: Object.entries(def.params || {}).map(([pName, pDef]) => ({
          name: pName,
          ...pDef,
        })),
      }));
  }

  /**
   * Instantiate a preset with parameters
   * @param {Object} grid - Target grid object with tiles/monsters/objects arrays
   * @param {string} presetName - Name of preset to instantiate
   * @param {Object} params - Parameters for instantiation
   * @returns {Object} - Result of preset generation
   */
  instantiate(grid, presetName, params = {}) {
    const preset = this.getPreset(presetName);
    if (!preset) {
      throw new Error(`Unknown preset: ${presetName}`);
    }

    // Merge with default params
    const mergedParams = { ...preset.params };
    for (const [key, value] of Object.entries(params)) {
      if (mergedParams[key] !== undefined) {
        mergedParams[key] = value;
      } else {
        // Allow extra params
        mergedParams[key] = value;
      }
    }

    // Extract actual values from param definitions
    const resolvedParams = {};
    for (const [key, def] of Object.entries(mergedParams)) {
      if (typeof def === 'object' && def !== null && 'default' in def) {
        resolvedParams[key] = params[key] !== undefined ? params[key] : def.default;
      } else {
        resolvedParams[key] = def;
      }
    }

    // Create seeded RNG
    const seed = resolvedParams.seed ?? Date.now();
    const rng = new SeededRandom(seed);

    // Call generate function
    const result = preset.generate.call(preset, grid, resolvedParams, rng);

    return {
      preset: presetName,
      params: resolvedParams,
      seed,
      result,
    };
  }

  /**
   * Batch instantiate multiple presets
   * @param {Object} grid - Target grid
   * @param {Array<{preset: string, params: Object}>} presetCalls - Array of preset calls
   * @returns {Array} - Array of results
   */
  batchInstantiate(grid, presetCalls) {
    const results = [];
    for (const call of presetCalls) {
      try {
        const result = this.instantiate(grid, call.preset, call.params || {});
        results.push({ success: true, ...result });
      } catch (error) {
        results.push({
          success: false,
          preset: call.preset,
          error: error.message,
        });
      }
    }
    return results;
  }

  /**
   * Create a new empty grid for preset instantiation
   * @param {number} width - Grid width
   * @param {number} height - Grid height
   * @param {number} defaultTile - Default tile value
   * @returns {Object} - Grid object
   */
  createGrid(width, height, defaultTile = 0) {
    const tiles = [];
    for (let y = 0; y < height; y++) {
      tiles[y] = new Array(width).fill(defaultTile);
    }

    return {
      width,
      height,
      tiles,
      monsters: null,
      objects: null,
      hasMonsters: false,
      hasObjects: false,
    };
  }

  /**
   * Convert grid to DUN format
   * @param {Object} grid - Grid object
   * @returns {Object} - DUN data structure
   */
  gridToDUN(grid) {
    return {
      width: grid.width,
      height: grid.height,
      baseTiles: grid.tiles,
      items: null,
      monsters: grid.monsters || null,
      objects: grid.objects || null,
      hasItems: false,
      hasMonsters: grid.hasMonsters || false,
      hasObjects: grid.hasObjects || false,
    };
  }

  /**
   * Get cache key for preset + params
   */
  _getCacheKey(presetName, params) {
    return `${presetName}:${JSON.stringify(params)}`;
  }
}

// ============================================================================
// SHORTHAND PARSER
// ============================================================================

/**
 * Parse AI shorthand notation for presets
 * Format: "@preset:param1=value1,param2=value2"
 * Example: "@town_cluster:count=8,radius=5,seed=42"
 */
export function parsePresetShorthand(shorthand) {
  const match = shorthand.match(/^@(\w+)(?::(.*))?$/);
  if (!match) {
    return null;
  }

  const presetName = match[1];
  const paramsStr = match[2] || '';
  const params = {};

  if (paramsStr) {
    const paramPairs = paramsStr.split(',');
    for (const pair of paramPairs) {
      const [key, value] = pair.split('=');
      if (key && value !== undefined) {
        // Try to parse as number or boolean
        if (value === 'true') {
          params[key.trim()] = true;
        } else if (value === 'false') {
          params[key.trim()] = false;
        } else if (!isNaN(Number(value))) {
          params[key.trim()] = Number(value);
        } else {
          params[key.trim()] = value.trim();
        }
      }
    }
  }

  return { preset: presetName, params };
}

/**
 * Parse multiple presets from a string
 * Presets are separated by whitespace
 */
export function parseMultiplePresets(input) {
  const presets = [];
  const regex = /@\w+(?::[^\s@]+)?/g;
  let match;

  while ((match = regex.exec(input)) !== null) {
    const parsed = parsePresetShorthand(match[0]);
    if (parsed) {
      presets.push(parsed);
    }
  }

  return presets;
}

// ============================================================================
// EXPORTS
// ============================================================================

// Create singleton engine
export const presetEngine = new PresetEngine();

export default {
  PresetEngine,
  presetEngine,
  SeededRandom,
  PerlinNoise,
  poissonDiskSampling,
  voronoiRegions,
  parsePresetShorthand,
  parseMultiplePresets,
  PRESET_LIBRARY,
};
