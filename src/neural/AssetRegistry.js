/**
 * Asset Registry
 *
 * A comprehensive searchable database of all game assets available
 * for campaign creation. Includes monsters, NPCs, items, tiles,
 * objects, structures, and UI elements.
 *
 * This registry enables AI to:
 * 1. Search for appropriate assets by criteria
 * 2. Know what's available for placement
 * 3. Identify what needs custom generation
 * 4. Map story elements to game entities
 */

// ============================================================================
// MONSTER REGISTRY
// ============================================================================

/**
 * Complete monster database with metadata
 */
export const MONSTER_REGISTRY = {
  // Undead - Cathedral
  zombie: {
    id: 1,
    name: 'Zombie',
    category: 'undead',
    difficulty: 1,
    levelRange: [1, 4],
    themes: ['cathedral', 'catacombs'],
    behavior: 'slow_melee',
    description: 'Shambling corpse risen from death',
    tags: ['undead', 'slow', 'melee', 'common'],
    variants: ['ghoul', 'rotting_carcass', 'black_death'],
    drops: ['gold', 'potion_minor'],
    sprite: 'monsters/zombie.cel',
  },
  skeleton: {
    id: 33,
    name: 'Skeleton',
    category: 'undead',
    difficulty: 2,
    levelRange: [1, 8],
    themes: ['cathedral', 'catacombs'],
    behavior: 'melee',
    description: 'Animated bones wielding rusted weapons',
    tags: ['undead', 'melee', 'common'],
    variants: ['corpse_axe', 'burning_dead', 'horror'],
    drops: ['gold', 'sword_rusty', 'shield_buckler'],
    sprite: 'monsters/skeleton.cel',
  },
  skeleton_archer: {
    id: 37,
    name: 'Skeleton Archer',
    category: 'undead',
    difficulty: 2,
    levelRange: [2, 8],
    themes: ['cathedral', 'catacombs'],
    behavior: 'ranged',
    description: 'Skeletal warriors firing bone arrows',
    tags: ['undead', 'ranged', 'common'],
    variants: ['corpse_bow', 'burning_dead_archer', 'horror_archer'],
    drops: ['gold', 'arrows', 'bow_short'],
    sprite: 'monsters/skeleton_archer.cel',
  },

  // Fallen Ones
  fallen: {
    id: 17,
    name: 'Fallen One',
    category: 'demon',
    difficulty: 1,
    levelRange: [1, 4],
    themes: ['cathedral'],
    behavior: 'pack_melee',
    description: 'Small demonic imps that attack in groups',
    tags: ['demon', 'melee', 'pack', 'common', 'small'],
    variants: ['carver', 'devil_kin', 'dark_one'],
    drops: ['gold', 'club'],
    sprite: 'monsters/fallen.cel',
  },
  fallen_shaman: {
    id: 21,
    name: 'Fallen Shaman',
    category: 'demon',
    difficulty: 3,
    levelRange: [2, 6],
    themes: ['cathedral', 'caves'],
    behavior: 'caster_resurrect',
    description: 'Fallen leaders that resurrect their kin',
    tags: ['demon', 'caster', 'resurrect', 'leader'],
    variants: ['carver_shaman', 'devilkin_shaman', 'darkone_shaman'],
    drops: ['gold', 'staff', 'scroll'],
    sprite: 'monsters/fallen_shaman.cel',
  },

  // Scavengers
  scavenger: {
    id: 49,
    name: 'Scavenger',
    category: 'beast',
    difficulty: 2,
    levelRange: [1, 6],
    themes: ['cathedral', 'catacombs'],
    behavior: 'fast_melee',
    description: 'Four-legged beasts that feast on corpses',
    tags: ['beast', 'melee', 'fast', 'common'],
    variants: ['plague_eater', 'shadow_beast', 'bone_gasher'],
    drops: ['gold', 'meat'],
    sprite: 'monsters/scavenger.cel',
  },

  // Goat Men
  flesh_clan: {
    id: 81,
    name: 'Goat Man',
    category: 'demon',
    difficulty: 4,
    levelRange: [5, 10],
    themes: ['catacombs', 'caves'],
    behavior: 'melee_charge',
    description: 'Demonic goat-headed warriors',
    tags: ['demon', 'melee', 'medium'],
    variants: ['stone_clan', 'fire_clan', 'night_clan'],
    drops: ['gold', 'axe', 'armor_leather'],
    sprite: 'monsters/goatman.cel',
  },
  flesh_clan_archer: {
    id: 85,
    name: 'Goat Archer',
    category: 'demon',
    difficulty: 4,
    levelRange: [5, 10],
    themes: ['catacombs', 'caves'],
    behavior: 'ranged_mobile',
    description: 'Goat warriors with deadly bows',
    tags: ['demon', 'ranged', 'medium'],
    variants: ['stone_clan_archer', 'fire_clan_archer', 'night_clan_archer'],
    drops: ['gold', 'bow', 'arrows'],
    sprite: 'monsters/goatman_archer.cel',
  },

  // Flying Enemies
  fiend: {
    id: 65,
    name: 'Fiend',
    category: 'demon',
    difficulty: 5,
    levelRange: [9, 14],
    themes: ['caves', 'hell'],
    behavior: 'flying_dive',
    description: 'Winged demons that swoop down on prey',
    tags: ['demon', 'flying', 'melee'],
    variants: ['blink', 'gloom', 'familiar'],
    drops: ['gold', 'jewelry'],
    sprite: 'monsters/fiend.cel',
  },

  // Hidden/Stealth
  hidden: {
    id: 97,
    name: 'Hidden',
    category: 'demon',
    difficulty: 6,
    levelRange: [9, 14],
    themes: ['caves', 'hell'],
    behavior: 'invisible_ambush',
    description: 'Invisible demons that ambush unwary travelers',
    tags: ['demon', 'stealth', 'ambush'],
    variants: ['stalker', 'unseen', 'illusion_weaver'],
    drops: ['gold', 'ring_invisibility'],
    sprite: 'monsters/hidden.cel',
  },

  // Hell Demons
  advocate: {
    id: 105,
    name: 'Advocate',
    category: 'demon',
    difficulty: 8,
    levelRange: [13, 16],
    themes: ['hell'],
    behavior: 'caster_summon',
    description: 'Demonic sorcerers who serve the Prime Evils',
    tags: ['demon', 'caster', 'summoner', 'elite'],
    variants: ['magistrate', 'cabalist', 'counselor'],
    drops: ['gold', 'staff_rare', 'tome'],
    sprite: 'monsters/advocate.cel',
  },
  balrog: {
    id: 109,
    name: 'Balrog',
    category: 'demon',
    difficulty: 9,
    levelRange: [14, 16],
    themes: ['hell'],
    behavior: 'heavy_melee',
    description: 'Massive flame-wreathed demons',
    tags: ['demon', 'melee', 'fire', 'elite', 'large'],
    variants: ['slayer', 'guardian', 'vortex_lord'],
    drops: ['gold', 'sword_rare', 'armor_plate'],
    sprite: 'monsters/balrog.cel',
  },

  // BOSSES
  skeleton_king: {
    id: 101,
    name: 'Skeleton King',
    category: 'boss',
    difficulty: 10,
    levelRange: [3, 4],
    themes: ['cathedral'],
    behavior: 'boss_melee',
    description: 'King Leoric, the mad king of Tristram',
    tags: ['boss', 'undead', 'unique', 'story'],
    variants: [],
    drops: ['undead_crown', 'gold_large'],
    sprite: 'monsters/skeleton_king.cel',
    bossData: {
      title: 'The Skeleton King',
      health: 500,
      phases: 1,
      abilities: ['summon_skeletons', 'charge'],
      introDialogue: 'The warmth of life has entered my tomb. Prepare to face the darkness!',
      defeatDialogue: 'Release me... from this... prison...',
    },
  },
  butcher: {
    id: 102,
    name: 'The Butcher',
    category: 'boss',
    difficulty: 12,
    levelRange: [2, 3],
    themes: ['cathedral'],
    behavior: 'boss_berserk',
    description: 'A massive demon that butchers all who enter his lair',
    tags: ['boss', 'demon', 'unique', 'story'],
    variants: [],
    drops: ['butchers_cleaver', 'gold_large'],
    sprite: 'monsters/butcher.cel',
    bossData: {
      title: 'The Butcher',
      health: 400,
      phases: 1,
      abilities: ['charge', 'cleave'],
      introDialogue: 'Ah, fresh meat!',
      defeatDialogue: '*Death gurgle*',
    },
  },
  lazarus: {
    id: 108,
    name: 'Archbishop Lazarus',
    category: 'boss',
    difficulty: 15,
    levelRange: [15, 15],
    themes: ['hell'],
    behavior: 'boss_caster',
    description: 'The traitorous archbishop who freed Diablo',
    tags: ['boss', 'human', 'unique', 'story', 'caster'],
    variants: [],
    drops: ['lazarus_staff', 'gold_large'],
    sprite: 'monsters/lazarus.cel',
    bossData: {
      title: 'Archbishop Lazarus',
      health: 800,
      phases: 2,
      abilities: ['teleport', 'fireball', 'summon_succubi'],
      introDialogue: 'Abandon your foolish quest! All that awaits you is the wrath of my master!',
      defeatDialogue: 'You shall never stop our master...',
    },
  },
  diablo: {
    id: 107,
    name: 'Diablo',
    category: 'boss',
    difficulty: 20,
    levelRange: [16, 16],
    themes: ['hell'],
    behavior: 'boss_final',
    description: 'The Lord of Terror himself',
    tags: ['boss', 'demon', 'unique', 'story', 'final_boss', 'prime_evil'],
    variants: [],
    drops: ['hellfire_ring', 'gold_massive'],
    sprite: 'monsters/diablo.cel',
    bossData: {
      title: 'Diablo, Lord of Terror',
      health: 2000,
      phases: 3,
      abilities: ['apocalypse', 'bone_prison', 'lightning_breath', 'charge'],
      introDialogue: 'Not even death can save you from me!',
      defeatDialogue: 'My brothers will avenge me...',
    },
  },
};

