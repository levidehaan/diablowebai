/**
 * Campaign Blueprint System
 *
 * A comprehensive framework for defining complete AI-generated campaigns.
 * Story-first approach: narrative drives all implementation decisions.
 *
 * Flow: Story → World Structure → Maps → Entities → Items → Triggers → Assets
 *
 * This module defines the complete structure of a campaign from opening
 * cinematic to final victory screen, including all characters, locations,
 * quests, boss encounters, and asset requirements.
 */

// ============================================================================
// CORE STRUCTURE DEFINITIONS
// ============================================================================

/**
 * Campaign Structure Levels
 * Campaign > Acts > Chapters > Scenes > Beats
 */
export const STRUCTURE_LEVELS = {
  CAMPAIGN: 'campaign',     // The entire game experience
  ACT: 'act',               // Major story division (e.g., Act 1: The Cathedral)
  CHAPTER: 'chapter',       // Subdivision of act (e.g., Chapter 1: The Fallen Village)
  SCENE: 'scene',           // Individual encounter/moment (e.g., Meeting Cain)
  BEAT: 'beat',             // Smallest narrative unit (e.g., dialogue line)
};

/**
 * Scene Types - What happens in each scene
 */
export const SCENE_TYPES = {
  // Narrative scenes
  CINEMATIC: 'cinematic',           // Non-interactive story moment
  DIALOGUE: 'dialogue',             // NPC conversation
  DISCOVERY: 'discovery',           // Finding lore/items
  REVELATION: 'revelation',         // Plot twist/major info

  // Gameplay scenes
  EXPLORATION: 'exploration',       // Dungeon traversal
  COMBAT: 'combat',                 // Standard enemy encounters
  BOSS_FIGHT: 'boss_fight',         // Boss encounter
  PUZZLE: 'puzzle',                 // Environmental puzzle
  SURVIVAL: 'survival',             // Timed/wave-based challenge

  // Transition scenes
  TOWN_RETURN: 'town_return',       // Return to town segment
  LEVEL_TRANSITION: 'level_transition', // Moving between areas
  ACT_TRANSITION: 'act_transition', // Moving between acts
};

/**
 * Character Roles in the campaign
 */
export const CHARACTER_ROLES = {
  // Player
  PROTAGONIST: 'protagonist',

  // Allies
  MENTOR: 'mentor',                 // Guides the player (Cain)
  MERCHANT: 'merchant',             // Sells items (Griswold, Adria)
  HEALER: 'healer',                 // Heals player (Pepin)
  QUEST_GIVER: 'quest_giver',       // Provides quests
  COMPANION: 'companion',           // Temporary ally

  // Enemies
  MINION: 'minion',                 // Basic enemy
  ELITE: 'elite',                   // Stronger enemy
  MINI_BOSS: 'mini_boss',           // Mid-chapter boss
  BOSS: 'boss',                     // End of chapter/act boss
  FINAL_BOSS: 'final_boss',         // Campaign final boss

  // Neutral
  NEUTRAL: 'neutral',               // Non-hostile NPC
  AMBIGUOUS: 'ambiguous',           // Could be friend or foe
};

/**
 * Location Types
 */
export const LOCATION_TYPES = {
  TOWN: 'town',
  DUNGEON: 'dungeon',
  OUTDOOR: 'outdoor',
  BOSS_ARENA: 'boss_arena',
  SECRET_AREA: 'secret_area',
  SHRINE_ROOM: 'shrine_room',
  TREASURE_ROOM: 'treasure_room',
  TRANSITION: 'transition',
};

/**
 * Dungeon Themes
 */
export const DUNGEON_THEMES = {
  CATHEDRAL: {
    id: 'cathedral',
    name: 'Cathedral',
    description: 'Gothic church architecture with stone floors and pillars',
    levelRange: [1, 4],
    palette: 'cathedral',
    music: 'cathedral',
    ambience: 'echoing halls, dripping water, distant moans',
    structures: ['altar', 'pews', 'pillars', 'crosses', 'candelabra'],
    enemies: ['zombie', 'skeleton', 'fallen', 'scavenger'],
    bosses: ['skeleton_king', 'butcher'],
  },
  CATACOMBS: {
    id: 'catacombs',
    name: 'Catacombs',
    description: 'Underground burial chambers with bone-lined walls',
    levelRange: [5, 8],
    palette: 'catacombs',
    music: 'catacombs',
    ambience: 'scratching bones, whispers, cold draft',
    structures: ['sarcophagus', 'tombs', 'bone_piles', 'crypts'],
    enemies: ['burning_dead', 'horror', 'flesh_clan', 'hidden'],
    bosses: ['leoric', 'bonecrusher'],
  },
  CAVES: {
    id: 'caves',
    name: 'Caves',
    description: 'Natural caverns with stalactites and underground rivers',
    levelRange: [9, 12],
    palette: 'caves',
    music: 'caves',
    ambience: 'dripping water, rumbling earth, creature echoes',
    structures: ['stalagmites', 'mushrooms', 'crystals', 'pools'],
    enemies: ['fire_clan', 'night_clan', 'acid_beast', 'fiend'],
    bosses: ['magma_demon', 'cave_mother'],
  },
  HELL: {
    id: 'hell',
    name: 'Hell',
    description: 'Infernal realm with lava rivers and demon architecture',
    levelRange: [13, 16],
    palette: 'hell',
    music: 'hell',
    ambience: 'screams, fire crackling, demonic chanting',
    structures: ['pentagram', 'demon_shrine', 'lava_pools', 'bone_throne'],
    enemies: ['advocate', 'viper', 'balrog', 'doom_guard'],
    bosses: ['lazarus', 'diablo'],
  },
};

