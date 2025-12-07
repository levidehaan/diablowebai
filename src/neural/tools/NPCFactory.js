/**
 * NPCFactory - High-Level Tool for AI NPC Creation
 *
 * Maps AI-generated NPCs to Diablo's 13 hardcoded towner types.
 * Provides abstraction for:
 *   - Mapping NPC roles to game types
 *   - Managing NPC placements
 *   - Dialogue configuration
 *   - Shop/service configuration
 *
 * IMPORTANT: Diablo has exactly 13 towner types:
 * TOWN_SMITH, TOWN_HEALER, TOWN_DEADGUY, TOWN_TAVERN, TOWN_STORY,
 * TOWN_DRUNK, TOWN_WITCH, TOWN_BMAID, TOWN_PEGBOY, TOWN_COW,
 * TOWN_FARMER, TOWN_GIRL, TOWN_COWFARM
 */

// Towner type IDs from the game
export const NPC_TYPES = {
  SMITH: 0,      // Blacksmith (Griswold)
  HEALER: 1,     // Healer (Pepin)
  DEADGUY: 2,    // Dead guy / corpse
  TAVERN: 3,     // Tavern owner (Ogden)
  STORY: 4,      // Storyteller (Deckard Cain)
  DRUNK: 5,      // Town drunk (Farnham)
  WITCH: 6,      // Witch (Adria)
  BMAID: 7,      // Barmaid (Gillian)
  PEGBOY: 8,     // Peg-legged boy (Wirt)
  COW: 9,        // Cow (moo)
  FARMER: 10,    // Farmer (Lester)
  GIRL: 11,      // Little girl (Celia)
  COWFARM: 12,   // Cow farmer (Complete Nut)
};

// Role to type mappings - AI-friendly role names
export const ROLE_MAPPINGS = {
  // Combat/Equipment NPCs
  blacksmith: NPC_TYPES.SMITH,
  armorer: NPC_TYPES.SMITH,
  weaponsmith: NPC_TYPES.SMITH,

  // Magic/Healing NPCs
  healer: NPC_TYPES.HEALER,
  doctor: NPC_TYPES.HEALER,
  priest: NPC_TYPES.HEALER,
  cleric: NPC_TYPES.HEALER,

  // Magic item NPCs
  witch: NPC_TYPES.WITCH,
  mage: NPC_TYPES.WITCH,
  enchanter: NPC_TYPES.WITCH,
  alchemist: NPC_TYPES.WITCH,
  sorceress: NPC_TYPES.WITCH,

  // Story/Quest NPCs
  elder: NPC_TYPES.STORY,
  sage: NPC_TYPES.STORY,
  scholar: NPC_TYPES.STORY,
  lorekeeper: NPC_TYPES.STORY,
  historian: NPC_TYPES.STORY,

  // Tavern/Social NPCs
  innkeeper: NPC_TYPES.TAVERN,
  tavernkeeper: NPC_TYPES.TAVERN,
  bartender: NPC_TYPES.TAVERN,

  barmaid: NPC_TYPES.BMAID,
  waitress: NPC_TYPES.BMAID,
  servant: NPC_TYPES.BMAID,

  drunk: NPC_TYPES.DRUNK,
  veteran: NPC_TYPES.DRUNK,
  survivor: NPC_TYPES.DRUNK,

  // Merchant NPCs
  merchant: NPC_TYPES.PEGBOY,
  trader: NPC_TYPES.PEGBOY,
  peddler: NPC_TYPES.PEGBOY,
  vendor: NPC_TYPES.PEGBOY,

  // Rural/Farm NPCs
  farmer: NPC_TYPES.FARMER,
  peasant: NPC_TYPES.FARMER,
  villager: NPC_TYPES.FARMER,

  girl: NPC_TYPES.GIRL,
  child: NPC_TYPES.GIRL,
  orphan: NPC_TYPES.GIRL,

  rancher: NPC_TYPES.COWFARM,
  herder: NPC_TYPES.COWFARM,

  // Special
  corpse: NPC_TYPES.DEADGUY,
  body: NPC_TYPES.DEADGUY,
  victim: NPC_TYPES.DEADGUY,

  cow: NPC_TYPES.COW,
  animal: NPC_TYPES.COW,
};

// NPC service types
export const SERVICE_TYPES = {
  SHOP_WEAPONS: 'shop_weapons',
  SHOP_ARMOR: 'shop_armor',
  SHOP_MAGIC: 'shop_magic',
  HEALING: 'healing',
  IDENTIFY: 'identify',
  QUEST_GIVER: 'quest_giver',
  LORE: 'lore',
  GOSSIP: 'gossip',
  NONE: 'none',
};

/**
 * NPCFactory class
 */
export class NPCFactory {
  constructor() {
    this.npcs = [];
    this.typeUsage = new Map();

    // Initialize type usage tracking
    for (const type of Object.values(NPC_TYPES)) {
      this.typeUsage.set(type, 0);
    }
  }

