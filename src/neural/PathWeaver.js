/**
 * Path Weaving Algorithm Wrapper
 *
 * Implements pathfinding algorithms for trails and connections:
 * - A* pathfinding for optimal routes
 * - Dijkstra for multi-path scenarios
 * - Bezier curves for natural winding paths
 * - Obstacle avoidance with placed objects
 *
 * AI specifies high-level anchors, this module auto-weaves the path.
 * Output is ready for DUN/TSV conversion.
 */

import { BINARY_MARKERS } from './TileMapper';
import { TOWN_TILES } from './TownGenerator';
import { SeededRandom } from './PresetLibrary';

// ============================================================================
// PRIORITY QUEUE FOR A*
// ============================================================================

/**
 * Min-heap priority queue for pathfinding
 */
class PriorityQueue {
  constructor() {
    this.heap = [];
  }

  push(item, priority) {
    this.heap.push({ item, priority });
    this._bubbleUp(this.heap.length - 1);
  }

  pop() {
    if (this.heap.length === 0) return null;
    if (this.heap.length === 1) return this.heap.pop().item;

    const result = this.heap[0].item;
    this.heap[0] = this.heap.pop();
    this._bubbleDown(0);
    return result;
  }

  isEmpty() {
    return this.heap.length === 0;
  }

  _bubbleUp(index) {
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.heap[parent].priority <= this.heap[index].priority) break;
      [this.heap[parent], this.heap[index]] = [this.heap[index], this.heap[parent]];
      index = parent;
    }
  }

  _bubbleDown(index) {
    while (true) {
      let smallest = index;
      const left = 2 * index + 1;
      const right = 2 * index + 2;

      if (left < this.heap.length && this.heap[left].priority < this.heap[smallest].priority) {
        smallest = left;
      }
      if (right < this.heap.length && this.heap[right].priority < this.heap[smallest].priority) {
        smallest = right;
      }

      if (smallest === index) break;
      [this.heap[smallest], this.heap[index]] = [this.heap[index], this.heap[smallest]];
      index = smallest;
    }
  }
}

// ============================================================================
// A* PATHFINDING
// ============================================================================

/**
 * A* Pathfinder - Finds optimal paths around obstacles
 */
export class AStarPathfinder {
  constructor(grid, options = {}) {
    this.grid = grid;
    this.width = grid.width || grid[0]?.length || 0;
    this.height = grid.height || grid.length || 0;
    this.options = {
      allowDiagonal: options.allowDiagonal ?? false,
      heuristicWeight: options.heuristicWeight ?? 1.0,
      walkableTiles: options.walkableTiles ?? null,
      costFunction: options.costFunction ?? null,
      ...options,
    };
  }

  /**
   * Check if a cell is walkable
   */
  isWalkable(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;

    const tiles = this.grid.tiles || this.grid;
    const tile = tiles[y]?.[x];
    if (tile === undefined) return false;

    // Custom walkable check
    if (this.options.walkableTiles) {
      return this.options.walkableTiles.includes(tile);
    }

    // Default: walls and certain tiles are not walkable
    const unwalkable = [
      BINARY_MARKERS.WALL,
      ...TOWN_TILES.wall_stone,
      ...TOWN_TILES.wall_wood,
      ...TOWN_TILES.water,
      ...TOWN_TILES.tree,
    ];

    return !unwalkable.includes(tile);
  }

  /**
   * Get movement cost for a cell
   */
  getCost(x, y) {
    if (this.options.costFunction) {
      return this.options.costFunction(x, y, this.grid);
    }

    const tiles = this.grid.tiles || this.grid;
    const tile = tiles[y]?.[x];

    // Different terrain has different costs
    if (TOWN_TILES.dirt?.includes(tile)) return 1.0;
    if (TOWN_TILES.cobblestone?.includes(tile)) return 0.8;
    if (TOWN_TILES.grass?.includes(tile)) return 1.2;
    if (TOWN_TILES.rubble?.includes(tile)) return 2.0;

    return 1.0;
  }

