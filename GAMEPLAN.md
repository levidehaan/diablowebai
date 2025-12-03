# DiabloWeb AI - Game Plan for True Level Injection

## Executive Summary

**Current State:** AI generates campaign narratives and simple 0/1 grids, but this data never actually modifies the game. The WASM engine loads levels from MPQ files and runs independently.

**Goal:** Inject AI-generated levels, enemies, and objects directly into the WASM game engine so players experience truly procedural content.

**Difficulty:** Hard but achievable. Requires understanding WASM memory layout and hooking into the right places.

---

## NEW: MPQ Modding Approach (Recommended)

**See:** [docs/MPQ_MODDING_PLAN.md](docs/MPQ_MODDING_PLAN.md)

The superior approach is to **modify the MPQ files directly** rather than runtime memory injection:

### Why MPQ Modding is Better

| Aspect | WASM Injection | MPQ Modding |
|--------|---------------|-------------|
| Persistence | Lost on reload | Saved as file |
| Stability | May crash | Safe - external file |
| Exportable | No | Yes - downloadable mod |
| Complexity | High (reverse engineering) | Medium (documented formats) |
| Graphics | Not possible | Full support |
| Shareable | No | Yes - distribute MPQ |

### MPQ Approach Overview

```
spawn.mpq (original)
       ↓
   MPQ Reader
       ↓
AI Editing Tools ← AI generates content
       ↓
   MPQ Writer
       ↓
spawn_modded.mpq (downloadable)
       ↓
  Load in Game
       ↓
   Real Mods!
```

### Key File Formats

| Format | Purpose | Modifiable |
|--------|---------|------------|
| DUN | Level layouts | ✅ Easy |
| MIN/TIL | Tile definitions | ⚠️ Complex |
| CEL/CL2 | Graphics | ✅ With RLE encoding |
| PAL | Color palettes | ✅ Easy |
| MON | Monster data | ⚠️ Complex |

### Implementation Status

- [x] MPQ Reader (savefile.js)
- [x] Tile Mapper (TileMapper.js)
- [x] Monster Mapper (MonsterMapper.js)
- [x] CEL/CL2 Encoder (AssetPipeline.js)
- [ ] DUN Parser/Writer
- [ ] MPQ Writer
- [ ] AI Mod Tools
- [ ] Mod Editor UI

**Continue reading MPQ_MODDING_PLAN.md for full implementation details.**

---

## Legacy: WASM Memory Injection

The sections below document the WASM memory injection approach, which is still useful for:
- Real-time runtime modifications
- Testing without rebuilding MPQ
- Understanding game internals

---

## Part 1: Understanding the Problem

### What We Have Now

```
AI Generation (works)     →  JSON Data (stored)  →  Game (ignores it)
     ↓                           ↓                        ↓
Campaign metadata         60x60 binary grids        Loads from MPQ
Acts, quests, bosses      0 = floor, 1 = wall       Static levels
NPC dialogue              Spawn coordinates         Original Diablo
```

### What We Need

```
AI Generation  →  Proper Level Data  →  WASM Memory Injection  →  Game Uses It
     ↓                  ↓                       ↓                      ↓
Campaign         40x40 tile grids       Write to dLevel[][]      Player sees
structure        with tile types        dMonster[], dObject[]    AI content
                 Entity placements      during level load
```

---

## Part 2: The WASM Memory Layout

### Key Data Arrays (from devilution source)

| Array | Size | Purpose | Tile Values |
|-------|------|---------|-------------|
| `dLevel[40][40]` | 1,600 bytes | Dungeon tile data | 0-255 tile IDs |
| `dPiece[112][112]` | 12,544 bytes | Sub-tile pieces | Rendering data |
| `dMonster[40][40]` | 1,600 bytes | Monster positions | Monster ID or 0 |
| `dObject[40][40]` | 1,600 bytes | Object positions | Object ID or 0 |
| `dFlags[40][40]` | 1,600 bytes | Tile flags | Bit flags |
| `dPlayer[40][40]` | 1,600 bytes | Player positions | Player ID or 0 |

