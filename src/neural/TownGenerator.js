/**
 * Town Generator
 *
 * Generates custom starting areas for AI campaigns.
 * Can create replacements for Tristram's town sectors or entirely new hub areas.
 *
 * Tristram Town Structure:
 * - Divided into 4 sectors (quadrants)
 * - Each sector is a DUN file (sector1s.dun - sector4s.dun)
 * - Sectors are arranged: NW(1), NE(2), SW(3), SE(4)
 * - Contains NPCs, shops, dungeon entrance, and interactive objects
 *
 * Custom Starting Areas:
 * - Village: Traditional town with buildings and NPCs
 * - Camp: Military encampment with tents and soldiers
 * - Ruins: Destroyed settlement, more desolate
 * - Sanctuary: Hidden refuge with limited services
 * - Outpost: Small frontier settlement
 */

import DUNParser from './DUNParser';
import TileMapper from './TileMapper';
import { GAME_LEVEL_PATHS } from './CampaignConverter';

// Town tile IDs (from town.til tileset)
export const TOWN_TILES = {
  // Ground tiles
  grass: [1, 2, 3, 4],           // Various grass tiles
  dirt: [5, 6, 7],               // Dirt paths
  cobblestone: [8, 9, 10, 11],   // Paved areas
  water: [12, 13],               // Fountain/well water

  // Structure tiles
  wall_stone: [20, 21, 22, 23],  // Stone walls
  wall_wood: [24, 25, 26],       // Wooden structures
  roof: [30, 31, 32],            // Rooftops
  door: [35, 36],                // Doorways
  window: [37, 38],              // Windows

  // Special tiles
  stairs_down: 40,               // Dungeon entrance
  well: 41,                      // Town well
  sign: 42,                      // Signpost
  fountain: 43,                  // Town fountain
  fire_pit: 44,                  // Campfire
  tent: [45, 46, 47],            // Tent structures
  cart: 48,                      // Wagon/cart
  barrel: 49,                    // Storage barrel
  crate: 50,                     // Storage crate

  // Decorative
  tree: [60, 61, 62, 63],        // Various trees
  bush: [64, 65],                // Bushes
  flowers: [66, 67],             // Flower patches
  rubble: [70, 71, 72],          // Ruined debris
  bones: [73, 74],               // Skeletal remains
};

// NPC positions in town (relative to sector)
export const NPC_LOCATIONS = {
  // Essential NPCs
  griswold: { sector: 1, x: 12, y: 8, name: 'Blacksmith' },      // Blacksmith
  adria: { sector: 3, x: 5, y: 12, name: 'Witch' },              // Witch's hut
  pepin: { sector: 1, x: 6, y: 14, name: 'Healer' },             // Healer
  cain: { sector: 2, x: 8, y: 10, name: 'Elder/Sage' },          // Deckard Cain
  ogden: { sector: 2, x: 14, y: 6, name: 'Innkeeper' },          // Tavern
  farnham: { sector: 2, x: 10, y: 8, name: 'Drunk' },            // Town drunk
  wirt: { sector: 4, x: 4, y: 4, name: 'Merchant' },             // Wirt (hidden)
  gillian: { sector: 2, x: 12, y: 10, name: 'Barmaid' },         // Gillian

  // Dungeon entrance
  cathedral_entrance: { sector: 1, x: 15, y: 2, name: 'Dungeon Entrance' },
};

// Starting area templates
export const STARTING_AREA_TYPES = {
  VILLAGE: 'village',       // Traditional town
  CAMP: 'camp',             // Military encampment
  RUINS: 'ruins',           // Destroyed settlement
  SANCTUARY: 'sanctuary',   // Hidden refuge
  OUTPOST: 'outpost',       // Frontier settlement
  CRYPT: 'crypt',           // Underground starting area
};

/**
 * Town Generator class
 */
export class TownGenerator {
  constructor(options = {}) {
    this.options = {
      type: options.type || STARTING_AREA_TYPES.VILLAGE,
      theme: options.theme || 'default',
      storyline: options.storyline || null,
      npcs: options.npcs || [],
      seed: options.seed || Date.now(),
      ...options,
    };

    this.random = this.createSeededRandom(this.options.seed);
  }

