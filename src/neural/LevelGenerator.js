/**
 * AI-Driven Level Generation System
 *
 * Replaces static dungeon generation with AI-generated layouts.
 * Uses constraint satisfaction and procedural healing to ensure playability.
 */

import NeuralConfig from './config';
import neuralInterop from './NeuralInterop';

const { levelGeneration: config } = NeuralConfig;

/**
 * Level generation schema for AI prompts
 */
const LEVEL_SCHEMA = {
  type: 'object',
  properties: {
    grid: {
      type: 'array',
      description: '40x40 2D array of tile integers (0=floor, 1=wall, 2=door, 3=stairs_up, 4=stairs_down)',
      items: {
        type: 'array',
        items: { type: 'integer', minimum: 0, maximum: 5 },
      },
    },
    rooms: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          x: { type: 'integer' },
          y: { type: 'integer' },
          width: { type: 'integer' },
          height: { type: 'integer' },
          type: { type: 'string' },
        },
      },
    },
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          x: { type: 'integer' },
          y: { type: 'integer' },
          count: { type: 'integer' },
        },
      },
    },
  },
};

/**
 * Pathfinding utilities for map validation
 */
class Pathfinder {
  static findPath(grid, startX, startY, endX, endY) {
    const width = grid[0].length;
    const height = grid.length;

    const openSet = [{ x: startX, y: startY, g: 0, h: 0, f: 0, parent: null }];
    const closedSet = new Set();

    const heuristic = (x1, y1, x2, y2) => Math.abs(x1 - x2) + Math.abs(y1 - y2);

    while (openSet.length > 0) {
      // Find node with lowest f score
      let lowestIndex = 0;
      for (let i = 1; i < openSet.length; i++) {
        if (openSet[i].f < openSet[lowestIndex].f) {
          lowestIndex = i;
        }
      }

      const current = openSet[lowestIndex];

      // Check if we reached the goal
      if (current.x === endX && current.y === endY) {
        const path = [];
        let node = current;
        while (node) {
          path.unshift({ x: node.x, y: node.y });
          node = node.parent;
        }
        return path;
      }

      // Move current from open to closed
      openSet.splice(lowestIndex, 1);
      closedSet.add(`${current.x},${current.y}`);

      // Check neighbors
      const neighbors = [
        { x: current.x - 1, y: current.y },
        { x: current.x + 1, y: current.y },
        { x: current.x, y: current.y - 1 },
        { x: current.x, y: current.y + 1 },
      ];

      for (const neighbor of neighbors) {
        const { x, y } = neighbor;

        // Skip if out of bounds
        if (x < 0 || x >= width || y < 0 || y >= height) continue;

        // Skip if in closed set
        if (closedSet.has(`${x},${y}`)) continue;

        // Skip walls (but allow doors and stairs)
        const tile = grid[y][x];
        if (tile === config.tileTypes.WALL) continue;

        const g = current.g + 1;
        const h = heuristic(x, y, endX, endY);
        const f = g + h;

        // Check if already in open set with better score
        const existingIndex = openSet.findIndex(n => n.x === x && n.y === y);
        if (existingIndex !== -1 && openSet[existingIndex].g <= g) continue;

        if (existingIndex !== -1) {
          openSet.splice(existingIndex, 1);
        }

        openSet.push({ x, y, g, h, f, parent: current });
      }
    }

    return null; // No path found
  }

  static floodFill(grid, startX, startY) {
    const width = grid[0].length;
    const height = grid.length;
    const visited = new Set();
    const queue = [{ x: startX, y: startY }];
    const reachable = [];

    while (queue.length > 0) {
      const { x, y } = queue.shift();
      const key = `${x},${y}`;

      if (visited.has(key)) continue;
      visited.add(key);

      // Skip walls
      if (grid[y][x] === config.tileTypes.WALL) continue;

      reachable.push({ x, y });

      const neighbors = [
        { x: x - 1, y },
        { x: x + 1, y },
        { x, y: y - 1 },
        { x, y: y + 1 },
      ];

      for (const neighbor of neighbors) {
        if (neighbor.x >= 0 && neighbor.x < width &&
            neighbor.y >= 0 && neighbor.y < height &&
            !visited.has(`${neighbor.x},${neighbor.y}`)) {
          queue.push(neighbor);
        }
      }
    }

    return reachable;
  }
}

