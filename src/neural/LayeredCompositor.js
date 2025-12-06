/**
 * Layered Composition Abstractions
 *
 * Breaks level generation into stackable layers:
 * - Base terrain (ground tiles, walls)
 * - Structures (buildings, rooms)
 * - Foliage (trees, bushes, decorations)
 * - Entities (monsters, NPCs)
 * - Objects (chests, barrels, shrines)
 *
 * AI outputs concise JSON blueprints, compositor merges layers procedurally.
 * Handles automatic conflict resolution (e.g., foliage avoids structures).
 */

import DUNParser from './DUNParser';
import { BINARY_MARKERS } from './TileMapper';
import { TOWN_TILES } from './TownGenerator';
import { presetEngine, SeededRandom, PerlinNoise, poissonDiskSampling } from './PresetLibrary';

// ============================================================================
// LAYER TYPES
// ============================================================================

export const LAYER_TYPES = {
  TERRAIN: 'terrain',
  STRUCTURES: 'structures',
  FOLIAGE: 'foliage',
  PATHS: 'paths',
  ENTITIES: 'entities',
  OBJECTS: 'objects',
  LIGHTING: 'lighting',
  SPECIAL: 'special',
};

export const LAYER_ORDER = [
  LAYER_TYPES.TERRAIN,
  LAYER_TYPES.STRUCTURES,
  LAYER_TYPES.PATHS,
  LAYER_TYPES.FOLIAGE,
  LAYER_TYPES.OBJECTS,
  LAYER_TYPES.ENTITIES,
  LAYER_TYPES.LIGHTING,
  LAYER_TYPES.SPECIAL,
];

export const BIOMES = {
  PLAINS: 'plains',
  FOREST: 'forest',
  SWAMP: 'swamp',
  DESERT: 'desert',
  SNOW: 'snow',
  VOLCANIC: 'volcanic',
  UNDERGROUND: 'underground',
  CORRUPTED: 'corrupted',
};

// ============================================================================
// LAYER GENERATORS
// ============================================================================

/**
 * Base Layer Generator interface
 */
class LayerGenerator {
  constructor(compositor) {
    this.compositor = compositor;
  }

  /**
   * Generate layer content
   * @param {Object} canvas - The canvas object with tiles, monsters, objects
   * @param {Object} params - Layer parameters
   * @param {SeededRandom} rng - Random number generator
   * @returns {Object} - Generation result
   */
  generate(canvas, params, rng) {
    throw new Error('LayerGenerator.generate must be implemented');
  }

  /**
   * Check if a position is blocked by previous layers
   */
  isBlocked(canvas, x, y, blockingTypes = ['structure', 'water']) {
    if (!canvas.metadata[y] || !canvas.metadata[y][x]) return false;
    return blockingTypes.some(type => canvas.metadata[y][x].has(type));
  }

  /**
   * Mark a position with metadata
   */
  markPosition(canvas, x, y, type) {
    if (!canvas.metadata[y]) canvas.metadata[y] = [];
    if (!canvas.metadata[y][x]) canvas.metadata[y][x] = new Set();
    canvas.metadata[y][x].add(type);
  }
}

/**
 * Terrain Layer - Base ground tiles
 */