  /**
   * Create a seeded random number generator
   */
  createSeededRandom(seed) {
    let s = seed;
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }

  /**
   * Generate all 4 town sectors
   * @returns {Map} sector path -> DUN data
   */
  generateTown() {
    const sectors = new Map();

    // Generate based on starting area type
    switch (this.options.type) {
      case STARTING_AREA_TYPES.CAMP:
        this.generateCamp(sectors);
        break;
      case STARTING_AREA_TYPES.RUINS:
        this.generateRuins(sectors);
        break;
      case STARTING_AREA_TYPES.SANCTUARY:
        this.generateSanctuary(sectors);
        break;
      case STARTING_AREA_TYPES.OUTPOST:
        this.generateOutpost(sectors);
        break;
      case STARTING_AREA_TYPES.CRYPT:
        this.generateCrypt(sectors);
        break;
      case STARTING_AREA_TYPES.VILLAGE:
      default:
        this.generateVillage(sectors);
        break;
    }

    return sectors;
  }

  /**
   * Generate a traditional village layout
   */
  generateVillage(sectors) {
    const sectorSize = 16; // Each sector is 16x16 tiles

    // Sector 1 (NW) - Blacksmith area, dungeon entrance
    sectors.set(GAME_LEVEL_PATHS.town.sector1s, this.createSector({
      name: 'Village Northwest',
      features: ['blacksmith', 'dungeon_entrance', 'healer'],
      groundType: 'mixed', // Mix of grass and cobblestone
      buildings: [
        { type: 'forge', x: 10, y: 6, width: 4, height: 4 },
        { type: 'hut', x: 4, y: 12, width: 3, height: 3 },
      ],
      npcs: [
        { ...NPC_LOCATIONS.griswold },
        { ...NPC_LOCATIONS.pepin },
      ],
      dungeonEntrance: { x: 14, y: 2 },
    }));

    // Sector 2 (NE) - Tavern area, elder's place
    sectors.set(GAME_LEVEL_PATHS.town.sector2s, this.createSector({
      name: 'Village Northeast',
      features: ['tavern', 'elder', 'well'],
      groundType: 'cobblestone',
      buildings: [
        { type: 'tavern', x: 10, y: 4, width: 5, height: 5 },
        { type: 'house', x: 4, y: 8, width: 4, height: 3 },
      ],
      npcs: [
        { ...NPC_LOCATIONS.ogden },
        { ...NPC_LOCATIONS.cain },
        { ...NPC_LOCATIONS.gillian },
        { ...NPC_LOCATIONS.farnham },
      ],
      centerFeature: { type: 'well', x: 8, y: 8 },
    }));

    // Sector 3 (SW) - Witch's hut area, outskirts
    sectors.set(GAME_LEVEL_PATHS.town.sector3s, this.createSector({
      name: 'Village Southwest',
      features: ['witch_hut', 'pond', 'trees'],
      groundType: 'grass',
      buildings: [
        { type: 'hut', x: 4, y: 10, width: 3, height: 3 },
      ],
      npcs: [
        { ...NPC_LOCATIONS.adria },
      ],
      water: { x: 10, y: 6, width: 4, height: 4 },
      decorations: ['trees', 'bushes'],
    }));

    // Sector 4 (SE) - Hidden area, Wirt's location
    sectors.set(GAME_LEVEL_PATHS.town.sector4s, this.createSector({
      name: 'Village Southeast',
      features: ['hidden_merchant', 'ruins'],
      groundType: 'mixed',
      buildings: [],
      npcs: [
        { ...NPC_LOCATIONS.wirt },
      ],
      decorations: ['rubble', 'trees', 'bones'],
    }));
  }

