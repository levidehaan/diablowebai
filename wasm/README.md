# DevilutionX WASM Build System

This directory contains the infrastructure for rebuilding the DevilutionX WASM binary
with custom API exports for the Neural AI system.

## Strategy: White Box Recompilation

Instead of treating the WASM binary as a black box and scanning for memory addresses,
we rebuild the engine with explicit exports that allow the JavaScript layer to act
as a "Hypervisor" - directly controlling game state.

## New API Exports

The `CustomAPI.cpp` module exposes these functions to JavaScript:

### Level Control
- `DApi_OverrideStartLevel(levelId)` - Start on custom level instead of Tristram
- `DApi_SuppressNPCs(bool)` - Prevent standard Tristram NPCs from spawning
- `DApi_SetDungeonGeometry(gridPtr, width, height)` - Inject tile grid directly

### Monster Control
- `DApi_InjectMonster(x, y, typeId, hp, flags)` - Spawn monster at runtime
- `DApi_ClearMonsters()` - Wipe all monsters from current level
- `DApi_GetMonsterCount()` - Get active monster count

### Object Control
- `DApi_InjectObject(x, y, typeId)` - Place object at runtime
- `DApi_ClearObjects()` - Wipe all objects from current level

### State Access
- `DApi_GetCurrentLevel()` - Get current dungeon level ID
- `DApi_GetPlayerPos(outX, outY)` - Get player position
- `DApi_SetPlayerPos(x, y)` - Teleport player
- `DApi_PauseGameLogic(bool)` - Freeze game tick while overlay shows

### Memory Pointers (for Glass Box fallback)
- `DApi_GetDLevelPtr()` - Get pointer to dLevel[40][40]
- `DApi_GetDMonsterPtr()` - Get pointer to dMonster array
- `DApi_GetDObjectPtr()` - Get pointer to dObject array
- `DApi_GetPlayerPtr()` - Get pointer to player struct

## Building

### Prerequisites
- Docker with emscripten/emsdk:3.1.47 image
- The devilutionX source (cloned automatically)

### Build Commands

```bash
# Build with custom exports (recommended)
./build.sh --custom-api

# Build with debug symbols for Glass Box (fallback)
./build.sh --debug-symbols

# Full rebuild
./build.sh --clean --custom-api
```

### Output

The build produces:
- `Diablo.wasm` - The main WASM binary
- `Diablo.jscc` - JavaScript glue code
- `symbols.json` - Memory address map (debug builds only)

Copy these to `src/api/` to use in the web app.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    JavaScript Layer                          │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ ModTools.js │  │ QuestSystem  │  │ DialogueOverlay  │   │
│  └─────────────┘  └──────────────┘  └──────────────────┘   │
│           │               │                  │              │
│           └───────────────┼──────────────────┘              │
│                           │                                  │
│                    ┌──────▼──────┐                          │
│                    │ WASMBridge  │ (calls new exports)      │
│                    └──────┬──────┘                          │
└───────────────────────────┼─────────────────────────────────┘
                            │
┌───────────────────────────┼─────────────────────────────────┐
│                    WASM Binary                               │
│                    ┌──────▼──────┐                          │
│                    │ CustomAPI   │ (new module)             │
│                    └──────┬──────┘                          │
│           ┌───────────────┼───────────────┐                 │
│    ┌──────▼──────┐ ┌──────▼──────┐ ┌──────▼──────┐        │
│    │   gendung   │ │   monster   │ │   objects   │        │
│    │ (tiles)     │ │ (enemies)   │ │ (items)     │        │
│    └─────────────┘ └─────────────┘ └─────────────┘        │
│                    Original DevilutionX                      │
└─────────────────────────────────────────────────────────────┘
```