  /**
   * Calculate heuristic (Manhattan or Euclidean distance)
   */
  heuristic(x1, y1, x2, y2) {
    if (this.options.allowDiagonal) {
      // Euclidean distance
      return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2) * this.options.heuristicWeight;
    }
    // Manhattan distance
    return (Math.abs(x2 - x1) + Math.abs(y2 - y1)) * this.options.heuristicWeight;
  }

  /**
   * Get valid neighbors
   */
  getNeighbors(x, y) {
    const neighbors = [];

    // Cardinal directions
    const directions = [
      { dx: 0, dy: -1 }, // North
      { dx: 1, dy: 0 },  // East
      { dx: 0, dy: 1 },  // South
      { dx: -1, dy: 0 }, // West
    ];

    // Add diagonal directions if allowed
    if (this.options.allowDiagonal) {
      directions.push(
        { dx: 1, dy: -1 },  // NE
        { dx: 1, dy: 1 },   // SE
        { dx: -1, dy: 1 },  // SW
        { dx: -1, dy: -1 }, // NW
      );
    }

    for (const { dx, dy } of directions) {
      const nx = x + dx;
      const ny = y + dy;

      if (this.isWalkable(nx, ny)) {
        // Diagonal movement cost is sqrt(2)
        const moveCost = (dx !== 0 && dy !== 0) ? 1.414 : 1.0;
        neighbors.push({
          x: nx,
          y: ny,
          cost: moveCost * this.getCost(nx, ny),
        });
      }
    }

    return neighbors;
  }

  /**
   * Find path from start to end
   * @returns {Array<{x, y}>|null} - Path points or null if no path
   */
  findPath(startX, startY, endX, endY) {
    if (!this.isWalkable(startX, startY) || !this.isWalkable(endX, endY)) {
      return null;
    }

    const openSet = new PriorityQueue();
    const cameFrom = new Map();
    const gScore = new Map();
    const fScore = new Map();

    const key = (x, y) => `${x},${y}`;

    gScore.set(key(startX, startY), 0);
    fScore.set(key(startX, startY), this.heuristic(startX, startY, endX, endY));
    openSet.push({ x: startX, y: startY }, fScore.get(key(startX, startY)));

    const closedSet = new Set();

    while (!openSet.isEmpty()) {
      const current = openSet.pop();
      const currentKey = key(current.x, current.y);

      if (current.x === endX && current.y === endY) {
        // Reconstruct path
        return this._reconstructPath(cameFrom, current);
      }

      closedSet.add(currentKey);

      for (const neighbor of this.getNeighbors(current.x, current.y)) {
        const neighborKey = key(neighbor.x, neighbor.y);

        if (closedSet.has(neighborKey)) continue;

        const tentativeGScore = gScore.get(currentKey) + neighbor.cost;

        if (!gScore.has(neighborKey) || tentativeGScore < gScore.get(neighborKey)) {
          cameFrom.set(neighborKey, current);
          gScore.set(neighborKey, tentativeGScore);
          fScore.set(neighborKey, tentativeGScore + this.heuristic(neighbor.x, neighbor.y, endX, endY));

          openSet.push(neighbor, fScore.get(neighborKey));
        }
      }
    }

    return null; // No path found
  }

  /**
   * Reconstruct path from cameFrom map
   */
  _reconstructPath(cameFrom, current) {
    const path = [{ x: current.x, y: current.y }];
    const key = (x, y) => `${x},${y}`;

    while (cameFrom.has(key(current.x, current.y))) {
      current = cameFrom.get(key(current.x, current.y));
      path.unshift({ x: current.x, y: current.y });
    }

    return path;
  }
}

// ============================================================================
// BEZIER CURVES
// ============================================================================

/**
 * Bezier curve utilities for smooth paths
 */
