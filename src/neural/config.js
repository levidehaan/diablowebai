/**
 * Neural Augmentation Configuration
 *
 * Configuration for AI-driven enhancements to the Diablo Web engine.
 * Supports multiple AI providers and configurable generation parameters.
 */

const NeuralConfig = {
  // AI Provider Configuration
  provider: {
    // Primary AI endpoint (can be OpenAI, Anthropic, or custom)
    endpoint: process.env.REACT_APP_AI_ENDPOINT || 'https://api.openai.com/v1',
    apiKey: process.env.REACT_APP_AI_API_KEY || '',
    model: process.env.REACT_APP_AI_MODEL || 'gpt-4',

    // Fallback to local/mock generation when API unavailable
    useFallback: true,

    // Request timeout in milliseconds
    timeout: 30000,

    // Retry configuration
    maxRetries: 3,
    retryDelay: 1000,
  },

  // Level Generation Configuration
  levelGeneration: {
    enabled: true,

    // Grid dimensions (Diablo uses 40x40 for most levels)
    gridWidth: 40,
    gridHeight: 40,

    // Tile types for generation
    tileTypes: {
      FLOOR: 0,
      WALL: 1,
      DOOR: 2,
      STAIRS_UP: 3,
      STAIRS_DOWN: 4,
      SPECIAL: 5,
    },

    // Generation constraints
    constraints: {
      minRooms: 3,
      maxRooms: 8,
      minRoomSize: 4,
      maxRoomSize: 12,
      corridorWidth: 2,
      ensureConnectivity: true,
    },

    // Level themes by dungeon type
    themes: {
      1: 'Cathedral',      // DTYPE_CATHEDRAL
      2: 'Catacombs',      // DTYPE_CATACOMBS
      3: 'Caves',          // DTYPE_CAVES
      4: 'Hell',           // DTYPE_HELL
    },

    // Healing algorithm for fixing broken maps
    healing: {
      enabled: true,
      maxIterations: 100,
      carvePathWidth: 1,
    },
  },

  // Narrative Engine Configuration
  narrative: {
    enabled: true,

    // Context window for story continuity
    contextWindowSize: 10,

    // Maximum dialogue length
    maxDialogueLength: 256,

    // NPC personality profiles
    personalities: {
      OGDEN: {
        role: 'Tavern Owner',
        tone: 'friendly, concerned, helpful',
        knowledge: 'local gossip, town history, rumors from travelers',
      },
      GRISWOLD: {
        role: 'Blacksmith',
        tone: 'gruff, practical, business-minded',
        knowledge: 'weapons, armor, crafting, warrior tales',
      },
      PEPIN: {
        role: 'Healer',
        tone: 'gentle, scholarly, mystical',
        knowledge: 'medicine, ancient lore, magical afflictions',
      },
      CAIN: {
        role: 'Elder Sage',
        tone: 'wise, cryptic, knowledgeable',
        knowledge: 'ancient history, prophecies, demonic lore, the Horadrim',
      },
      ADRIA: {
        role: 'Witch',
        tone: 'mysterious, otherworldly, knowing',
        knowledge: 'dark magic, potions, occult secrets',
      },
      WIRT: {
        role: 'Boy Merchant',
        tone: 'sly, opportunistic, street-smart',
        knowledge: 'black market, rare items, survival',
      },
      FARNHAM: {
        role: 'Town Drunk',
        tone: 'slurred, traumatized, occasionally lucid',
        knowledge: 'fragmented memories of horror, warnings',
      },
      GILLIAN: {
        role: 'Barmaid',
        tone: 'kind, worried, gossipy',
        knowledge: 'Ogden, town happenings, rumors',
      },
    },

    // Quest generation parameters
    quests: {
      maxActiveQuests: 3,
      questTypes: ['KILL_MONSTER', 'FIND_ITEM', 'EXPLORE_AREA', 'RESCUE_NPC', 'BOSS_FIGHT'],
    },

    // Cache configuration
    cache: {
      enabled: true,
      maxEntries: 100,
      ttlSeconds: 3600,
    },
  },

  // Commander AI Configuration (NPC Behavior)
  commander: {
    enabled: true,

    // Update frequency (in game frames, 20fps)
    tacticalUpdateInterval: 60,   // Every 3 seconds
    strategicUpdateInterval: 200, // Every 10 seconds
    bossUpdateInterval: 30,       // Every 1.5 seconds for bosses

    // Squad configuration
    squads: {
      maxSquadSize: 6,
      formationTypes: ['LINE', 'WEDGE', 'FLANK', 'SURROUND', 'RETREAT'],
    },

    // Monster roles
    roles: {
      MELEE: { aggression: 0.8, rangePreference: 1 },
      RANGED: { aggression: 0.4, rangePreference: 8 },
      SUPPORT: { aggression: 0.2, rangePreference: 6 },
      BOSS: { aggression: 1.0, rangePreference: 3 },
    },

    // Boss personality overrides
    bosses: {
      BUTCHER: {
        personality: 'relentless pursuer',
        tactics: ['charge', 'cleave', 'intimidate'],
        retreatThreshold: 0.0, // Never retreats
      },
      SKELETON_KING: {
        personality: 'defensive commander',
        tactics: ['summon', 'curse', 'retreat_behind_minions'],
        retreatThreshold: 0.3,
      },
      LAZARUS: {
        personality: 'cunning manipulator',
        tactics: ['teleport', 'summon', 'curse', 'hide'],
        retreatThreshold: 0.5,
      },
      DIABLO: {
        personality: 'apocalyptic destroyer',
        tactics: ['fire_breath', 'lightning', 'charge', 'apocalypse'],
        retreatThreshold: 0.0,
      },
    },
  },

  // Asset Pipeline Configuration
  assets: {
    enabled: false, // Disabled by default - requires image generation API

    // Diablo palette (256 colors, simplified representation)
    palettePath: '/assets/palette.bin',

    // Supported sprite formats
    formats: ['CEL', 'CL2'],

    // Image generation settings
    imageGen: {
      endpoint: process.env.REACT_APP_IMAGE_GEN_ENDPOINT || '',
      style: 'dark fantasy, pixel art, 256 colors, diablo style',
      maxSize: 128,
    },
  },

  // Memory Management
  memory: {
    // Pointer refresh strategy
    refreshPointersOnGeneration: true,

    // Heap monitoring
    monitorHeapGrowth: true,
    heapWarningThreshold: 50 * 1024 * 1024, // 50MB

    // Cache limits
    levelCacheSize: 5,
    dialogueCacheSize: 100,
  },

  // Debug Configuration
  debug: {
    enabled: process.env.NODE_ENV !== 'production',
    logLevel: 'info', // 'debug', 'info', 'warn', 'error'
    visualizeAI: false,
    logAPIRequests: true,
    mockAPIResponses: true, // Use mock responses when no API key
  },
};

// Freeze configuration to prevent accidental modification
Object.freeze(NeuralConfig);
Object.freeze(NeuralConfig.provider);
Object.freeze(NeuralConfig.levelGeneration);
Object.freeze(NeuralConfig.narrative);
Object.freeze(NeuralConfig.commander);
Object.freeze(NeuralConfig.assets);
Object.freeze(NeuralConfig.memory);
Object.freeze(NeuralConfig.debug);

export default NeuralConfig;
