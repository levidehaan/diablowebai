/**
 * Visual Grid System for AI
 *
 * Provides a visual representation of the game world that AI can understand
 * and interact with. Renders grids as images with coordinates for AI vision.
 *
 * Features:
 * - Canvas-based grid rendering
 * - Alphanumeric coordinate system
 * - Color-coded tile types with legend
 * - Multiple zoom levels
 * - AI command protocol (ZOOM, PLACE, ROAD, etc.)
 * - Collision detection
 * - State management with undo/redo
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Tile type definitions with visual properties
 */
export const TileType = {
  EMPTY: { id: 0, color: '#1a1a1a', name: 'Empty', walkable: false },
  FLOOR: { id: 1, color: '#4a3728', name: 'Floor', walkable: true },
  WALL: { id: 2, color: '#2d2d2d', name: 'Wall', walkable: false },
  DOOR: { id: 3, color: '#8b4513', name: 'Door', walkable: true },
  STAIRS_UP: { id: 4, color: '#00ff00', name: 'Stairs Up', walkable: true },
  STAIRS_DOWN: { id: 5, color: '#ff4444', name: 'Stairs Down', walkable: true },
  WATER: { id: 6, color: '#1e90ff', name: 'Water', walkable: false },
  LAVA: { id: 7, color: '#ff4500', name: 'Lava', walkable: false },
  BRIDGE: { id: 8, color: '#8b7355', name: 'Bridge', walkable: true },
  ROAD: { id: 9, color: '#b8860b', name: 'Road', walkable: true },
  GRASS: { id: 10, color: '#228b22', name: 'Grass', walkable: true },
  TREE: { id: 11, color: '#006400', name: 'Tree', walkable: false },
  BUILDING: { id: 12, color: '#696969', name: 'Building', walkable: false },
  SHRINE: { id: 13, color: '#9932cc', name: 'Shrine', walkable: true },
  CHEST: { id: 14, color: '#ffd700', name: 'Chest', walkable: true },
  BARREL: { id: 15, color: '#8b4513', name: 'Barrel', walkable: true },
  SPAWN_POINT: { id: 16, color: '#ff1493', name: 'Spawn Point', walkable: true },
  BOSS_SPAWN: { id: 17, color: '#dc143c', name: 'Boss Spawn', walkable: true },
  NPC: { id: 18, color: '#00ffff', name: 'NPC', walkable: false },
  DUNGEON_ENTRANCE: { id: 19, color: '#8b0000', name: 'Dungeon Entrance', walkable: true },
};

/**
 * Object layer types (placed on top of tiles)
 */
export const ObjectType = {
  MONSTER: { id: 100, color: '#ff0000', symbol: 'M', name: 'Monster' },
  NPC: { id: 101, color: '#00ffff', symbol: 'N', name: 'NPC' },
  CHEST: { id: 102, color: '#ffd700', symbol: 'C', name: 'Chest' },
  SHRINE: { id: 103, color: '#9932cc', symbol: 'S', name: 'Shrine' },
  BARREL: { id: 104, color: '#8b4513', symbol: 'B', name: 'Barrel' },
  ITEM: { id: 105, color: '#00ff00', symbol: 'I', name: 'Item' },
  WAYPOINT: { id: 106, color: '#4169e1', symbol: 'W', name: 'Waypoint' },
  PORTAL: { id: 107, color: '#9400d3', symbol: 'P', name: 'Portal' },
};

/**
 * Zoom levels
 */
export const ZoomLevel = {
  OVERVIEW: { scale: 0.25, cellSize: 4, showLabels: false, showCoords: false },
  REGION: { scale: 0.5, cellSize: 8, showLabels: false, showCoords: true },
  STANDARD: { scale: 1, cellSize: 16, showLabels: true, showCoords: true },
  DETAILED: { scale: 2, cellSize: 32, showLabels: true, showCoords: true },
  CLOSE: { scale: 4, cellSize: 64, showLabels: true, showCoords: true },
};

// ============================================================================
// COORDINATE SYSTEM
// ============================================================================

/**
 * Alphanumeric coordinate encoder/decoder
 * Converts grid positions to human-readable coordinates like "A1", "Z26", "AA27"
 */