class TerrainLayerGenerator extends LayerGenerator {
  generate(canvas, params, rng) {
    const {
      biome = BIOMES.PLAINS,
      noiseScale = 0.1,
      variant = 'default',
    } = params;

    const noise = new PerlinNoise(rng.seed);
    let tilesSet = 0;

    // Get biome tile mappings
    const tiles = this._getBiomeTiles(biome);

    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const noiseVal = noise.octaveNoise(x * noiseScale, y * noiseScale, 4, 0.5);

        // Select tile based on noise
        let tile;
        if (noiseVal < 0.3) {
          tile = rng.pick(tiles.primary);
        } else if (noiseVal < 0.6) {
          tile = rng.pick(tiles.secondary);
        } else {
          tile = rng.pick(tiles.accent);
        }

        canvas.tiles[y][x] = tile;
        this.markPosition(canvas, x, y, 'terrain');
        tilesSet++;
      }
    }

    return {
      layer: LAYER_TYPES.TERRAIN,
      biome,
      tilesSet,
    };
  }

  _getBiomeTiles(biome) {
    const tileMappings = {
      [BIOMES.PLAINS]: {
        primary: TOWN_TILES.grass,
        secondary: TOWN_TILES.dirt,
        accent: TOWN_TILES.flowers || TOWN_TILES.grass,
      },
      [BIOMES.FOREST]: {
        primary: TOWN_TILES.grass,
        secondary: TOWN_TILES.dirt,
        accent: TOWN_TILES.grass,
      },
      [BIOMES.SWAMP]: {
        primary: TOWN_TILES.water,
        secondary: TOWN_TILES.grass,
        accent: TOWN_TILES.dirt,
      },
      [BIOMES.UNDERGROUND]: {
        primary: [BINARY_MARKERS.FLOOR],
        secondary: [BINARY_MARKERS.FLOOR],
        accent: [BINARY_MARKERS.FLOOR],
      },
      [BIOMES.CORRUPTED]: {
        primary: TOWN_TILES.rubble,
        secondary: TOWN_TILES.dirt,
        accent: TOWN_TILES.bones,
      },
    };

    return tileMappings[biome] || tileMappings[BIOMES.PLAINS];
  }
}

/**
 * Structures Layer - Buildings, walls, rooms
 */
class StructuresLayerGenerator extends LayerGenerator {
  generate(canvas, params, rng) {
    const {
      presets = [],
      buildings = [],
      walls = null,
    } = params;

    const results = {
      layer: LAYER_TYPES.STRUCTURES,
      structures: [],
      presetsApplied: [],
    };

    // Add perimeter walls if requested
    if (walls) {
      this._addPerimeterWalls(canvas, walls, rng);
      results.hasPerimeterWalls = true;
    }

    // Apply structure presets (e.g., "house_group:10", "room_cluster:5")
    for (const presetDef of presets) {
      let presetName, count;

      if (typeof presetDef === 'string') {
        const parts = presetDef.split(':');
        presetName = parts[0];
        count = parseInt(parts[1]) || 1;
      } else {
        presetName = presetDef.name;
        count = presetDef.count || 1;
      }

      for (let i = 0; i < count; i++) {
        try {
          const presetParams = {
            ...presetDef.params,
            seed: rng.nextInt(0, 1000000),
          };

          const result = presetEngine.instantiate(canvas, presetName, presetParams);
          results.presetsApplied.push(result);

          // Mark structure positions
          if (result.result?.houses) {
            for (const house of result.result.houses) {
              this._markStructureArea(canvas, house.x, house.y, house.width, house.height);
            }
          }
          if (result.result?.rooms) {
            for (const room of result.result.rooms) {
              this._markStructureArea(canvas, room.x, room.y, room.width, room.height);
            }
          }
        } catch (e) {
          console.warn(`Failed to apply preset ${presetName}:`, e.message);
        }
      }
    }

    // Add custom buildings
    for (const building of buildings) {
      this._addBuilding(canvas, building, rng);
      results.structures.push(building);
    }

    return results;
  }