  /**
   * Generate a military camp layout
   */
  generateCamp(sectors) {
    // Sector 1 (NW) - Command tent, armory
    sectors.set(GAME_LEVEL_PATHS.town.sector1s, this.createSector({
      name: 'Camp Command',
      features: ['command_tent', 'armory', 'dungeon_entrance'],
      groundType: 'dirt',
      buildings: [
        { type: 'tent_large', x: 8, y: 6, width: 5, height: 4 },
        { type: 'tent', x: 3, y: 10, width: 3, height: 3 },
      ],
      npcs: [
        { x: 10, y: 8, name: 'Commander', role: 'blacksmith' },
        { x: 5, y: 12, name: 'Medic', role: 'healer' },
      ],
      dungeonEntrance: { x: 14, y: 2 },
      decorations: ['fire_pit', 'crates', 'barrels'],
    }));

    // Sector 2 (NE) - Mess tent, training area
    sectors.set(GAME_LEVEL_PATHS.town.sector2s, this.createSector({
      name: 'Camp Mess Hall',
      features: ['mess_tent', 'training_ground'],
      groundType: 'dirt',
      buildings: [
        { type: 'tent_large', x: 8, y: 4, width: 5, height: 4 },
      ],
      npcs: [
        { x: 10, y: 6, name: 'Quartermaster', role: 'innkeeper' },
        { x: 6, y: 10, name: 'Veteran', role: 'elder' },
      ],
      centerFeature: { type: 'fire_pit', x: 8, y: 10 },
    }));

    // Sector 3 (SW) - Supply tents
    sectors.set(GAME_LEVEL_PATHS.town.sector3s, this.createSector({
      name: 'Camp Supplies',
      features: ['supply_tent', 'field_hospital'],
      groundType: 'dirt',
      buildings: [
        { type: 'tent', x: 4, y: 8, width: 3, height: 3 },
        { type: 'tent', x: 10, y: 6, width: 3, height: 3 },
      ],
      npcs: [
        { x: 6, y: 10, name: 'Supplier', role: 'witch' },
      ],
      decorations: ['carts', 'crates', 'barrels'],
    }));

    // Sector 4 (SE) - Perimeter, scout area
    sectors.set(GAME_LEVEL_PATHS.town.sector4s, this.createSector({
      name: 'Camp Perimeter',
      features: ['watchtower', 'scout_tent'],
      groundType: 'grass',
      buildings: [
        { type: 'tent', x: 4, y: 4, width: 3, height: 3 },
      ],
      npcs: [
        { x: 5, y: 5, name: 'Scout', role: 'merchant' },
      ],
      decorations: ['trees', 'fire_pit'],
    }));
  }

  /**
   * Generate ruined settlement layout
   */
  generateRuins(sectors) {
    // More desolate, with destroyed buildings and rubble
    sectors.set(GAME_LEVEL_PATHS.town.sector1s, this.createSector({
      name: 'Ruins North',
      features: ['ruined_building', 'dungeon_entrance'],
      groundType: 'rubble',
      buildings: [
        { type: 'ruins', x: 8, y: 6, width: 5, height: 4, destroyed: true },
      ],
      npcs: [
        { x: 10, y: 8, name: 'Survivor', role: 'blacksmith' },
      ],
      dungeonEntrance: { x: 14, y: 2 },
      decorations: ['rubble', 'bones', 'fire_pit'],
    }));

    sectors.set(GAME_LEVEL_PATHS.town.sector2s, this.createSector({
      name: 'Ruins East',
      features: ['collapsed_church'],
      groundType: 'rubble',
      buildings: [
        { type: 'ruins', x: 6, y: 4, width: 6, height: 5, destroyed: true },
      ],
      npcs: [
        { x: 8, y: 8, name: 'Hermit', role: 'elder' },
      ],
      decorations: ['rubble', 'bones'],
    }));

    sectors.set(GAME_LEVEL_PATHS.town.sector3s, this.createSector({
      name: 'Ruins West',
      features: ['shelter'],
      groundType: 'mixed',
      buildings: [
        { type: 'lean_to', x: 4, y: 10, width: 4, height: 3 },
      ],
      npcs: [
        { x: 5, y: 11, name: 'Mystic', role: 'witch' },
      ],
      decorations: ['rubble', 'trees'],
    }));

    sectors.set(GAME_LEVEL_PATHS.town.sector4s, this.createSector({
      name: 'Ruins South',
      features: ['graveyard'],
      groundType: 'grass',
      buildings: [],
      npcs: [
        { x: 6, y: 6, name: 'Scavenger', role: 'merchant' },
      ],
      decorations: ['rubble', 'bones', 'graves'],
    }));
  }