/**
 * Map healing utilities for fixing AI-generated maps
 */
class MapHealer {
  static heal(grid) {
    if (!config.healing.enabled) return grid;

    let healedGrid = grid.map(row => [...row]);
    let iterations = 0;

    // Find start and end points
    let start = null;
    let end = null;

    for (let y = 0; y < healedGrid.length; y++) {
      for (let x = 0; x < healedGrid[y].length; x++) {
        if (healedGrid[y][x] === config.tileTypes.STAIRS_UP) {
          start = { x, y };
        } else if (healedGrid[y][x] === config.tileTypes.STAIRS_DOWN) {
          end = { x, y };
        }
      }
    }

    // If no start/end, place them
    if (!start) {
      start = MapHealer.findPlaceForStairs(healedGrid, true);
      if (start) healedGrid[start.y][start.x] = config.tileTypes.STAIRS_UP;
    }

    if (!end) {
      end = MapHealer.findPlaceForStairs(healedGrid, false, start);
      if (end) healedGrid[end.y][end.x] = config.tileTypes.STAIRS_DOWN;
    }

    if (!start || !end) {
      console.warn('[MapHealer] Could not place stairs');
      return healedGrid;
    }

    // Check connectivity
    while (iterations < config.healing.maxIterations) {
      const path = Pathfinder.findPath(healedGrid, start.x, start.y, end.x, end.y);

      if (path) {
        // Map is connected
        break;
      }

      // Carve a path
      healedGrid = MapHealer.carvePath(healedGrid, start, end);
      iterations++;
    }

    // Validate and fix any remaining issues
    healedGrid = MapHealer.fixWalls(healedGrid);

    return healedGrid;
  }

  static findPlaceForStairs(grid, isStart, avoidPoint = null) {
    const floors = [];

    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        if (grid[y][x] === config.tileTypes.FLOOR) {
          const dist = avoidPoint
            ? Math.abs(x - avoidPoint.x) + Math.abs(y - avoidPoint.y)
            : 0;
          floors.push({ x, y, dist });
        }
      }
    }

    if (floors.length === 0) return null;

    // Sort by distance (for end stairs, prefer far from start)
    floors.sort((a, b) => avoidPoint ? b.dist - a.dist : a.dist - b.dist);

    return floors[isStart ? 0 : Math.min(floors.length - 1, floors.length - 1)];
  }

  static carvePath(grid, start, end) {
    const newGrid = grid.map(row => [...row]);

    // Use Bresenham's line algorithm to carve
    let x = start.x;
    let y = start.y;
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    const sx = start.x < end.x ? 1 : -1;
    const sy = start.y < end.y ? 1 : -1;
    let err = dx - dy;

    while (true) {
      // Carve floor at current position
      if (newGrid[y][x] === config.tileTypes.WALL) {
        newGrid[y][x] = config.tileTypes.FLOOR;
      }

      // Also carve adjacent tiles for wider corridors
      if (config.healing.carvePathWidth > 1) {
        for (let ox = -1; ox <= 1; ox++) {
          for (let oy = -1; oy <= 1; oy++) {
            const nx = x + ox;
            const ny = y + oy;
            if (nx >= 0 && nx < newGrid[0].length &&
                ny >= 0 && ny < newGrid.length &&
                newGrid[ny][nx] === config.tileTypes.WALL) {
              newGrid[ny][nx] = config.tileTypes.FLOOR;
            }
          }
        }
      }

      if (x === end.x && y === end.y) break;

      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }

    return newGrid;
  }

  static fixWalls(grid) {
    const newGrid = grid.map(row => [...row]);

    // Ensure border is walls
    for (let x = 0; x < newGrid[0].length; x++) {
      if (newGrid[0][x] === config.tileTypes.FLOOR) newGrid[0][x] = config.tileTypes.WALL;
      if (newGrid[newGrid.length - 1][x] === config.tileTypes.FLOOR) {
        newGrid[newGrid.length - 1][x] = config.tileTypes.WALL;
      }
    }
    for (let y = 0; y < newGrid.length; y++) {
      if (newGrid[y][0] === config.tileTypes.FLOOR) newGrid[y][0] = config.tileTypes.WALL;
      if (newGrid[y][newGrid[0].length - 1] === config.tileTypes.FLOOR) {
        newGrid[y][newGrid[0].length - 1] = config.tileTypes.WALL;
      }
    }

    return newGrid;
  }
}