  /**
   * Create an NPC from AI specification
   * @param {object} spec - NPC specification
   * @returns {object} NPC configuration for game
   */
  createNPC(spec) {
    const {
      id,
      name,
      role,
      position,
      dialogue = {},
      services = [],
      questGiver = false,
      questId = null,
    } = spec;

    // Map role to game type
    const typeId = this.mapRoleToType(role);

    // Track usage
    const usageCount = this.typeUsage.get(typeId) || 0;
    this.typeUsage.set(typeId, usageCount + 1);

    // Create NPC object
    const npc = {
      id: id || `npc_${this.npcs.length}`,
      name: name || this.getDefaultName(role, typeId),
      typeId,
      role,
      position: position || { x: 25, y: 29 },

      // Dialogue configuration
      dialogue: this.normalizeDialogue(dialogue),

      // Services this NPC provides
      services: this.normalizeServices(services, typeId),

      // Quest configuration
      questGiver,
      questId,

      // For runtime tracking
      interactionCount: 0,
    };

    this.npcs.push(npc);
    return npc;
  }

  /**
   * Map a role string to NPC type ID
   */
  mapRoleToType(role) {
    if (typeof role === 'number') {
      return role; // Already a type ID
    }

    const normalizedRole = role.toLowerCase().trim();
    const mappedType = ROLE_MAPPINGS[normalizedRole];

    if (mappedType !== undefined) {
      return mappedType;
    }

    // Fuzzy matching for unknown roles
    for (const [key, type] of Object.entries(ROLE_MAPPINGS)) {
      if (normalizedRole.includes(key) || key.includes(normalizedRole)) {
        return type;
      }
    }

    // Default to story teller for unknown roles
    console.warn(`Unknown NPC role: ${role}, defaulting to STORY type`);
    return NPC_TYPES.STORY;
  }

  /**
   * Get default name for a role/type
   */
  getDefaultName(role, typeId) {
    const defaultNames = {
      [NPC_TYPES.SMITH]: 'The Blacksmith',
      [NPC_TYPES.HEALER]: 'The Healer',
      [NPC_TYPES.TAVERN]: 'The Innkeeper',
      [NPC_TYPES.STORY]: 'The Elder',
      [NPC_TYPES.DRUNK]: 'The Drunk',
      [NPC_TYPES.WITCH]: 'The Witch',
      [NPC_TYPES.BMAID]: 'The Barmaid',
      [NPC_TYPES.PEGBOY]: 'The Merchant',
      [NPC_TYPES.FARMER]: 'The Farmer',
      [NPC_TYPES.GIRL]: 'The Child',
      [NPC_TYPES.COWFARM]: 'The Rancher',
      [NPC_TYPES.DEADGUY]: 'Corpse',
      [NPC_TYPES.COW]: 'Cow',
    };

    return defaultNames[typeId] || role || 'Stranger';
  }

  /**
   * Normalize dialogue configuration
   */
  normalizeDialogue(dialogue) {
    const normalized = {
      greeting: dialogue.greeting || dialogue.intro || 'Well met, traveler.',
      farewell: dialogue.farewell || dialogue.goodbye || 'Safe travels.',
      gossip: dialogue.gossip || [],
      questIntro: dialogue.questIntro || dialogue.quest_intro || null,
      questProgress: dialogue.questProgress || dialogue.quest_progress || null,
      questComplete: dialogue.questComplete || dialogue.quest_complete || null,
    };

    // Ensure gossip is array
    if (typeof normalized.gossip === 'string') {
      normalized.gossip = [normalized.gossip];
    }

    return normalized;
  }

  /**
   * Normalize services based on NPC type
   */
  normalizeServices(services, typeId) {
    if (services.length > 0) {
      return services;
    }

    // Default services based on type
    const defaultServices = {
      [NPC_TYPES.SMITH]: [SERVICE_TYPES.SHOP_WEAPONS, SERVICE_TYPES.SHOP_ARMOR],
      [NPC_TYPES.HEALER]: [SERVICE_TYPES.HEALING],
      [NPC_TYPES.WITCH]: [SERVICE_TYPES.SHOP_MAGIC, SERVICE_TYPES.IDENTIFY],
      [NPC_TYPES.STORY]: [SERVICE_TYPES.IDENTIFY, SERVICE_TYPES.LORE],
      [NPC_TYPES.TAVERN]: [SERVICE_TYPES.GOSSIP],
      [NPC_TYPES.PEGBOY]: [SERVICE_TYPES.SHOP_MAGIC],
      [NPC_TYPES.DRUNK]: [SERVICE_TYPES.GOSSIP],
      [NPC_TYPES.BMAID]: [SERVICE_TYPES.GOSSIP],
      [NPC_TYPES.FARMER]: [SERVICE_TYPES.GOSSIP],
      [NPC_TYPES.GIRL]: [SERVICE_TYPES.GOSSIP],
      [NPC_TYPES.COWFARM]: [SERVICE_TYPES.GOSSIP],
    };

    return defaultServices[typeId] || [SERVICE_TYPES.NONE];
  }