class CoordinateSystem {
  /**
   * Convert column index to letter(s) (0 = A, 25 = Z, 26 = AA, etc.)
   */
  static columnToLetters(col) {
    let result = '';
    col++;
    while (col > 0) {
      col--;
      result = String.fromCharCode(65 + (col % 26)) + result;
      col = Math.floor(col / 26);
    }
    return result;
  }

  /**
   * Convert letter(s) to column index
   */
  static lettersToColumn(letters) {
    let col = 0;
    for (let i = 0; i < letters.length; i++) {
      col = col * 26 + (letters.charCodeAt(i) - 64);
    }
    return col - 1;
  }

  /**
   * Convert grid position to coordinate string
   */
  static encode(x, y) {
    return `${this.columnToLetters(x)}${y + 1}`;
  }

  /**
   * Parse coordinate string to grid position
   */
  static decode(coord) {
    const match = coord.match(/^([A-Z]+)(\d+)$/i);
    if (!match) {
      throw new Error(`Invalid coordinate: ${coord}`);
    }
    return {
      x: this.lettersToColumn(match[1].toUpperCase()),
      y: parseInt(match[2]) - 1,
    };
  }

  /**
   * Get coordinate range string
   */
  static encodeRange(x1, y1, x2, y2) {
    return `${this.encode(x1, y1)}:${this.encode(x2, y2)}`;
  }

  /**
   * Parse range string to positions
   */
  static decodeRange(range) {
    const [start, end] = range.split(':');
    return {
      start: this.decode(start),
      end: this.decode(end),
    };
  }
}

// ============================================================================
// GRID STATE
// ============================================================================

/**
 * Represents the state of the grid at a point in time
 */
class GridState {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.tiles = new Uint8Array(width * height);
    this.objects = new Map(); // coord string -> object data
    this.labels = new Map(); // coord string -> label
    this.metadata = {
      name: '',
      theme: 'dungeon',
      created: Date.now(),
      modified: Date.now(),
    };
  }

  /**
   * Get tile at position
   */
  getTile(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return TileType.EMPTY.id;
    }
    return this.tiles[y * this.width + x];
  }

  /**
   * Set tile at position
   */
  setTile(x, y, tileId) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return false;
    }
    this.tiles[y * this.width + x] = tileId;
    this.metadata.modified = Date.now();
    return true;
  }

  /**
   * Get object at position
   */
  getObject(x, y) {
    const key = CoordinateSystem.encode(x, y);
    return this.objects.get(key) || null;
  }

  /**
   * Set object at position
   */
  setObject(x, y, object) {
    const key = CoordinateSystem.encode(x, y);
    if (object) {
      this.objects.set(key, { ...object, x, y });
    } else {
      this.objects.delete(key);
    }
    this.metadata.modified = Date.now();
  }

  /**
   * Get label at position
   */
  getLabel(x, y) {
    const key = CoordinateSystem.encode(x, y);
    return this.labels.get(key) || null;
  }

  /**
   * Set label at position
   */
  setLabel(x, y, label) {
    const key = CoordinateSystem.encode(x, y);
    if (label) {
      this.labels.set(key, label);
    } else {
      this.labels.delete(key);
    }
  }

  /**
   * Fill a rectangular region
   */
  fillRect(x1, y1, x2, y2, tileId) {
    const minX = Math.max(0, Math.min(x1, x2));
    const maxX = Math.min(this.width - 1, Math.max(x1, x2));
    const minY = Math.max(0, Math.min(y1, y2));
    const maxY = Math.min(this.height - 1, Math.max(y1, y2));

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        this.tiles[y * this.width + x] = tileId;
      }
    }
    this.metadata.modified = Date.now();
  }

  /**
   * Clone the state
   */
  clone() {
    const clone = new GridState(this.width, this.height);
    clone.tiles = new Uint8Array(this.tiles);
    clone.objects = new Map(this.objects);
    clone.labels = new Map(this.labels);
    clone.metadata = { ...this.metadata };
    return clone;
  }

  /**
   * Export to JSON
   */
  export() {
    return {
      width: this.width,
      height: this.height,
      tiles: Array.from(this.tiles),
      objects: Object.fromEntries(this.objects),
      labels: Object.fromEntries(this.labels),
      metadata: { ...this.metadata },
    };
  }

  /**
   * Import from JSON
   */
  static import(data) {
    const state = new GridState(data.width, data.height);
    state.tiles = new Uint8Array(data.tiles);
    state.objects = new Map(Object.entries(data.objects || {}));
    state.labels = new Map(Object.entries(data.labels || {}));
    state.metadata = { ...data.metadata };
    return state;
  }
}

