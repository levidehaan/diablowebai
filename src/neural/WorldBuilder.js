/**
 * World Builder System
 *
 * Creates complete world structure including:
 * - Overworld/town maps
 * - Dungeon entrances and connections
 * - Multiple dungeon levels
 * - Area transitions and gates
 * - New explorable regions
 */

import NeuralConfig from './config';
import { providerManager } from './providers';
import levelGenerator from './LevelGenerator';

/**
 * Area types
 */
export const AREA_TYPES = {
  TOWN: 'town',
  OVERWORLD: 'overworld',
  DUNGEON: 'dungeon',
  BOSS_ROOM: 'boss_room',
  SECRET: 'secret',
  HUB: 'hub',
};

/**
 * Transition types
 */
export const TRANSITION_TYPES = {
  STAIRS_DOWN: 'stairs_down',
  STAIRS_UP: 'stairs_up',
  DOOR: 'door',
  PORTAL: 'portal',
  CAVE_ENTRANCE: 'cave_entrance',
  GATE: 'gate',
  SECRET_PASSAGE: 'secret_passage',
};

/**
 * Theme configurations for area generation
 */
const THEME_CONFIGS = {
  town: {
    structures: ['tavern', 'blacksmith', 'church', 'well', 'house'],
    groundTile: 'grass',
    decorations: ['tree', 'fence', 'cart', 'barrel'],
  },
  cathedral: {
    structures: ['altar', 'pillar', 'bookshelf', 'candelabra'],
    groundTile: 'stone_floor',
    decorations: ['torch', 'bones', 'blood_stain', 'broken_pew'],
  },
  catacombs: {
    structures: ['sarcophagus', 'tomb', 'coffin', 'crypt'],
    groundTile: 'dirt_floor',
    decorations: ['skull_pile', 'chain', 'cobweb', 'rat'],
  },
  caves: {
    structures: ['stalagmite', 'stalactite', 'mushroom_cluster', 'crystal'],
    groundTile: 'cave_floor',
    decorations: ['rock', 'puddle', 'glowing_moss', 'bat'],
  },
  hell: {
    structures: ['demon_shrine', 'lava_pool', 'bone_throne', 'pentagram'],
    groundTile: 'hellstone',
    decorations: ['flame_geyser', 'skull_spike', 'chain', 'portal_fragment'],
  },
};

/**
 * Area definition
 */
class Area {
  constructor(config) {
    this.id = config.id;
    this.name = config.name;
    this.type = config.type || AREA_TYPES.DUNGEON;
    this.theme = config.theme || 'cathedral';
    this.difficulty = config.difficulty || 1;
    this.width = config.width || 40;
    this.height = config.height || 40;
    this.grid = config.grid || null;
    this.transitions = config.transitions || [];
    this.spawnPoints = config.spawnPoints || [];
    this.structures = config.structures || [];
    this.decorations = config.decorations || [];
    this.locked = config.locked || false;
    this.unlockCondition = config.unlockCondition || null;
    this.metadata = config.metadata || {};
  }

  /**
   * Check if area is accessible
   */
  isAccessible(gameState) {
    if (!this.locked) return true;
    if (!this.unlockCondition) return true;

    const { type, target } = this.unlockCondition;

    switch (type) {
      case 'boss_kill':
        return gameState.defeatedBosses?.includes(target);
      case 'item_required':
        return gameState.inventory?.includes(target);
      case 'quest_complete':
        return gameState.completedQuests?.includes(target);
      case 'level_required':
        return gameState.playerLevel >= target;
      default:
        return false;
    }
  }

  /**
   * Get transitions that lead to accessible areas
   */
  getAccessibleTransitions(gameState) {
    return this.transitions.filter(t => {
      if (!t.locked) return true;
      if (!t.unlockCondition) return true;
      return this.checkCondition(t.unlockCondition, gameState);
    });
  }

  checkCondition(condition, gameState) {
    const { type, target } = condition;

    switch (type) {
      case 'boss_kill':
        return gameState.defeatedBosses?.includes(target);
      case 'item_required':
        return gameState.inventory?.includes(target);
      default:
        return false;
    }
  }
}