### Tile Type Values (for Cathedral theme)

```javascript
// Based on devilution source - cathedral dungeon
const CATHEDRAL_TILES = {
  // Floors
  FLOOR_1: 13,
  FLOOR_2: 14,
  FLOOR_3: 15,

  // Walls
  WALL_SW: 1,
  WALL_SE: 2,
  WALL_NW: 3,
  WALL_NE: 4,
  WALL_END_SW: 5,
  WALL_END_SE: 6,

  // Corners
  CORNER_NW: 7,
  CORNER_NE: 8,
  CORNER_SW: 9,
  CORNER_SE: 10,

  // Doors
  DOOR_CLOSED: 25,
  DOOR_OPEN: 26,

  // Stairs
  STAIRS_UP: 36,
  STAIRS_DOWN: 37,

  // Special
  ARCH: 41,
  PILLAR: 42,
  ALTAR: 43,
};
```

### Monster ID Values

```javascript
// Monster type IDs from devilution
const MONSTER_IDS = {
  // Cathedral (dlvl 1-4)
  ZOMBIE: 1,
  GHOUL: 2,
  ROTTING_CARCASS: 3,
  BLACK_DEATH: 4,
  FALLEN_ONE: 17,
  CARVER: 18,
  DEVIL_KIN: 19,
  DARK_ONE: 20,
  SKELETON: 33,
  CORPSE_AXE: 34,
  BURNING_DEAD: 35,
  HORROR: 36,
  SCAVENGER: 49,
  PLAGUE_EATER: 50,
  SHADOW_BEAST: 51,
  BONE_GASHER: 52,

  // Bosses
  SKELETON_KING: 98,
  BUTCHER: 99,
  DIABLO: 107,
};
```

---

## Part 3: Implementation Steps

### Phase 1: Find WASM Export Functions

**Goal:** Identify which WASM functions we can call to manipulate level data.

**Steps:**
1. Add debug logging to `game.worker.js` to list all `wasm._*` exports
2. Look for functions like:
   - `_LoadLevel` or `_CreateLevel`
   - `_AddMonster` or `_SpawnMonster`
   - `_PlaceObject`
   - Level generation functions

**Test:**
```javascript
// In game.worker.js after WASM loads
console.log('WASM exports:', Object.keys(wasm).filter(k => k.startsWith('_')));
```

**Expected Result:** List of callable WASM functions

---

### Phase 2: Memory Pointer Discovery

**Goal:** Find the memory addresses of dLevel, dMonster, dObject arrays.

**Approach 1: Search for exported globals**
```javascript
// Look for exported memory locations
const exports = Object.keys(wasm).filter(k =>
  k.includes('Level') || k.includes('Monster') || k.includes('dung')
);
```

**Approach 2: Signature scanning**
```javascript
// After entering first dungeon level, scan memory for known patterns
// The first level always has stairs at a known location
function findDungeonArray() {
  const heap = wasm.HEAPU8;
  // Search for the pattern of a freshly generated cathedral level
  // ...
}
```

**Approach 3: Use devilution source as reference**
The devilution source code shows exact struct layouts. Cross-reference with WASM.

**Test:**
- Enter Cathedral Level 1
- Read memory at discovered pointer
- Verify it matches expected dungeon layout

---

### Phase 3: Level Grid Expansion

**Goal:** Replace binary 0/1 grids with proper Diablo tile values.

**Current format:**
```javascript
grid = [
  [1,1,1,1,1],
  [1,0,0,0,1],  // 0 = floor, 1 = wall
  [1,0,0,0,1],
  [1,1,1,1,1],
]
```

**New format:**
```javascript
grid = [
  [1,1,1,1,1],
  [3,13,13,13,4],  // Proper tile IDs
  [1,13,13,13,2],  // 13 = floor, 1-4 = walls
  [9,1,1,1,10],    // 9,10 = corners
]
```