// ============================================================================
// NPC REGISTRY
// ============================================================================

/**
 * All friendly/neutral NPCs
 */
export const NPC_REGISTRY = {
  cain: {
    id: 'cain',
    name: 'Deckard Cain',
    title: 'The Last Horadrim',
    role: 'mentor',
    location: 'town',
    description: 'An elderly scholar who identifies items and provides guidance',
    tags: ['quest_giver', 'identifier', 'lore', 'story'],
    services: ['identify', 'lore'],
    personality: {
      traits: ['wise', 'patient', 'scholarly'],
      speechStyle: 'formal_ancient',
    },
    dialogue: {
      greeting: 'Stay awhile and listen...',
      farewell: 'Good luck, hero. May the Light guide you.',
    },
    sprite: 'npcs/cain.cel',
    portrait: 'portraits/cain.cel',
  },
  griswold: {
    id: 'griswold',
    name: 'Griswold',
    title: 'The Blacksmith',
    role: 'merchant',
    location: 'town',
    description: 'A burly blacksmith who sells weapons and armor',
    tags: ['merchant', 'weapons', 'armor', 'repair'],
    services: ['buy', 'sell', 'repair'],
    inventory: ['weapons', 'armor', 'shields'],
    personality: {
      traits: ['gruff', 'honest', 'hardworking'],
      speechStyle: 'casual_rough',
    },
    dialogue: {
      greeting: 'What can I do for ya?',
      farewell: 'Take care out there.',
    },
    sprite: 'npcs/griswold.cel',
    portrait: 'portraits/griswold.cel',
  },
  pepin: {
    id: 'pepin',
    name: 'Pepin',
    title: 'The Healer',
    role: 'healer',
    location: 'town',
    description: 'A kind healer who tends to the wounded',
    tags: ['healer', 'quest_giver'],
    services: ['heal', 'buy_potions'],
    inventory: ['potions', 'scrolls_healing'],
    personality: {
      traits: ['kind', 'compassionate', 'gentle'],
      speechStyle: 'soft_caring',
    },
    dialogue: {
      greeting: 'What ails you, my friend?',
      farewell: 'Be careful down there.',
    },
    sprite: 'npcs/pepin.cel',
    portrait: 'portraits/pepin.cel',
  },
  adria: {
    id: 'adria',
    name: 'Adria',
    title: 'The Witch',
    role: 'merchant',
    location: 'town_outskirts',
    description: 'A mysterious witch who sells magical items',
    tags: ['merchant', 'magic', 'mysterious'],
    services: ['buy', 'sell', 'recharge'],
    inventory: ['staves', 'scrolls', 'potions_mana', 'books'],
    personality: {
      traits: ['mysterious', 'cryptic', 'knowing'],
      speechStyle: 'cryptic_mystical',
    },
    dialogue: {
      greeting: 'I sense a soul in search of answers...',
      farewell: 'The spirits will guide you.',
    },
    sprite: 'npcs/adria.cel',
    portrait: 'portraits/adria.cel',
  },
  ogden: {
    id: 'ogden',
    name: 'Ogden',
    title: 'The Tavern Owner',
    role: 'quest_giver',
    location: 'tavern',
    description: 'The nervous owner of the Tavern of the Rising Sun',
    tags: ['quest_giver', 'information'],
    services: ['information', 'rumors'],
    personality: {
      traits: ['nervous', 'helpful', 'worried'],
      speechStyle: 'anxious_helpful',
    },
    dialogue: {
      greeting: 'Good to see you, traveler! These are dark times...',
      farewell: 'Watch yourself out there!',
    },
    sprite: 'npcs/ogden.cel',
    portrait: 'portraits/ogden.cel',
  },
  wirt: {
    id: 'wirt',
    name: 'Wirt',
    title: 'The Peg-Legged Boy',
    role: 'merchant',
    location: 'town_edge',
    description: 'A young boy who sells overpriced rare items',
    tags: ['merchant', 'rare_items'],
    services: ['buy_premium'],
    inventory: ['rare_weapons', 'rare_armor'],
    personality: {
      traits: ['greedy', 'streetwise', 'bitter'],
      speechStyle: 'sarcastic_shrewd',
    },
    dialogue: {
      greeting: 'Looking for something special? I might have what you need... for a price.',
      farewell: 'Come back when you have more gold.',
    },
    sprite: 'npcs/wirt.cel',
    portrait: 'portraits/wirt.cel',
  },
  farnham: {
    id: 'farnham',
    name: 'Farnham',
    title: 'The Drunk',
    role: 'information',
    location: 'tavern',
    description: 'A traumatized survivor of the cathedral who drinks to forget',
    tags: ['lore', 'information'],
    services: ['rumors'],
    personality: {
      traits: ['drunk', 'traumatized', 'rambling'],
      speechStyle: 'slurred_incoherent',
    },
    dialogue: {
      greeting: '*hic* The darkness... I can still see the darkness...',
      farewell: '*mumbles incoherently*',
    },
    sprite: 'npcs/farnham.cel',
    portrait: 'portraits/farnham.cel',
  },
  gillian: {
    id: 'gillian',
    name: 'Gillian',
    title: 'The Barmaid',
    role: 'information',
    location: 'tavern',
    description: 'A young woman who serves at the tavern',
    tags: ['information', 'story'],
    services: ['rumors', 'comfort'],
    personality: {
      traits: ['kind', 'worried', 'hopeful'],
      speechStyle: 'warm_concerned',
    },
    dialogue: {
      greeting: 'Oh, hello there. Can I get you anything?',
      farewell: 'Please be careful.',
    },
    sprite: 'npcs/gillian.cel',
    portrait: 'portraits/gillian.cel',
  },
};