/**
 * Asset Categories for image generation
 */
export const ASSET_CATEGORIES = {
  // Characters
  PLAYER_CHARACTER: 'player_character',
  NPC: 'npc',
  ENEMY: 'enemy',
  BOSS: 'boss',

  // Environment
  TILE_FLOOR: 'tile_floor',
  TILE_WALL: 'tile_wall',
  TILE_SPECIAL: 'tile_special',
  STRUCTURE: 'structure',
  DECORATION: 'decoration',

  // Objects
  CONTAINER: 'container',
  SHRINE: 'shrine',
  DOOR: 'door',
  INTERACTIVE: 'interactive',

  // Items
  WEAPON: 'weapon',
  ARMOR: 'armor',
  CONSUMABLE: 'consumable',
  QUEST_ITEM: 'quest_item',
  GOLD: 'gold',

  // UI
  PORTRAIT: 'portrait',
  ICON: 'icon',
  BACKGROUND: 'background',
};

// ============================================================================
// BLUEPRINT CLASSES
// ============================================================================

/**
 * Complete Campaign Blueprint
 * The master document defining the entire campaign experience
 */
export class CampaignBlueprint {
  constructor(config = {}) {
    // Meta information
    this.id = config.id || `campaign_${Date.now()}`;
    this.version = config.version || '1.0.0';
    this.name = config.name || 'Unnamed Campaign';
    this.author = config.author || 'AI Generated';
    this.createdAt = config.createdAt || new Date().toISOString();

    // Campaign settings
    this.settings = {
      difficulty: config.difficulty || 'normal',
      playerClasses: config.playerClasses || ['warrior', 'rogue', 'sorcerer'],
      startingLevel: config.startingLevel || 1,
      maxLevel: config.maxLevel || 50,
      permadeath: config.permadeath || false,
      // Starting area settings
      startingArea: {
        type: config.startingArea?.type || null, // village, camp, ruins, sanctuary, outpost, crypt
        theme: config.startingArea?.theme || 'default',
        name: config.startingArea?.name || null,
        customNPCs: config.startingArea?.customNPCs || [],
        dungeonEntranceName: config.startingArea?.dungeonEntranceName || 'Cathedral',
      },
      ...config.settings,
    };

    // Story structure
    this.story = new StoryStructure(config.story);

    // World definition
    this.world = new WorldDefinition(config.world);

    // Character roster
    this.characters = new CharacterRoster(config.characters);

    // Item database for this campaign
    this.items = new ItemDatabase(config.items);

    // Quest definitions
    this.quests = new QuestDatabase(config.quests);

    // Asset requirements (for image generation)
    this.assets = new AssetManifest(config.assets);

    // Completion criteria
    this.completion = new CompletionCriteria(config.completion);

    // Generated status
    this.generationStatus = {
      story: false,
      world: false,
      characters: false,
      items: false,
      quests: false,
      assets: false,
      validated: false,
    };
  }

  /**
   * Validate the complete blueprint
   */
  validate() {
    const errors = [];
    const warnings = [];

    // Story validation
    if (!this.story.acts || this.story.acts.length === 0) {
      errors.push('Campaign must have at least one act');
    }

    // Character validation
    if (!this.characters.hasRole(CHARACTER_ROLES.FINAL_BOSS)) {
      warnings.push('Campaign has no final boss defined');
    }

    // Quest validation
    if (!this.quests.hasMainQuest()) {
      errors.push('Campaign must have a main quest line');
    }

    // World validation
    if (!this.world.hasLocation('town')) {
      warnings.push('Campaign has no town location');
    }

    // Completion validation
    if (!this.completion.victoryConditions.length) {
      errors.push('Campaign must define victory conditions');
    }

    this.generationStatus.validated = errors.length === 0;

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Export blueprint as JSON
   */
  toJSON() {
    return {
      id: this.id,
      version: this.version,
      name: this.name,
      author: this.author,
      createdAt: this.createdAt,
      settings: this.settings,
      story: this.story.toJSON(),
      world: this.world.toJSON(),
      characters: this.characters.toJSON(),
      items: this.items.toJSON(),
      quests: this.quests.toJSON(),
      assets: this.assets.toJSON(),
      completion: this.completion.toJSON(),
      generationStatus: this.generationStatus,
    };
  }

  /**
   * Import blueprint from JSON
   */
  static fromJSON(json) {
    return new CampaignBlueprint(json);
  }

  /**
   * Get summary for AI prompts
   */
  getSummary() {
    return {
      name: this.name,
      acts: this.story.acts.length,
      totalLevels: this.world.getTotalLevels(),
      characters: this.characters.getCount(),
      quests: this.quests.getCount(),
      estimatedPlaytime: this.estimatePlaytime(),
    };
  }

  /**
   * Estimate campaign playtime in hours
   */
  estimatePlaytime() {
    const levelsCount = this.world.getTotalLevels();
    const questCount = this.quests.getCount();
    // ~20 min per level + 10 min per quest
    return Math.round((levelsCount * 20 + questCount * 10) / 60);
  }
}

/**
 * Story Structure - The narrative backbone
 */
export class StoryStructure {
  constructor(config = {}) {
    this.title = config.title || 'Untitled Story';
    this.premise = config.premise || '';
    this.setting = config.setting || '';
    this.tone = config.tone || 'dark fantasy';
    this.themes = config.themes || ['good vs evil', 'corruption', 'redemption'];

    // Opening and ending
    this.opening = new StoryMoment(config.opening || {
      type: 'cinematic',
      title: 'Prologue',
    });
    this.ending = new StoryMoment(config.ending || {
      type: 'cinematic',
      title: 'Epilogue',
    });

    // Acts
    this.acts = (config.acts || []).map(act => new Act(act));

    // Story timeline/events
    this.timeline = config.timeline || [];
  }