export const BezierCurve = {
  /**
   * Quadratic Bezier point
   */
  quadratic(t, p0, p1, p2) {
    const t1 = 1 - t;
    return {
      x: t1 * t1 * p0.x + 2 * t1 * t * p1.x + t * t * p2.x,
      y: t1 * t1 * p0.y + 2 * t1 * t * p1.y + t * t * p2.y,
    };
  },

  /**
   * Cubic Bezier point
   */
  cubic(t, p0, p1, p2, p3) {
    const t1 = 1 - t;
    const t1sq = t1 * t1;
    const tsq = t * t;
    return {
      x: t1sq * t1 * p0.x + 3 * t1sq * t * p1.x + 3 * t1 * tsq * p2.x + tsq * t * p3.x,
      y: t1sq * t1 * p0.y + 3 * t1sq * t * p1.y + 3 * t1 * tsq * p2.y + tsq * t * p3.y,
    };
  },

  /**
   * Generate points along a quadratic Bezier curve
   */
  generateQuadratic(p0, p1, p2, segments = 20) {
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const point = this.quadratic(t, p0, p1, p2);
      points.push({
        x: Math.round(point.x),
        y: Math.round(point.y),
      });
    }
    return points;
  },

  /**
   * Generate points along a cubic Bezier curve
   */
  generateCubic(p0, p1, p2, p3, segments = 30) {
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const point = this.cubic(t, p0, p1, p2, p3);
      points.push({
        x: Math.round(point.x),
        y: Math.round(point.y),
      });
    }
    return points;
  },

  /**
   * Generate a Catmull-Rom spline through points
   * More natural-looking than Bezier for multiple waypoints
   */
  catmullRom(points, tension = 0.5, segments = 10) {
    if (points.length < 2) return points;
    if (points.length === 2) {
      // Just linear interpolation
      const result = [];
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        result.push({
          x: Math.round(points[0].x + t * (points[1].x - points[0].x)),
          y: Math.round(points[0].y + t * (points[1].y - points[0].y)),
        });
      }
      return result;
    }

    const result = [];

    // Duplicate first and last points
    const pts = [points[0], ...points, points[points.length - 1]];

    for (let i = 1; i < pts.length - 2; i++) {
      const p0 = pts[i - 1];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2];

      for (let j = 0; j < segments; j++) {
        const t = j / segments;
        const t2 = t * t;
        const t3 = t2 * t;

        const x = 0.5 * (
          (2 * p1.x) +
          (-p0.x + p2.x) * t +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
        );

        const y = 0.5 * (
          (2 * p1.y) +
          (-p0.y + p2.y) * t +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
        );

        result.push({ x: Math.round(x), y: Math.round(y) });
      }
    }

    // Add final point
    result.push(points[points.length - 1]);

    return result;
  },
};

// ============================================================================
// PATH STYLES
// ============================================================================

export const PATH_STYLES = {
  STRAIGHT: 'straight',
  WINDING: 'winding',
  FOREST: 'winding_forest',
  CAVE: 'cave_tunnel',
  CORRIDOR: 'dungeon_corridor',
  ROAD: 'road',
  RIVER: 'river',
};

const STYLE_CONFIGS = {
  [PATH_STYLES.STRAIGHT]: {
    width: 2,
    material: 'dirt',
    curviness: 0,
    addDecorations: false,
  },
  [PATH_STYLES.WINDING]: {
    width: 2,
    material: 'dirt',
    curviness: 0.4,
    addDecorations: false,
  },
  [PATH_STYLES.FOREST]: {
    width: 2,
    material: 'dirt',
    curviness: 0.5,
    addDecorations: true,
    decorations: ['trees', 'bushes'],
    decorationDensity: 0.3,
  },
  [PATH_STYLES.CAVE]: {
    width: 3,
    material: 'floor',
    curviness: 0.3,
    addDecorations: true,
    decorations: ['rocks'],
    decorationDensity: 0.15,
  },
  [PATH_STYLES.CORRIDOR]: {
    width: 2,
    material: 'floor',
    curviness: 0,
    addDecorations: false,
    addWalls: true,
  },
  [PATH_STYLES.ROAD]: {
    width: 3,
    material: 'cobblestone',
    curviness: 0.1,
    addDecorations: false,
  },
  [PATH_STYLES.RIVER]: {
    width: 2,
    material: 'water',
    curviness: 0.6,
    addDecorations: true,
    decorations: ['trees'],
    decorationDensity: 0.2,
  },
};

// ============================================================================
// PATH WEAVER
// ============================================================================

/**
 * PathWeaver - Main path generation engine
 *
 * AI specifies:
 * {
 *   start: [x1, y1],
 *   end: [x2, y2],
 *   waypoints: [[x3, y3], [x4, y4]],  // Optional intermediate points
 *   obstacles: [id1, id2],  // Objects to avoid
 *   style: "winding_forest"
 * }
 */
export class PathWeaver {
  constructor(grid) {
    this.grid = grid;
    this.width = grid.width || grid.tiles?.[0]?.length || 0;
    this.height = grid.height || grid.tiles?.length || 0;
  }

