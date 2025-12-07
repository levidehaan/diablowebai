/**
 * LevelDesigner - High-Level Tool for AI Level Creation
 *
 * Provides abstracted methods for level design that reduce the number
 * of tool calls the AI needs to make. Instead of placing individual tiles,
 * the AI can use high-level commands like:
 *   - drawRoad(from, to, width)
 *   - placeBuilding(type, position)
 *   - populateArea(region, density, types)
 *
 * This dramatically reduces AI token usage and improves generation quality.
 */

import { TOWN_TILES } from '../TownGenerator';

// Building templates (pre-defined tile patterns)
const BUILDING_TEMPLATES = {
  blacksmith: {
    width: 5,
    height: 4,
    tiles: [
      [20, 21, 21, 21, 22],
      [23, 0, 0, 0, 23],
      [23, 0, 0, 0, 23],
      [24, 35, 24, 24, 24],
    ],
    npcSpot: { x: 2, y: 2 },
    entrance: { x: 1, y: 3 },
  },
  tavern: {
    width: 6,
    height: 5,
    tiles: [
      [20, 21, 21, 21, 21, 22],
      [23, 0, 0, 0, 0, 23],
      [23, 0, 44, 0, 0, 23],
      [23, 0, 0, 0, 0, 23],
      [24, 24, 35, 24, 24, 24],
    ],
    npcSpot: { x: 3, y: 2 },
    entrance: { x: 2, y: 4 },
  },
  healer: {
    width: 4,
    height: 4,
    tiles: [
      [20, 21, 21, 22],
      [23, 0, 0, 23],
      [23, 0, 0, 23],
      [24, 35, 24, 24],
    ],
    npcSpot: { x: 1, y: 2 },
    entrance: { x: 1, y: 3 },
  },
  shrine: {
    width: 3,
    height: 3,
    tiles: [
      [20, 43, 22],
      [23, 0, 23],
      [24, 24, 24],
    ],
    npcSpot: null,
    entrance: { x: 1, y: 2 },
  },
  tent: {
    width: 3,
    height: 3,
    tiles: [
      [45, 46, 47],
      [0, 0, 0],
      [5, 5, 5],
    ],
    npcSpot: { x: 1, y: 1 },
    entrance: { x: 1, y: 2 },
  },
  well: {
    width: 2,
    height: 2,
    tiles: [
      [41, 41],
      [12, 12],
    ],
    npcSpot: null,
    entrance: null,
  },
  dungeon_entrance: {
    width: 3,
    height: 3,
    tiles: [
      [70, 40, 70],
      [70, 40, 70],
      [5, 5, 5],
    ],
    npcSpot: null,
    entrance: { x: 1, y: 0 },
  },
};

// Ground types
const GROUND_TYPES = {
  grass: [1, 2, 3, 4],
  dirt: [5, 6, 7],
  cobblestone: [8, 9, 10, 11],
  water: [12, 13],
};

// Monster spawn density configurations
const DENSITY_CONFIG = {
  sparse: { minSpacing: 8, maxPerArea: 0.02 },
  light: { minSpacing: 6, maxPerArea: 0.05 },
  medium: { minSpacing: 4, maxPerArea: 0.1 },
  heavy: { minSpacing: 3, maxPerArea: 0.15 },
  dense: { minSpacing: 2, maxPerArea: 0.25 },
};

/**
 * LevelDesigner class
 */
export class LevelDesigner {
  constructor(options = {}) {
    this.width = options.width || 40;
    this.height = options.height || 40;
    this.seed = options.seed || Date.now();
    this.random = this.createSeededRandom(this.seed);

    // Initialize empty grid
    this.grid = this.createEmptyGrid();

    // Track placed entities
    this.monsters = [];
    this.objects = [];
    this.npcs = [];
    this.buildings = [];
  }

  createSeededRandom(seed) {
    return () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
  }

  createEmptyGrid() {
    const grid = [];
    for (let y = 0; y < this.height; y++) {
      grid[y] = new Array(this.width).fill(1); // Default to grass
    }
    return grid;
  }

  // ==========================================================================
  // HIGH-LEVEL DRAWING METHODS
  // ==========================================================================