  _addPerimeterWalls(canvas, wallConfig, rng) {
    const wallTile = wallConfig.tile || rng.pick(TOWN_TILES.wall_stone);
    const thickness = wallConfig.thickness || 1;

    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const isEdge = x < thickness || x >= canvas.width - thickness ||
                       y < thickness || y >= canvas.height - thickness;

        if (isEdge) {
          canvas.tiles[y][x] = wallTile;
          this.markPosition(canvas, x, y, 'structure');
          this.markPosition(canvas, x, y, 'wall');
        }
      }
    }
  }

  _addBuilding(canvas, building, rng) {
    const { x, y, width, height, type = 'house' } = building;

    // Draw walls
    for (let bx = x; bx < x + width && bx < canvas.width; bx++) {
      for (let by = y; by < y + height && by < canvas.height; by++) {
        if (by < 0 || bx < 0) continue;

        const isWall = bx === x || bx === x + width - 1 ||
                       by === y || by === y + height - 1;

        if (isWall) {
          canvas.tiles[by][bx] = rng.pick(TOWN_TILES.wall_stone);
        } else {
          canvas.tiles[by][bx] = rng.pick(TOWN_TILES.cobblestone);
        }

        this.markPosition(canvas, bx, by, 'structure');
      }
    }

    // Add door
    if (building.door !== false) {
      const doorX = x + Math.floor(width / 2);
      const doorY = y + height - 1;
      if (doorY >= 0 && doorY < canvas.height && doorX >= 0 && doorX < canvas.width) {
        canvas.tiles[doorY][doorX] = TOWN_TILES.door[0];
        this.markPosition(canvas, doorX, doorY, 'door');
      }
    }

    this._markStructureArea(canvas, x, y, width, height);
  }

  _markStructureArea(canvas, x, y, width, height) {
    for (let by = y; by < y + height; by++) {
      for (let bx = x; bx < x + width; bx++) {
        this.markPosition(canvas, bx, by, 'structure');
      }
    }
  }
}

/**
 * Paths Layer - Roads, trails, corridors
 */
class PathsLayerGenerator extends LayerGenerator {
  generate(canvas, params, rng) {
    const {
      paths = [],
      connectStructures = false,
      pathMaterial = 'dirt',
      pathWidth = 2,
    } = params;

    const results = {
      layer: LAYER_TYPES.PATHS,
      pathsCreated: 0,
    };

    const materialTiles = {
      dirt: TOWN_TILES.dirt,
      cobblestone: TOWN_TILES.cobblestone,
      grass: TOWN_TILES.grass,
    }[pathMaterial] || TOWN_TILES.dirt;

    // Auto-connect structures if requested
    if (connectStructures) {
      const structurePositions = this._findStructurePositions(canvas);
      if (structurePositions.length > 1) {
        const connectionPaths = this._computeConnectionPaths(structurePositions, rng);
        paths.push(...connectionPaths);
      }
    }

    // Draw each path
    for (const path of paths) {
      this._drawPath(canvas, path, materialTiles, pathWidth, rng);
      results.pathsCreated++;
    }

    return results;
  }