/**
 * World map containing all areas
 */
class WorldMap {
  constructor() {
    this.areas = new Map();
    this.startArea = null;
    this.connections = [];
  }

  addArea(area) {
    this.areas.set(area.id, area);
    if (!this.startArea) {
      this.startArea = area.id;
    }
  }

  getArea(areaId) {
    return this.areas.get(areaId);
  }

  getStartArea() {
    return this.areas.get(this.startArea);
  }

  getAllAreas() {
    return Array.from(this.areas.values());
  }

  /**
   * Find path between two areas
   */
  findPath(fromId, toId) {
    const visited = new Set();
    const queue = [[fromId]];

    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];

      if (current === toId) {
        return path;
      }

      if (visited.has(current)) continue;
      visited.add(current);

      const area = this.areas.get(current);
      if (!area) continue;

      for (const transition of area.transitions) {
        if (!visited.has(transition.targetArea)) {
          queue.push([...path, transition.targetArea]);
        }
      }
    }

    return null;
  }

  /**
   * Export world map for saving
   */
  export() {
    return {
      areas: Array.from(this.areas.entries()).map(([id, area]) => ({
        id,
        ...area,
      })),
      startArea: this.startArea,
      connections: this.connections,
      version: 1,
    };
  }

  /**
   * Import saved world map
   */
  import(data) {
    if (data.version === 1) {
      this.areas.clear();
      for (const areaData of data.areas) {
        this.areas.set(areaData.id, new Area(areaData));
      }
      this.startArea = data.startArea;
      this.connections = data.connections;
      return true;
    }
    return false;
  }
}

/**
 * Mock world generator for offline use
 */
class MockWorldGenerator {
  static async generateWorld(campaign) {
    const world = new WorldMap();

    // Create town
    const town = new Area({
      id: 'tristram',
      name: 'Tristram',
      type: AREA_TYPES.TOWN,
      theme: 'town',
      difficulty: 0,
      width: 60,
      height: 60,
      grid: this.generateTownGrid(60, 60),
      transitions: [],
      structures: this.generateTownStructures(),
    });

    world.addArea(town);

    // Create dungeon levels for each act
    for (const act of campaign.acts) {
      for (const level of act.levels) {
        const dungeonArea = new Area({
          id: level.id,
          name: level.name,
          type: AREA_TYPES.DUNGEON,
          theme: act.theme.toLowerCase(),
          difficulty: level.difficulty,
          width: 40,
          height: 40,
          grid: await levelGenerator.generateLevel({
            theme: act.theme,
            difficulty: level.difficulty,
          }),
          transitions: [],
          spawnPoints: level.spawnAreas || [],
          locked: !!level.unlockCondition,
          unlockCondition: level.unlockCondition,
          metadata: {
            actId: act.id,
            objectives: level.objectives,
          },
        });

        world.addArea(dungeonArea);
      }

      // Create boss room for each act
      if (act.boss) {
        const bossRoom = new Area({
          id: `${act.id}_boss_room`,
          name: `${act.boss.name}'s Lair`,
          type: AREA_TYPES.BOSS_ROOM,
          theme: act.theme.toLowerCase(),
          difficulty: act.boss.difficulty,
          width: 30,
          height: 30,
          grid: this.generateBossRoomGrid(30, 30),
          transitions: [],
          locked: true,
          unlockCondition: {
            type: 'quest_complete',
            target: `${act.id}_level_${act.levels.length}_clear`,
          },
          metadata: {
            boss: act.boss,
          },
        });

        world.addArea(bossRoom);
      }
    }

    // Connect all areas
    this.connectAreas(world, campaign);

    return world;
  }