  addAct(actConfig) {
    const act = new Act(actConfig);
    this.acts.push(act);
    return act;
  }

  getAct(index) {
    return this.acts[index];
  }

  getTotalChapters() {
    return this.acts.reduce((sum, act) => sum + act.chapters.length, 0);
  }

  getTotalScenes() {
    return this.acts.reduce((sum, act) =>
      sum + act.chapters.reduce((cSum, chapter) =>
        cSum + chapter.scenes.length, 0), 0);
  }

  toJSON() {
    return {
      title: this.title,
      premise: this.premise,
      setting: this.setting,
      tone: this.tone,
      themes: this.themes,
      opening: this.opening.toJSON(),
      ending: this.ending.toJSON(),
      acts: this.acts.map(a => a.toJSON()),
      timeline: this.timeline,
    };
  }
}

/**
 * Act - Major story division
 */
export class Act {
  constructor(config = {}) {
    this.id = config.id || `act_${Date.now()}`;
    this.number = config.number || 1;
    this.title = config.title || `Act ${this.number}`;
    this.subtitle = config.subtitle || '';
    this.description = config.description || '';

    // Narrative elements
    this.introduction = config.introduction || ''; // Opening text/cinematic
    this.conclusion = config.conclusion || '';     // Closing text
    this.majorEvents = config.majorEvents || [];   // Key plot points

    // Theme/setting for this act
    this.theme = config.theme || 'cathedral';
    this.levelRange = config.levelRange || [1, 4];

    // Chapters within this act
    this.chapters = (config.chapters || []).map(ch => new Chapter(ch));

    // Act-level boss
    this.boss = config.boss || null;

    // Requirements to unlock this act
    this.unlockRequirements = config.unlockRequirements || [];

    // Rewards for completing this act
    this.completionRewards = config.completionRewards || [];
  }

  addChapter(chapterConfig) {
    const chapter = new Chapter(chapterConfig);
    this.chapters.push(chapter);
    return chapter;
  }

  toJSON() {
    return {
      id: this.id,
      number: this.number,
      title: this.title,
      subtitle: this.subtitle,
      description: this.description,
      introduction: this.introduction,
      conclusion: this.conclusion,
      majorEvents: this.majorEvents,
      theme: this.theme,
      levelRange: this.levelRange,
      chapters: this.chapters.map(c => c.toJSON()),
      boss: this.boss,
      unlockRequirements: this.unlockRequirements,
      completionRewards: this.completionRewards,
    };
  }
}

/**
 * Chapter - Subdivision of an act
 */
export class Chapter {
  constructor(config = {}) {
    this.id = config.id || `chapter_${Date.now()}`;
    this.number = config.number || 1;
    this.title = config.title || `Chapter ${this.number}`;
    this.description = config.description || '';

    // What happens in this chapter
    this.objectives = config.objectives || [];
    this.scenes = (config.scenes || []).map(s => new Scene(s));

    // Location mapping
    this.primaryLocation = config.primaryLocation || null;
    this.secondaryLocations = config.secondaryLocations || [];

    // Chapter-specific enemies
    this.enemies = config.enemies || [];
    this.miniBoss = config.miniBoss || null;

    // Loot/rewards in this chapter
    this.lootTable = config.lootTable || [];
    this.guaranteedDrops = config.guaranteedDrops || [];

    // Story elements
    this.dialogue = config.dialogue || [];
    this.loreEntries = config.loreEntries || [];
  }

  addScene(sceneConfig) {
    const scene = new Scene(sceneConfig);
    this.scenes.push(scene);
    return scene;
  }