  /**
   * Generate a hidden sanctuary layout
   */
  generateSanctuary(sectors) {
    // More enclosed, hidden nature
    sectors.set(GAME_LEVEL_PATHS.town.sector1s, this.createSector({
      name: 'Sanctuary Entrance',
      features: ['hidden_entrance', 'guardian'],
      groundType: 'stone',
      buildings: [
        { type: 'altar', x: 8, y: 4, width: 4, height: 3 },
      ],
      npcs: [
        { x: 10, y: 6, name: 'Guardian', role: 'blacksmith' },
      ],
      dungeonEntrance: { x: 14, y: 2 },
      surrounded: true, // Walls around edges
    }));

    sectors.set(GAME_LEVEL_PATHS.town.sector2s, this.createSector({
      name: 'Sanctuary Hall',
      features: ['meditation_room'],
      groundType: 'stone',
      buildings: [
        { type: 'chamber', x: 6, y: 6, width: 6, height: 5 },
      ],
      npcs: [
        { x: 9, y: 8, name: 'Sage', role: 'elder' },
        { x: 7, y: 10, name: 'Acolyte', role: 'healer' },
      ],
      surrounded: true,
    }));

    sectors.set(GAME_LEVEL_PATHS.town.sector3s, this.createSector({
      name: 'Sanctuary Garden',
      features: ['herb_garden'],
      groundType: 'grass',
      buildings: [
        { type: 'greenhouse', x: 4, y: 8, width: 4, height: 4 },
      ],
      npcs: [
        { x: 6, y: 10, name: 'Herbalist', role: 'witch' },
      ],
      water: { x: 10, y: 10, width: 3, height: 3 },
      decorations: ['flowers', 'trees'],
    }));

    sectors.set(GAME_LEVEL_PATHS.town.sector4s, this.createSector({
      name: 'Sanctuary Quarters',
      features: ['sleeping_quarters'],
      groundType: 'stone',
      buildings: [
        { type: 'cell', x: 4, y: 4, width: 3, height: 3 },
        { type: 'cell', x: 8, y: 4, width: 3, height: 3 },
      ],
      npcs: [
        { x: 5, y: 5, name: 'Pilgrim', role: 'merchant' },
      ],
      surrounded: true,
    }));
  }

  /**
   * Generate a frontier outpost layout
   */
  generateOutpost(sectors) {
    // Small, sparse, practical
    sectors.set(GAME_LEVEL_PATHS.town.sector1s, this.createSector({
      name: 'Outpost Gate',
      features: ['gate', 'armory'],
      groundType: 'dirt',
      buildings: [
        { type: 'gatehouse', x: 6, y: 2, width: 6, height: 4 },
        { type: 'shed', x: 10, y: 10, width: 3, height: 3 },
      ],
      npcs: [
        { x: 11, y: 11, name: 'Armorer', role: 'blacksmith' },
      ],
      dungeonEntrance: { x: 8, y: 0 },
      palisade: true, // Wooden walls
    }));

    sectors.set(GAME_LEVEL_PATHS.town.sector2s, this.createSector({
      name: 'Outpost Barracks',
      features: ['barracks', 'mess'],
      groundType: 'dirt',
      buildings: [
        { type: 'longhouse', x: 4, y: 4, width: 8, height: 4 },
      ],
      npcs: [
        { x: 8, y: 6, name: 'Captain', role: 'innkeeper' },
        { x: 10, y: 10, name: 'Soldier', role: 'elder' },
      ],
      centerFeature: { type: 'fire_pit', x: 8, y: 10 },
      palisade: true,
    }));

    sectors.set(GAME_LEVEL_PATHS.town.sector3s, this.createSector({
      name: 'Outpost Stores',
      features: ['storage', 'stable'],
      groundType: 'dirt',
      buildings: [
        { type: 'shed', x: 4, y: 6, width: 4, height: 3 },
        { type: 'stable', x: 10, y: 8, width: 4, height: 4 },
      ],
      npcs: [
        { x: 5, y: 7, name: 'Trader', role: 'witch' },
      ],
      decorations: ['carts', 'barrels'],
      palisade: true,
    }));

    sectors.set(GAME_LEVEL_PATHS.town.sector4s, this.createSector({
      name: 'Outpost Watch',
      features: ['watchtower', 'training'],
      groundType: 'grass',
      buildings: [
        { type: 'tower', x: 12, y: 4, width: 3, height: 3 },
      ],
      npcs: [
        { x: 4, y: 6, name: 'Scout', role: 'merchant' },
      ],
      palisade: true,
    }));
  }