// ============================================================================
// ITEM REGISTRY
// ============================================================================

/**
 * Base item types and their properties
 */
export const ITEM_REGISTRY = {
  // Weapons - Swords
  sword_short: {
    id: 'sword_short',
    name: 'Short Sword',
    type: 'weapon',
    subtype: 'sword',
    rarity: 'common',
    damage: [2, 6],
    requirements: { strength: 0 },
    levelRange: [1, 5],
    value: 50,
    tags: ['weapon', 'melee', 'one_handed', 'sword'],
    sprite: 'items/sword_short.cel',
  },
  sword_long: {
    id: 'sword_long',
    name: 'Long Sword',
    type: 'weapon',
    subtype: 'sword',
    rarity: 'common',
    damage: [4, 10],
    requirements: { strength: 30 },
    levelRange: [5, 15],
    value: 250,
    tags: ['weapon', 'melee', 'one_handed', 'sword'],
    sprite: 'items/sword_long.cel',
  },
  sword_bastard: {
    id: 'sword_bastard',
    name: 'Bastard Sword',
    type: 'weapon',
    subtype: 'sword',
    rarity: 'uncommon',
    damage: [6, 15],
    requirements: { strength: 50 },
    levelRange: [10, 25],
    value: 750,
    tags: ['weapon', 'melee', 'two_handed', 'sword'],
    sprite: 'items/sword_bastard.cel',
  },

  // Weapons - Axes
  axe_small: {
    id: 'axe_small',
    name: 'Small Axe',
    type: 'weapon',
    subtype: 'axe',
    rarity: 'common',
    damage: [2, 10],
    requirements: { strength: 0 },
    levelRange: [1, 5],
    value: 50,
    tags: ['weapon', 'melee', 'one_handed', 'axe'],
    sprite: 'items/axe_small.cel',
  },
  axe_battle: {
    id: 'axe_battle',
    name: 'Battle Axe',
    type: 'weapon',
    subtype: 'axe',
    rarity: 'uncommon',
    damage: [10, 25],
    requirements: { strength: 65 },
    levelRange: [15, 30],
    value: 1500,
    tags: ['weapon', 'melee', 'two_handed', 'axe'],
    sprite: 'items/axe_battle.cel',
  },

  // Weapons - Bows
  bow_short: {
    id: 'bow_short',
    name: 'Short Bow',
    type: 'weapon',
    subtype: 'bow',
    rarity: 'common',
    damage: [1, 4],
    requirements: { dexterity: 0 },
    levelRange: [1, 5],
    value: 50,
    tags: ['weapon', 'ranged', 'two_handed', 'bow'],
    sprite: 'items/bow_short.cel',
  },
  bow_long: {
    id: 'bow_long',
    name: 'Long Bow',
    type: 'weapon',
    subtype: 'bow',
    rarity: 'uncommon',
    damage: [4, 10],
    requirements: { dexterity: 30, strength: 25 },
    levelRange: [10, 20],
    value: 350,
    tags: ['weapon', 'ranged', 'two_handed', 'bow'],
    sprite: 'items/bow_long.cel',
  },

  // Weapons - Staves
  staff_short: {
    id: 'staff_short',
    name: 'Short Staff',
    type: 'weapon',
    subtype: 'staff',
    rarity: 'common',
    damage: [2, 4],
    requirements: { magic: 0 },
    levelRange: [1, 5],
    value: 30,
    tags: ['weapon', 'melee', 'two_handed', 'staff', 'caster'],
    sprite: 'items/staff_short.cel',
  },
  staff_war: {
    id: 'staff_war',
    name: 'War Staff',
    type: 'weapon',
    subtype: 'staff',
    rarity: 'uncommon',
    damage: [8, 16],
    requirements: { magic: 30 },
    levelRange: [15, 30],
    value: 750,
    tags: ['weapon', 'melee', 'two_handed', 'staff', 'caster'],
    sprite: 'items/staff_war.cel',
  },

  // Armor - Body
  armor_rags: {
    id: 'armor_rags',
    name: 'Rags',
    type: 'armor',
    subtype: 'body',
    rarity: 'common',
    armor: 2,
    requirements: {},
    levelRange: [1, 3],
    value: 5,
    tags: ['armor', 'body', 'cloth'],
    sprite: 'items/armor_rags.cel',
  },
  armor_leather: {
    id: 'armor_leather',
    name: 'Leather Armor',
    type: 'armor',
    subtype: 'body',
    rarity: 'common',
    armor: 10,
    requirements: { strength: 0 },
    levelRange: [1, 10],
    value: 150,
    tags: ['armor', 'body', 'leather'],
    sprite: 'items/armor_leather.cel',
  },
  armor_chain: {
    id: 'armor_chain',
    name: 'Chain Mail',
    type: 'armor',
    subtype: 'body',
    rarity: 'uncommon',
    armor: 25,
    requirements: { strength: 30 },
    levelRange: [10, 20],
    value: 750,
    tags: ['armor', 'body', 'chain'],
    sprite: 'items/armor_chain.cel',
  },
  armor_plate: {
    id: 'armor_plate',
    name: 'Plate Mail',
    type: 'armor',
    subtype: 'body',
    rarity: 'rare',
    armor: 45,
    requirements: { strength: 60 },
    levelRange: [20, 40],
    value: 3000,
    tags: ['armor', 'body', 'plate'],
    sprite: 'items/armor_plate.cel',
  },

  // Shields
  shield_buckler: {
    id: 'shield_buckler',
    name: 'Buckler',
    type: 'armor',
    subtype: 'shield',
    rarity: 'common',
    armor: 5,
    requirements: { strength: 0 },
    levelRange: [1, 10],
    value: 50,
    tags: ['armor', 'shield'],
    sprite: 'items/shield_buckler.cel',
  },
  shield_large: {
    id: 'shield_large',
    name: 'Large Shield',
    type: 'armor',
    subtype: 'shield',
    rarity: 'uncommon',
    armor: 15,
    requirements: { strength: 40 },
    levelRange: [10, 25],
    value: 400,
    tags: ['armor', 'shield'],
    sprite: 'items/shield_large.cel',
  },

  // Helms
  helm_cap: {
    id: 'helm_cap',
    name: 'Cap',
    type: 'armor',
    subtype: 'helm',
    rarity: 'common',
    armor: 1,
    requirements: {},
    levelRange: [1, 5],
    value: 15,
    tags: ['armor', 'helm'],
    sprite: 'items/helm_cap.cel',
  },
  helm_full: {
    id: 'helm_full',
    name: 'Full Helm',
    type: 'armor',
    subtype: 'helm',
    rarity: 'uncommon',
    armor: 10,
    requirements: { strength: 35 },
    levelRange: [15, 30],
    value: 500,
    tags: ['armor', 'helm'],
    sprite: 'items/helm_full.cel',
  },

  // Potions
  potion_health_minor: {
    id: 'potion_health_minor',
    name: 'Minor Healing Potion',
    type: 'consumable',
    subtype: 'potion',
    rarity: 'common',
    effect: { heal: 50 },
    levelRange: [1, 50],
    value: 25,
    tags: ['consumable', 'potion', 'healing'],
    sprite: 'items/potion_red_small.cel',
  },
  potion_health: {
    id: 'potion_health',
    name: 'Healing Potion',
    type: 'consumable',
    subtype: 'potion',
    rarity: 'common',
    effect: { heal: 150 },
    levelRange: [5, 50],
    value: 75,
    tags: ['consumable', 'potion', 'healing'],
    sprite: 'items/potion_red.cel',
  },
  potion_health_full: {
    id: 'potion_health_full',
    name: 'Full Healing Potion',
    type: 'consumable',
    subtype: 'potion',
    rarity: 'uncommon',
    effect: { heal: 'full' },
    levelRange: [15, 50],
    value: 250,
    tags: ['consumable', 'potion', 'healing'],
    sprite: 'items/potion_red_large.cel',
  },
  potion_mana_minor: {
    id: 'potion_mana_minor',
    name: 'Minor Mana Potion',
    type: 'consumable',
    subtype: 'potion',
    rarity: 'common',
    effect: { mana: 30 },
    levelRange: [1, 50],
    value: 25,
    tags: ['consumable', 'potion', 'mana'],
    sprite: 'items/potion_blue_small.cel',
  },
  potion_mana: {
    id: 'potion_mana',
    name: 'Mana Potion',
    type: 'consumable',
    subtype: 'potion',
    rarity: 'common',
    effect: { mana: 100 },
    levelRange: [5, 50],
    value: 75,
    tags: ['consumable', 'potion', 'mana'],
    sprite: 'items/potion_blue.cel',
  },
  potion_rejuvenation: {
    id: 'potion_rejuvenation',
    name: 'Rejuvenation Potion',
    type: 'consumable',
    subtype: 'potion',
    rarity: 'rare',
    effect: { heal: 'full', mana: 'full' },
    levelRange: [10, 50],
    value: 500,
    tags: ['consumable', 'potion', 'healing', 'mana'],
    sprite: 'items/potion_purple.cel',
  },

  // Gold
  gold_pile: {
    id: 'gold_pile',
    name: 'Gold',
    type: 'gold',
    subtype: 'currency',
    rarity: 'common',
    levelRange: [1, 50],
    tags: ['gold', 'currency'],
    sprite: 'items/gold.cel',
  },

  // Scrolls
  scroll_identify: {
    id: 'scroll_identify',
    name: 'Scroll of Identify',
    type: 'consumable',
    subtype: 'scroll',
    rarity: 'common',
    effect: { spell: 'identify' },
    levelRange: [1, 50],
    value: 50,
    tags: ['consumable', 'scroll', 'utility'],
    sprite: 'items/scroll.cel',
  },
  scroll_town_portal: {
    id: 'scroll_town_portal',
    name: 'Scroll of Town Portal',
    type: 'consumable',
    subtype: 'scroll',
    rarity: 'common',
    effect: { spell: 'town_portal' },
    levelRange: [1, 50],
    value: 100,
    tags: ['consumable', 'scroll', 'utility'],
    sprite: 'items/scroll.cel',
  },
};