  /**
   * Draw a road/path between two points
   * @param {object} options - Road options
   * @param {object} options.from - Start position {x, y}
   * @param {object} options.to - End position {x, y}
   * @param {number} options.width - Road width (1-3)
   * @param {string} options.type - 'dirt' or 'cobblestone'
   */
  drawRoad({ from, to, width = 2, type = 'dirt' }) {
    const tiles = GROUND_TYPES[type] || GROUND_TYPES.dirt;
    const halfWidth = Math.floor(width / 2);

    // Bresenham's line algorithm
    const dx = Math.abs(to.x - from.x);
    const dy = Math.abs(to.y - from.y);
    const sx = from.x < to.x ? 1 : -1;
    const sy = from.y < to.y ? 1 : -1;
    let err = dx - dy;

    let x = from.x;
    let y = from.y;

    while (true) {
      // Place road tiles with width
      for (let wx = -halfWidth; wx <= halfWidth; wx++) {
        for (let wy = -halfWidth; wy <= halfWidth; wy++) {
          const px = x + wx;
          const py = y + wy;
          if (this.isInBounds(px, py)) {
            this.grid[py][px] = this.randomFrom(tiles);
          }
        }
      }

      if (x === to.x && y === to.y) break;

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

    return this;
  }

  /**
   * Fill a rectangular area with ground type
   * @param {object} options - Area options
   * @param {object} options.region - {x, y, width, height}
   * @param {string} options.type - Ground type
   */
  fillArea({ region, type = 'grass' }) {
    const tiles = GROUND_TYPES[type] || GROUND_TYPES.grass;

    for (let y = region.y; y < region.y + region.height; y++) {
      for (let x = region.x; x < region.x + region.width; x++) {
        if (this.isInBounds(x, y)) {
          this.grid[y][x] = this.randomFrom(tiles);
        }
      }
    }

    return this;
  }

  /**
   * Place a pre-defined building
   * @param {object} options - Building options
   * @param {string} options.type - Building type name
   * @param {object} options.position - {x, y} top-left corner
   * @param {object} options.npc - Optional NPC to place inside
   */
  placeBuilding({ type, position, npc = null }) {
    const template = BUILDING_TEMPLATES[type];
    if (!template) {
      console.warn(`Unknown building type: ${type}`);
      return this;
    }

    // Place building tiles
    for (let y = 0; y < template.height; y++) {
      for (let x = 0; x < template.width; x++) {
        const px = position.x + x;
        const py = position.y + y;
        if (this.isInBounds(px, py) && template.tiles[y][x] !== 0) {
          this.grid[py][px] = template.tiles[y][x];
        }
      }
    }

    // Track building
    const building = {
      type,
      position,
      width: template.width,
      height: template.height,
      entrance: template.entrance
        ? { x: position.x + template.entrance.x, y: position.y + template.entrance.y }
        : null,
    };
    this.buildings.push(building);

    // Place NPC if specified
    if (npc && template.npcSpot) {
      this.npcs.push({
        ...npc,
        x: position.x + template.npcSpot.x,
        y: position.y + template.npcSpot.y,
        building: type,
      });
    }

    return this;
  }

  /**
   * Place decorative elements in an area
   * @param {object} options - Decoration options
   * @param {object} options.region - {x, y, width, height}
   * @param {string} options.type - 'trees', 'bushes', 'rubble', 'mixed'
   * @param {string} options.density - 'sparse', 'light', 'medium', 'heavy'
   */
  addDecorations({ region, type = 'trees', density = 'light' }) {
    const densityConfig = DENSITY_CONFIG[density] || DENSITY_CONFIG.light;
    const tiles = this.getDecorationTiles(type);

    const count = Math.floor(
      region.width * region.height * densityConfig.maxPerArea
    );

    for (let i = 0; i < count; i++) {
      const x = region.x + Math.floor(this.random() * region.width);
      const y = region.y + Math.floor(this.random() * region.height);

      if (this.isInBounds(x, y) && this.isWalkable(x, y)) {
        this.objects.push({
          x,
          y,
          typeId: this.randomFrom(tiles),
          decorative: true,
        });
      }
    }

    return this;
  }

  getDecorationTiles(type) {
    switch (type) {
      case 'trees':
        return [60, 61, 62, 63];
      case 'bushes':
        return [64, 65];
      case 'rubble':
        return [70, 71, 72];
      case 'bones':
        return [73, 74];
      case 'mixed':
        return [60, 61, 64, 65, 70];
      default:
        return [60, 61, 62];
    }
  }

  // ==========================================================================
  // MONSTER/NPC POPULATION
  // ==========================================================================

  /**
   * Populate an area with monsters
   * @param {object} options - Population options
   * @param {object} options.region - {x, y, width, height}
   * @param {string} options.density - 'sparse', 'light', 'medium', 'heavy', 'dense'
   * @param {Array} options.types - Array of monster type IDs or names
   * @param {object} options.boss - Optional boss {type, position}
   */
  populateArea({ region, density = 'medium', types = [1], boss = null }) {
    const config = DENSITY_CONFIG[density] || DENSITY_CONFIG.medium;
    const count = Math.floor(
      region.width * region.height * config.maxPerArea
    );

    // Place regular monsters
    const placed = [];
    let attempts = 0;
    const maxAttempts = count * 10;

    while (placed.length < count && attempts < maxAttempts) {
      const x = region.x + Math.floor(this.random() * region.width);
      const y = region.y + Math.floor(this.random() * region.height);

      // Check spacing from other monsters
      const tooClose = placed.some(
        (m) => Math.abs(m.x - x) < config.minSpacing && Math.abs(m.y - y) < config.minSpacing
      );

      if (!tooClose && this.isInBounds(x, y) && this.isWalkable(x, y)) {
        const typeId = this.randomFrom(types);
        this.monsters.push({
          x,
          y,
          typeId,
          hp: -1, // Use default HP
          isBoss: false,
        });
        placed.push({ x, y });
      }

      attempts++;
    }

    // Place boss if specified
    if (boss) {
      const bossPos = boss.position || {
        x: region.x + Math.floor(region.width / 2),
        y: region.y + Math.floor(region.height / 2),
      };
      this.monsters.push({
        x: bossPos.x,
        y: bossPos.y,
        typeId: boss.type,
        hp: boss.hp || -1,
        isBoss: true,
      });
    }

    return this;
  }

  /**
   * Add a single point of interest (shrine, chest, etc.)
   * @param {object} options - POI options
   * @param {string} options.type - 'shrine', 'chest', 'barrel', 'bookstand'
   * @param {object} options.position - {x, y}
   */
  addPointOfInterest({ type, position }) {
    const objectTypes = {
      shrine: 1,
      chest: 2,
      barrel: 49,
      bookstand: 3,
      lever: 4,
      sarcophagus: 5,
    };

    this.objects.push({
      x: position.x,
      y: position.y,
      typeId: objectTypes[type] || 1,
      decorative: false,
    });

    return this;
  }

  // ==========================================================================
  // TOWN LAYOUT HELPERS
  // ==========================================================================

  /**
   * Create a standard town layout with buildings and roads
   * @param {object} options - Town options
   * @param {Array} options.buildings - Array of {type, position}
   * @param {object} options.center - Town center position
   * @param {object} options.dungeonEntrance - Dungeon entrance position
   */
  createTownLayout({ buildings = [], center, dungeonEntrance }) {
    // Fill with grass
    this.fillArea({
      region: { x: 0, y: 0, width: this.width, height: this.height },
      type: 'grass',
    });

    // Create central plaza
    if (center) {
      this.fillArea({
        region: {
          x: center.x - 3,
          y: center.y - 3,
          width: 7,
          height: 7,
        },
        type: 'cobblestone',
      });

      // Add well/fountain in center
      this.placeBuilding({
        type: 'well',
        position: { x: center.x - 1, y: center.y - 1 },
      });
    }

    // Place buildings
    for (const building of buildings) {
      this.placeBuilding(building);

      // Draw road from building to center
      if (center && building.position) {
        const template = BUILDING_TEMPLATES[building.type];
        const entrance = template?.entrance || { x: 1, y: template?.height - 1 || 0 };
        this.drawRoad({
          from: {
            x: building.position.x + entrance.x,
            y: building.position.y + entrance.y,
          },
          to: center,
          width: 2,
          type: 'dirt',
        });
      }
    }

    // Place dungeon entrance
    if (dungeonEntrance) {
      this.placeBuilding({
        type: 'dungeon_entrance',
        position: dungeonEntrance,
      });

      // Road to dungeon
      if (center) {
        this.drawRoad({
          from: { x: dungeonEntrance.x + 1, y: dungeonEntrance.y + 2 },
          to: center,
          width: 2,
          type: 'cobblestone',
        });
      }
    }

    return this;
  }

  // ==========================================================================
  // DUNGEON LAYOUT HELPERS
  // ==========================================================================

  /**
   * Create a dungeon layout with rooms and corridors
   * @param {object} options - Dungeon options
   * @param {number} options.roomCount - Number of rooms
   * @param {object} options.entrance - Entrance position
   * @param {object} options.exit - Exit position
   * @param {string} options.bossRoom - Boss room position
   */
  createDungeonLayout({ roomCount = 5, entrance, exit, bossRoom = null }) {
    // Fill with walls
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.grid[y][x] = 20; // Stone wall
      }
    }