**Implementation:**
```javascript
// src/neural/LevelGenerator.js - new method
convertToTileGrid(binaryGrid, theme = 'cathedral') {
  const width = binaryGrid[0].length;
  const height = binaryGrid.length;
  const tileGrid = [];

  for (let y = 0; y < height; y++) {
    tileGrid[y] = [];
    for (let x = 0; x < width; x++) {
      if (binaryGrid[y][x] === 0) {
        // Floor tile - randomize for variety
        tileGrid[y][x] = 13 + Math.floor(Math.random() * 3);
      } else {
        // Wall - determine type based on neighbors
        tileGrid[y][x] = this.getWallType(binaryGrid, x, y);
      }
    }
  }

  return tileGrid;
}

getWallType(grid, x, y) {
  const n = y > 0 && grid[y-1][x] === 1;
  const s = y < grid.length-1 && grid[y+1][x] === 1;
  const e = x < grid[0].length-1 && grid[y][x+1] === 1;
  const w = x > 0 && grid[y][x-1] === 1;

  // Determine wall orientation based on neighbors
  if (!n && !s && !e && !w) return 42; // Pillar
  if (n && s && !e && !w) return 1;    // Vertical wall
  if (!n && !s && e && w) return 2;    // Horizontal wall
  if (!n && s && !e && w) return 7;    // NW corner
  // ... etc for all combinations

  return 1; // Default wall
}
```

**Test:** Generate level, verify tile variety in output JSON.

---

### Phase 4: WASM Level Injection Hook

**Goal:** Intercept level loading and inject our data.

**Location:** `src/api/game.worker.js`

**Strategy:** Hook the DApi render call when entering a new level.

```javascript
// game.worker.js - add level detection
let currentLevel = -1;
let pendingLevelData = null;

// Check for level change each frame
function checkLevelChange() {
  // Read current level from WASM memory
  const newLevel = wasm._GetCurrentLevel?.() || readLevelFromMemory();

  if (newLevel !== currentLevel) {
    currentLevel = newLevel;

    // If we have AI level data, inject it
    if (pendingLevelData && pendingLevelData.level === newLevel) {
      injectLevelData(pendingLevelData);
      pendingLevelData = null;
    }
  }
}

function injectLevelData(data) {
  const { grid, monsters, objects } = data;

  // Write tile grid to dLevel
  const levelPtr = findDLevelPointer();
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 40; x++) {
      wasm.HEAPU8[levelPtr + y * 40 + x] = grid[y][x];
    }
  }

  // Spawn monsters
  monsters.forEach(m => {
    wasm._AddMonster?.(m.type, m.x, m.y);
  });

  // Place objects
  objects.forEach(o => {
    wasm._AddObject?.(o.type, o.x, o.y);
  });
}
```

**Test:**
1. Generate a simple 40x40 level with known pattern
2. Enter dungeon
3. Verify the pattern appears in-game

---

### Phase 5: Monster Spawning

**Goal:** Place AI-generated enemies into the level.

**Current EnemyPlacement output:**
```javascript
{
  x: 15,
  y: 20,
  enemyType: 'SKELETON',
  difficulty: 2
}
```

**Required for WASM:**
```javascript
{
  x: 15,
  y: 20,
  monsterId: 33,  // WASM monster type ID
  flags: 0        // Optional: unique, champion, etc.
}
```

**Implementation:**
```javascript
// Map our enemy types to WASM IDs
const ENEMY_TO_WASM_ID = {
  'ZOMBIE': 1,
  'SKELETON': 33,
  'FALLEN': 17,
  'SCAVENGER': 49,
  // ... etc
};

function spawnMonster(placement) {
  const monsterId = ENEMY_TO_WASM_ID[placement.enemyType];

  // Call WASM monster spawn function
  if (wasm._AddMonster) {
    wasm._AddMonster(monsterId, placement.x, placement.y);
  } else {
    // Fallback: write directly to dMonster array
    const monsterPtr = findDMonsterPointer();
    wasm.HEAPU8[monsterPtr + placement.y * 40 + placement.x] = monsterId;
  }
}
```

**Test:**
1. Generate level with 5 skeletons at known positions
2. Enter level
3. Verify skeletons appear at those positions

---

### Phase 6: Object Placement

**Goal:** Place chests, barrels, shrines, etc.

