/**
 * Object Mapper
 *
 * Maps object names to Diablo 1 object IDs for placing items,
 * treasure, shrines, and interactive objects in DUN levels.
 *
 * Objects in Diablo are placed on the "objects" layer of DUN files
 * at 2x resolution (sub-tile coordinates).
 */

// Object type IDs based on Diablo 1 data
export const OBJECT_IDS = {
  // Containers
  barrel: 1,
  chest: 2,
  chest_large: 3,
  sarcophagus: 4,
  bookcase: 5,
  weapon_rack: 6,
  armor_stand: 7,
  skeleton: 8,
  crate: 9,
  pod: 10,

  // Shrines
  shrine_mysterious: 11,
  shrine_hidden: 12,
  shrine_gloomy: 13,
  shrine_weird: 14,
  shrine_magical: 15,
  shrine_stone: 16,
  shrine_religious: 17,
  shrine_enchanted: 18,
  shrine_thaumaturgic: 19,
  shrine_fascinating: 20,
  shrine_cryptic: 21,
  shrine_eldritch: 22,
  shrine_eerie: 23,
  shrine_divine: 24,
  shrine_holy: 25,
  shrine_sacred: 26,
  shrine_spiritual: 27,
  shrine_spooky: 28,
  shrine_abandoned: 29,
  shrine_creepy: 30,
  shrine_quiet: 31,
  shrine_secluded: 32,
  shrine_ornate: 33,
  shrine_glimmering: 34,
  shrine_tainted: 35,
  cauldron: 36,
  goat_shrine: 37,
  fountain_murky: 38,
  fountain_tears: 39,
  fountain_purifying: 40,

  // Quest Objects
  pedestal_staff: 41,
  altar: 42,
  bloody_cross: 43,
  arch_lava: 44,
  book_blind: 45,
  book_blood: 46,
  book_steel: 47,
  book_vileness: 48,
  decapitated_body: 49,
  candle: 50,
  lever: 51,
  door: 52,
  torch: 53,
  mushroom_patch: 54,

  // Light Sources
  brazier: 55,
  lamp: 56,
  fire_pit: 57,

  // Decorations
  cross: 58,
  tombstone: 59,
  pile_skulls: 60,
  pile_bones: 61,
  banner: 62,
  bloodfountain: 63,
  crucifix: 64,
};

// Alias map for common names
const OBJECT_ALIASES = {
  barrel: 'barrel',
  barrels: 'barrel',
  chest: 'chest',
  treasure: 'chest',
  loot: 'chest',
  bigchest: 'chest_large',
  large_chest: 'chest_large',
  coffin: 'sarcophagus',
  tomb: 'sarcophagus',
  books: 'bookcase',
  weapons: 'weapon_rack',
  armor: 'armor_stand',
  corpse: 'skeleton',
  dead: 'skeleton',
  bones: 'skeleton',
  box: 'crate',
  shrine: 'shrine_mysterious',
  well: 'fountain_murky',
  fountain: 'fountain_murky',
  light: 'brazier',
  fire: 'fire_pit',
  torch: 'torch',
  candle: 'candle',
  door: 'door',
  switch: 'lever',
  mushroom: 'mushroom_patch',
  shroom: 'mushroom_patch',
};

// Objects appropriate for each theme
const THEME_OBJECTS = {
  cathedral: [
    'barrel', 'chest', 'bookcase', 'skeleton', 'sarcophagus',
    'shrine_mysterious', 'shrine_hidden', 'shrine_religious',
    'altar', 'brazier', 'torch', 'candle', 'cross',
    'tombstone', 'crucifix', 'fountain_purifying',
  ],
  catacombs: [
    'barrel', 'chest', 'chest_large', 'skeleton', 'sarcophagus',
    'shrine_gloomy', 'shrine_cryptic', 'shrine_eerie',
    'brazier', 'torch', 'pile_skulls', 'pile_bones',
    'bloody_cross', 'decapitated_body', 'bloodfountain',
  ],
  caves: [
    'barrel', 'chest', 'crate', 'pod', 'skeleton',
    'shrine_weird', 'shrine_stone', 'shrine_quiet',
    'cauldron', 'mushroom_patch', 'fire_pit',
    'fountain_murky', 'pile_bones',
  ],
  hell: [
    'chest', 'chest_large', 'sarcophagus', 'skeleton',
    'shrine_tainted', 'shrine_eldritch', 'shrine_ornate',
    'goat_shrine', 'cauldron', 'arch_lava', 'brazier',
    'bloodfountain', 'pile_skulls', 'crucifix', 'banner',
  ],
};