  static generateTownGrid(width, height) {
    const grid = [];

    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        // Create paths and open areas
        const isBorder = x < 2 || x >= width - 2 || y < 2 || y >= height - 2;
        const isPath = x % 10 < 3 || y % 10 < 3;

        row.push(isBorder ? 1 : (isPath ? 0 : (Math.random() > 0.7 ? 1 : 0)));
      }
      grid.push(row);
    }

    return grid;
  }

  static generateBossRoomGrid(width, height) {
    const grid = [];

    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        // Mostly open with walls on edges
        const isBorder = x < 2 || x >= width - 2 || y < 2 || y >= height - 2;
        const isCorner = (x < 5 && y < 5) || (x < 5 && y >= height - 5) ||
                        (x >= width - 5 && y < 5) || (x >= width - 5 && y >= height - 5);

        row.push(isBorder ? 1 : (isCorner && Math.random() > 0.5 ? 1 : 0));
      }
      grid.push(row);
    }

    return grid;
  }

  static generateTownStructures() {
    return [
      { type: 'tavern', x: 10, y: 10, name: 'Tavern of the Rising Sun', npc: 'OGDEN' },
      { type: 'blacksmith', x: 25, y: 12, name: 'Griswold\'s Edge', npc: 'GRISWOLD' },
      { type: 'church', x: 40, y: 8, name: 'Cathedral Entrance', npc: 'PEPIN' },
      { type: 'house', x: 15, y: 30, name: 'Cain\'s House', npc: 'CAIN' },
      { type: 'hut', x: 50, y: 35, name: 'Adria\'s Shack', npc: 'ADRIA' },
      { type: 'well', x: 30, y: 25, name: 'Town Well' },
    ];
  }

  static connectAreas(world, campaign) {
    const town = world.getArea('tristram');

    // Connect town to first dungeon
    const firstAct = campaign.acts[0];
    const firstLevel = firstAct?.levels[0];

    if (firstLevel) {
      town.transitions.push({
        id: 'town_to_dungeon',
        type: TRANSITION_TYPES.STAIRS_DOWN,
        x: 40,
        y: 8,
        targetArea: firstLevel.id,
        targetX: 20,
        targetY: 38,
        name: 'Cathedral Entrance',
      });

      const firstDungeon = world.getArea(firstLevel.id);
      if (firstDungeon) {
        firstDungeon.transitions.push({
          id: 'dungeon_to_town',
          type: TRANSITION_TYPES.STAIRS_UP,
          x: 20,
          y: 38,
          targetArea: 'tristram',
          targetX: 40,
          targetY: 10,
          name: 'Exit to Tristram',
        });
      }
    }

    // Connect dungeon levels within acts
    for (const act of campaign.acts) {
      for (let i = 0; i < act.levels.length; i++) {
        const currentLevel = act.levels[i];
        const currentArea = world.getArea(currentLevel.id);

        if (!currentArea) continue;

        // Connect to next level
        if (i < act.levels.length - 1) {
          const nextLevel = act.levels[i + 1];
          const nextArea = world.getArea(nextLevel.id);

          if (nextArea) {
            currentArea.transitions.push({
              id: `${currentLevel.id}_to_${nextLevel.id}`,
              type: TRANSITION_TYPES.STAIRS_DOWN,
              x: 20,
              y: 2,
              targetArea: nextLevel.id,
              targetX: 20,
              targetY: 38,
              name: `Descent to ${nextLevel.name}`,
              locked: !!nextLevel.unlockCondition,
              unlockCondition: nextLevel.unlockCondition,
            });

            nextArea.transitions.push({
              id: `${nextLevel.id}_to_${currentLevel.id}`,
              type: TRANSITION_TYPES.STAIRS_UP,
              x: 20,
              y: 38,
              targetArea: currentLevel.id,
              targetX: 20,
              targetY: 4,
              name: `Ascent to ${currentLevel.name}`,
            });
          }
        }

        // Connect last level to boss room
        if (i === act.levels.length - 1 && act.boss) {
          const bossRoomId = `${act.id}_boss_room`;
          const bossRoom = world.getArea(bossRoomId);

          if (bossRoom) {
            currentArea.transitions.push({
              id: `${currentLevel.id}_to_boss`,
              type: TRANSITION_TYPES.GATE,
              x: 20,
              y: 2,
              targetArea: bossRoomId,
              targetX: 15,
              targetY: 28,
              name: `Gate to ${act.boss.name}'s Lair`,
              locked: true,
              unlockCondition: {
                type: 'quest_complete',
                target: `${currentLevel.id}_clear`,
              },
            });

            bossRoom.transitions.push({
              id: `boss_to_${currentLevel.id}`,
              type: TRANSITION_TYPES.GATE,
              x: 15,
              y: 28,
              targetArea: currentLevel.id,
              targetX: 20,
              targetY: 4,
              name: 'Exit',
            });
          }
        }
      }
    }

    // Connect acts (boss room of act N to first level of act N+1)
    for (let actIndex = 0; actIndex < campaign.acts.length - 1; actIndex++) {
      const currentAct = campaign.acts[actIndex];
      const nextAct = campaign.acts[actIndex + 1];

      const bossRoomId = `${currentAct.id}_boss_room`;
      const bossRoom = world.getArea(bossRoomId);

      const nextFirstLevel = nextAct.levels[0];
      const nextArea = world.getArea(nextFirstLevel?.id);

      if (bossRoom && nextArea) {
        bossRoom.transitions.push({
          id: `boss_to_next_act`,
          type: TRANSITION_TYPES.PORTAL,
          x: 15,
          y: 2,
          targetArea: nextFirstLevel.id,
          targetX: 20,
          targetY: 38,
          name: `Portal to ${nextAct.name}`,
          locked: true,
          unlockCondition: {
            type: 'boss_kill',
            target: currentAct.boss?.id || `${currentAct.id}_boss`,
          },
        });
      }
    }
  }
}