  _findStructurePositions(canvas) {
    const positions = [];
    const visited = new Set();

    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        if (canvas.metadata[y]?.[x]?.has('door')) {
          const key = `${Math.floor(x / 5)},${Math.floor(y / 5)}`;
          if (!visited.has(key)) {
            positions.push({ x, y: y + 1 }); // Just outside door
            visited.add(key);
          }
        }
      }
    }

    return positions;
  }

  _computeConnectionPaths(positions, rng) {
    const paths = [];

    // Use MST to connect all positions
    if (positions.length < 2) return paths;

    const inMST = new Set([0]);

    while (inMST.size < positions.length) {
      let minDist = Infinity;
      let minEdge = null;

      for (const i of inMST) {
        for (let j = 0; j < positions.length; j++) {
          if (inMST.has(j)) continue;

          const dist = Math.abs(positions[i].x - positions[j].x) +
                       Math.abs(positions[i].y - positions[j].y);

          if (dist < minDist) {
            minDist = dist;
            minEdge = {
              from: positions[i],
              to: positions[j],
              toIdx: j,
            };
          }
        }
      }

      if (minEdge) {
        paths.push({
          startX: minEdge.from.x,
          startY: minEdge.from.y,
          endX: minEdge.to.x,
          endY: minEdge.to.y,
        });
        inMST.add(minEdge.toIdx);
      } else {
        break;
      }
    }

    return paths;
  }

  _drawPath(canvas, path, tiles, width, rng) {
    const { startX, startY, endX, endY } = path;

    // L-shaped path
    const midX = Math.round((startX + endX) / 2);

    // Horizontal to mid
    for (let x = Math.min(startX, midX); x <= Math.max(startX, midX); x++) {
      this._drawPathSegment(canvas, x, startY, width, tiles, rng);
    }

    // Vertical
    for (let y = Math.min(startY, endY); y <= Math.max(startY, endY); y++) {
      this._drawPathSegment(canvas, midX, y, width, tiles, rng);
    }

    // Horizontal to end
    for (let x = Math.min(midX, endX); x <= Math.max(midX, endX); x++) {
      this._drawPathSegment(canvas, x, endY, width, tiles, rng);
    }
  }

  _drawPathSegment(canvas, cx, cy, width, tiles, rng) {
    for (let dy = -Math.floor(width / 2); dy <= Math.floor(width / 2); dy++) {
      for (let dx = -Math.floor(width / 2); dx <= Math.floor(width / 2); dx++) {
        const x = cx + dx;
        const y = cy + dy;

        if (y >= 0 && y < canvas.height && x >= 0 && x < canvas.width) {
          // Don't overwrite structures
          if (!this.isBlocked(canvas, x, y, ['structure', 'wall'])) {
            canvas.tiles[y][x] = rng.pick(tiles);
            this.markPosition(canvas, x, y, 'path');
          }
        }
      }
    }
  }
}

/**
 * Foliage Layer - Trees, bushes, natural decorations
 */
class FoliageLayerGenerator extends LayerGenerator {
  generate(canvas, params, rng) {
    const {
      density = 0.2,
      avoid = ['structure', 'path', 'water'],
      types = ['trees', 'bushes'],
      noiseScale = 0.15,
      clusterStrength = 0.5,
    } = params;

    const noise = new PerlinNoise(rng.seed);
    let placed = 0;

    const results = {
      layer: LAYER_TYPES.FOLIAGE,
      trees: 0,
      bushes: 0,
      flowers: 0,
    };

    for (let y = 1; y < canvas.height - 1; y++) {
      for (let x = 1; x < canvas.width - 1; x++) {
        // Skip blocked positions
        if (this.isBlocked(canvas, x, y, avoid)) continue;

        // Use noise for natural clustering
        const noiseVal = noise.octaveNoise(x * noiseScale, y * noiseScale, 3, 0.5);
        const threshold = 1 - density - (noiseVal * clusterStrength);

        if (rng.next() > threshold) {
          // Select foliage type
          const foliageType = rng.pick(types);
          let tile;

          switch (foliageType) {
            case 'trees':
              tile = rng.pick(TOWN_TILES.tree);
              results.trees++;
              break;
            case 'bushes':
              tile = rng.pick(TOWN_TILES.bush);
              results.bushes++;
              break;
            case 'flowers':
              tile = rng.pick(TOWN_TILES.flowers);
              results.flowers++;
              break;
            default:
              tile = rng.pick(TOWN_TILES.tree);
              results.trees++;
          }

          canvas.tiles[y][x] = tile;
          this.markPosition(canvas, x, y, 'foliage');
          placed++;
        }
      }
    }

    results.totalPlaced = placed;
    return results;
  }
}

/**
 * Objects Layer - Chests, barrels, shrines
 */