// Loot categories for treasure placement
const LOOT_TYPES = {
  common: ['barrel', 'crate', 'skeleton', 'pile_bones'],
  uncommon: ['chest', 'weapon_rack', 'armor_stand', 'bookcase'],
  rare: ['chest_large', 'sarcophagus', 'pod'],
  shrine: [
    'shrine_mysterious', 'shrine_hidden', 'shrine_gloomy', 'shrine_weird',
    'shrine_magical', 'shrine_stone', 'shrine_religious', 'shrine_enchanted',
    'shrine_thaumaturgic', 'shrine_fascinating', 'shrine_cryptic',
    'shrine_eldritch', 'shrine_eerie', 'shrine_divine', 'shrine_holy',
    'shrine_sacred', 'shrine_spiritual', 'shrine_spooky', 'shrine_abandoned',
    'shrine_creepy', 'shrine_quiet', 'shrine_secluded', 'shrine_ornate',
    'shrine_glimmering', 'shrine_tainted',
  ],
  fountain: ['fountain_murky', 'fountain_tears', 'fountain_purifying', 'cauldron'],
  decoration: ['torch', 'brazier', 'candle', 'cross', 'tombstone', 'banner'],
};

/**
 * Get object ID from name
 * @param {string} name - Object name or alias
 * @returns {number|null} Object ID or null if not found
 */
export function getObjectId(name) {
  const normalizedName = name.toLowerCase().replace(/[\s-]/g, '_');

  // Check direct ID
  if (OBJECT_IDS[normalizedName]) {
    return OBJECT_IDS[normalizedName];
  }

  // Check aliases
  if (OBJECT_ALIASES[normalizedName]) {
    return OBJECT_IDS[OBJECT_ALIASES[normalizedName]];
  }

  return null;
}

/**
 * Get object name from ID
 * @param {number} id - Object ID
 * @returns {string|null} Object name or null
 */
export function getObjectName(id) {
  for (const [name, objId] of Object.entries(OBJECT_IDS)) {
    if (objId === id) return name;
  }
  return null;
}

/**
 * Get objects appropriate for a theme
 * @param {string} theme - Theme name
 * @returns {Array} Array of object names
 */
export function getObjectsForTheme(theme) {
  return THEME_OBJECTS[theme] || THEME_OBJECTS.cathedral;
}

/**
 * Get objects by loot category
 * @param {string} category - common, uncommon, rare, shrine, fountain, decoration
 * @returns {Array} Array of object names
 */
export function getObjectsByCategory(category) {
  return LOOT_TYPES[category] || [];
}

/**
 * Get all available categories
 * @returns {Array} Category names
 */
export function getCategories() {
  return Object.keys(LOOT_TYPES);
}

/**
 * Convert placement requests to object IDs
 * @param {Array} placements - Array of {x, y, type} objects
 * @param {string} theme - Current theme for validation
 * @returns {Array} Array of {x, y, objectId} objects
 */