/**
 * Mock level generator for when AI API is unavailable
 */
class MockLevelGenerator {
  static generate(levelType, depth) {
    const width = config.gridWidth;
    const height = config.gridHeight;

    // Initialize with walls
    const grid = Array(height).fill(null).map(() => Array(width).fill(config.tileTypes.WALL));

    // Generate rooms
    const rooms = [];
    const numRooms = config.constraints.minRooms +
      Math.floor(Math.random() * (config.constraints.maxRooms - config.constraints.minRooms + 1));

    for (let i = 0; i < numRooms; i++) {
      const roomWidth = config.constraints.minRoomSize +
        Math.floor(Math.random() * (config.constraints.maxRoomSize - config.constraints.minRoomSize + 1));
      const roomHeight = config.constraints.minRoomSize +
        Math.floor(Math.random() * (config.constraints.maxRoomSize - config.constraints.minRoomSize + 1));

      const roomX = 2 + Math.floor(Math.random() * (width - roomWidth - 4));
      const roomY = 2 + Math.floor(Math.random() * (height - roomHeight - 4));

      // Check for overlap
      let overlaps = false;
      for (const room of rooms) {
        if (roomX < room.x + room.width + 2 &&
            roomX + roomWidth + 2 > room.x &&
            roomY < room.y + room.height + 2 &&
            roomY + roomHeight + 2 > room.y) {
          overlaps = true;
          break;
        }
      }

      if (!overlaps) {
        rooms.push({ x: roomX, y: roomY, width: roomWidth, height: roomHeight });

        // Carve room
        for (let y = roomY; y < roomY + roomHeight; y++) {
          for (let x = roomX; x < roomX + roomWidth; x++) {
            grid[y][x] = config.tileTypes.FLOOR;
          }
        }
      }
    }

    // Connect rooms with corridors
    for (let i = 1; i < rooms.length; i++) {
      const prev = rooms[i - 1];
      const curr = rooms[i];

      const startX = Math.floor(prev.x + prev.width / 2);
      const startY = Math.floor(prev.y + prev.height / 2);
      const endX = Math.floor(curr.x + curr.width / 2);
      const endY = Math.floor(curr.y + curr.height / 2);

      // Horizontal then vertical
      let x = startX;
      while (x !== endX) {
        grid[startY][x] = config.tileTypes.FLOOR;
        x += x < endX ? 1 : -1;
      }

      let y = startY;
      while (y !== endY) {
        grid[y][endX] = config.tileTypes.FLOOR;
        y += y < endY ? 1 : -1;
      }
    }

    // Place stairs
    if (rooms.length >= 2) {
      const startRoom = rooms[0];
      const endRoom = rooms[rooms.length - 1];

      grid[Math.floor(startRoom.y + startRoom.height / 2)]
          [Math.floor(startRoom.x + startRoom.width / 2)] = config.tileTypes.STAIRS_UP;

      grid[Math.floor(endRoom.y + endRoom.height / 2)]
          [Math.floor(endRoom.x + endRoom.width / 2)] = config.tileTypes.STAIRS_DOWN;
    }

    // Generate monster spawn points
    const entities = [];
    for (const room of rooms.slice(1)) {
      entities.push({
        type: 'MONSTER_SPAWN',
        x: Math.floor(room.x + room.width / 2),
        y: Math.floor(room.y + room.height / 2),
        count: 1 + Math.floor(Math.random() * 3),
      });
    }

    return { grid, rooms, entities };
  }
}

/**
 * AI Level Generator
 */
class LevelGenerator {
  constructor() {
    this.cache = new Map();
    this.generating = false;
  }

