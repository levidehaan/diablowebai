# Game Data Formats Documentation

This document details the data structures for monsters, items, quests, and dungeon configuration.

---

## Table of Contents

1. [DUN File Format](#1-dun-file-format)
2. [Monster Data](#2-monster-data)
3. [Item & Object Data](#3-item--object-data)
4. [Quest & Trigger System](#4-quest--trigger-system)
5. [Dungeon Configuration](#5-dungeon-configuration)
6. [Campaign Generation](#6-campaign-generation)

---

## 1. DUN File Format

### File Structure

```
Offset    Size       Type      Description
───────────────────────────────────────────
0         2          WORD      Width (1-256)
2         2          WORD      Height (1-256)
4         W×H×2      WORD[]    Base tile layer
4+W×H×2   W×H×8      WORD[]    Items layer (4x res, optional)
...       W×H×8      WORD[]    Monsters layer (4x res, optional)
...       W×H×8      WORD[]    Objects layer (4x res, optional)
```

### Tile Value Encoding

- Value `0` = Default floor tile (no data)
- Value `N` = Actual tile index is `N - 1`

### Sub-Layer Resolution

Sub-layers (items, monsters, objects) are at 4x resolution:
- Base: W × H tiles
- Sub: (W×2) × (H×2) = 4× total positions

### Binary Grid Markers (for AI)

```javascript
FLOOR:       0
WALL:        1
DOOR:        2
STAIRS_UP:   3
STAIRS_DOWN: 4
SPECIAL:     5
```

### Wall Orientation System

Walls are selected based on neighboring floor tiles (NSEW connections):

| Connections | Wall Type |
|-------------|-----------|
| 4 (cross) | Solid/cross |
| 3 (T-junction) | Tee piece |
| 2 (corner/straight) | Corner or corridor |
| 1 (end) | Dead end cap |
| 0 (isolated) | Pillar |

---

## 2. Monster Data

### Monster IDs (WASM Engine)

#### Zombies (Cathedral)
| ID | Name |
|----|------|
| 1 | ZOMBIE |
| 2 | GHOUL |
| 3 | ROTTING_CARCASS |
| 4 | BLACK_DEATH |

#### Fallen Ones (Cathedral)
| ID | Name |
|----|------|
| 17 | FALLEN_ONE |
| 18 | CARVER |
| 19 | DEVIL_KIN |
| 20 | DARK_ONE |

#### Skeletons (All Levels)
| ID | Name |
|----|------|
| 33 | SKELETON |
| 34 | CORPSE_AXE |
| 35 | BURNING_DEAD |
| 36 | HORROR |

#### Skeleton Archers
| ID | Name |
|----|------|
| 37 | SKELETON_ARCHER |
| 38 | CORPSE_BOW |
| 39 | BURNING_DEAD_ARCHER |
| 40 | HORROR_ARCHER |

#### Scavengers (Cathedral/Catacombs)
| ID | Name |
|----|------|
| 49 | SCAVENGER |
| 50 | PLAGUE_EATER |
| 51 | SHADOW_BEAST |
| 52 | BONE_GASHER |

#### Bats/Fiends (Caves/Hell)
| ID | Name |
|----|------|
| 65 | FIEND |
| 66 | BLINK |
| 67 | GLOOM |
| 68 | FAMILIAR |

#### Goat Men (Catacombs/Caves)
| ID | Name |
|----|------|
| 81 | FLESH_CLAN |
| 82 | STONE_CLAN |
| 83 | FIRE_CLAN |
| 84 | NIGHT_CLAN |

#### Goat Archers
| ID | Name |
|----|------|
| 85 | FLESH_CLAN_ARCHER |
| 86 | STONE_CLAN_ARCHER |
| 87 | FIRE_CLAN_ARCHER |
| 88 | NIGHT_CLAN_ARCHER |

#### Demons (Hell)
| ID | Name |
|----|------|
| 97 | HIDDEN |
| 98 | STALKER |
| 99 | UNSEEN |
| 100 | ILLUSION_WEAVER |

#### Bosses
| ID | Name | Difficulty |
|----|------|------------|
| 101 | SKELETON_KING | 12 |
| 102 | BUTCHER | 10 |
| 107 | DIABLO | 20 |
| 108 | LAZARUS | 14 |

### Level-Based Monster Pools

```javascript
Cathedral (1-4):
  ZOMBIE, FALLEN_ONE, SKELETON, SCAVENGER, GHOUL, CARVER,
  CORPSE_AXE, PLAGUE_EATER

Catacombs (5-8):
  SKELETON, BURNING_DEAD, HORROR, FLESH_CLAN, STONE_CLAN,
  SKELETON_ARCHER, CORPSE_BOW, ROTTING_CARCASS, BLACK_DEATH,
  SHADOW_BEAST

Caves (9-12):
  HORROR, FIRE_CLAN, NIGHT_CLAN, FIEND, BLINK, BURNING_DEAD,
  HORROR_ARCHER, BONE_GASHER, FIRE_CLAN_ARCHER, NIGHT_CLAN_ARCHER

Hell (13-16):
  GLOOM, FAMILIAR, HIDDEN, STALKER, UNSEEN, ILLUSION_WEAVER,
  NIGHT_CLAN, NIGHT_CLAN_ARCHER
```

### Spawn Data Structure

```javascript
{
  x: number,              // X coordinate (0-39)
  y: number,              // Y coordinate (0-39)
  monsterId: number,      // Diablo monster ID
  flags: number,          // Difficulty flags
}
```

**Difficulty Flags:**
- `0x00` = Normal
- `0x01` = Champion (high difficulty)
- `0x02` = Unique (highest difficulty)

### Spawn Templates

| Template | Formation | Min | Max | Spacing | Notes |
|----------|-----------|-----|-----|---------|-------|
| PATROL | line | 2 | 4 | 2 | Moving group |
| AMBUSH | circle | 3 | 6 | 3 | Hidden until triggered |
| GUARD | cluster | 1 | 2 | 1 | Stationary |
| HORDE | random | 6 | 12 | 2 | Large swarm |
| BOSS_ROOM | boss_with_minions | 4+ | - | 4 | Boss + minions |

### Monster Density Formula

```javascript
baseDensity = 0.3 + (level * 0.02)
// Level 1:  0.32
// Level 8:  0.46
// Level 16: 0.62
```

### Boss Configuration

```javascript
{
  type: "SKELETON_KING",
  level: 12,
  minions: "SKELETON",
  minionCount: 4,
  name: "King Leoric",
  dialogue: "The warmth of life has entered my tomb...",
  rewards: {
    xp: 1000,
    gold: 5000,
    items: ["undead_crown"]
  }
}
```

---

## 3. Item & Object Data

### Object Type IDs

#### Containers
| ID | Type |
|----|------|
| 1 | barrel |
| 2 | chest |
| 3 | chest_large |
| 4 | sarcophagus |
| 5 | bookcase |
| 6 | weapon_rack |
| 7 | armor_stand |
| 8 | skeleton |
| 9 | crate |
| 10 | pod |

#### Shrines (26 types, IDs 11-35)
| ID | Type |
|----|------|
| 11 | shrine_mysterious |
| 12 | shrine_hidden |
| 13 | shrine_gloomy |
| 14 | shrine_weird |
| 15 | shrine_magical |
| ... | ... |
| 35 | shrine_tainted |

#### Quest Objects
| ID | Type |
|----|------|
| 41 | pedestal_staff |
| 42 | altar |
| 43 | bloody_cross |
| 44 | arch_lava |
| 45 | book_blind |
| 46 | book_blood |
| 47 | book_steel |
| 48 | book_vileness |
| 49 | decapitated_body |
| 50 | candle |
| 51 | lever |
| 52 | door |
| 53 | torch |
| 54 | mushroom_patch |

#### Light Sources & Decorations
| ID | Type |
|----|------|
| 55 | brazier |
| 56 | lamp |
| 57 | fire_pit |
| 58 | cross |
| 59 | tombstone |
| 60 | pile_skulls |
| 61 | pile_bones |
| 62 | banner |
| 63 | bloodfountain |
| 64 | crucifix |

### Theme-Specific Objects

```javascript
Cathedral:
  barrel, chest, bookcase, skeleton, sarcophagus, shrines,
  altar, brazier, torch, candle, cross, tombstone, crucifix,
  fountain_purifying

Catacombs:
  barrel, chest, chest_large, skeleton, sarcophagus, shrines,
  brazier, torch, pile_skulls, pile_bones, bloody_cross,
  decapitated_body, bloodfountain

Caves:
  barrel, chest, crate, pod, skeleton, shrines, cauldron,
  mushroom_patch, fire_pit, fountain_murky, pile_bones

Hell:
  chest, chest_large, sarcophagus, skeleton, shrines,
  goat_shrine, cauldron, arch_lava, brazier, bloodfountain,
  pile_skulls, crucifix, banner
```

### Loot Categories

| Category | Objects |
|----------|---------|
| Common | barrel, crate, skeleton, pile_bones |
| Uncommon | chest, weapon_rack, armor_stand, bookcase |
| Rare | chest_large, sarcophagus, pod |
| Shrine | All 26 shrine types |
| Fountain | fountain_murky, fountain_tears, fountain_purifying |
| Decoration | torch, brazier, candle, cross, tombstone |

### Item Quality Tiers

| Tier | Weight | Color | Min Level |
|------|--------|-------|-----------|
| COMMON | 60% | white | 1 |
| MAGIC | 25% | blue | 1 |
| RARE | 10% | yellow | 5 |
| UNIQUE | 4% | gold | 10 |
| SET | 1% | green | 10 |

### Treasure Placement Structure

```javascript
{
  x: number,
  y: number,
  type: string,         // "chest", "shrine", etc.
  objectId: number,     // Diablo object ID
  originalType: string  // Original type requested
}
```

### Treasure Generation Options

```javascript
{
  density: 0.3,           // Objects per room area
  shrineChance: 0.1,      // 10% chance for shrine
  chestChance: 0.2,       // 20% chance for chest
  decorationChance: 0.4,  // 40% chance for decoration
  seed: number            // For reproducibility
}
```

---

## 4. Quest & Trigger System

### Trigger Types

#### Location-Based
| Type | Description |
|------|-------------|
| ENTER_AREA | Player enters named area |
| ENTER_TILE | Player steps on specific tile |
| PROXIMITY | Player within radius of point |

#### Combat
| Type | Description |
|------|-------------|
| MONSTER_KILLED | Any monster killed |
| MONSTER_TYPE_KILLED | Specific monster type killed |
| ALL_MONSTERS_CLEARED | Level cleared |
| BOSS_KILLED | Boss defeated |
| PLAYER_DAMAGED | Player takes damage |
| PLAYER_HEALTH_LOW | Health below threshold |

#### Interaction
| Type | Description |
|------|-------------|
| OBJECT_ACTIVATED | Object used (chest, lever) |
| SHRINE_USED | Shrine activated |
| ITEM_PICKED | Item picked up |
| ITEM_EQUIPPED | Item equipped |
| LEVEL_ENTERED | Entered dungeon level |
| LEVEL_EXITED | Left dungeon level |

#### Quest
| Type | Description |
|------|-------------|
| QUEST_STARTED | Quest begun |
| QUEST_COMPLETED | Quest finished |
| OBJECTIVE_COMPLETED | Objective done |

#### Time
| Type | Description |
|------|-------------|
| TIME_ELAPSED | Time passed |
| TURN_COUNT | Turns taken |

### Action Types

#### Dialogue & UI
| Type | Description |
|------|-------------|
| SHOW_DIALOGUE | Display NPC dialogue |
| SHOW_NOTIFICATION | Show notification |

#### Quest Management
| Type | Description |
|------|-------------|
| START_QUEST | Begin quest |
| COMPLETE_QUEST | Finish quest |
| FAIL_QUEST | Fail quest |
| UPDATE_OBJECTIVE | Update progress |
| ADD_OBJECTIVE | Add new objective |

#### Spawning
| Type | Description |
|------|-------------|
| SPAWN_MONSTER | Spawn single monster |
| SPAWN_MONSTERS | Spawn group |
| SPAWN_BOSS | Spawn boss |
| SPAWN_ITEM | Spawn item |
| SPAWN_OBJECT | Spawn object |

#### Level Modification
| Type | Description |
|------|-------------|
| OPEN_DOOR | Open door |
| CLOSE_DOOR | Close door |
| REVEAL_AREA | Reveal hidden area |
| MODIFY_TILE | Change tile |

#### Player Effects
| Type | Description |
|------|-------------|
| HEAL_PLAYER | Restore health |
| DAMAGE_PLAYER | Deal damage |
| GRANT_EXPERIENCE | Give XP |
| GRANT_GOLD | Give gold |
| GIVE_ITEM | Give item |

#### Flow Control
| Type | Description |
|------|-------------|
| ENABLE_TRIGGER | Enable trigger |
| DISABLE_TRIGGER | Disable trigger |
| DELAY_ACTION | Delayed action |
| CHAIN_ACTIONS | Sequence actions |

#### Audio/Visual
| Type | Description |
|------|-------------|
| PLAY_SOUND | Play sound effect |
| SCREEN_SHAKE | Shake screen |
| FLASH_SCREEN | Flash effect |

### Trigger Definition

```javascript
{
  id: "boss_room_entry",
  type: "ENTER_AREA",
  conditions: {
    areaId: "boss_room"
  },
  actions: [
    {
      type: "SHOW_DIALOGUE",
      speaker: "Skeleton King",
      text: "The warmth of life has entered my tomb..."
    },
    {
      type: "SPAWN_BOSS",
      bossType: "SKELETON_KING",
      x: 20,
      y: 20
    }
  ],
  enabled: true,
  oneShot: true,       // Only fires once
  priority: 10,        // Higher = fires first
  cooldown: 0,         // MS between fires
  tags: ["boss", "skeleton_king"],
  description: "Triggers boss fight"
}
```

### Quest Structure

```javascript
{
  id: "rescue_cain",
  name: "The Search for Cain",
  description: "Find the wise sage Deckard Cain...",
  objectives: [
    {
      id: "find_entrance",
      description: "Locate the dungeon entrance",
      progress: 0,
      target: 1,
      completed: false
    },
    {
      id: "defeat_boss",
      description: "Defeat the Skeleton King",
      progress: 0,
      target: 1,
      completed: false
    }
  ],
  status: "active",    // active, completed, failed
  startTime: 1701234567890,
  completedTime: null,
  rewards: {
    experience: 1000,
    gold: 500,
    items: ["identify_scroll_x5"]
  }
}
```

---

## 5. Dungeon Configuration

### Dungeon Themes

| Theme | Levels | Tile Prefix | Description |
|-------|--------|-------------|-------------|
| CATHEDRAL | 1-4 | l1 | Gothic stone |
| CATACOMBS | 5-8 | l2 | Burial chambers |
| CAVES | 9-12 | l3 | Natural caverns |
| HELL | 13-16 | l4 | Demonic realm |

### Difficulty Presets

| Preset | Health | Damage | Density | XP | Gold | Quality |
|--------|--------|--------|---------|-----|------|---------|
| EASY | ×0.75 | ×0.75 | ×0.6 | ×0.8 | ×1.2 | +0 |
| NORMAL | ×1.0 | ×1.0 | ×1.0 | ×1.0 | ×1.0 | +0 |
| NIGHTMARE | ×1.5 | ×1.5 | ×1.3 | ×1.5 | ×1.5 | +10 |
| HELL | ×2.0 | ×2.0 | ×1.5 | ×2.0 | ×2.0 | +25 |

### Per-Level Configuration

```javascript
{
  level: 1,
  theme: "CATHEDRAL",
  themeOverride: null,
  difficulty: 1,
  difficultyMultiplier: 1.0,

  // Monster configuration
  monsterDensity: 0.32,
  allowedMonsters: ["ZOMBIE", "FALLEN_ONE", "SKELETON"],
  disallowedMonsters: [],
  monsterLevelBonus: 0,

  // Boss configuration
  boss: null,
  bossOverride: null,
  customBossLocation: null,

  // Treasure configuration
  treasureDensity: 0.3,
  goldMultiplier: 1.0,
  itemQualityBonus: 0,
  guaranteedDrops: [],

  // Quest integration
  questTriggers: [],
  storyBeats: [],
  requiredQuests: [],

  // Layout
  customLayout: null,
  roomCount: { min: 4, max: 8 },
  corridorWidth: 2,

  // Special flags
  noMonsters: false,
  noTreasure: false,
  isBossLevel: false,
  isQuestLevel: false,

  // Environment
  ambiance: "Gothic cathedral with dim torchlight",
  lightLevel: 0.8,
  hasFog: false
}
```

### Global Configuration

```javascript
{
  difficultyPreset: "NORMAL",
  difficultyMultiplier: 1.0,
  xpMultiplier: 1.0,
  goldMultiplier: 1.0,
  itemQualityBonus: 0,
  monsterDensityMultiplier: 1.0,
  allowUniqueMonsters: true,
  allowChampionMonsters: true
}
```

---

## 6. Campaign Generation

### Campaign Templates

| Template | Acts | Levels/Act | Description |
|----------|------|------------|-------------|
| CLASSIC | 4 | 4 | Traditional descent |
| SIEGE | 3 | 3 | Defend Tristram |
| CORRUPTION | 4 | 3 | Cleanse areas (timed) |
| QUEST | 5 | 2 | Collect relics |

### Objective Types

| Type | Description |
|------|-------------|
| KILL_BOSS | Defeat boss monster |
| KILL_ALL | Eliminate all monsters |
| FIND_ITEM | Locate specific item |
| REACH_LOCATION | Get to area |
| SURVIVE_WAVES | Survive monster waves |
| ESCORT_NPC | Protect NPC |
| DESTROY_OBJECTS | Destroy targets |
| COLLECT_ITEMS | Gather collectibles |

### Progression Gates

| Type | Description |
|------|-------------|
| BOSS_KILL | Requires defeating boss |
| ITEM_REQUIRED | Requires specific item |
| QUEST_COMPLETE | Requires quest completion |
| LEVEL_REQUIRED | Requires character level |

### Campaign Structure

```javascript
{
  id: "dark_cathedral",
  name: "The Dark Cathedral",
  description: "Descend into the depths...",
  template: "CLASSIC",
  seed: 12345,
  createdAt: "2024-12-05T10:30:00Z",

  acts: [
    {
      id: "act1",
      number: 1,
      name: "The Cathedral",
      theme: "cathedral",
      levels: [
        {
          id: "level_1",
          name: "Cathedral Level 1",
          difficulty: 1,
          // ... level config
        }
      ],
      boss: {
        type: "SKELETON_KING",
        level: 12
      },
      unlockCondition: {
        type: "BOSS_KILL",
        target: "SKELETON_KING"
      }
    }
  ],

  quests: [...],
  npcs: [...],
  items: [...]
}
```

---

## Key Code Locations

| Component | File |
|-----------|------|
| DUN Parser | `/src/neural/DUNParser.js` |
| Monster Mapper | `/src/neural/MonsterMapper.js` |
| Object Mapper | `/src/neural/ObjectMapper.js` |
| Tile Mapper | `/src/neural/TileMapper.js` |
| Quest Triggers | `/src/neural/QuestTriggers.js` |
| Dungeon Config | `/src/neural/DungeonConfig.js` |
| Campaign Generator | `/src/neural/CampaignGenerator.js` |
| Enemy Placement | `/src/neural/EnemyPlacement.js` |
| Level Validator | `/src/neural/LevelValidator.js` |

---

*Last Updated: December 2024*