  /**
   * Weave a path based on specification
   * @param {Object} spec - Path specification
   * @returns {Object} - Result with path points and modifications
   */
  weave(spec, rng = new SeededRandom()) {
    const {
      start,
      end,
      waypoints = [],
      obstacles = [],
      style = PATH_STYLES.WINDING,
      seed = Date.now(),
    } = spec;

    if (!rng.seed) rng = new SeededRandom(seed);

    const styleConfig = STYLE_CONFIGS[style] || STYLE_CONFIGS[PATH_STYLES.WINDING];

    // Build obstacle set
    const obstacleSet = this._buildObstacleSet(obstacles);

    // Create pathfinder with obstacles considered
    const pathfinder = new AStarPathfinder(this.grid, {
      allowDiagonal: false,
      costFunction: (x, y) => {
        if (obstacleSet.has(`${x},${y}`)) return Infinity;
        return 1.0;
      },
    });

    // Collect all anchor points
    const anchors = [
      { x: start[0], y: start[1] },
      ...waypoints.map(w => ({ x: w[0], y: w[1] })),
      { x: end[0], y: end[1] },
    ];

    // Find paths between consecutive anchors
    const pathSegments = [];
    for (let i = 0; i < anchors.length - 1; i++) {
      const from = anchors[i];
      const to = anchors[i + 1];

      const segment = pathfinder.findPath(from.x, from.y, to.x, to.y);
      if (segment) {
        pathSegments.push(segment);
      } else {
        // Fallback: straight line
        pathSegments.push([from, to]);
      }
    }

    // Combine segments
    let fullPath = [];
    for (const segment of pathSegments) {
      // Avoid duplicates at joints
      if (fullPath.length > 0 && segment.length > 0) {
        const last = fullPath[fullPath.length - 1];
        if (last.x === segment[0].x && last.y === segment[0].y) {
          fullPath.push(...segment.slice(1));
        } else {
          fullPath.push(...segment);
        }
      } else {
        fullPath.push(...segment);
      }
    }

    // Apply curviness using Catmull-Rom spline
    if (styleConfig.curviness > 0 && fullPath.length > 2) {
      // Sample points for spline
      const sampleRate = Math.max(1, Math.floor(fullPath.length / 10));
      const sampledPoints = [];
      for (let i = 0; i < fullPath.length; i += sampleRate) {
        sampledPoints.push(fullPath[i]);
      }
      if (sampledPoints[sampledPoints.length - 1] !== fullPath[fullPath.length - 1]) {
        sampledPoints.push(fullPath[fullPath.length - 1]);
      }

      // Add random control points for curves
      const curvedPoints = [];
      for (let i = 0; i < sampledPoints.length; i++) {
        const point = sampledPoints[i];
        const offset = (rng.next() - 0.5) * 2 * styleConfig.curviness * 5;

        if (i > 0 && i < sampledPoints.length - 1) {
          curvedPoints.push({
            x: Math.round(point.x + offset),
            y: Math.round(point.y + offset),
          });
        } else {
          curvedPoints.push(point);
        }
      }

      // Generate smooth curve
      fullPath = BezierCurve.catmullRom(curvedPoints, 0.5, Math.ceil(fullPath.length / curvedPoints.length));
    }

    // Remove duplicate points
    fullPath = this._removeDuplicates(fullPath);

    // Apply path to grid
    const result = this._applyPath(fullPath, styleConfig, rng);

    return {
      path: fullPath,
      style,
      config: styleConfig,
      ...result,
    };
  }

  /**
   * Weave multiple paths
   */
  weaveMultiple(specs, rng = new SeededRandom()) {
    const results = [];
    for (const spec of specs) {
      results.push(this.weave(spec, rng));
    }
    return results;
  }

  /**
   * Build obstacle set from obstacle IDs
   */
  _buildObstacleSet(obstacles) {
    const set = new Set();

    // Check if obstacles are positions or references to placed objects
    for (const obs of obstacles) {
      if (Array.isArray(obs)) {
        // Direct position [x, y]
        set.add(`${obs[0]},${obs[1]}`);
      } else if (typeof obs === 'object' && 'x' in obs && 'y' in obs) {
        // Object with x, y
        set.add(`${obs.x},${obs.y}`);
        // Also add surrounding tiles for larger obstacles
        if (obs.width && obs.height) {
          for (let dy = 0; dy < obs.height; dy++) {
            for (let dx = 0; dx < obs.width; dx++) {
              set.add(`${obs.x + dx},${obs.y + dy}`);
            }
          }
        }
      }
    }

    return set;
  }

  /**
   * Remove duplicate consecutive points
   */
  _removeDuplicates(path) {
    if (path.length < 2) return path;

    const result = [path[0]];
    for (let i = 1; i < path.length; i++) {
      const prev = result[result.length - 1];
      const curr = path[i];
      if (prev.x !== curr.x || prev.y !== curr.y) {
        result.push(curr);
      }
    }
    return result;
  }