  /**
   * Generate an underground crypt starting area
   */
  generateCrypt(sectors) {
    // Underground, more claustrophobic
    sectors.set(GAME_LEVEL_PATHS.town.sector1s, this.createSector({
      name: 'Crypt Entrance',
      features: ['entrance_chamber'],
      groundType: 'stone',
      underground: true,
      buildings: [],
      npcs: [
        { x: 8, y: 8, name: 'Keeper', role: 'blacksmith' },
      ],
      dungeonEntrance: { x: 8, y: 14 }, // Exit leads deeper
      torches: true,
    }));

    sectors.set(GAME_LEVEL_PATHS.town.sector2s, this.createSector({
      name: 'Crypt Hall',
      features: ['main_hall'],
      groundType: 'stone',
      underground: true,
      buildings: [
        { type: 'altar', x: 8, y: 6, width: 4, height: 3 },
      ],
      npcs: [
        { x: 10, y: 8, name: 'Priest', role: 'elder' },
        { x: 6, y: 10, name: 'Acolyte', role: 'healer' },
      ],
      torches: true,
    }));

    sectors.set(GAME_LEVEL_PATHS.town.sector3s, this.createSector({
      name: 'Crypt Archives',
      features: ['library'],
      groundType: 'stone',
      underground: true,
      buildings: [
        { type: 'bookshelf_row', x: 4, y: 4, width: 8, height: 2 },
        { type: 'bookshelf_row', x: 4, y: 8, width: 8, height: 2 },
      ],
      npcs: [
        { x: 8, y: 12, name: 'Archivist', role: 'witch' },
      ],
      torches: true,
    }));

    sectors.set(GAME_LEVEL_PATHS.town.sector4s, this.createSector({
      name: 'Crypt Tombs',
      features: ['tomb_chamber'],
      groundType: 'stone',
      underground: true,
      buildings: [
        { type: 'sarcophagus', x: 4, y: 6, width: 2, height: 3 },
        { type: 'sarcophagus', x: 10, y: 6, width: 2, height: 3 },
      ],
      npcs: [
        { x: 8, y: 10, name: 'Grave Keeper', role: 'merchant' },
      ],
      decorations: ['bones', 'cobwebs'],
      torches: true,
    }));
  }

  /**
   * Create a single sector DUN data
   */
  createSector(config) {
    const width = 16;
    const height = 16;

    // Create base DUN structure
    const dunData = {
      width,
      height,
      baseTiles: [],
      monsters: null,
      objects: null,
      items: null,
      hasMonsters: false,
      hasObjects: true,
      hasItems: false,
    };

    // Initialize tile grid
    for (let y = 0; y < height; y++) {
      dunData.baseTiles[y] = [];
      for (let x = 0; x < width; x++) {
        dunData.baseTiles[y][x] = this.getGroundTile(config.groundType, x, y);
      }
    }

    // Add walls if surrounded
    if (config.surrounded || config.palisade || config.underground) {
      this.addWalls(dunData, config);
    }

    // Add buildings
    if (config.buildings) {
      for (const building of config.buildings) {
        this.addBuilding(dunData, building, config);
      }
    }

    // Add water features
    if (config.water) {
      this.addWater(dunData, config.water);
    }

    // Add center feature (well, fire pit, etc.)
    if (config.centerFeature) {
      this.addCenterFeature(dunData, config.centerFeature);
    }

    // Add dungeon entrance
    if (config.dungeonEntrance) {
      dunData.baseTiles[config.dungeonEntrance.y][config.dungeonEntrance.x] = TOWN_TILES.stairs_down;
    }

    // Add decorations
    if (config.decorations) {
      this.addDecorations(dunData, config.decorations);
    }

    // Add torches for underground areas
    if (config.torches) {
      this.addTorches(dunData);
    }

    // Initialize objects layer for NPCs and interactables
    dunData.objects = DUNParser.createEmptySubLayer(width, height);
    dunData.hasObjects = true;

    // Place NPCs (as objects)
    if (config.npcs) {
      for (const npc of config.npcs) {
        // NPCs are placed at 2x resolution
        const ox = npc.x * 2;
        const oy = npc.y * 2;
        if (oy < dunData.objects.length && ox < dunData.objects[0].length) {
          // Use object ID based on NPC role
          dunData.objects[oy][ox] = this.getNPCObjectId(npc.role);
        }
      }
    }

    return dunData;
  }