  toJSON() {
    return {
      id: this.id,
      number: this.number,
      title: this.title,
      description: this.description,
      objectives: this.objectives,
      scenes: this.scenes.map(s => s.toJSON()),
      primaryLocation: this.primaryLocation,
      secondaryLocations: this.secondaryLocations,
      enemies: this.enemies,
      miniBoss: this.miniBoss,
      lootTable: this.lootTable,
      guaranteedDrops: this.guaranteedDrops,
      dialogue: this.dialogue,
      loreEntries: this.loreEntries,
    };
  }
}

/**
 * Scene - Individual encounter or moment
 */
export class Scene {
  constructor(config = {}) {
    this.id = config.id || `scene_${Date.now()}`;
    this.type = config.type || SCENE_TYPES.EXPLORATION;
    this.title = config.title || 'Untitled Scene';
    this.description = config.description || '';

    // Scene content
    this.beats = config.beats || []; // Smallest narrative units
    this.triggers = config.triggers || []; // What triggers this scene
    this.outcomes = config.outcomes || []; // Possible outcomes

    // Location within the chapter
    this.location = config.location || null;
    this.coordinates = config.coordinates || null;

    // Characters involved
    this.characters = config.characters || [];

    // Combat setup (if applicable)
    this.combat = config.combat || null;

    // Dialogue (if applicable)
    this.dialogue = config.dialogue || [];

    // Rewards/consequences
    this.rewards = config.rewards || [];
    this.consequences = config.consequences || [];

    // Flags this scene sets
    this.setsFlags = config.setsFlags || [];
    this.requiresFlags = config.requiresFlags || [];
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      title: this.title,
      description: this.description,
      beats: this.beats,
      triggers: this.triggers,
      outcomes: this.outcomes,
      location: this.location,
      coordinates: this.coordinates,
      characters: this.characters,
      combat: this.combat,
      dialogue: this.dialogue,
      rewards: this.rewards,
      consequences: this.consequences,
      setsFlags: this.setsFlags,
      requiresFlags: this.requiresFlags,
    };
  }
}

/**
 * Story Moment - Opening/ending cinematics
 */
export class StoryMoment {
  constructor(config = {}) {
    this.type = config.type || 'cinematic';
    this.title = config.title || '';
    this.narration = config.narration || '';
    this.dialogue = config.dialogue || [];
    this.visuals = config.visuals || []; // Image generation hints
    this.music = config.music || null;
    this.duration = config.duration || 0; // Estimated seconds
  }

  toJSON() {
    return {
      type: this.type,
      title: this.title,
      narration: this.narration,
      dialogue: this.dialogue,
      visuals: this.visuals,
      music: this.music,
      duration: this.duration,
    };
  }
}

// ============================================================================
// WORLD DEFINITION
// ============================================================================

/**
 * World Definition - All locations and their connections
 */
export class WorldDefinition {
  constructor(config = {}) {
    this.name = config.name || 'The World';
    this.description = config.description || '';

    // All locations
    this.locations = new Map();
    if (config.locations) {
      for (const loc of config.locations) {
        this.addLocation(loc);
      }
    }

    // Connections between locations
    this.connections = config.connections || [];

    // Global world state flags
    this.initialFlags = config.initialFlags || {};
  }

  addLocation(locationConfig) {
    const location = new Location(locationConfig);
    this.locations.set(location.id, location);
    return location;
  }

  getLocation(id) {
    return this.locations.get(id);
  }

  hasLocation(type) {
    for (const loc of this.locations.values()) {
      if (loc.type === type) return true;
    }
    return false;
  }

  getTotalLevels() {
    let count = 0;
    for (const loc of this.locations.values()) {
      if (loc.type === LOCATION_TYPES.DUNGEON) {
        count += loc.levels?.length || 1;
      }
    }
    return count;
  }

  toJSON() {
    return {
      name: this.name,
      description: this.description,
      locations: Array.from(this.locations.values()).map(l => l.toJSON()),
      connections: this.connections,
      initialFlags: this.initialFlags,
    };
  }
}

/**
 * Location - A place in the world
 */
export class Location {
  constructor(config = {}) {
    this.id = config.id || `loc_${Date.now()}`;
    this.name = config.name || 'Unknown Location';
    this.type = config.type || LOCATION_TYPES.DUNGEON;
    this.theme = config.theme || 'cathedral';
    this.description = config.description || '';

    // For dungeons - level definitions
    this.levels = config.levels || [];

    // Map generation settings
    this.mapSettings = {
      width: config.width || 40,
      height: config.height || 40,
      algorithm: config.algorithm || 'bsp',
      seed: config.seed || null,
      ...config.mapSettings,
    };

    // What spawns here
    this.enemyTable = config.enemyTable || [];
    this.objectTable = config.objectTable || [];
    this.itemTable = config.itemTable || [];

    // Special features
    this.specialFeatures = config.specialFeatures || [];

    // Ambient settings
    this.ambience = config.ambience || {};

    // Image generation requirements
    this.assetRequirements = config.assetRequirements || [];

    // Unlock conditions
    this.unlockConditions = config.unlockConditions || [];
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      theme: this.theme,
      description: this.description,
      levels: this.levels,
      mapSettings: this.mapSettings,
      enemyTable: this.enemyTable,
      objectTable: this.objectTable,
      itemTable: this.itemTable,
      specialFeatures: this.specialFeatures,
      ambience: this.ambience,
      assetRequirements: this.assetRequirements,
      unlockConditions: this.unlockConditions,
    };
  }
}