  /**
   * Apply path to grid with width and decorations
   */
  _applyPath(path, config, rng) {
    const {
      width = 2,
      material = 'dirt',
      addDecorations = false,
      decorations = [],
      decorationDensity = 0.2,
      addWalls = false,
    } = config;

    const tiles = this.grid.tiles || this.grid;
    const materialTiles = this._getMaterialTiles(material);
    const halfWidth = Math.floor(width / 2);

    let tilesModified = 0;
    const pathTileSet = new Set();

    // First pass: carve path
    for (const point of path) {
      for (let dy = -halfWidth; dy <= halfWidth; dy++) {
        for (let dx = -halfWidth; dx <= halfWidth; dx++) {
          const x = point.x + dx;
          const y = point.y + dy;

          if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
            if (tiles[y] && tiles[y][x] !== undefined) {
              tiles[y][x] = rng.pick(materialTiles);
              pathTileSet.add(`${x},${y}`);
              tilesModified++;
            }
          }
        }
      }
    }

    // Second pass: add walls along corridor if requested
    const wallTilesAdded = [];
    if (addWalls) {
      for (const point of path) {
        for (let dy = -halfWidth - 1; dy <= halfWidth + 1; dy++) {
          for (let dx = -halfWidth - 1; dx <= halfWidth + 1; dx++) {
            const x = point.x + dx;
            const y = point.y + dy;

            if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
              if (!pathTileSet.has(`${x},${y}`)) {
                const isAdjacent = pathTileSet.has(`${x - 1},${y}`) ||
                                   pathTileSet.has(`${x + 1},${y}`) ||
                                   pathTileSet.has(`${x},${y - 1}`) ||
                                   pathTileSet.has(`${x},${y + 1}`);

                if (isAdjacent && tiles[y] && tiles[y][x] !== undefined) {
                  tiles[y][x] = BINARY_MARKERS.WALL;
                  wallTilesAdded.push({ x, y });
                }
              }
            }
          }
        }
      }
    }

    // Third pass: add decorations along path
    const decorationsPlaced = [];
    if (addDecorations && decorations.length > 0) {
      for (const point of path) {
        // Check sides of path
        for (const side of [-1, 1]) {
          const offset = halfWidth + 1 + rng.nextInt(0, 2);
          const dx = side * offset;

          // Try horizontal and vertical offsets
          for (const [ox, oy] of [[dx, 0], [0, dx]]) {
            const x = point.x + ox;
            const y = point.y + oy;

            if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
              if (!pathTileSet.has(`${x},${y}`) && rng.next() < decorationDensity) {
                const decorType = rng.pick(decorations);
                const tile = this._getDecorationTile(decorType, rng);

                if (tile && tiles[y] && tiles[y][x] !== undefined) {
                  tiles[y][x] = tile;
                  decorationsPlaced.push({ x, y, type: decorType });
                }
              }
            }
          }
        }
      }
    }

    return {
      tilesModified,
      pathLength: path.length,
      wallTilesAdded: wallTilesAdded.length,
      decorationsPlaced: decorationsPlaced.length,
    };
  }

  /**
   * Get tiles for a material type
   */
  _getMaterialTiles(material) {
    const materials = {
      dirt: TOWN_TILES.dirt,
      cobblestone: TOWN_TILES.cobblestone,
      grass: TOWN_TILES.grass,
      floor: [BINARY_MARKERS.FLOOR],
      water: TOWN_TILES.water,
    };
    return materials[material] || materials.dirt;
  }

  /**
   * Get tile for decoration type
   */
  _getDecorationTile(type, rng) {
    const decorTiles = {
      trees: TOWN_TILES.tree,
      bushes: TOWN_TILES.bush,
      flowers: TOWN_TILES.flowers,
      rocks: TOWN_TILES.rubble,
    };
    const tiles = decorTiles[type];
    return tiles ? rng.pick(tiles) : null;
  }
}

// ============================================================================
// DUNGEON PATH UTILITIES
// ============================================================================

/**
 * Utilities for dungeon-specific pathfinding
 */