  /**
   * Get ground tile based on type
   */
  getGroundTile(groundType, x, y) {
    switch (groundType) {
      case 'cobblestone':
        return TOWN_TILES.cobblestone[this.randomInt(0, TOWN_TILES.cobblestone.length)];
      case 'dirt':
        return TOWN_TILES.dirt[this.randomInt(0, TOWN_TILES.dirt.length)];
      case 'stone':
        return TOWN_TILES.cobblestone[0]; // Solid stone floor
      case 'rubble':
        if (this.random() < 0.3) {
          return TOWN_TILES.rubble[this.randomInt(0, TOWN_TILES.rubble.length)];
        }
        return TOWN_TILES.dirt[0];
      case 'mixed':
      default:
        // Mix grass and cobblestone based on position
        if ((x + y) % 3 === 0 || this.random() < 0.3) {
          return TOWN_TILES.cobblestone[this.randomInt(0, TOWN_TILES.cobblestone.length)];
        }
        return TOWN_TILES.grass[this.randomInt(0, TOWN_TILES.grass.length)];
    }
  }

  /**
   * Add walls around sector
   */
  addWalls(dunData, config) {
    const wallTile = config.palisade ? TOWN_TILES.wall_wood[0] : TOWN_TILES.wall_stone[0];

    for (let x = 0; x < dunData.width; x++) {
      dunData.baseTiles[0][x] = wallTile;
      dunData.baseTiles[dunData.height - 1][x] = wallTile;
    }
    for (let y = 0; y < dunData.height; y++) {
      dunData.baseTiles[y][0] = wallTile;
      dunData.baseTiles[y][dunData.width - 1] = wallTile;
    }
  }

  /**
   * Add a building to the sector
   */
  addBuilding(dunData, building, config) {
    const { x, y, width, height, type, destroyed } = building;

    // Wall tiles
    const wallTile = destroyed
      ? TOWN_TILES.rubble[0]
      : (type.includes('tent') ? TOWN_TILES.tent[0] : TOWN_TILES.wall_stone[0]);

    // Draw building outline
    for (let bx = x; bx < x + width && bx < dunData.width; bx++) {
      for (let by = y; by < y + height && by < dunData.height; by++) {
        // Walls on edges
        if (bx === x || bx === x + width - 1 || by === y || by === y + height - 1) {
          dunData.baseTiles[by][bx] = wallTile;
        } else {
          // Interior floor
          dunData.baseTiles[by][bx] = TOWN_TILES.cobblestone[0];
        }
      }
    }

    // Add door
    if (!destroyed) {
      const doorX = x + Math.floor(width / 2);
      const doorY = y + height - 1;
      if (doorY < dunData.height) {
        dunData.baseTiles[doorY][doorX] = TOWN_TILES.door[0];
      }
    }
  }

  /**
   * Add water feature
   */
  addWater(dunData, water) {
    for (let wx = water.x; wx < water.x + water.width && wx < dunData.width; wx++) {
      for (let wy = water.y; wy < water.y + water.height && wy < dunData.height; wy++) {
        dunData.baseTiles[wy][wx] = TOWN_TILES.water[0];
      }
    }
  }

  /**
   * Add center feature
   */
  addCenterFeature(dunData, feature) {
    const tile = TOWN_TILES[feature.type] || TOWN_TILES.well;
    dunData.baseTiles[feature.y][feature.x] = tile;
  }