    const rooms = [];

    // Generate rooms
    for (let i = 0; i < roomCount; i++) {
      const roomWidth = 5 + Math.floor(this.random() * 5);
      const roomHeight = 5 + Math.floor(this.random() * 5);
      const roomX = 2 + Math.floor(this.random() * (this.width - roomWidth - 4));
      const roomY = 2 + Math.floor(this.random() * (this.height - roomHeight - 4));

      // Carve room
      for (let y = roomY; y < roomY + roomHeight; y++) {
        for (let x = roomX; x < roomX + roomWidth; x++) {
          this.grid[y][x] = 0; // Floor
        }
      }

      rooms.push({
        x: roomX,
        y: roomY,
        width: roomWidth,
        height: roomHeight,
        centerX: roomX + Math.floor(roomWidth / 2),
        centerY: roomY + Math.floor(roomHeight / 2),
      });
    }

    // Connect rooms with corridors
    for (let i = 1; i < rooms.length; i++) {
      const from = rooms[i - 1];
      const to = rooms[i];
      this.carveCorridorL(from.centerX, from.centerY, to.centerX, to.centerY);
    }

    // Place entrance and exit
    if (entrance && rooms.length > 0) {
      const startRoom = rooms[0];
      this.grid[entrance.y][entrance.x] = 40; // Stairs up
    }