export const DungeonPaths = {
  /**
   * Connect rooms with corridors using A*
   * @param {Object} grid - Dungeon grid
   * @param {Array} rooms - Array of room objects {x, y, width, height}
   * @returns {Array} - Corridor connections
   */
  connectRooms(grid, rooms, options = {}) {
    const {
      corridorWidth = 2,
      useAStar = true,
      addDoors = true,
    } = options;

    const connections = [];
    const pathfinder = useAStar ? new AStarPathfinder(grid) : null;

    // Use MST to determine which rooms to connect
    const roomCenters = rooms.map(r => ({
      x: r.x + Math.floor(r.width / 2),
      y: r.y + Math.floor(r.height / 2),
      room: r,
    }));

    // Prim's algorithm for MST
    if (roomCenters.length < 2) return connections;

    const inMST = new Set([0]);
    const edges = [];

    while (inMST.size < roomCenters.length) {
      let minDist = Infinity;
      let minEdge = null;

      for (const i of inMST) {
        for (let j = 0; j < roomCenters.length; j++) {
          if (inMST.has(j)) continue;

          const dist = Math.abs(roomCenters[i].x - roomCenters[j].x) +
                       Math.abs(roomCenters[i].y - roomCenters[j].y);

          if (dist < minDist) {
            minDist = dist;
            minEdge = { from: i, to: j };
          }
        }
      }

      if (minEdge) {
        edges.push(minEdge);
        inMST.add(minEdge.to);
      } else {
        break;
      }
    }

    // Create corridors for each edge
    const weaver = new PathWeaver(grid);

    for (const edge of edges) {
      const from = roomCenters[edge.from];
      const to = roomCenters[edge.to];

      // Find door positions on room edges
      const doorFrom = this._findRoomExit(from.room, to);
      const doorTo = this._findRoomExit(to.room, from);

      const result = weaver.weave({
        start: [doorFrom.x, doorFrom.y],
        end: [doorTo.x, doorTo.y],
        style: PATH_STYLES.CORRIDOR,
      });

      // Add doors at entrances
      const tiles = grid.tiles || grid;
      if (addDoors) {
        tiles[doorFrom.y][doorFrom.x] = BINARY_MARKERS.DOOR;
        tiles[doorTo.y][doorTo.x] = BINARY_MARKERS.DOOR;
      }

      connections.push({
        from: edge.from,
        to: edge.to,
        path: result.path,
        doors: [doorFrom, doorTo],
      });
    }

    return connections;
  },

  /**
   * Find exit point from room towards target
   */
  _findRoomExit(room, target) {
    const cx = room.x + room.width / 2;
    const cy = room.y + room.height / 2;

    const dx = target.x - cx;
    const dy = target.y - cy;

    // Determine which edge to exit from
    if (Math.abs(dx) > Math.abs(dy)) {
      // Exit horizontally
      return {
        x: dx > 0 ? room.x + room.width - 1 : room.x,
        y: Math.floor(cy),
      };
    } else {
      // Exit vertically
      return {
        x: Math.floor(cx),
        y: dy > 0 ? room.y + room.height - 1 : room.y,
      };
    }
  },

  /**
   * Create a river or stream through dungeon
   */
  createRiver(grid, startEdge = 'top', rng = new SeededRandom()) {
    const width = grid.width || grid.tiles?.[0]?.length || 40;
    const height = grid.height || grid.tiles?.length || 40;

    let start, end;

    switch (startEdge) {
      case 'top':
        start = [rng.nextInt(5, width - 5), 0];
        end = [rng.nextInt(5, width - 5), height - 1];
        break;
      case 'left':
        start = [0, rng.nextInt(5, height - 5)];
        end = [width - 1, rng.nextInt(5, height - 5)];
        break;
      default:
        start = [rng.nextInt(5, width - 5), 0];
        end = [rng.nextInt(5, width - 5), height - 1];
    }

    // Add random waypoints for natural look
    const waypoints = [];
    const numWaypoints = rng.nextInt(2, 5);
    for (let i = 0; i < numWaypoints; i++) {
      const t = (i + 1) / (numWaypoints + 1);
      waypoints.push([
        Math.round(start[0] + t * (end[0] - start[0]) + (rng.next() - 0.5) * 10),
        Math.round(start[1] + t * (end[1] - start[1])),
      ]);
    }

    const weaver = new PathWeaver(grid);
    return weaver.weave({
      start,
      end,
      waypoints,
      style: PATH_STYLES.RIVER,
    }, rng);
  },
};

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  PathWeaver,
  AStarPathfinder,
  BezierCurve,
  DungeonPaths,
  PATH_STYLES,
  PriorityQueue,
};