class ObjectsLayerGenerator extends LayerGenerator {
  generate(canvas, params, rng) {
    const {
      objects = [],
      presets = [],
      avoid = ['structure', 'wall', 'water'],
    } = params;

    // Ensure objects array exists
    if (!canvas.objects) {
      canvas.objects = [];
      for (let y = 0; y < canvas.height * 2; y++) {
        canvas.objects[y] = new Array(canvas.width * 2).fill(0);
      }
      canvas.hasObjects = true;
    }

    const results = {
      layer: LAYER_TYPES.OBJECTS,
      objectsPlaced: 0,
      presetsApplied: [],
    };

    // Apply object presets
    for (const presetDef of presets) {
      try {
        const presetName = typeof presetDef === 'string' ? presetDef : presetDef.name;
        const presetParams = typeof presetDef === 'object' ? presetDef.params : {};

        const result = presetEngine.instantiate(canvas, presetName, {
          ...presetParams,
          seed: rng.nextInt(0, 1000000),
        });

        results.presetsApplied.push(result);
        results.objectsPlaced += result.result?.totalObjects || 0;
      } catch (e) {
        console.warn(`Failed to apply object preset:`, e.message);
      }
    }

    // Place individual objects
    for (const obj of objects) {
      const { x, y, type, id } = obj;

      if (y >= 0 && y < canvas.height && x >= 0 && x < canvas.width) {
        if (!this.isBlocked(canvas, x, y, avoid)) {
          const ox = x * 2;
          const oy = y * 2;

          if (canvas.objects[oy] && canvas.objects[oy][ox] !== undefined) {
            canvas.objects[oy][ox] = id || this._getObjectId(type);
            this.markPosition(canvas, x, y, 'object');
            results.objectsPlaced++;
          }
        }
      }
    }

    return results;
  }

  _getObjectId(type) {
    const objectIds = {
      barrel: 52,
      chest: 51,
      large_chest: 50,
      shrine: 60,
      torch: 70,
      altar: 80,
      lever: 81,
      tombstone: 90,
    };
    return objectIds[type] || 52;
  }
}

/**
 * Entities Layer - Monsters, NPCs
 */
class EntitiesLayerGenerator extends LayerGenerator {
  generate(canvas, params, rng) {
    const {
      monsters = [],
      npcs = [],
      presets = [],
      avoid = ['structure', 'wall', 'water'],
    } = params;

    // Ensure monsters array exists
    if (!canvas.monsters) {
      canvas.monsters = [];
      for (let y = 0; y < canvas.height * 2; y++) {
        canvas.monsters[y] = new Array(canvas.width * 2).fill(0);
      }
      canvas.hasMonsters = true;
    }

    const results = {
      layer: LAYER_TYPES.ENTITIES,
      monstersPlaced: 0,
      npcsPlaced: 0,
      presetsApplied: [],
    };

    // Apply entity presets (e.g., monster_group)
    for (const presetDef of presets) {
      try {
        const presetName = typeof presetDef === 'string' ? presetDef : presetDef.name;
        const presetParams = typeof presetDef === 'object' ? presetDef.params : {};

        const result = presetEngine.instantiate(canvas, presetName, {
          ...presetParams,
          seed: rng.nextInt(0, 1000000),
        });

        results.presetsApplied.push(result);
        results.monstersPlaced += result.result?.count || 0;
      } catch (e) {
        console.warn(`Failed to apply entity preset:`, e.message);
      }
    }

    // Place individual monsters
    for (const monster of monsters) {
      const { x, y, type, id } = monster;

      if (y >= 0 && y < canvas.height && x >= 0 && x < canvas.width) {
        if (!this.isBlocked(canvas, x, y, avoid)) {
          const mx = x * 2;
          const my = y * 2;

          if (canvas.monsters[my] && canvas.monsters[my][mx] !== undefined) {
            canvas.monsters[my][mx] = id || type || 1;
            this.markPosition(canvas, x, y, 'monster');
            results.monstersPlaced++;
          }
        }
      }
    }

    // Place NPCs (stored in objects layer typically)
    for (const npc of npcs) {
      const { x, y, role, id } = npc;

      if (y >= 0 && y < canvas.height && x >= 0 && x < canvas.width) {
        const ox = x * 2;
        const oy = y * 2;

        if (canvas.objects[oy] && canvas.objects[oy][ox] !== undefined) {
          canvas.objects[oy][ox] = id || this._getNPCId(role);
          this.markPosition(canvas, x, y, 'npc');
          results.npcsPlaced++;
        }
      }
    }

    return results;
  }