// ============================================================================
// OBJECT REGISTRY
// ============================================================================

/**
 * All placeable objects (interactive and decorative)
 */
export const OBJECT_REGISTRY = {
  // Containers
  barrel: {
    id: 1,
    name: 'Barrel',
    category: 'container',
    interactive: true,
    destructible: true,
    lootTable: ['gold', 'potion_health_minor'],
    themes: ['cathedral', 'catacombs', 'caves', 'town'],
    tags: ['container', 'destructible', 'common'],
    sprite: 'objects/barrel.cel',
  },
  chest: {
    id: 2,
    name: 'Chest',
    category: 'container',
    interactive: true,
    destructible: false,
    lootTable: ['gold', 'equipment', 'potions'],
    themes: ['cathedral', 'catacombs', 'caves', 'hell'],
    tags: ['container', 'treasure'],
    sprite: 'objects/chest.cel',
  },
  chest_large: {
    id: 3,
    name: 'Large Chest',
    category: 'container',
    interactive: true,
    destructible: false,
    lootTable: ['gold_large', 'equipment_rare', 'potions'],
    themes: ['cathedral', 'catacombs', 'caves', 'hell'],
    tags: ['container', 'treasure', 'rare'],
    sprite: 'objects/chest_large.cel',
  },
  sarcophagus: {
    id: 4,
    name: 'Sarcophagus',
    category: 'container',
    interactive: true,
    destructible: false,
    lootTable: ['gold', 'equipment', 'skeleton_spawn'],
    themes: ['cathedral', 'catacombs'],
    tags: ['container', 'undead_spawn', 'tomb'],
    sprite: 'objects/sarcophagus.cel',
  },

  // Shrines
  shrine_mysterious: {
    id: 11,
    name: 'Mysterious Shrine',
    category: 'shrine',
    interactive: true,
    effect: 'random_buff_debuff',
    themes: ['cathedral', 'catacombs', 'caves', 'hell'],
    tags: ['shrine', 'mysterious', 'buff'],
    sprite: 'objects/shrine.cel',
  },
  shrine_hidden: {
    id: 12,
    name: 'Hidden Shrine',
    category: 'shrine',
    interactive: true,
    effect: 'durability_bonus',
    themes: ['cathedral', 'catacombs'],
    tags: ['shrine', 'buff', 'durability'],
    sprite: 'objects/shrine.cel',
  },
  shrine_religious: {
    id: 17,
    name: 'Religious Shrine',
    category: 'shrine',
    interactive: true,
    effect: 'restore_health',
    themes: ['cathedral'],
    tags: ['shrine', 'healing', 'holy'],
    sprite: 'objects/shrine.cel',
  },
  shrine_enchanted: {
    id: 18,
    name: 'Enchanted Shrine',
    category: 'shrine',
    interactive: true,
    effect: 'spell_boost',
    themes: ['catacombs', 'caves', 'hell'],
    tags: ['shrine', 'magic', 'buff'],
    sprite: 'objects/shrine.cel',
  },
  cauldron: {
    id: 36,
    name: 'Cauldron',
    category: 'shrine',
    interactive: true,
    effect: 'random_potion',
    themes: ['caves', 'hell'],
    tags: ['shrine', 'magic', 'potion'],
    sprite: 'objects/cauldron.cel',
  },
  fountain: {
    id: 38,
    name: 'Fountain',
    category: 'shrine',
    interactive: true,
    effect: 'restore_mana',
    themes: ['cathedral', 'catacombs'],
    tags: ['shrine', 'mana', 'water'],
    sprite: 'objects/fountain.cel',
  },

  // Decorations
  torch: {
    id: 53,
    name: 'Torch',
    category: 'decoration',
    interactive: false,
    lightSource: true,
    themes: ['cathedral', 'catacombs', 'caves', 'hell', 'town'],
    tags: ['decoration', 'light'],
    sprite: 'objects/torch.cel',
  },
  brazier: {
    id: 55,
    name: 'Brazier',
    category: 'decoration',
    interactive: false,
    lightSource: true,
    themes: ['cathedral', 'catacombs', 'hell'],
    tags: ['decoration', 'light', 'fire'],
    sprite: 'objects/brazier.cel',
  },
  cross: {
    id: 58,
    name: 'Cross',
    category: 'decoration',
    interactive: false,
    themes: ['cathedral'],
    tags: ['decoration', 'holy', 'religious'],
    sprite: 'objects/cross.cel',
  },
  tombstone: {
    id: 59,
    name: 'Tombstone',
    category: 'decoration',
    interactive: true,
    effect: 'read_inscription',
    themes: ['cathedral', 'catacombs'],
    tags: ['decoration', 'tomb', 'lore'],
    sprite: 'objects/tombstone.cel',
  },
  pile_skulls: {
    id: 60,
    name: 'Skull Pile',
    category: 'decoration',
    interactive: false,
    themes: ['catacombs', 'caves', 'hell'],
    tags: ['decoration', 'gore', 'bones'],
    sprite: 'objects/skulls.cel',
  },
  pile_bones: {
    id: 61,
    name: 'Bone Pile',
    category: 'decoration',
    interactive: true,
    effect: 'skeleton_spawn',
    themes: ['cathedral', 'catacombs', 'caves'],
    tags: ['decoration', 'bones', 'undead_spawn'],
    sprite: 'objects/bones.cel',
  },

  // Quest objects
  altar: {
    id: 42,
    name: 'Altar',
    category: 'quest',
    interactive: true,
    themes: ['cathedral', 'hell'],
    tags: ['quest', 'religious', 'story'],
    sprite: 'objects/altar.cel',
  },
  pedestal: {
    id: 41,
    name: 'Pedestal',
    category: 'quest',
    interactive: true,
    themes: ['cathedral', 'catacombs'],
    tags: ['quest', 'item_placement'],
    sprite: 'objects/pedestal.cel',
  },
  lever: {
    id: 51,
    name: 'Lever',
    category: 'quest',
    interactive: true,
    effect: 'trigger_mechanism',
    themes: ['cathedral', 'catacombs', 'caves', 'hell'],
    tags: ['quest', 'mechanism', 'door'],
    sprite: 'objects/lever.cel',
  },
  door: {
    id: 52,
    name: 'Door',
    category: 'structure',
    interactive: true,
    themes: ['cathedral', 'catacombs', 'hell', 'town'],
    tags: ['structure', 'barrier', 'passage'],
    sprite: 'objects/door.cel',
  },
};