// ============================================================================
// GRID IMAGE GENERATOR
// ============================================================================

/**
 * Generates visual representations of the grid for AI consumption
 */
class GridImageGenerator {
  constructor(options = {}) {
    this.defaultCellSize = options.cellSize || 16;
    this.showGrid = options.showGrid !== false;
    this.showCoordinates = options.showCoordinates !== false;
    this.backgroundColor = options.backgroundColor || '#000000';
  }

  /**
   * Render grid state to canvas
   */
  render(state, options = {}) {
    const zoom = options.zoom || ZoomLevel.STANDARD;
    const viewX = options.viewX || 0;
    const viewY = options.viewY || 0;
    const viewWidth = options.viewWidth || state.width;
    const viewHeight = options.viewHeight || state.height;

    const cellSize = zoom.cellSize;
    const marginLeft = zoom.showCoords ? 40 : 0;
    const marginTop = zoom.showCoords ? 20 : 0;

    const canvasWidth = viewWidth * cellSize + marginLeft;
    const canvasHeight = viewHeight * cellSize + marginTop;

    // Create canvas (works in browser or Node with canvas package)
    let canvas, ctx;
    if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
      ctx = canvas.getContext('2d');
    } else if (typeof document !== 'undefined') {
      canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      ctx = canvas.getContext('2d');
    } else {
      throw new Error('Canvas not available');
    }

    // Fill background
    ctx.fillStyle = this.backgroundColor;
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // Draw coordinate labels
    if (zoom.showCoords) {
      ctx.fillStyle = '#888888';
      ctx.font = `${Math.min(12, cellSize * 0.8)}px monospace`;
      ctx.textAlign = 'center';

      // Column headers
      for (let x = 0; x < viewWidth; x++) {
        const label = CoordinateSystem.columnToLetters(viewX + x);
        ctx.fillText(label, marginLeft + x * cellSize + cellSize / 2, 14);
      }

      // Row labels
      ctx.textAlign = 'right';
      for (let y = 0; y < viewHeight; y++) {
        ctx.fillText(String(viewY + y + 1), marginLeft - 4, marginTop + y * cellSize + cellSize / 2 + 4);
      }
    }

    // Draw tiles
    for (let y = 0; y < viewHeight; y++) {
      for (let x = 0; x < viewWidth; x++) {
        const tileId = state.getTile(viewX + x, viewY + y);
        const tileType = this.getTileTypeById(tileId);

        const px = marginLeft + x * cellSize;
        const py = marginTop + y * cellSize;

        // Draw tile
        ctx.fillStyle = tileType.color;
        ctx.fillRect(px, py, cellSize, cellSize);

        // Draw grid lines
        if (this.showGrid && cellSize >= 8) {
          ctx.strokeStyle = 'rgba(255,255,255,0.1)';
          ctx.strokeRect(px, py, cellSize, cellSize);
        }
      }
    }