  _getNPCId(role) {
    const npcIds = {
      blacksmith: 62,
      witch: 63,
      healer: 64,
      elder: 65,
      innkeeper: 66,
      merchant: 67,
      barmaid: 68,
      drunk: 69,
    };
    return npcIds[role] || 67;
  }
}

// ============================================================================
// LAYERED COMPOSITOR
// ============================================================================

/**
 * LayeredCompositor - Main composition engine
 *
 * Accepts a blueprint like:
 * {
 *   width: 40,
 *   height: 40,
 *   seed: 12345,
 *   layers: [
 *     { type: "terrain", params: { biome: "plains" } },
 *     { type: "structures", params: { presets: ["town_cluster:8"] } },
 *     { type: "foliage", params: { density: 0.3, avoid: ["structure"] } },
 *     { type: "entities", params: { presets: ["monster_group:5"] } }
 *   ]
 * }
 */
export class LayeredCompositor {
  constructor() {
    this.generators = {
      [LAYER_TYPES.TERRAIN]: new TerrainLayerGenerator(this),
      [LAYER_TYPES.STRUCTURES]: new StructuresLayerGenerator(this),
      [LAYER_TYPES.PATHS]: new PathsLayerGenerator(this),
      [LAYER_TYPES.FOLIAGE]: new FoliageLayerGenerator(this),
      [LAYER_TYPES.OBJECTS]: new ObjectsLayerGenerator(this),
      [LAYER_TYPES.ENTITIES]: new EntitiesLayerGenerator(this),
    };

    this.customGenerators = new Map();
  }

  /**
   * Register a custom layer generator
   * @param {string} type - Layer type name
   * @param {LayerGenerator} generator - Generator instance
   */
  registerGenerator(type, generator) {
    this.customGenerators.set(type, generator);
  }

  /**
   * Get generator for layer type
   */
  getGenerator(type) {
    return this.customGenerators.get(type) || this.generators[type];
  }

  /**
   * Compose a level from a blueprint
   * @param {Object} blueprint - Level blueprint
   * @returns {Object} - Composed result with DUN data
   */
  compose(blueprint) {
    const {
      width = 40,
      height = 40,
      seed = Date.now(),
      layers = [],
      defaultTile = 0,
    } = blueprint;

    const rng = new SeededRandom(seed);

    // Create canvas
    const canvas = this._createCanvas(width, height, defaultTile);

    // Process layers in order
    const results = {
      width,
      height,
      seed,
      layerResults: [],
    };

    // Sort layers by predefined order
    const sortedLayers = this._sortLayers(layers);

    for (const layer of sortedLayers) {
      const generator = this.getGenerator(layer.type);

      if (!generator) {
        console.warn(`Unknown layer type: ${layer.type}`);
        continue;
      }

      try {
        const layerResult = generator.generate(canvas, layer.params || {}, rng);
        results.layerResults.push(layerResult);
      } catch (e) {
        console.error(`Error generating layer ${layer.type}:`, e);
        results.layerResults.push({
          layer: layer.type,
          error: e.message,
        });
      }
    }

    // Convert canvas to DUN format
    results.dunData = this._canvasToDUN(canvas);
    results.preview = DUNParser.visualize(results.dunData);

    return results;
  }

  /**
   * Create a blank canvas
   */
  _createCanvas(width, height, defaultTile) {
    const tiles = [];
    const metadata = [];

    for (let y = 0; y < height; y++) {
      tiles[y] = new Array(width).fill(defaultTile);
      metadata[y] = [];
    }

    return {
      width,
      height,
      tiles,
      monsters: null,
      objects: null,
      hasMonsters: false,
      hasObjects: false,
      metadata, // Track what's at each position
    };
  }