// ============================================================================
// CHARACTER ROSTER
// ============================================================================

/**
 * Character Roster - All characters in the campaign
 */
export class CharacterRoster {
  constructor(config = {}) {
    this.characters = new Map();

    if (config.characters || Array.isArray(config)) {
      const chars = config.characters || config;
      for (const char of chars) {
        this.addCharacter(char);
      }
    }
  }

  addCharacter(charConfig) {
    const character = new Character(charConfig);
    this.characters.set(character.id, character);
    return character;
  }

  getCharacter(id) {
    return this.characters.get(id);
  }

  hasRole(role) {
    for (const char of this.characters.values()) {
      if (char.role === role) return true;
    }
    return false;
  }

  getByRole(role) {
    const result = [];
    for (const char of this.characters.values()) {
      if (char.role === role) result.push(char);
    }
    return result;
  }

  getCount() {
    return this.characters.size;
  }

  /**
   * Search characters by criteria
   */
  search(criteria = {}) {
    const results = [];
    for (const char of this.characters.values()) {
      let matches = true;

      if (criteria.role && char.role !== criteria.role) matches = false;
      if (criteria.faction && char.faction !== criteria.faction) matches = false;
      if (criteria.location && char.location !== criteria.location) matches = false;
      if (criteria.name && !char.name.toLowerCase().includes(criteria.name.toLowerCase())) matches = false;
      if (criteria.tags && !criteria.tags.every(t => char.tags.includes(t))) matches = false;

      if (matches) results.push(char);
    }
    return results;
  }

  toJSON() {
    return Array.from(this.characters.values()).map(c => c.toJSON());
  }
}

/**
 * Character - A person/creature in the campaign
 */
export class Character {
  constructor(config = {}) {
    this.id = config.id || `char_${Date.now()}`;
    this.name = config.name || 'Unknown';
    this.title = config.title || '';
    this.role = config.role || CHARACTER_ROLES.NEUTRAL;
    this.faction = config.faction || 'neutral';

    // Appearance
    this.appearance = {
      description: config.appearance?.description || '',
      portrait: config.appearance?.portrait || null,
      sprite: config.appearance?.sprite || null,
      size: config.appearance?.size || 'medium',
      ...config.appearance,
    };

    // Personality/behavior
    this.personality = {
      traits: config.personality?.traits || [],
      speechStyle: config.personality?.speechStyle || 'formal',
      mood: config.personality?.mood || 'neutral',
      ...config.personality,
    };

    // For NPCs - dialogue
    this.dialogue = {
      greeting: config.dialogue?.greeting || '',
      farewell: config.dialogue?.farewell || '',
      questDialogue: config.dialogue?.questDialogue || {},
      contextual: config.dialogue?.contextual || [],
      ...config.dialogue,
    };

    // For enemies - combat stats
    this.combat = {
      health: config.combat?.health || 100,
      damage: config.combat?.damage || 10,
      armor: config.combat?.armor || 0,
      resistances: config.combat?.resistances || {},
      abilities: config.combat?.abilities || [],
      behavior: config.combat?.behavior || 'aggressive',
      lootTable: config.combat?.lootTable || [],
      ...config.combat,
    };

    // For bosses - special mechanics
    this.bossData = config.bossData || null;

    // Location in the world
    this.location = config.location || null;
    this.spawnConditions = config.spawnConditions || [];

    // Story involvement
    this.storyRole = config.storyRole || '';
    this.questsGiven = config.questsGiven || [];
    this.questsInvolved = config.questsInvolved || [];

    // Asset requirements
    this.assetRequirements = config.assetRequirements || [];

    // Tags for searching
    this.tags = config.tags || [];
  }

  /**
   * Get dialogue for context
   */
  getDialogue(context = {}) {
    if (context.questId && this.dialogue.questDialogue[context.questId]) {
      return this.dialogue.questDialogue[context.questId];
    }
    if (context.type === 'greeting') return this.dialogue.greeting;
    if (context.type === 'farewell') return this.dialogue.farewell;
    return this.dialogue.greeting;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      title: this.title,
      role: this.role,
      faction: this.faction,
      appearance: this.appearance,
      personality: this.personality,
      dialogue: this.dialogue,
      combat: this.combat,
      bossData: this.bossData,
      location: this.location,
      spawnConditions: this.spawnConditions,
      storyRole: this.storyRole,
      questsGiven: this.questsGiven,
      questsInvolved: this.questsInvolved,
      assetRequirements: this.assetRequirements,
      tags: this.tags,
    };
  }
}

// ============================================================================
// ITEM DATABASE
// ============================================================================

/**
 * Item Database - All items in the campaign
 */
