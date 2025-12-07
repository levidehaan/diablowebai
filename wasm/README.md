# WASM Integration - White Box & Glass Box Strategies

This document describes the two strategies for deep WASM integration with DevilutionX.

## Current State

The project currently uses a **Glass Box** approach that works with the existing pre-built WASM binary. The **White Box** approach (rebuilding WASM with new exports) is documented but requires resolving Emscripten compatibility issues with the older AJenbo/devilutionX fork.

## Glass Box Strategy (Active)

The Glass Box strategy uses memory scanning and pattern matching to find and manipulate game structures without requiring WASM rebuilds.

### How It Works

1. **Memory Scanning**: When the game is running, we scan WASM memory for characteristic patterns
2. **Structure Discovery**: We identify dungeon arrays, monster arrays, object arrays, and player data
3. **Direct Memory Access**: We read/write game state through direct memory manipulation
4. **Pattern Matching**: We use heuristics to locate structures (tile patterns, coordinate ranges, etc.)

### Key Components

- **`src/neural/GlassBoxMapper.js`** - Advanced memory pattern recognition
  - Finds dungeon[40][40] array using tile pattern analysis
  - Locates dMonster, dObject arrays
  - Discovers player and monster structures
  - Provides read/write access to game state

- **`src/api/game.worker.js`** - Game worker with neural memory bridge
  - `handleNeuralScanMemory()` - Scans for dungeon arrays
  - `handleNeuralReadGrid/WriteGrid()` - Grid manipulation
  - `handleNeuralInjectLevel()` - Level injection

- **`src/neural/WASMBridge.js`** - Main thread bridge to game worker
  - `scanMemory()` - Trigger memory scan
  - `readDungeonGrid()` / `writeDungeonGrid()` - Grid access
  - `injectLevel()` - Complete level injection

### Usage Example

```javascript
import WASMBridge from './neural/WASMBridge';

// Initialize with game worker
WASMBridge.init(gameWorker);

// Scan memory to find dungeon arrays
const scanResult = await WASMBridge.scanMemory();
console.log('dLevel found at:', scanResult.pointer);

// Read current dungeon grid
const grid = await WASMBridge.readDungeonGrid();
console.log('Current level:', grid);

// Write a custom level
const customGrid = generateCustomLevel();
await WASMBridge.writeDungeonGrid(customGrid);

// Inject a complete level with grid, monsters, objects
await WASMBridge.injectLevel({
  grid: customGrid,
  monsters: [{ x: 10, y: 10, type: 'skeleton' }],
  objects: [{ x: 5, y: 5, type: 'chest' }],
});
```

### Capabilities

| Feature | Glass Box | Notes |
|---------|-----------|-------|
| Read dungeon grid | ✅ | 40x40 tile IDs |
| Write dungeon grid | ✅ | Changes tiles |
| Read monsters | ⚠️ | Pattern matching required |
| Write monsters | ⚠️ | Limited control |
| Read objects | ⚠️ | Pattern matching required |
| Quest state | ❌ | Not accessible |
| Game flow control | ❌ | Cannot pause/override |
| NPC injection | ❌ | Cannot add custom NPCs |

### Limitations

1. **Memory Discovery Required**: Must scan memory each time
2. **No API Guarantees**: Structure offsets may change between versions
3. **Limited Control**: Cannot control game flow or add new entity types
4. **Risk of Corruption**: Writing to wrong addresses can crash the game

---

## White Box Strategy (Future Enhancement)

The White Box strategy involves rebuilding DevilutionX WASM with new C++ exports for full API control.

### Status: Build Compatibility Issues

The AJenbo/devilutionX fork has compatibility issues with modern Emscripten 3.x:
- `va_list` typedef conflicts between Emscripten and clang
- Older codebase designed for Emscripten 1.x
- SDL2 integration differences

### Files Prepared

- **`wasm/patches/CustomAPI.cpp`** - C++ implementation with EMSCRIPTEN_KEEPALIVE exports
- **`wasm/patches/CustomAPI.h`** - Header file
- **`wasm/build.sh`** - Build script
- **`wasm/Dockerfile.build`** - Docker container for building
- **`src/neural/CustomAPIBridge.js`** - JavaScript bridge for custom APIs

### Proposed Exports

When White Box is working, these functions will be available:

```cpp
// Level Control
int DApi_GetCurrentLevel()
int DApi_SetDungeonGeometry(const unsigned char* grid, int width, int height)
int DApi_ClearLevel()
int DApi_SetLevelType(int levelType)

// Monster Control
int DApi_InjectMonster(int x, int y, int typeId, int hp, int flags)
int DApi_ModifyMonster(int monsterId, int hp, int x, int y)
void DApi_ClearMonsters()
uintptr_t DApi_GetMonsterList(int* outCount)

// Object Control
int DApi_InjectObject(int x, int y, int typeId)
void DApi_ClearObjects()
uintptr_t DApi_GetObjectList(int* outCount)

// NPC Control
int DApi_InjectNPC(int x, int y, int typeId, const char* name)

// Player Control
int DApi_GetPlayerInfo(int* outX, int* outY, int* outLevel, int* outHP)
int DApi_SetPlayerPosition(int x, int y)

// Quest/State Control
int DApi_GetQuestState(int questId)
int DApi_SetQuestState(int questId, int state)
int DApi_GetGameState()
int DApi_SetGameFlag(int flagId, int value)

// Item Control
int DApi_InjectItem(int x, int y, int itemId, int identified)

// Dialogue
int DApi_TriggerDialogue(int npcId, const char* text)
```

### Path Forward

To enable White Box:

1. **Use modern DevilutionX**: The diasurgical/devilutionX main branch has better Emscripten support
2. **OR Patch the fork**: Fix the va_list and other compatibility issues
3. **OR Use WebAssembly Text Format**: Patch the existing WASM binary directly
4. **OR Use wasmer/wasmtime**: Run WASM with additional imports

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Main Thread                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │  WASMBridge.js  │  │ GlassBoxMapper  │  │CustomAPIBridge  │ │
│  │ (Grid R/W API)  │  │(Pattern Matcher)│  │(Future White)   │ │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘ │
│           │                    │                    │           │
│           └────────────────────┼────────────────────┘           │
│                                │                                 │
│                    ┌───────────▼───────────┐                    │
│                    │   postMessage()       │                    │
│                    └───────────┬───────────┘                    │
└────────────────────────────────┼────────────────────────────────┘
                                 │
┌────────────────────────────────┼────────────────────────────────┐
│                    ┌───────────▼───────────┐                    │
│                    │  game.worker.js       │                    │
│                    │  - neural_* handlers  │                    │
│                    │  - custom_api_*       │                    │
│                    └───────────┬───────────┘                    │
│                                │                                 │
│                    ┌───────────▼───────────┐                    │
│                    │   WASM Module         │                    │
│                    │   (Diablo.wasm)       │                    │
│                    │                       │                    │
│                    │   - HEAPU8 (memory)   │                    │
│                    │   - _DApi_* (basic)   │                    │
│                    │   - [Custom exports]  │                    │
│                    └───────────────────────┘                    │
│                        Game Worker Thread                        │
└──────────────────────────────────────────────────────────────────┘
```

---

## Integration with Neural AI System

The WASM integration connects to the Neural AI system:

1. **LevelInjector** (`src/neural/LevelInjector.js`) - Orchestrates level injection using WASMBridge
2. **ModTools** (`src/neural/ModTools.js`) - AI-callable tools for game modification
3. **CampaignPipeline** - Converts AI-generated campaigns to injectable format

### Data Flow

```
AI Intent
    │
    ▼
CampaignBlueprint
    │
    ▼
Level Data (grid, monsters, objects)
    │
    ▼
WASMBridge.injectLevel()
    │
    ▼
game.worker.js (neural handlers)
    │
    ▼
WASM Memory (direct write)
    │
    ▼
Game renders custom level
```

---

## Troubleshooting

### Memory scan finds no candidates
- Ensure the game is in a dungeon level (not Tristram/town)
- Wait for level generation to complete
- The dungeon array only exists when inside a level

### Grid write doesn't update visuals
- The game may need to re-render (walking updates tiles)
- dPiece array may also need updating for full visual change
- Some changes require level reload to take effect

### Build errors with White Box approach
- Check Emscripten version compatibility
- The AJenbo fork works best with older Emscripten
- Consider using the main diasurgical/devilutionX branch

---

## References

- [DevilutionX GitHub](https://github.com/diasurgical/devilutionX)
- [AJenbo/devilutionX Fork](https://github.com/AJenbo/devilutionX) (used for web builds)
- [Emscripten Documentation](https://emscripten.org/docs/)
- [WASM Memory Model](https://developer.mozilla.org/en-US/docs/WebAssembly/Memory)
