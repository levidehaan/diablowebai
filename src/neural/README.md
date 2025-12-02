# Neural Augmentation System for Diablo Web

This module provides AI-driven enhancements to the Diablo Web engine, transforming static game mechanics into dynamic, adaptive experiences.

## Overview

The Neural Augmentation System introduces four primary AI subsystems:

1. **Level Generator** - AI-driven procedural dungeon generation
2. **Narrative Engine** - Dynamic dialogue and quest generation
3. **Commander AI** - Tactical NPC behavior and squad coordination
4. **Asset Pipeline** - Runtime asset generation and conversion

## Architecture

```
Neural Augmentation System
├── config.js           # Configuration and settings
├── index.js            # Main entry point and exports
├── NeuralInterop.js    # WASM <-> JS bridge layer
├── LevelGenerator.js   # Procedural level generation
├── NarrativeEngine.js  # Dynamic dialogue and quests
├── CommanderAI.js      # NPC tactical behavior
├── AssetPipeline.js    # Asset generation utilities
└── neural.worker.js    # Worker thread integration
```

## Quick Start

### 1. Configuration

Set environment variables for AI integration:

```bash
export REACT_APP_AI_ENDPOINT="https://api.openai.com/v1"
export REACT_APP_AI_API_KEY="your-api-key"
export REACT_APP_AI_MODEL="gpt-4"
```

### 2. Integration

```javascript
import neuralAugmentation from './neural';

// Initialize with WASM module
await neuralAugmentation.initialize(wasmModule);

// Generate a level
const levelData = await neuralAugmentation.generateLevel(1, 5);

// Generate NPC dialogue
const dialogue = await neuralAugmentation.generateDialogue('CAIN');
```

## Modules

### Level Generator

Generates 40x40 dungeon grids with AI-driven layouts.

```javascript
import levelGenerator from './neural/LevelGenerator';

// Generate a Cathedral level at depth 3
const level = await levelGenerator.generate(1, 3);

// level.grid - 40x40 tile array
// level.rooms - Room metadata
// level.entities - Monster spawn points
```

**Tile Types:**
- 0: Floor
- 1: Wall
- 2: Door
- 3: Stairs Up (entrance)
- 4: Stairs Down (exit)
- 5: Special

**Level Types:**
- 1: Cathedral
- 2: Catacombs
- 3: Caves
- 4: Hell

### Map Healing

The MapHealer ensures generated maps are playable:

```javascript
import { MapHealer, Pathfinder } from './neural/LevelGenerator';

// Heal a potentially broken map
const healedGrid = MapHealer.heal(aiGeneratedGrid);

// Validate path exists
const path = Pathfinder.findPath(grid, startX, startY, endX, endY);
```

### Narrative Engine

Provides context-aware dialogue and quest generation.

```javascript
import narrativeEngine from './neural/NarrativeEngine';

// Initialize
narrativeEngine.initialize();

// Generate dialogue
const dialogue = await narrativeEngine.generateDialogue('OGDEN', {
  event: 'PLAYER_RETURNED_FROM_DUNGEON'
});

// Record game events for context
narrativeEngine.recordEvent('BOSS_DEFEATED', { boss: 'BUTCHER' });

// Get story summary
const context = narrativeEngine.getContext().getSummary();
```

**Supported NPCs:**
- OGDEN - Tavern Owner
- GRISWOLD - Blacksmith
- PEPIN - Healer
- CAIN - Elder Sage
- ADRIA - Witch
- WIRT - Boy Merchant
- FARNHAM - Town Drunk
- GILLIAN - Barmaid

### Quest Manager

```javascript
const questManager = narrativeEngine.getQuestManager();

// Generate a new quest
const quest = await questManager.generateQuest(context, 'CAIN');

// Update progress
questManager.updateProgress('MONSTER_KILLED', { type: 'SKELETON' });

// Get active quests
const activeQuests = questManager.getActiveQuests();
```

### Commander AI

Hierarchical tactical AI for monster behavior.

```javascript
import commanderAI from './neural/CommanderAI';

// Initialize
commanderAI.initialize();

// Enable/disable
commanderAI.setEnabled(true);

// Get status
const status = commanderAI.getStatus();
```