export class ItemDatabase {
  constructor(config = {}) {
    this.items = new Map();

    if (config.items || Array.isArray(config)) {
      const items = config.items || config;
      for (const item of items) {
        this.addItem(item);
      }
    }
  }

  addItem(itemConfig) {
    const item = new Item(itemConfig);
    this.items.set(item.id, item);
    return item;
  }

  getItem(id) {
    return this.items.get(id);
  }

  getCount() {
    return this.items.size;
  }

  /**
   * Search items by criteria
   */
  search(criteria = {}) {
    const results = [];
    for (const item of this.items.values()) {
      let matches = true;

      if (criteria.type && item.type !== criteria.type) matches = false;
      if (criteria.rarity && item.rarity !== criteria.rarity) matches = false;
      if (criteria.minLevel && item.requiredLevel < criteria.minLevel) matches = false;
      if (criteria.maxLevel && item.requiredLevel > criteria.maxLevel) matches = false;
      if (criteria.isQuest !== undefined && item.isQuestItem !== criteria.isQuest) matches = false;
      if (criteria.name && !item.name.toLowerCase().includes(criteria.name.toLowerCase())) matches = false;

      if (matches) results.push(item);
    }
    return results;
  }

  toJSON() {
    return Array.from(this.items.values()).map(i => i.toJSON());
  }
}

/**
 * Item - A collectible object
 */
export class Item {
  constructor(config = {}) {
    this.id = config.id || `item_${Date.now()}`;
    this.name = config.name || 'Unknown Item';
    this.type = config.type || 'consumable';
    this.rarity = config.rarity || 'common';
    this.description = config.description || '';

    // Stats
    this.stats = config.stats || {};
    this.requiredLevel = config.requiredLevel || 1;
    this.requiredClass = config.requiredClass || null;

    // Value
    this.buyPrice = config.buyPrice || 0;
    this.sellPrice = config.sellPrice || 0;

    // Quest item flag
    this.isQuestItem = config.isQuestItem || false;
    this.questId = config.questId || null;

    // Asset
    this.icon = config.icon || null;
    this.sprite = config.sprite || null;
    this.assetRequirements = config.assetRequirements || [];

    // Where this item can be found
    this.dropLocations = config.dropLocations || [];
    this.dropChance = config.dropChance || 1.0;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      rarity: this.rarity,
      description: this.description,
      stats: this.stats,
      requiredLevel: this.requiredLevel,
      requiredClass: this.requiredClass,
      buyPrice: this.buyPrice,
      sellPrice: this.sellPrice,
      isQuestItem: this.isQuestItem,
      questId: this.questId,
      icon: this.icon,
      sprite: this.sprite,
      assetRequirements: this.assetRequirements,
      dropLocations: this.dropLocations,
      dropChance: this.dropChance,
    };
  }
}

// ============================================================================
// QUEST DATABASE
// ============================================================================

/**
 * Quest Database - All quests in the campaign
 */
export class QuestDatabase {
  constructor(config = {}) {
    this.mainQuest = null;
    this.sideQuests = new Map();

    if (config.mainQuest) {
      this.mainQuest = new Quest({ ...config.mainQuest, isMain: true });
    }

    if (config.sideQuests) {
      for (const quest of config.sideQuests) {
        this.addSideQuest(quest);
      }
    }
  }

  setMainQuest(questConfig) {
    this.mainQuest = new Quest({ ...questConfig, isMain: true });
    return this.mainQuest;
  }

  addSideQuest(questConfig) {
    const quest = new Quest({ ...questConfig, isMain: false });
    this.sideQuests.set(quest.id, quest);
    return quest;
  }

  hasMainQuest() {
    return this.mainQuest !== null;
  }

  getCount() {
    return (this.mainQuest ? 1 : 0) + this.sideQuests.size;
  }

  getAllQuests() {
    const all = [];
    if (this.mainQuest) all.push(this.mainQuest);
    for (const quest of this.sideQuests.values()) {
      all.push(quest);
    }
    return all;
  }

  toJSON() {
    return {
      mainQuest: this.mainQuest?.toJSON(),
      sideQuests: Array.from(this.sideQuests.values()).map(q => q.toJSON()),
    };
  }
}

/**
 * Quest - A task for the player
 */
export class Quest {
  constructor(config = {}) {
    this.id = config.id || `quest_${Date.now()}`;
    this.name = config.name || 'Unknown Quest';
    this.description = config.description || '';
    this.isMain = config.isMain || false;

    // Quest giver
    this.giver = config.giver || null;
    this.giverDialogue = config.giverDialogue || {};

    // Objectives
    this.objectives = (config.objectives || []).map(o => new QuestObjective(o));

    // Rewards
    this.rewards = {
      experience: config.rewards?.experience || 0,
      gold: config.rewards?.gold || 0,
      items: config.rewards?.items || [],
      unlocks: config.rewards?.unlocks || [],
      ...config.rewards,
    };

    // Completion
    this.completionDialogue = config.completionDialogue || '';
    this.failureDialogue = config.failureDialogue || '';

    // Requirements
    this.prerequisites = config.prerequisites || [];
    this.levelRequirement = config.levelRequirement || 1;

    // Flags
    this.setsFlags = config.setsFlags || [];
    this.requiresFlags = config.requiresFlags || [];
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      isMain: this.isMain,
      giver: this.giver,
      giverDialogue: this.giverDialogue,
      objectives: this.objectives.map(o => o.toJSON()),
      rewards: this.rewards,
      completionDialogue: this.completionDialogue,
      failureDialogue: this.failureDialogue,
      prerequisites: this.prerequisites,
      levelRequirement: this.levelRequirement,
      setsFlags: this.setsFlags,
      requiresFlags: this.requiresFlags,
    };
  }
}