  /**
   * Create a standard town NPC set
   * @param {object} options - Town configuration
   * @returns {Array} Array of NPCs
   */
  createTownNPCs(options = {}) {
    const {
      centerPosition = { x: 20, y: 20 },
      includeShops = true,
      includeQuestGivers = true,
      theme = 'medieval',
    } = options;

    const npcs = [];

    if (includeShops) {
      // Blacksmith
      npcs.push(
        this.createNPC({
          role: 'blacksmith',
          name: this.getThemedName('blacksmith', theme),
          position: { x: centerPosition.x - 8, y: centerPosition.y - 5 },
          dialogue: {
            greeting: 'Looking for equipment? I forge the finest weapons in the land.',
            gossip: ['Strange creatures have been spotted near the old ruins.'],
          },
        })
      );

      // Healer
      npcs.push(
        this.createNPC({
          role: 'healer',
          name: this.getThemedName('healer', theme),
          position: { x: centerPosition.x + 8, y: centerPosition.y - 5 },
          dialogue: {
            greeting: 'Are you injured? Let me tend to your wounds.',
            gossip: ['Many adventurers have fallen to the evil below.'],
          },
        })
      );

      // Witch/Magic vendor
      npcs.push(
        this.createNPC({
          role: 'witch',
          name: this.getThemedName('witch', theme),
          position: { x: centerPosition.x - 10, y: centerPosition.y + 8 },
          dialogue: {
            greeting: 'The spirits whisper of your arrival...',
            gossip: ['Dark magic grows stronger each day.'],
          },
        })
      );
    }

    if (includeQuestGivers) {
      // Elder/Quest giver
      npcs.push(
        this.createNPC({
          role: 'elder',
          name: this.getThemedName('elder', theme),
          position: { x: centerPosition.x, y: centerPosition.y - 3 },
          questGiver: true,
          dialogue: {
            greeting: 'Ah, a brave soul. We have need of your skills.',
            questIntro: 'A great evil threatens our land. Will you help us?',
          },
        })
      );
    }

    // Innkeeper
    npcs.push(
      this.createNPC({
        role: 'innkeeper',
        name: this.getThemedName('innkeeper', theme),
        position: { x: centerPosition.x + 5, y: centerPosition.y + 5 },
        dialogue: {
          greeting: 'Welcome to my establishment! Rest your weary bones.',
          gossip: ['Travelers speak of terrors in the depths.'],
        },
      })
    );

    return npcs;
  }

  /**
   * Get themed name for NPC role
   */
  getThemedName(role, theme) {
    const themedNames = {
      medieval: {
        blacksmith: 'Aldric the Smith',
        healer: 'Brother Marcus',
        witch: 'Morgana',
        elder: 'Elder Theron',
        innkeeper: 'Bartholomew',
      },
      horror: {
        blacksmith: 'The Masked Smith',
        healer: 'Dr. Graves',
        witch: 'The Crone',
        elder: 'The Keeper',
        innkeeper: 'The Host',
      },
      frost: {
        blacksmith: 'Bjorn Ironforge',
        healer: 'Healer Frost',
        witch: 'The Ice Witch',
        elder: 'Elder Winterborn',
        innkeeper: 'Ingrid',
      },
      desert: {
        blacksmith: 'Rashid the Forger',
        healer: 'Sage Amara',
        witch: 'The Sand Seer',
        elder: 'Elder Khalid',
        innkeeper: 'Hassan',
      },
    };

    const themeNames = themedNames[theme] || themedNames.medieval;
    return themeNames[role] || this.getDefaultName(role, this.mapRoleToType(role));
  }

  /**
   * Get placement commands for WhiteBoxAPI
   */
  getPlacementCommands() {
    // Note: NPCs are placed differently than monsters
    // We use the towner system which is more limited
    // This returns commands for the NeuralGameController to interpret
    return this.npcs.map((npc) => ({
      type: 'place_npc',
      npc: {
        typeId: npc.typeId,
        x: npc.position.x,
        y: npc.position.y,
        name: npc.name,
      },
    }));
  }

  /**
   * Export all NPCs
   */
  exportAll() {
    return this.npcs.map((npc) => ({
      ...npc,
      // Include game-ready format
      gameFormat: {
        typeId: npc.typeId,
        x: npc.position.x,
        y: npc.position.y,
      },
    }));
  }

  /**
   * Get usage summary
   */
  getSummary() {
    const usage = [];
    for (const [typeId, count] of this.typeUsage) {
      if (count > 0) {
        const typeName = Object.entries(NPC_TYPES).find(([, id]) => id === typeId)?.[0];
        usage.push({ type: typeName, typeId, count });
      }
    }

    return {
      totalNPCs: this.npcs.length,
      uniqueTypes: usage.length,
      typeUsage: usage,
      maxPerType: 13, // Diablo limit
    };
  }

  /**
   * Reset factory
   */
  reset() {
    this.npcs = [];
    for (const type of Object.values(NPC_TYPES)) {
      this.typeUsage.set(type, 0);
    }
  }
}

export default NPCFactory;