/**
 * Main World Builder
 */
class WorldBuilder {
  constructor() {
    this.currentWorld = null;
    this.generatedAreas = new Map();
  }

  /**
   * Build a complete world from a campaign
   */
  async buildWorld(campaign) {
    const provider = providerManager.getProvider();

    if (!provider || NeuralConfig.debug.mockAPIResponses) {
      this.currentWorld = await MockWorldGenerator.generateWorld(campaign);
    } else {
      this.currentWorld = await this.buildWithAI(campaign);
    }

    return this.currentWorld;
  }

  /**
   * Build world using AI
   */
  async buildWithAI(campaign) {
    // Start with mock generation as base
    const world = await MockWorldGenerator.generateWorld(campaign);

    // Enhance with AI-generated details
    const provider = providerManager.getProvider();
    if (!provider) return world;

    // Generate enhanced area descriptions
    for (const area of world.getAllAreas()) {
      try {
        const enhancement = await this.enhanceArea(area, campaign);
        if (enhancement) {
          area.metadata.description = enhancement.description;
          area.metadata.lore = enhancement.lore;
          area.metadata.secrets = enhancement.secrets;
        }
      } catch (error) {
        console.error(`[WorldBuilder] Failed to enhance area ${area.id}:`, error);
      }
    }

    return world;
  }