    // Draw objects
    for (const [coord, obj] of state.objects) {
      try {
        const { x, y } = CoordinateSystem.decode(coord);
        if (x >= viewX && x < viewX + viewWidth && y >= viewY && y < viewY + viewHeight) {
          const objType = this.getObjectTypeById(obj.type);
          const px = marginLeft + (x - viewX) * cellSize + cellSize / 2;
          const py = marginTop + (y - viewY) * cellSize + cellSize / 2;

          // Draw object marker
          ctx.fillStyle = objType.color;
          ctx.beginPath();
          ctx.arc(px, py, cellSize / 3, 0, Math.PI * 2);
          ctx.fill();

          // Draw symbol if zoomed in enough
          if (cellSize >= 16) {
            ctx.fillStyle = '#000000';
            ctx.font = `bold ${cellSize / 2}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(objType.symbol, px, py);
          }
        }
      } catch (e) {
        // Skip invalid coordinates
      }
    }

    // Draw labels
    if (zoom.showLabels) {
      ctx.fillStyle = '#ffffff';
      ctx.font = `${Math.min(10, cellSize / 2)}px sans-serif`;
      ctx.textAlign = 'center';

      for (const [coord, label] of state.labels) {
        try {
          const { x, y } = CoordinateSystem.decode(coord);
          if (x >= viewX && x < viewX + viewWidth && y >= viewY && y < viewY + viewHeight) {
            const px = marginLeft + (x - viewX) * cellSize + cellSize / 2;
            const py = marginTop + (y - viewY) * cellSize + cellSize - 2;
            ctx.fillText(label, px, py);
          }
        } catch (e) {
          // Skip invalid coordinates
        }
      }
    }

    return canvas;
  }

  /**
   * Render with legend
   */
  renderWithLegend(state, options = {}) {
    const gridCanvas = this.render(state, options);
    const legendHeight = 100;

    // Create combined canvas
    let canvas, ctx;
    if (typeof OffscreenCanvas !== 'undefined') {
      canvas = new OffscreenCanvas(gridCanvas.width, gridCanvas.height + legendHeight);
      ctx = canvas.getContext('2d');
    } else {
      canvas = document.createElement('canvas');
      canvas.width = gridCanvas.width;
      canvas.height = gridCanvas.height + legendHeight;
      ctx = canvas.getContext('2d');
    }

    // Draw grid
    ctx.drawImage(gridCanvas, 0, 0);

    // Draw legend background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, gridCanvas.height, canvas.width, legendHeight);

    // Draw legend items
    const tileTypes = Object.values(TileType).slice(0, 10); // First 10 types
    const objectTypes = Object.values(ObjectType).slice(0, 5); // First 5 object types

    ctx.font = '10px sans-serif';
    let x = 10;
    let y = gridCanvas.height + 20;

    // Tile legend
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Tiles:', x, y);
    x += 40;

    for (const type of tileTypes) {
      ctx.fillStyle = type.color;
      ctx.fillRect(x, y - 10, 12, 12);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(type.name, x + 16, y);
      x += 70;
      if (x > canvas.width - 80) {
        x = 10;
        y += 20;
      }
    }

    // Object legend
    x = 10;
    y += 30;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('Objects:', x, y);
    x += 50;

    for (const type of objectTypes) {
      ctx.fillStyle = type.color;
      ctx.beginPath();
      ctx.arc(x + 6, y - 4, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillText(type.name, x + 16, y);
      x += 70;
    }

    return canvas;
  }

  /**
   * Get tile type by ID
   */
  getTileTypeById(id) {
    for (const type of Object.values(TileType)) {
      if (type.id === id) return type;
    }
    return TileType.EMPTY;
  }

  /**
   * Get object type by ID
   */
  getObjectTypeById(id) {
    for (const type of Object.values(ObjectType)) {
      if (type.id === id) return type;
    }
    return ObjectType.MONSTER;
  }

  /**
   * Convert canvas to data URL
   */
  async toDataURL(canvas) {
    if (canvas.toDataURL) {
      return canvas.toDataURL('image/png');
    } else if (canvas.convertToBlob) {
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
    }
    throw new Error('Cannot convert canvas to data URL');
  }

  /**
   * Convert canvas to Blob
   */
  async toBlob(canvas) {
    if (canvas.toBlob) {
      return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    } else if (canvas.convertToBlob) {
      return canvas.convertToBlob({ type: 'image/png' });
    }
    throw new Error('Cannot convert canvas to blob');
  }
}

// ============================================================================
// AI COMMAND PROTOCOL
// ============================================================================

/**
 * Command types for AI interaction
 */
export const CommandType = {
  ZOOM: 'zoom',
  PLACE: 'place',
  FILL: 'fill',
  ROAD: 'road',
  REGION: 'region',
  BUILDING: 'building',
  SPAWN_ZONE: 'spawn_zone',
  DUNGEON_ENTRANCE: 'dungeon_entrance',
  NPC: 'npc',
  LABEL: 'label',
  CLEAR: 'clear',
  UNDO: 'undo',
  REDO: 'redo',
};

/**
 * AI Command Parser and Executor
 */
class AICommandProcessor {
  constructor(gridSystem) {
    this.gridSystem = gridSystem;
  }

  /**
   * Parse and execute a command string
   */
  execute(commandString) {
    const parts = commandString.trim().split(/\s+/);
    const command = parts[0].toUpperCase();
    const args = parts.slice(1);

    switch (command) {
      case 'ZOOM':
        return this.cmdZoom(args);
      case 'PLACE':
        return this.cmdPlace(args);
      case 'FILL':
        return this.cmdFill(args);
      case 'ROAD':
        return this.cmdRoad(args);
      case 'REGION':
        return this.cmdRegion(args);
      case 'BUILDING':
        return this.cmdBuilding(args);
      case 'SPAWN_ZONE':
        return this.cmdSpawnZone(args);
      case 'DUNGEON_ENTRANCE':
        return this.cmdDungeonEntrance(args);
      case 'NPC':
        return this.cmdNpc(args);
      case 'LABEL':
        return this.cmdLabel(args);
      case 'CLEAR':
        return this.cmdClear(args);
      case 'UNDO':
        return this.gridSystem.undo();
      case 'REDO':
        return this.gridSystem.redo();
      default:
        return { success: false, error: `Unknown command: ${command}` };
    }
  }

  /**
   * Execute batch of commands
   */
  executeBatch(commands) {
    const results = [];
    for (const cmd of commands) {
      results.push({
        command: cmd,
        result: this.execute(cmd),
      });
    }
    return results;
  }

  // Command implementations

  cmdZoom(args) {
    // ZOOM <start_coord> <end_coord>
    if (args.length < 2) {
      return { success: false, error: 'ZOOM requires start and end coordinates' };
    }

    try {
      const start = CoordinateSystem.decode(args[0]);
      const end = CoordinateSystem.decode(args[1]);
      return {
        success: true,
        view: { x: start.x, y: start.y, width: end.x - start.x + 1, height: end.y - start.y + 1 },
      };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  cmdPlace(args) {
    // PLACE <type> <coord>
    if (args.length < 2) {
      return { success: false, error: 'PLACE requires type and coordinate' };
    }

    try {
      const typeName = args[0].toUpperCase();
      const { x, y } = CoordinateSystem.decode(args[1]);

      const tileType = TileType[typeName];
      if (tileType) {
        this.gridSystem.saveState();
        this.gridSystem.state.setTile(x, y, tileType.id);
        return { success: true, placed: { type: typeName, x, y } };
      }

      const objType = ObjectType[typeName];
      if (objType) {
        this.gridSystem.saveState();
        this.gridSystem.state.setObject(x, y, { type: objType.id });
        return { success: true, placed: { type: typeName, x, y } };
      }

      return { success: false, error: `Unknown type: ${typeName}` };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  cmdFill(args) {
    // FILL <type> <start_coord> <end_coord>
    if (args.length < 3) {
      return { success: false, error: 'FILL requires type, start and end coordinates' };
    }

    try {
      const typeName = args[0].toUpperCase();
      const start = CoordinateSystem.decode(args[1]);
      const end = CoordinateSystem.decode(args[2]);

      const tileType = TileType[typeName];
      if (!tileType) {
        return { success: false, error: `Unknown tile type: ${typeName}` };
      }

      this.gridSystem.saveState();
      this.gridSystem.state.fillRect(start.x, start.y, end.x, end.y, tileType.id);
      return { success: true, filled: { type: typeName, from: args[1], to: args[2] } };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  cmdRoad(args) {
    // ROAD <start_coord> <end_coord>
    if (args.length < 2) {
      return { success: false, error: 'ROAD requires start and end coordinates' };
    }

    try {
      const start = CoordinateSystem.decode(args[0]);
      const end = CoordinateSystem.decode(args[1]);

      this.gridSystem.saveState();

      // Simple pathfinding - Manhattan path
      const path = [];
      let x = start.x,
        y = start.y;

      while (x !== end.x || y !== end.y) {
        this.gridSystem.state.setTile(x, y, TileType.ROAD.id);
        path.push({ x, y });

        if (x < end.x) x++;
        else if (x > end.x) x--;
        else if (y < end.y) y++;
        else if (y > end.y) y--;
      }
      this.gridSystem.state.setTile(end.x, end.y, TileType.ROAD.id);
      path.push({ x: end.x, y: end.y });

      return { success: true, path };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  cmdRegion(args) {
    // REGION <type> <coord1> <coord2> <coord3> <coord4>
    if (args.length < 5) {
      return { success: false, error: 'REGION requires type and 4 corner coordinates' };
    }

    try {
      const typeName = args[0].toUpperCase();
      const corners = args.slice(1, 5).map((c) => CoordinateSystem.decode(c));

      const minX = Math.min(...corners.map((c) => c.x));
      const maxX = Math.max(...corners.map((c) => c.x));
      const minY = Math.min(...corners.map((c) => c.y));
      const maxY = Math.max(...corners.map((c) => c.y));

      const tileType = TileType[typeName];
      if (!tileType) {
        return { success: false, error: `Unknown tile type: ${typeName}` };
      }

      this.gridSystem.saveState();
      this.gridSystem.state.fillRect(minX, minY, maxX, maxY, tileType.id);
      return { success: true, region: { type: typeName, minX, minY, maxX, maxY } };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  cmdBuilding(args) {
    // BUILDING <type> <coord> <width> <height>
    if (args.length < 4) {
      return { success: false, error: 'BUILDING requires type, coord, width and height' };
    }

    try {
      const typeName = args[0];
      const { x, y } = CoordinateSystem.decode(args[1]);
      const width = parseInt(args[2]);
      const height = parseInt(args[3]);

      this.gridSystem.saveState();

      // Draw walls around the perimeter
      for (let dx = 0; dx < width; dx++) {
        this.gridSystem.state.setTile(x + dx, y, TileType.WALL.id);
        this.gridSystem.state.setTile(x + dx, y + height - 1, TileType.WALL.id);
      }
      for (let dy = 0; dy < height; dy++) {
        this.gridSystem.state.setTile(x, y + dy, TileType.WALL.id);
        this.gridSystem.state.setTile(x + width - 1, y + dy, TileType.WALL.id);
      }

      // Fill interior with floor
      for (let dy = 1; dy < height - 1; dy++) {
        for (let dx = 1; dx < width - 1; dx++) {
          this.gridSystem.state.setTile(x + dx, y + dy, TileType.FLOOR.id);
        }
      }

      // Add door in front
      const doorX = x + Math.floor(width / 2);
      this.gridSystem.state.setTile(doorX, y + height - 1, TileType.DOOR.id);

      // Add label
      this.gridSystem.state.setLabel(x + Math.floor(width / 2), y + 1, typeName);

      return { success: true, building: { type: typeName, x, y, width, height } };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  cmdSpawnZone(args) {
    // SPAWN_ZONE <monster_type> <coord> <radius> [density]
    if (args.length < 3) {
      return { success: false, error: 'SPAWN_ZONE requires monster_type, coord and radius' };
    }

    try {
      const monsterType = args[0];
      const { x, y } = CoordinateSystem.decode(args[1]);
      const radius = parseInt(args[2]);
      const density = args[3] ? parseFloat(args[3]) : 0.3;

      this.gridSystem.saveState();

      // Mark spawn points in the zone
      const spawnPoints = [];
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (dx * dx + dy * dy <= radius * radius) {
            if (Math.random() < density) {
              const px = x + dx,
                py = y + dy;
              if (
                px >= 0 &&
                px < this.gridSystem.state.width &&
                py >= 0 &&
                py < this.gridSystem.state.height
              ) {
                this.gridSystem.state.setObject(px, py, {
                  type: ObjectType.MONSTER.id,
                  monsterType,
                });
                spawnPoints.push({ x: px, y: py });
              }
            }
          }
        }
      }

      return { success: true, spawnZone: { monsterType, x, y, radius, spawnPoints } };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  cmdDungeonEntrance(args) {
    // DUNGEON_ENTRANCE <dungeon_id> <coord>
    if (args.length < 2) {
      return { success: false, error: 'DUNGEON_ENTRANCE requires dungeon_id and coord' };
    }

    try {
      const dungeonId = args[0];
      const { x, y } = CoordinateSystem.decode(args[1]);

      this.gridSystem.saveState();
      this.gridSystem.state.setTile(x, y, TileType.DUNGEON_ENTRANCE.id);
      this.gridSystem.state.setLabel(x, y, dungeonId);

      return { success: true, entrance: { dungeonId, x, y } };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  cmdNpc(args) {
    // NPC <npc_type> <coord> <name> [dialogue_id]
    if (args.length < 3) {
      return { success: false, error: 'NPC requires npc_type, coord and name' };
    }

    try {
      const npcType = args[0];
      const { x, y } = CoordinateSystem.decode(args[1]);
      const name = args[2];
      const dialogueId = args[3] || null;

      this.gridSystem.saveState();
      this.gridSystem.state.setObject(x, y, {
        type: ObjectType.NPC.id,
        npcType,
        name,
        dialogueId,
      });
      this.gridSystem.state.setLabel(x, y, name);

      return { success: true, npc: { npcType, x, y, name, dialogueId } };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  cmdLabel(args) {
    // LABEL <coord> <text>
    if (args.length < 2) {
      return { success: false, error: 'LABEL requires coord and text' };
    }

    try {
      const { x, y } = CoordinateSystem.decode(args[0]);
      const text = args.slice(1).join(' ');

      this.gridSystem.state.setLabel(x, y, text);
      return { success: true, label: { x, y, text } };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  cmdClear(args) {
    // CLEAR [coord] or CLEAR <start> <end>
    try {
      this.gridSystem.saveState();

      if (args.length === 0) {
        // Clear all
        this.gridSystem.state.tiles.fill(TileType.EMPTY.id);
        this.gridSystem.state.objects.clear();
        this.gridSystem.state.labels.clear();
        return { success: true, cleared: 'all' };
      } else if (args.length === 1) {
        // Clear single cell
        const { x, y } = CoordinateSystem.decode(args[0]);
        this.gridSystem.state.setTile(x, y, TileType.EMPTY.id);
        this.gridSystem.state.setObject(x, y, null);
        this.gridSystem.state.setLabel(x, y, null);
        return { success: true, cleared: args[0] };
      } else {
        // Clear range
        const start = CoordinateSystem.decode(args[0]);
        const end = CoordinateSystem.decode(args[1]);
        this.gridSystem.state.fillRect(start.x, start.y, end.x, end.y, TileType.EMPTY.id);
        return { success: true, cleared: { from: args[0], to: args[1] } };
      }
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

// ============================================================================
// MAIN VISUAL GRID SYSTEM CLASS
// ============================================================================

/**
 * Main class that integrates all visual grid functionality
 */
export class VisualGridSystem {
  constructor(width = 100, height = 100) {
    this.state = new GridState(width, height);
    this.generator = new GridImageGenerator();
    this.commandProcessor = new AICommandProcessor(this);

    // Undo/redo history
    this.undoStack = [];
    this.redoStack = [];
    this.maxHistory = 50;

    // Event listeners
    this.listeners = new Map();
  }

  // ==========================================================================
  // STATE MANAGEMENT
  // ==========================================================================

  /**
   * Save current state for undo
   */
  saveState() {
    this.undoStack.push(this.state.clone());
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = []; // Clear redo on new action
  }

  /**
   * Undo last action
   */
  undo() {
    if (this.undoStack.length === 0) {
      return { success: false, error: 'Nothing to undo' };
    }

    this.redoStack.push(this.state.clone());
    this.state = this.undoStack.pop();
    this.emit('stateChanged', { action: 'undo' });
    return { success: true };
  }

  /**
   * Redo last undone action
   */
  redo() {
    if (this.redoStack.length === 0) {
      return { success: false, error: 'Nothing to redo' };
    }

    this.undoStack.push(this.state.clone());
    this.state = this.redoStack.pop();
    this.emit('stateChanged', { action: 'redo' });
    return { success: true };
  }

  /**
   * Reset to fresh state
   */
  reset(width = this.state.width, height = this.state.height) {
    this.saveState();
    this.state = new GridState(width, height);
    this.emit('stateChanged', { action: 'reset' });
  }

  // ==========================================================================
  // RENDERING
  // ==========================================================================

  /**
   * Render the grid as an image
   */
  render(options = {}) {
    return this.generator.render(this.state, options);
  }

  /**
   * Render with legend
   */
  renderWithLegend(options = {}) {
    return this.generator.renderWithLegend(this.state, options);
  }

  /**
   * Get data URL of rendered grid
   */
  async toDataURL(options = {}) {
    const canvas = this.render(options);
    return this.generator.toDataURL(canvas);
  }

  /**
   * Get blob of rendered grid
   */
  async toBlob(options = {}) {
    const canvas = this.render(options);
    return this.generator.toBlob(canvas);
  }

  // ==========================================================================
  // AI COMMAND INTERFACE
  // ==========================================================================

  /**
   * Execute a command string
   */
  executeCommand(command) {
    const result = this.commandProcessor.execute(command);
    if (result.success) {
      this.emit('commandExecuted', { command, result });
    }
    return result;
  }

  /**
   * Execute multiple commands
   */
  executeBatch(commands) {
    const results = this.commandProcessor.executeBatch(commands);
    this.emit('batchExecuted', { commands, results });
    return results;
  }

  /**
   * Get command help/documentation for AI
   */
  getCommandHelp() {
    return {
      ZOOM: 'ZOOM <start_coord> <end_coord> - Get detailed view of area',
      PLACE: 'PLACE <type> <coord> - Place tile or object',
      FILL: 'FILL <type> <start_coord> <end_coord> - Fill rectangle with tile type',
      ROAD: 'ROAD <start_coord> <end_coord> - Create road path between points',
      REGION: 'REGION <type> <c1> <c2> <c3> <c4> - Define area with 4 corners',
      BUILDING: 'BUILDING <name> <coord> <width> <height> - Place building structure',
      SPAWN_ZONE: 'SPAWN_ZONE <monster> <coord> <radius> [density] - Create monster spawn area',
      DUNGEON_ENTRANCE: 'DUNGEON_ENTRANCE <id> <coord> - Place dungeon entrance',
      NPC: 'NPC <type> <coord> <name> [dialogue] - Place NPC',
      LABEL: 'LABEL <coord> <text> - Add text label',
      CLEAR: 'CLEAR [coord] or CLEAR <start> <end> - Clear tiles',
      UNDO: 'UNDO - Undo last action',
      REDO: 'REDO - Redo last undone action',
      tileTypes: Object.keys(TileType),
      objectTypes: Object.keys(ObjectType),
      coordinateExample: 'Coordinates use format like A1, Z26, AA27, etc.',
    };
  }

  // ==========================================================================
  // IMPORT/EXPORT
  // ==========================================================================

  /**
   * Export state as JSON
   */
  exportState() {
    return this.state.export();
  }

  /**
   * Import state from JSON
   */
  importState(data) {
    this.saveState();
    this.state = GridState.import(data);
    this.emit('stateChanged', { action: 'import' });
  }

  // ==========================================================================
  // COLLISION DETECTION
  // ==========================================================================

  /**
   * Check if a path is walkable
   */
  isPathWalkable(path) {
    for (const point of path) {
      const tileId = this.state.getTile(point.x, point.y);
      const tileType = this.generator.getTileTypeById(tileId);
      if (!tileType.walkable) {
        return false;
      }
    }
    return true;
  }

  /**
   * Check if a position is walkable
   */
  isWalkable(x, y) {
    const tileId = this.state.getTile(x, y);
    const tileType = this.generator.getTileTypeById(tileId);
    return tileType.walkable;
  }

  /**
   * Check if placing at position would cause collision
   */
  wouldCollide(x, y) {
    // Check existing object
    if (this.state.getObject(x, y)) {
      return true;
    }

    // Check tile walkability
    return !this.isWalkable(x, y);
  }

  // ==========================================================================
  // EVENT SYSTEM
  // ==========================================================================

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const list = this.listeners.get(event);
    if (list) {
      const idx = list.indexOf(callback);
      if (idx !== -1) list.splice(idx, 1);
    }
  }

  emit(event, data) {
    const list = this.listeners.get(event);
    if (list) {
      for (const cb of list) {
        try {
          cb(data);
        } catch (err) {
          console.error(`[VisualGridSystem] Event error (${event}):`, err);
        }
      }
    }
  }

  // ==========================================================================
  // STATUS
  // ==========================================================================

  /**
   * Get system status
   */
  getStatus() {
    return {
      width: this.state.width,
      height: this.state.height,
      objectCount: this.state.objects.size,
      labelCount: this.state.labels.size,
      undoStackSize: this.undoStack.length,
      redoStackSize: this.redoStack.length,
      metadata: this.state.metadata,
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { CoordinateSystem, GridState, GridImageGenerator, AICommandProcessor };

// Create default instance
export const visualGridSystem = new VisualGridSystem();

export default visualGridSystem;