    if (exit && rooms.length > 0) {
      const endRoom = rooms[rooms.length - 1];
      this.grid[exit.y][exit.x] = 40; // Stairs down
    }

    // Mark boss room
    if (bossRoom && rooms.length > 0) {
      const bRoom = rooms[rooms.length - 1];
      this.populateArea({
        region: { x: bRoom.x, y: bRoom.y, width: bRoom.width, height: bRoom.height },
        density: 'sparse',
        types: [1],
        boss: { type: bossRoom.bossType, position: { x: bRoom.centerX, y: bRoom.centerY } },
      });
    }

    return this;
  }

  carveCorridorL(x1, y1, x2, y2) {
    // Horizontal then vertical
    let x = x1;
    while (x !== x2) {
      if (this.isInBounds(x, y1)) {
        this.grid[y1][x] = 0;
      }
      x += x < x2 ? 1 : -1;
    }

    let y = y1;
    while (y !== y2) {
      if (this.isInBounds(x2, y)) {
        this.grid[y][x2] = 0;
      }
      y += y < y2 ? 1 : -1;
    }
  }

  // ==========================================================================
  // UTILITY METHODS
  // ==========================================================================

  isInBounds(x, y) {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  isWalkable(x, y) {
    if (!this.isInBounds(x, y)) return false;
    const tile = this.grid[y][x];
    // Walls, water, etc. are not walkable
    return tile < 20 || tile === 0;
  }

  randomFrom(arr) {
    return arr[Math.floor(this.random() * arr.length)];
  }

  /**
   * Export the designed level for injection
   * @returns {object} Level data ready for LevelInjector
   */
  export() {
    // Flatten grid to 1D array
    const flatGrid = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        flatGrid.push(this.grid[y][x]);
      }
    }

    return {
      width: this.width,
      height: this.height,
      grid: new Uint8Array(flatGrid),
      monsters: this.monsters,
      objects: this.objects.filter((o) => !o.decorative),
      npcs: this.npcs,
      buildings: this.buildings,
    };
  }

  /**
   * Get summary for AI debugging
   */
  getSummary() {
    return {
      dimensions: `${this.width}x${this.height}`,
      buildings: this.buildings.length,
      monsters: this.monsters.length,
      bosses: this.monsters.filter((m) => m.isBoss).length,
      objects: this.objects.length,
      npcs: this.npcs.length,
    };
  }
}

export default LevelDesigner;