  /**
   * Enhance an area with AI-generated content
   */
  async enhanceArea(area, campaign) {
    const provider = providerManager.getProvider();
    if (!provider) return null;

    const prompt = `Generate atmospheric details for a Diablo-style dungeon area:

Area: ${area.name}
Type: ${area.type}
Theme: ${area.theme}
Difficulty: ${area.difficulty}

Campaign Context: ${campaign.name} - ${campaign.description}

Generate a JSON object with:
{
  "description": "2-3 sentence atmospheric description",
  "lore": "Optional backstory or history hint",
  "secrets": ["Optional list of discoverable secrets"]
}`;

    try {
      const response = await provider.generateText(prompt, {
        temperature: 0.8,
        maxTokens: 500,
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('[WorldBuilder] Area enhancement failed:', error);
    }

    return null;
  }

  /**
   * Generate a single dungeon level
   */
  async generateDungeonLevel(config) {
    const grid = await levelGenerator.generateLevel(config);

    return new Area({
      id: config.id || `dungeon_${Date.now()}`,
      name: config.name || 'Unknown Level',
      type: AREA_TYPES.DUNGEON,
      theme: config.theme || 'cathedral',
      difficulty: config.difficulty || 1,
      width: config.width || 40,
      height: config.height || 40,
      grid,
      transitions: config.transitions || [],
      spawnPoints: config.spawnPoints || [],
    });
  }

  /**
   * Generate a boss room
   */
  async generateBossRoom(config) {
    const width = config.width || 30;
    const height = config.height || 30;

    const grid = await levelGenerator.generateLevel({
      ...config,
      constraints: {
        minRooms: 1,
        maxRooms: 1,
        minRoomSize: Math.floor(width * 0.6),
        maxRoomSize: Math.floor(width * 0.8),
      },
    });

    return new Area({
      id: config.id || `boss_room_${Date.now()}`,
      name: config.name || 'Boss Lair',
      type: AREA_TYPES.BOSS_ROOM,
      theme: config.theme || 'hell',
      difficulty: config.difficulty || 10,
      width,
      height,
      grid,
      transitions: config.transitions || [],
      metadata: {
        boss: config.boss,
      },
    });
  }

  /**
   * Add a new area to current world
   */
  addArea(area) {
    if (this.currentWorld) {
      this.currentWorld.addArea(area);
    }
  }

  /**
   * Connect two areas
   */
  connectAreas(fromAreaId, toAreaId, transitionConfig) {
    if (!this.currentWorld) return false;

    const fromArea = this.currentWorld.getArea(fromAreaId);
    const toArea = this.currentWorld.getArea(toAreaId);

    if (!fromArea || !toArea) return false;

    // Add forward transition
    fromArea.transitions.push({
      id: `${fromAreaId}_to_${toAreaId}`,
      type: transitionConfig.type || TRANSITION_TYPES.DOOR,
      x: transitionConfig.fromX || 20,
      y: transitionConfig.fromY || 2,
      targetArea: toAreaId,
      targetX: transitionConfig.toX || 20,
      targetY: transitionConfig.toY || 38,
      name: transitionConfig.name || `To ${toArea.name}`,
      locked: transitionConfig.locked || false,
      unlockCondition: transitionConfig.unlockCondition || null,
    });

    // Add reverse transition if bidirectional
    if (transitionConfig.bidirectional !== false) {
      toArea.transitions.push({
        id: `${toAreaId}_to_${fromAreaId}`,
        type: this.getReverseTransitionType(transitionConfig.type),
        x: transitionConfig.toX || 20,
        y: transitionConfig.toY || 38,
        targetArea: fromAreaId,
        targetX: transitionConfig.fromX || 20,
        targetY: transitionConfig.fromY || 4,
        name: `To ${fromArea.name}`,
      });
    }

    return true;
  }

  getReverseTransitionType(type) {
    const reverseMap = {
      [TRANSITION_TYPES.STAIRS_DOWN]: TRANSITION_TYPES.STAIRS_UP,
      [TRANSITION_TYPES.STAIRS_UP]: TRANSITION_TYPES.STAIRS_DOWN,
      [TRANSITION_TYPES.DOOR]: TRANSITION_TYPES.DOOR,
      [TRANSITION_TYPES.PORTAL]: TRANSITION_TYPES.PORTAL,
      [TRANSITION_TYPES.CAVE_ENTRANCE]: TRANSITION_TYPES.CAVE_ENTRANCE,
      [TRANSITION_TYPES.GATE]: TRANSITION_TYPES.GATE,
    };

    return reverseMap[type] || type;
  }

  /**
   * Get current world
   */
  getWorld() {
    return this.currentWorld;
  }

  /**
   * Get area by ID
   */
  getArea(areaId) {
    return this.currentWorld?.getArea(areaId);
  }

  /**
   * Export world for saving
   */
  export() {
    return this.currentWorld?.export() || null;
  }

  /**
   * Import saved world
   */
  import(data) {
    this.currentWorld = new WorldMap();
    return this.currentWorld.import(data);
  }

  /**
   * Clear current world
   */
  clear() {
    this.currentWorld = null;
    this.generatedAreas.clear();
  }
}

// Singleton instance
const worldBuilder = new WorldBuilder();

export {
  WorldBuilder,
  WorldMap,
  Area,
  MockWorldGenerator,
  THEME_CONFIGS,
};

export default worldBuilder;