// ============================================================================
// TILE REGISTRY
// ============================================================================

/**
 * Tile sets by theme
 */
export const TILE_REGISTRY = {
  cathedral: {
    floors: {
      stone: { id: 0, name: 'Stone Floor', sprite: 'tiles/cathedral/floor.cel' },
      checkered: { id: 1, name: 'Checkered Floor', sprite: 'tiles/cathedral/floor_check.cel' },
      bloody: { id: 2, name: 'Bloody Floor', sprite: 'tiles/cathedral/floor_blood.cel' },
    },
    walls: {
      stone: { id: 10, name: 'Stone Wall', sprite: 'tiles/cathedral/wall.cel' },
      pillar: { id: 11, name: 'Pillar', sprite: 'tiles/cathedral/pillar.cel' },
      arch: { id: 12, name: 'Archway', sprite: 'tiles/cathedral/arch.cel' },
    },
    special: {
      stairs_up: { id: 36, name: 'Stairs Up', sprite: 'tiles/cathedral/stairs_up.cel' },
      stairs_down: { id: 37, name: 'Stairs Down', sprite: 'tiles/cathedral/stairs_down.cel' },
      door: { id: 25, name: 'Door', sprite: 'tiles/cathedral/door.cel' },
    },
  },
  catacombs: {
    floors: {
      stone: { id: 0, name: 'Catacomb Floor', sprite: 'tiles/catacombs/floor.cel' },
      bones: { id: 1, name: 'Bone Floor', sprite: 'tiles/catacombs/floor_bones.cel' },
    },
    walls: {
      stone: { id: 10, name: 'Catacomb Wall', sprite: 'tiles/catacombs/wall.cel' },
      crypt: { id: 11, name: 'Crypt Wall', sprite: 'tiles/catacombs/wall_crypt.cel' },
    },
    special: {
      stairs_up: { id: 36, name: 'Stairs Up', sprite: 'tiles/catacombs/stairs_up.cel' },
      stairs_down: { id: 37, name: 'Stairs Down', sprite: 'tiles/catacombs/stairs_down.cel' },
    },
  },
  caves: {
    floors: {
      dirt: { id: 0, name: 'Dirt Floor', sprite: 'tiles/caves/floor.cel' },
      gravel: { id: 1, name: 'Gravel Floor', sprite: 'tiles/caves/floor_gravel.cel' },
    },
    walls: {
      rock: { id: 10, name: 'Rock Wall', sprite: 'tiles/caves/wall.cel' },
      stalagmite: { id: 11, name: 'Stalagmite', sprite: 'tiles/caves/stalagmite.cel' },
    },
    special: {
      stairs_up: { id: 36, name: 'Stairs Up', sprite: 'tiles/caves/stairs_up.cel' },
      stairs_down: { id: 37, name: 'Stairs Down', sprite: 'tiles/caves/stairs_down.cel' },
      lava: { id: 50, name: 'Lava', sprite: 'tiles/caves/lava.cel' },
    },
  },
  hell: {
    floors: {
      brimstone: { id: 0, name: 'Brimstone Floor', sprite: 'tiles/hell/floor.cel' },
      pentagram: { id: 1, name: 'Pentagram', sprite: 'tiles/hell/floor_penta.cel' },
    },
    walls: {
      bone: { id: 10, name: 'Bone Wall', sprite: 'tiles/hell/wall_bone.cel' },
      flesh: { id: 11, name: 'Flesh Wall', sprite: 'tiles/hell/wall_flesh.cel' },
    },
    special: {
      stairs_up: { id: 36, name: 'Stairs Up', sprite: 'tiles/hell/stairs_up.cel' },
      stairs_down: { id: 37, name: 'Stairs Down', sprite: 'tiles/hell/stairs_down.cel' },
      lava: { id: 50, name: 'Lava River', sprite: 'tiles/hell/lava.cel' },
    },
  },
};