  /**
   * Sort layers by predefined order
   */
  _sortLayers(layers) {
    return [...layers].sort((a, b) => {
      const orderA = LAYER_ORDER.indexOf(a.type);
      const orderB = LAYER_ORDER.indexOf(b.type);
      return (orderA === -1 ? 999 : orderA) - (orderB === -1 ? 999 : orderB);
    });
  }

  /**
   * Convert canvas to DUN format
   */
  _canvasToDUN(canvas) {
    return {
      width: canvas.width,
      height: canvas.height,
      baseTiles: canvas.tiles,
      items: null,
      monsters: canvas.monsters,
      objects: canvas.objects,
      hasItems: false,
      hasMonsters: canvas.hasMonsters,
      hasObjects: canvas.hasObjects,
    };
  }

  /**
   * Validate a blueprint before composition
   * @param {Object} blueprint - Blueprint to validate
   * @returns {Object} - Validation result
   */
  validateBlueprint(blueprint) {
    const errors = [];
    const warnings = [];

    // Check required fields
    if (!blueprint.width || blueprint.width < 8) {
      errors.push('Width must be at least 8');
    }
    if (!blueprint.height || blueprint.height < 8) {
      errors.push('Height must be at least 8');
    }
    if (blueprint.width > 256 || blueprint.height > 256) {
      errors.push('Dimensions cannot exceed 256');
    }

    // Check layers
    if (!blueprint.layers || !Array.isArray(blueprint.layers)) {
      warnings.push('No layers specified, will create empty level');
    } else {
      const seenTypes = new Set();
      for (const layer of blueprint.layers) {
        if (!layer.type) {
          errors.push('Layer missing type');
          continue;
        }

        if (seenTypes.has(layer.type)) {
          warnings.push(`Duplicate layer type: ${layer.type}`);
        }
        seenTypes.add(layer.type);

        if (!this.getGenerator(layer.type)) {
          warnings.push(`Unknown layer type: ${layer.type}`);
        }
      }

      // Check for terrain layer (recommended)
      if (!seenTypes.has(LAYER_TYPES.TERRAIN)) {
        warnings.push('No terrain layer - ground will be default tile');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

// ============================================================================
// BLUEPRINT BUILDER
// ============================================================================

/**
 * Fluent API for building blueprints
 */
export class BlueprintBuilder {
  constructor(width = 40, height = 40) {
    this.blueprint = {
      width,
      height,
      seed: Date.now(),
      layers: [],
    };
  }

  seed(seed) {
    this.blueprint.seed = seed;
    return this;
  }

  terrain(biome = BIOMES.PLAINS, params = {}) {
    this.blueprint.layers.push({
      type: LAYER_TYPES.TERRAIN,
      params: { biome, ...params },
    });
    return this;
  }

  structures(params = {}) {
    this.blueprint.layers.push({
      type: LAYER_TYPES.STRUCTURES,
      params,
    });
    return this;
  }

  paths(params = {}) {
    this.blueprint.layers.push({
      type: LAYER_TYPES.PATHS,
      params,
    });
    return this;
  }

  foliage(density = 0.2, params = {}) {
    this.blueprint.layers.push({
      type: LAYER_TYPES.FOLIAGE,
      params: { density, ...params },
    });
    return this;
  }

  objects(params = {}) {
    this.blueprint.layers.push({
      type: LAYER_TYPES.OBJECTS,
      params,
    });
    return this;
  }

  entities(params = {}) {
    this.blueprint.layers.push({
      type: LAYER_TYPES.ENTITIES,
      params,
    });
    return this;
  }

  addLayer(type, params = {}) {
    this.blueprint.layers.push({ type, params });
    return this;
  }

  build() {
    return this.blueprint;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

// Create singleton compositor
export const compositor = new LayeredCompositor();

export default {
  LayeredCompositor,
  compositor,
  BlueprintBuilder,
  LayerGenerator,
  LAYER_TYPES,
  LAYER_ORDER,
  BIOMES,
};