**Object Types:**
```javascript
const OBJECT_IDS = {
  BARREL: 1,
  CHEST: 2,
  CHEST_LARGE: 3,
  SHRINE_MYSTERIOUS: 10,
  SHRINE_HIDDEN: 11,
  SHRINE_GLOOMY: 12,
  STAND_TORCH: 20,
  CANDLE: 21,
  WEAPON_RACK: 30,
  ARMOR_STAND: 31,
  BOOKCASE: 40,
  LECTERN: 41,
  SARCOPHAGUS: 50,
};
```

**Implementation similar to monsters.**

---

### Phase 7: Stairs and Transitions

**Goal:** Make stairs work for level transitions.

**Critical:** Stairs need both:
1. Correct tile type in dLevel
2. Transition data so clicking stairs changes level

```javascript
function placeStairs(grid, upX, upY, downX, downY) {
  // Place stair tiles
  grid[upY][upX] = TILES.STAIRS_UP;
  grid[downY][downX] = TILES.STAIRS_DOWN;

  // Register transition (may need WASM call)
  wasm._SetLevelEntry?.(upX, upY);   // Where player enters
  wasm._SetLevelExit?.(downX, downY); // Where player exits
}
```

---

### Phase 8: Integration with Campaign System

**Goal:** When player clicks "Play AI Campaign", load AI levels as they descend.

**Flow:**
```
Campaign Ready → Click Play → Start Game → Enter Dungeon
                                                ↓
                              Load AI Level 1 from campaign.acts[0].levels[0]
                                                ↓
                              Inject grid + monsters + objects
                                                ↓
                              Player plays AI level
                                                ↓
                              On stairs down → Load next level from campaign
```

**Implementation in AIGameSession.js:**
```javascript
async loadCampaignLevel(actIndex, levelIndex) {
  const act = this.campaign.acts[actIndex];
  const level = act.levels[levelIndex];

  // Generate or retrieve the level grid
  const grid = await this.generateLevelGrid(level);

  // Generate enemies based on difficulty
  const enemies = await this.generateEnemies(level, grid);

  // Queue for injection
  this.pendingLevelData = {
    level: this.calculateDungeonLevel(actIndex, levelIndex),
    grid: grid,
    monsters: enemies,
    objects: this.generateObjects(level, grid),
  };

  // Signal worker to use this data
  postMessage({
    action: 'neural_level_ready',
    data: this.pendingLevelData
  });
}
```

---

## Part 4: Testing Strategy

### Test 1: Memory Discovery
**Input:** Start game, enter Cathedral Level 1
**Action:** Dump memory regions, search for dungeon patterns
**Expected:** Find dLevel pointer
**Verify:** Reading memory matches known level layout

### Test 2: Memory Write
**Input:** Known dLevel pointer
**Action:** Write a simple pattern (all floors)
**Expected:** Level becomes all walkable
**Verify:** Player can walk everywhere

### Test 3: Single Tile Change
**Input:** Change one tile from floor to wall
**Action:** Write single byte to dLevel
**Expected:** Obstacle appears at that location
**Verify:** Player cannot walk through

### Test 4: Full Level Injection
**Input:** AI-generated 40x40 grid
**Action:** Write entire grid before level loads
**Expected:** Custom level layout appears
**Verify:** Rooms and corridors match generated data

### Test 5: Monster Spawn
**Input:** Inject 3 skeletons at positions (10,10), (15,15), (20,20)
**Action:** Call spawn function or write to dMonster
**Expected:** Skeletons appear at those positions
**Verify:** Enemies are attackable and functional

### Test 6: Full Campaign
**Input:** Complete campaign with 4 acts, 16 levels
**Action:** Play through entire campaign
**Expected:** Each level loads from AI data
**Verify:** Progression, bosses, transitions all work

---

## Part 5: File Changes Required

### Modified Files