// ============================================================================
// ASSET SEARCH ENGINE
// ============================================================================

/**
 * Universal Asset Search
 * Allows AI to find appropriate assets by criteria
 */
export class AssetSearch {
  /**
   * Search monsters by criteria
   */
  static searchMonsters(criteria = {}) {
    const results = [];
    for (const [key, monster] of Object.entries(MONSTER_REGISTRY)) {
      let matches = true;

      if (criteria.category && monster.category !== criteria.category) matches = false;
      if (criteria.theme && !monster.themes.includes(criteria.theme)) matches = false;
      if (criteria.minDifficulty && monster.difficulty < criteria.minDifficulty) matches = false;
      if (criteria.maxDifficulty && monster.difficulty > criteria.maxDifficulty) matches = false;
      if (criteria.minLevel && monster.levelRange[0] > criteria.minLevel) matches = false;
      if (criteria.maxLevel && monster.levelRange[1] < criteria.maxLevel) matches = false;
      if (criteria.tags && !criteria.tags.every(t => monster.tags.includes(t))) matches = false;
      if (criteria.name && !monster.name.toLowerCase().includes(criteria.name.toLowerCase())) matches = false;
      if (criteria.behavior && monster.behavior !== criteria.behavior) matches = false;

      if (matches) results.push({ key, ...monster });
    }
    return results;
  }