**Squad Formations:**
- LINE - Perpendicular to target
- WEDGE - V-formation
- FLANK - Two-pronged attack
- SURROUND - Encircle target
- RETREAT - Fall back

**Boss Personalities:**
- BUTCHER: Relentless pursuer, never retreats
- SKELETON_KING: Defensive commander, summons minions
- LAZARUS: Cunning manipulator, uses teleport
- DIABLO: Apocalyptic destroyer

### Asset Pipeline

Converts AI-generated images to game-compatible formats.

```javascript
import assetPipeline from './neural/AssetPipeline';

// Generate monster sprite
const sprite = await assetPipeline.generateMonsterSprite('Frost Skeleton', {
  width: 128,
  height: 128,
  frameWidth: 32,
  frameHeight: 32,
});

// Get the Diablo color palette
const palette = assetPipeline.getPalette();
```

## Neural Interop Layer

The bridge between JavaScript and WASM:

```javascript
import neuralInterop from './neural/NeuralInterop';

// Initialize with WASM module
neuralInterop.initialize(wasmModule);

// Read game state
const state = neuralInterop.extractGameState();

// Subscribe to events
neuralInterop.on('frame', (data) => {
  console.log('Frame:', data.frameCount);
});

neuralInterop.on('levelGenerated', (levelData) => {
  console.log('New level generated');
});
```

## Configuration Reference

Edit `config.js` to customize behavior:

```javascript
const NeuralConfig = {
  provider: {
    endpoint: 'https://api.openai.com/v1',
    apiKey: '',
    model: 'gpt-4',
    timeout: 30000,
  },

  levelGeneration: {
    enabled: true,
    gridWidth: 40,
    gridHeight: 40,
    constraints: {
      minRooms: 3,
      maxRooms: 8,
      ensureConnectivity: true,
    },
  },

  narrative: {
    enabled: true,
    contextWindowSize: 10,
    maxDialogueLength: 256,
  },

  commander: {
    enabled: true,
    tacticalUpdateInterval: 60,  // frames
    bossUpdateInterval: 30,
  },

  debug: {
    enabled: true,
    mockAPIResponses: true,  // Use mock when no API key
  },
};
```

## Testing

Run the neural augmentation tests:

```bash
# Unit tests
npm run test:neural

# Integration tests (requires browser)
npm run test:integration

# All tests
npm run test:all
```

## Docker

Build and run with Docker:

```bash
# Build the container
npm run docker:build

# Development mode
npm run docker:dev

# Run tests in container
npm run docker:test
```

## Mock Mode

When no AI API key is configured, the system automatically uses mock generators:

- **MockLevelGenerator**: Procedural room-based generation
- **MockDialogueGenerator**: Pre-written dialogue lines
- **MockCommanderAI**: Simple tactical decisions

This allows development and testing without API costs.

## Events

Subscribe to Neural events:

| Event | Data | Description |
|-------|------|-------------|
| `initialized` | `{}` | System ready |
| `frame` | `{frameCount, timestamp}` | Frame update |
| `levelGenerated` | `{grid, rooms, entities}` | New level created |
| `questCompleted` | `{quest}` | Quest finished |
| `tacticalOrders` | `[orders]` | Monster commands |
| `bossAction` | `{bossId, tactic}` | Boss behavior |

## Memory Management

The system includes safeguards against memory leaks:

- Pointer refresh on memory growth
- LRU caching for dialogues and levels
- Automatic cleanup of dead entities

Monitor with:
```javascript
const status = neuralAugmentation.getStatus();
console.log(status.subsystems);
```

## Save/Load State

Persist narrative state across sessions:

```javascript
// Save
const state = neuralAugmentation.saveState();
localStorage.setItem('neural_state', JSON.stringify(state));

// Load
const saved = JSON.parse(localStorage.getItem('neural_state'));
neuralAugmentation.loadState(saved);
```

## Limitations

1. **API Latency**: AI generation takes 1-5 seconds; use async patterns
2. **Token Costs**: Complex prompts consume API tokens
3. **WASM Integration**: Full memory access requires C++ modifications
4. **Asset Generation**: Disabled by default; requires image generation API

## Contributing

1. Run tests before committing
2. Update documentation for new features
3. Use mock mode for development
4. Follow existing code patterns

## License

Part of the DiabloWeb project. See main repository for license.