  /**
   * Add decorative elements
   */
  addDecorations(dunData, decorations) {
    const decorCount = 5 + this.randomInt(0, 10);

    for (let i = 0; i < decorCount; i++) {
      const x = 1 + this.randomInt(0, dunData.width - 2);
      const y = 1 + this.randomInt(0, dunData.height - 2);

      // Don't overwrite important tiles
      if (dunData.baseTiles[y][x] === TOWN_TILES.stairs_down) continue;

      const decorType = decorations[this.randomInt(0, decorations.length)];
      let tile;

      switch (decorType) {
        case 'trees':
          tile = TOWN_TILES.tree[this.randomInt(0, TOWN_TILES.tree.length)];
          break;
        case 'bushes':
          tile = TOWN_TILES.bush[this.randomInt(0, TOWN_TILES.bush.length)];
          break;
        case 'flowers':
          tile = TOWN_TILES.flowers[this.randomInt(0, TOWN_TILES.flowers.length)];
          break;
        case 'rubble':
          tile = TOWN_TILES.rubble[this.randomInt(0, TOWN_TILES.rubble.length)];
          break;
        case 'bones':
          tile = TOWN_TILES.bones[this.randomInt(0, TOWN_TILES.bones.length)];
          break;
        case 'fire_pit':
          tile = TOWN_TILES.fire_pit;
          break;
        case 'crates':
          tile = TOWN_TILES.crate;
          break;
        case 'barrels':
          tile = TOWN_TILES.barrel;
          break;
        case 'carts':
          tile = TOWN_TILES.cart;
          break;
        default:
          continue;
      }

      if (tile !== undefined) {
        dunData.baseTiles[y][x] = tile;
      }
    }
  }

  /**
   * Add torches for underground areas
   */
  addTorches(dunData) {
    // Add torches along walls
    for (let x = 2; x < dunData.width - 2; x += 4) {
      dunData.baseTiles[1][x] = TOWN_TILES.fire_pit; // Using fire_pit as torch
      dunData.baseTiles[dunData.height - 2][x] = TOWN_TILES.fire_pit;
    }
    for (let y = 2; y < dunData.height - 2; y += 4) {
      dunData.baseTiles[y][1] = TOWN_TILES.fire_pit;
      dunData.baseTiles[y][dunData.width - 2] = TOWN_TILES.fire_pit;
    }
  }

  /**
   * Get NPC object ID based on role
   */
  getNPCObjectId(role) {
    // Object IDs for NPCs (these map to the game's object system)
    const npcObjects = {
      blacksmith: 62,   // Griswold
      witch: 63,        // Adria
      healer: 64,       // Pepin
      elder: 65,        // Cain
      innkeeper: 66,    // Ogden
      merchant: 67,     // Wirt/Generic merchant
      barmaid: 68,      // Gillian
      drunk: 69,        // Farnham
    };
    return npcObjects[role] || 67;
  }

  /**
   * Random integer helper
   */
  randomInt(min, max) {
    return Math.floor(this.random() * (max - min)) + min;
  }

  /**
   * Convert to MPQ-ready buffers
   */
  toBuffers() {
    const sectors = this.generateTown();
    const buffers = new Map();

    for (const [path, dunData] of sectors) {
      const buffer = DUNParser.write(dunData);
      buffers.set(path, buffer);
    }

    return buffers;
  }

  /**
   * Get preview of all sectors
   */
  getPreview() {
    const sectors = this.generateTown();
    const previews = {};

    for (const [path, dunData] of sectors) {
      previews[path] = DUNParser.visualize(dunData);
    }

    return previews;
  }
}

/**
 * Quick function to generate a starting area
 */
export function generateStartingArea(type = STARTING_AREA_TYPES.VILLAGE, options = {}) {
  const generator = new TownGenerator({ type, ...options });
  return generator.toBuffers();
}

/**
 * Get all sector paths
 */
export function getTownSectorPaths() {
  return [
    GAME_LEVEL_PATHS.town.sector1s,
    GAME_LEVEL_PATHS.town.sector2s,
    GAME_LEVEL_PATHS.town.sector3s,
    GAME_LEVEL_PATHS.town.sector4s,
  ];
}

export default TownGenerator;