  /**
   * Generate a level using AI
   */
  async generate(levelType, depth, seed = null) {
    if (!config.enabled) {
      console.log('[LevelGenerator] AI generation disabled, using mock');
      return MockLevelGenerator.generate(levelType, depth);
    }

    // Check cache
    const cacheKey = `${levelType}-${depth}-${seed}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    this.generating = true;

    try {
      const theme = config.themes[levelType] || 'Dungeon';

      // Build prompt
      const prompt = this.buildPrompt(theme, depth);

      let levelData;

      if (NeuralConfig.debug.mockAPIResponses || !NeuralConfig.provider.apiKey) {
        // Use mock generation
        console.log('[LevelGenerator] Using mock generation');
        levelData = MockLevelGenerator.generate(levelType, depth);
      } else {
        // Call AI API
        levelData = await this.callAI(prompt);
      }

      // Validate and heal the map
      if (levelData.grid) {
        levelData.grid = MapHealer.heal(levelData.grid);
      }

      // Cache the result
      if (this.cache.size >= NeuralConfig.memory.levelCacheSize) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
      }
      this.cache.set(cacheKey, levelData);

      // Emit event
      neuralInterop.emit('levelGenerated', levelData);

      return levelData;
    } catch (error) {
      console.error('[LevelGenerator] Generation failed:', error);

      // Fallback to mock
      return MockLevelGenerator.generate(levelType, depth);
    } finally {
      this.generating = false;
    }
  }

  /**
   * Generate a level with options object (wrapper for generate)
   * @param {Object} options - { theme, difficulty, seed }
   * @returns {Promise<Object>} Level data with grid
   */
  async generateLevel(options = {}) {
    const { theme = 'cathedral', difficulty = 1, seed = null } = options;

    // Map theme to level type
    const themeToType = {
      cathedral: 0,
      catacombs: 1,
      caves: 2,
      hell: 3,
    };

    const levelType = themeToType[theme.toLowerCase()] ?? 0;

    // Use difficulty as depth
    const result = await this.generate(levelType, difficulty, seed);

    // Return just the grid if that's all we got, or the full result
    return result?.grid || result;
  }

  /**
   * Build AI prompt for level generation
   */
  buildPrompt(theme, depth) {
    return `Generate a 40x40 tile grid for a Diablo 1 ${theme} level at depth ${depth}.

Requirements:
- The level must contain exactly 1 entrance (stairs up, value 3) and 1 exit (stairs down, value 4)
- Include at least ${config.constraints.minRooms} separate rooms connected by corridors
- Rooms should be between ${config.constraints.minRoomSize}x${config.constraints.minRoomSize} and ${config.constraints.maxRoomSize}x${config.constraints.maxRoomSize} tiles
- Use these tile values: 0=floor, 1=wall, 2=door, 3=stairs_up, 4=stairs_down
- Ensure all areas are connected (no isolated sections)
- Border tiles must be walls
- Include 2-3 monster spawn locations in the 'entities' array

Output strictly valid JSON matching this schema:
${JSON.stringify(LEVEL_SCHEMA, null, 2)}

Theme notes for ${theme}:
${this.getThemeNotes(theme)}`;
  }

  /**
   * Get theme-specific generation notes
   */
  getThemeNotes(theme) {
    const notes = {
      Cathedral: 'Gothic architecture, arched corridors, altar rooms, crypts',
      Catacombs: 'Narrow passages, burial chambers, bone piles, small crypts',
      Caves: 'Organic shapes, winding tunnels, underground lakes, stalagmites',
      Hell: 'Chaotic layout, fire pits, demonic architecture, blood pools',
    };
    return notes[theme] || 'Standard dungeon layout';
  }

  /**
   * Call AI API for generation
   */
  async callAI(prompt) {
    const response = await fetch(`${NeuralConfig.provider.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NeuralConfig.provider.apiKey}`,
      },
      body: JSON.stringify({
        model: NeuralConfig.provider.model,
        messages: [
          {
            role: 'system',
            content: 'You are a procedural level generator for the game Diablo. Output only valid JSON.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON in response');
    }

    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Convert AI grid to game tile format
   */
  convertToGameTiles(grid, levelType) {
    // This would apply the game's autotiling logic
    // For now, return the abstract grid
    return grid;
  }

  /**
   * Clear the generation cache
   */
  clearCache() {
    this.cache.clear();
  }
}

// Singleton instance
const levelGenerator = new LevelGenerator();

export {
  LevelGenerator,
  MockLevelGenerator,
  MapHealer,
  Pathfinder,
  LEVEL_SCHEMA,
};

export default levelGenerator;