| File | Changes |
|------|---------|
| `src/api/game.worker.js` | Add level injection hooks, memory access |
| `src/neural/LevelGenerator.js` | Add proper tile grid conversion |
| `src/neural/EnemyPlacement.js` | Add WASM monster ID mapping |
| `src/neural/NeuralInterop.js` | Implement actual WASM write functions |
| `src/neural/AIGameSession.js` | Add level loading/queuing |
| `src/App.js` | Wire up campaign-to-game flow |

### New Files

| File | Purpose |
|------|---------|
| `src/neural/WASMBridge.js` | Low-level WASM memory manipulation |
| `src/neural/TileMapper.js` | Binary grid → tile ID conversion |
| `src/neural/MonsterMapper.js` | Enemy type → WASM ID mapping |
| `src/neural/LevelInjector.js` | Orchestrates level injection |

---

## Part 6: Risk Assessment

### High Risk
- **WASM memory layout unknown:** Need to reverse-engineer or scan for pointers
- **Timing issues:** Injecting data at wrong time could crash or corrupt

### Medium Risk
- **Tile compatibility:** Wrong tile IDs could cause visual glitches
- **Monster AI:** Spawned monsters might not behave correctly
- **Save compatibility:** Modified levels might not save/load properly

### Low Risk
- **Performance:** Writing 1,600 bytes per level is trivial
- **API compatibility:** DApi functions are stable

### Mitigations
1. Add debug mode with memory dumps
2. Implement fallback to original levels on error
3. Extensive testing with simple cases first
4. Keep original level generation as backup

---

## Part 7: Success Criteria

### Minimum Viable Product (MVP)
- [ ] Can inject a custom 40x40 floor/wall layout
- [ ] Layout appears in-game when entering dungeon
- [ ] Player can walk on floors, blocked by walls
- [ ] Stairs work for entering/exiting

### Full Feature
- [ ] All 4 dungeon themes supported (Cathedral, Catacombs, Caves, Hell)
- [ ] Monsters spawn from AI placement data
- [ ] Objects (chests, shrines) placed from AI data
- [ ] Full campaign of 16+ levels playable
- [ ] Boss encounters work correctly
- [ ] Quest triggers integrated
- [ ] Save/load works with AI levels

---

## Part 8: Immediate Next Steps

1. **Add WASM export discovery** (30 min)
   - Log all wasm._ functions when game loads
   - Document what's available

2. **Add memory scanning** (1-2 hours)
   - Enter Level 1
   - Find dLevel array in memory
   - Verify by reading known tile positions

3. **Test single tile write** (30 min)
   - Change one floor to wall
   - Verify player collision

4. **Expand LevelGenerator** (1-2 hours)
   - Add convertToTileGrid() method
   - Map wall orientations properly

5. **Create injection hook** (2-3 hours)
   - Hook into level change detection
   - Inject pending level data
   - Test with generated level

---

## Appendix A: devilution Source References

Key files from the devilution project that show memory layout:

- `Source/gendung.cpp` - Dungeon generation
- `Source/drlg_l1.cpp` - Cathedral level generator
- `Source/monster.cpp` - Monster structures
- `Source/objects.cpp` - Object placement
- `Source/player.cpp` - Player spawn handling

These can be cross-referenced with the WASM binary to understand offsets.

---

## Appendix B: Quick Reference - Tile IDs by Theme

### Cathedral (dlvl 1-4)
```
Floors: 13, 14, 15
Walls: 1-12 (based on orientation)
Doors: 25, 26
Stairs: 36, 37
Pillars: 42
```

### Catacombs (dlvl 5-8)
```
Floors: 130-135
Walls: 100-120
Doors: 140, 141
Arches: 145-150
```

### Caves (dlvl 9-12)
```
Floors: 200-210
Walls: 180-199
Lava: 220-225
Bridges: 230-235
```

### Hell (dlvl 13-16)
```
Floors: 300-310
Walls: 280-299
Pentagrams: 320-325
```

---

## Appendix C: Monster Spawn Limits

```
Max monsters per level: 200 (MAX_MONSTERS)
Max monster types active: varies by level type
Boss levels: usually 1 boss + 20-40 minions
Regular levels: 30-80 monsters typical
```

---

*This document should be updated as discoveries are made during implementation.*