export function convertPlacements(placements, theme = 'cathedral') {
  const themeObjects = getObjectsForTheme(theme);
  const result = [];

  for (const placement of placements) {
    const { x, y, type } = placement;
    let objectId = null;

    // Try to get object ID
    objectId = getObjectId(type);

    if (objectId === null) {
      // If type is a category, pick a random object from it
      const categoryObjects = getObjectsByCategory(type);
      if (categoryObjects.length > 0) {
        const randomObj = categoryObjects[Math.floor(Math.random() * categoryObjects.length)];
        objectId = OBJECT_IDS[randomObj];
      }
    }

    if (objectId === null) {
      // Default to barrel for unknown types
      console.warn(`[ObjectMapper] Unknown object type: ${type}, defaulting to barrel`);
      objectId = OBJECT_IDS.barrel;
    }

    result.push({ x, y, objectId, originalType: type });
  }

  return result;
}

/**
 * Generate treasure placements based on room positions
 * @param {Array} rooms - Array of {x, y, width, height} rooms
 * @param {string} theme - Level theme
 * @param {Object} options - Generation options
 * @returns {Array} Array of object placements
 */
export function generateTreasurePlacements(rooms, theme = 'cathedral', options = {}) {
  const {
    density = 0.3,
    shrineChance = 0.1,
    chestChance = 0.2,
    decorationChance = 0.4,
    seed = Date.now(),
  } = options;

  const themeObjects = getObjectsForTheme(theme);
  const placements = [];

  // Simple seeded random
  let rng = seed;
  const random = () => {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return rng / 0x7fffffff;
  };

  for (const room of rooms) {
    const area = room.width * room.height;
    const numObjects = Math.max(1, Math.floor(area * density * random()));

    for (let i = 0; i < numObjects; i++) {
      const x = room.x + 1 + Math.floor(random() * (room.width - 2));
      const y = room.y + 1 + Math.floor(random() * (room.height - 2));

      let type;
      const roll = random();

      if (roll < shrineChance) {
        // Place shrine or fountain
        const shrines = LOOT_TYPES.shrine.filter(s =>
          themeObjects.includes(s)
        );
        type = shrines.length > 0
          ? shrines[Math.floor(random() * shrines.length)]
          : 'shrine_mysterious';
      } else if (roll < shrineChance + chestChance) {
        // Place chest
        type = random() < 0.3 ? 'chest_large' : 'chest';
      } else if (roll < shrineChance + chestChance + decorationChance) {
        // Place decoration
        const decorations = LOOT_TYPES.decoration.filter(d =>
          themeObjects.includes(d)
        );
        type = decorations.length > 0
          ? decorations[Math.floor(random() * decorations.length)]
          : 'torch';
      } else {
        // Place common loot container
        const common = LOOT_TYPES.common.filter(c =>
          themeObjects.includes(c)
        );
        type = common.length > 0
          ? common[Math.floor(random() * common.length)]
          : 'barrel';
      }

      placements.push({ x, y, type });
    }
  }

  return placements;
}

/**
 * Get summary of all object types
 * @returns {Object} Object types organized by category
 */
export function getObjectSummary() {
  return {
    containers: ['barrel', 'chest', 'chest_large', 'sarcophagus', 'bookcase',
                 'weapon_rack', 'armor_stand', 'skeleton', 'crate', 'pod'],
    shrines: Object.keys(OBJECT_IDS).filter(k => k.startsWith('shrine_')),
    fountains: ['cauldron', 'fountain_murky', 'fountain_tears', 'fountain_purifying'],
    quest: ['pedestal_staff', 'altar', 'book_blind', 'book_blood', 'book_steel',
            'book_vileness', 'lever', 'door', 'mushroom_patch'],
    decoration: ['brazier', 'lamp', 'fire_pit', 'cross', 'tombstone',
                 'pile_skulls', 'pile_bones', 'banner', 'crucifix', 'torch', 'candle'],
  };
}

// Default export
const ObjectMapper = {
  OBJECT_IDS,
  getObjectId,
  getObjectName,
  getObjectsForTheme,
  getObjectsByCategory,
  getCategories,
  convertPlacements,
  generateTreasurePlacements,
  getObjectSummary,
};

export default ObjectMapper;