  /**
   * Search NPCs by criteria
   */
  static searchNPCs(criteria = {}) {
    const results = [];
    for (const [key, npc] of Object.entries(NPC_REGISTRY)) {
      let matches = true;

      if (criteria.role && npc.role !== criteria.role) matches = false;
      if (criteria.location && npc.location !== criteria.location) matches = false;
      if (criteria.service && !npc.services?.includes(criteria.service)) matches = false;
      if (criteria.tags && !criteria.tags.every(t => npc.tags.includes(t))) matches = false;
      if (criteria.name && !npc.name.toLowerCase().includes(criteria.name.toLowerCase())) matches = false;

      if (matches) results.push({ key, ...npc });
    }
    return results;
  }

  /**
   * Search items by criteria
   */
  static searchItems(criteria = {}) {
    const results = [];
    for (const [key, item] of Object.entries(ITEM_REGISTRY)) {
      let matches = true;

      if (criteria.type && item.type !== criteria.type) matches = false;
      if (criteria.subtype && item.subtype !== criteria.subtype) matches = false;
      if (criteria.rarity && item.rarity !== criteria.rarity) matches = false;
      if (criteria.minLevel && item.levelRange[0] > criteria.minLevel) matches = false;
      if (criteria.maxLevel && item.levelRange[1] < criteria.maxLevel) matches = false;
      if (criteria.tags && !criteria.tags.every(t => item.tags.includes(t))) matches = false;
      if (criteria.name && !item.name.toLowerCase().includes(criteria.name.toLowerCase())) matches = false;

      if (matches) results.push({ key, ...item });
    }
    return results;
  }