/**
 * Quest Objective - A step in a quest
 */
export class QuestObjective {
  constructor(config = {}) {
    this.id = config.id || `obj_${Date.now()}`;
    this.type = config.type || 'kill';
    this.description = config.description || '';
    this.target = config.target || null;
    this.count = config.count || 1;
    this.location = config.location || null;
    this.optional = config.optional || false;
    this.hidden = config.hidden || false;
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      description: this.description,
      target: this.target,
      count: this.count,
      location: this.location,
      optional: this.optional,
      hidden: this.hidden,
    };
  }
}

// ============================================================================
// ASSET MANIFEST
// ============================================================================

/**
 * Asset Manifest - All assets needed for the campaign
 */
export class AssetManifest {
  constructor(config = {}) {
    this.assets = new Map();

    if (config.assets || Array.isArray(config)) {
      const assets = config.assets || config;
      for (const asset of assets) {
        this.addAsset(asset);
      }
    }

    // Track which assets use existing vs need generation
    this.existingAssets = new Set(config.existingAssets || []);
    this.generatedAssets = new Set(config.generatedAssets || []);
  }

  addAsset(assetConfig) {
    const asset = new AssetRequirement(assetConfig);
    this.assets.set(asset.id, asset);
    return asset;
  }

  getAsset(id) {
    return this.assets.get(id);
  }

  markAsExisting(id) {
    this.existingAssets.add(id);
    this.generatedAssets.delete(id);
  }

  markAsGenerated(id) {
    this.generatedAssets.add(id);
    this.existingAssets.delete(id);
  }

  /**
   * Get all assets that need generation
   */
  getAssetsNeedingGeneration() {
    const results = [];
    for (const asset of this.assets.values()) {
      if (!this.existingAssets.has(asset.id) && !this.generatedAssets.has(asset.id)) {
        results.push(asset);
      }
    }
    return results;
  }

  /**
   * Search assets by criteria
   */
  search(criteria = {}) {
    const results = [];
    for (const asset of this.assets.values()) {
      let matches = true;

      if (criteria.category && asset.category !== criteria.category) matches = false;
      if (criteria.type && asset.type !== criteria.type) matches = false;
      if (criteria.needsGeneration && this.existingAssets.has(asset.id)) matches = false;

      if (matches) results.push(asset);
    }
    return results;
  }

  toJSON() {
    return {
      assets: Array.from(this.assets.values()).map(a => a.toJSON()),
      existingAssets: Array.from(this.existingAssets),
      generatedAssets: Array.from(this.generatedAssets),
    };
  }
}

/**
 * Asset Requirement - A needed visual asset
 */
export class AssetRequirement {
  constructor(config = {}) {
    this.id = config.id || `asset_${Date.now()}`;
    this.name = config.name || 'Unknown Asset';
    this.category = config.category || ASSET_CATEGORIES.DECORATION;
    this.type = config.type || 'sprite';

    // Generation prompt for AI image generation
    this.generationPrompt = config.generationPrompt || '';

    // Technical requirements
    this.dimensions = {
      width: config.dimensions?.width || 64,
      height: config.dimensions?.height || 64,
      ...config.dimensions,
    };
    this.frameCount = config.frameCount || 1;
    this.animated = config.animated || false;
    this.palette = config.palette || 'default';

    // Fallback to existing asset
    this.fallbackAsset = config.fallbackAsset || null;

    // Reference images for style matching
    this.styleReference = config.styleReference || null;

    // Who/what uses this asset
    this.usedBy = config.usedBy || [];
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      category: this.category,
      type: this.type,
      generationPrompt: this.generationPrompt,
      dimensions: this.dimensions,
      frameCount: this.frameCount,
      animated: this.animated,
      palette: this.palette,
      fallbackAsset: this.fallbackAsset,
      styleReference: this.styleReference,
      usedBy: this.usedBy,
    };
  }
}

// ============================================================================
// COMPLETION CRITERIA
// ============================================================================

/**
 * Completion Criteria - What defines campaign victory
 */
export class CompletionCriteria {
  constructor(config = {}) {
    // Victory conditions (all must be met)
    this.victoryConditions = config.victoryConditions || [];

    // Optional bonus objectives
    this.bonusObjectives = config.bonusObjectives || [];

    // Ending variations based on choices/achievements
    this.endings = config.endings || [
      {
        id: 'default',
        name: 'Victory',
        description: 'The standard ending',
        conditions: [],
        narration: '',
        epilogue: '',
      },
    ];

    // What happens after completion
    this.postCompletion = {
      unlocks: config.postCompletion?.unlocks || [],
      newGamePlus: config.postCompletion?.newGamePlus || false,
      statistics: config.postCompletion?.statistics || true,
      ...config.postCompletion,
    };

    // Credits/acknowledgments
    this.credits = config.credits || {
      storyBy: '',
      designedBy: '',
      artBy: '',
      specialThanks: [],
    };
  }

  /**
   * Check if victory conditions are met
   */
  checkVictory(gameState) {
    for (const condition of this.victoryConditions) {
      if (!this.evaluateCondition(condition, gameState)) {
        return { victory: false, remaining: condition };
      }
    }
    return { victory: true };
  }

  /**
   * Evaluate a single condition
   */
  evaluateCondition(condition, gameState) {
    switch (condition.type) {
      case 'boss_defeated':
        return gameState.defeatedBosses?.includes(condition.target);
      case 'quest_completed':
        return gameState.completedQuests?.includes(condition.target);
      case 'item_collected':
        return gameState.inventory?.includes(condition.target);
      case 'flag_set':
        return gameState.flags?.[condition.target];
      case 'level_reached':
        return gameState.playerLevel >= condition.target;
      default:
        return false;
    }
  }

  /**
   * Determine which ending the player gets
   */
  determineEnding(gameState) {
    // Check endings in order, return first that matches
    for (const ending of this.endings) {
      if (ending.conditions.length === 0) continue; // Skip default for now
      const allMet = ending.conditions.every(c => this.evaluateCondition(c, gameState));
      if (allMet) return ending;
    }
    // Return default ending
    return this.endings.find(e => e.id === 'default') || this.endings[0];
  }

  toJSON() {
    return {
      victoryConditions: this.victoryConditions,
      bonusObjectives: this.bonusObjectives,
      endings: this.endings,
      postCompletion: this.postCompletion,
      credits: this.credits,
    };
  }
}

// ============================================================================
// BLUEPRINT BUILDER HELPERS
// ============================================================================

/**
 * Helper to create a standard Diablo-style campaign blueprint
 */
export function createStandardCampaignBlueprint(config = {}) {
  const blueprint = new CampaignBlueprint({
    name: config.name || 'Custom Campaign',
    settings: {
      difficulty: 'normal',
      playerClasses: ['warrior', 'rogue', 'sorcerer'],
      ...config.settings,
    },
  });

  // Set up standard 4-act structure
  const themes = ['cathedral', 'catacombs', 'caves', 'hell'];
  const actTitles = ['The Fallen Cathedral', 'The Forgotten Tombs', 'The Depths Below', 'The Gates of Hell'];

  for (let i = 0; i < 4; i++) {
    const theme = DUNGEON_THEMES[themes[i].toUpperCase()];
    blueprint.story.addAct({
      number: i + 1,
      title: actTitles[i],
      theme: themes[i],
      levelRange: theme.levelRange,
    });
  }

  return blueprint;
}

/**
 * Template for a complete story structure
 */
export const STORY_TEMPLATES = {
  CLASSIC_DIABLO: {
    premise: 'A great evil stirs beneath the cathedral of Tristram. Heroes must descend through increasingly hellish depths to confront the Lord of Terror himself.',
    acts: 4,
    chaptersPerAct: 4,
    themes: ['cathedral', 'catacombs', 'caves', 'hell'],
    bossProgression: ['skeleton_king', 'butcher', 'lazarus', 'diablo'],
  },

  SIEGE: {
    premise: 'The forces of Hell have laid siege to the last bastion of humanity. Push back the demonic hordes and strike at their source.',
    acts: 3,
    chaptersPerAct: 3,
    themes: ['outdoor', 'caves', 'hell'],
    bossProgression: ['siege_commander', 'pit_lord', 'arch_demon'],
  },

  CORRUPTION: {
    premise: 'A dark corruption spreads through the land, twisting nature and man alike. Discover its source and cleanse the world before all is lost.',
    acts: 4,
    chaptersPerAct: 3,
    themes: ['forest', 'swamp', 'ruins', 'void'],
    bossProgression: ['corrupted_guardian', 'swamp_witch', 'fallen_hero', 'corruption_incarnate'],
  },
};

// Export for easy access
export default {
  CampaignBlueprint,
  StoryStructure,
  Act,
  Chapter,
  Scene,
  WorldDefinition,
  Location,
  CharacterRoster,
  Character,
  ItemDatabase,
  Item,
  QuestDatabase,
  Quest,
  AssetManifest,
  AssetRequirement,
  CompletionCriteria,
  createStandardCampaignBlueprint,
  STRUCTURE_LEVELS,
  SCENE_TYPES,
  CHARACTER_ROLES,
  LOCATION_TYPES,
  DUNGEON_THEMES,
  ASSET_CATEGORIES,
  STORY_TEMPLATES,
};