  /**
   * Search objects by criteria
   */
  static searchObjects(criteria = {}) {
    const results = [];
    for (const [key, obj] of Object.entries(OBJECT_REGISTRY)) {
      let matches = true;

      if (criteria.category && obj.category !== criteria.category) matches = false;
      if (criteria.theme && !obj.themes.includes(criteria.theme)) matches = false;
      if (criteria.interactive !== undefined && obj.interactive !== criteria.interactive) matches = false;
      if (criteria.tags && !criteria.tags.every(t => obj.tags.includes(t))) matches = false;
      if (criteria.name && !obj.name.toLowerCase().includes(criteria.name.toLowerCase())) matches = false;

      if (matches) results.push({ key, ...obj });
    }
    return results;
  }

  /**
   * Search tiles by theme
   */
  static searchTiles(theme, category = null) {
    const themeData = TILE_REGISTRY[theme];
    if (!themeData) return [];

    if (category) {
      return themeData[category] ? Object.entries(themeData[category]).map(([k, v]) => ({ key: k, ...v })) : [];
    }

    const results = [];
    for (const [cat, tiles] of Object.entries(themeData)) {
      for (const [key, tile] of Object.entries(tiles)) {
        results.push({ key, category: cat, ...tile });
      }
    }
    return results;
  }

  /**
   * Get monsters appropriate for a dungeon level
   */
  static getMonstersForLevel(level, theme = null) {
    return this.searchMonsters({
      theme,
      maxLevel: level + 2,
      minLevel: Math.max(1, level - 4),
    });
  }

  /**
   * Get boss for an act
   */
  static getBossForAct(actNumber) {
    const bosses = this.searchMonsters({ category: 'boss' });
    // Map act to appropriate boss difficulty
    const targetDifficulty = [10, 12, 15, 20][actNumber - 1] || 20;
    return bosses.find(b => b.difficulty === targetDifficulty) || bosses[0];
  }

  /**
   * Get all available tags for a registry
   */
  static getAvailableTags(registryType) {
    let registry;
    switch (registryType) {
      case 'monsters': registry = MONSTER_REGISTRY; break;
      case 'npcs': registry = NPC_REGISTRY; break;
      case 'items': registry = ITEM_REGISTRY; break;
      case 'objects': registry = OBJECT_REGISTRY; break;
      default: return [];
    }

    const tags = new Set();
    for (const entity of Object.values(registry)) {
      if (entity.tags) {
        entity.tags.forEach(t => tags.add(t));
      }
    }
    return Array.from(tags).sort();
  }

  /**
   * Get registry summary for AI context
   */
  static getRegistrySummary() {
    return {
      monsters: {
        total: Object.keys(MONSTER_REGISTRY).length,
        bosses: Object.values(MONSTER_REGISTRY).filter(m => m.category === 'boss').length,
        categories: [...new Set(Object.values(MONSTER_REGISTRY).map(m => m.category))],
        themes: [...new Set(Object.values(MONSTER_REGISTRY).flatMap(m => m.themes))],
      },
      npcs: {
        total: Object.keys(NPC_REGISTRY).length,
        roles: [...new Set(Object.values(NPC_REGISTRY).map(n => n.role))],
      },
      items: {
        total: Object.keys(ITEM_REGISTRY).length,
        types: [...new Set(Object.values(ITEM_REGISTRY).map(i => i.type))],
        subtypes: [...new Set(Object.values(ITEM_REGISTRY).map(i => i.subtype))],
      },
      objects: {
        total: Object.keys(OBJECT_REGISTRY).length,
        categories: [...new Set(Object.values(OBJECT_REGISTRY).map(o => o.category))],
      },
      themes: Object.keys(TILE_REGISTRY),
    };
  }
}

// Export everything
export default {
  MONSTER_REGISTRY,
  NPC_REGISTRY,
  ITEM_REGISTRY,
  OBJECT_REGISTRY,
  TILE_REGISTRY,
  AssetSearch,
};
