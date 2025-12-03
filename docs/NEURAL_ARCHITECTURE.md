# DiabloWeb AI - Neural Augmentation Architecture

This document explains how the AI-driven content generation system works and how to adapt it for different games or content types.

## Overview

The Neural Augmentation system provides AI-driven procedural content generation for game content. It uses a modular tool-based architecture where complex generation tasks are broken into smaller, composable tools that can be called multiple times with partial result recovery.

```
┌─────────────────────────────────────────────────────────────────┐
│                        Game Application                          │
│  (React UI, Game State, Player Input)                           │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      NeuralInterop Layer                         │
│  - Bridges UI to generation systems                             │
│  - Manages generation state and progress                        │
│  - Coordinates WASM game engine calls                           │
└─────────────────────────────┬───────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│   Campaign    │   │    Level      │   │   Dialogue    │
│   Generator   │   │   Generator   │   │   Generator   │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        └─────────────────────────────────────────┐
                              │                   │
                              ▼                   │
┌─────────────────────────────────────────────────────────────────┐
│                      AI Tool System                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Tool Registry │  │ Tool Executor │  │   Pipelines  │          │
│  │              │  │              │  │              │          │
│  │ - Definitions │  │ - Retry logic │  │ - Campaign   │          │
│  │ - Schemas    │  │ - Caching    │  │ - Level      │          │
│  │ - Categories │  │ - Recovery   │  │ - Custom     │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Provider Manager                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   OpenRouter  │  │    Ollama    │  │  LM Studio   │          │
│  │   Provider    │  │   Provider   │  │   Provider   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. Provider Manager (`src/neural/providers/index.js`)

Handles communication with AI backends. Supports multiple providers:

- **OpenRouter** - Cloud API with many models (GPT-4, Claude, Llama, etc.)
- **Ollama** - Local models running on your machine
- **LM Studio** - Local model server with OpenAI-compatible API

```javascript
import { providerManager } from './providers';

// Configure provider
providerManager.configure({
  provider: 'openrouter',
  apiKey: 'your-api-key',
  model: 'anthropic/claude-3-haiku',
});

// Generate text
const response = await providerManager.generateText(prompt, {
  temperature: 0.7,
  maxTokens: 2000,
});

// Generate images (OpenRouter)
const imageBase64 = await providerManager.generateImage(prompt, {
  model: 'openai/dall-e-3',
  aspectRatio: '1:1',
});
```

### 2. AI Tool System (`src/neural/AIToolSystem.js`)

The core of the modular generation system. Instead of one large prompt, work is broken into smaller tools.

#### Tool Definitions

Each tool has:
- **name**: Unique identifier
- **description**: What the tool does (shown to AI)
- **parameters**: JSON schema of inputs
- **outputSchema**: JSON schema of expected output
- **isLocal**: If true, runs locally without AI call

```javascript
export const TOOLS = {
  generate_campaign_metadata: {
    name: 'generate_campaign_metadata',
    description: 'Generate basic campaign info: name, description, and theme',
    parameters: {
      type: 'object',
      properties: {
        template: { type: 'string', enum: ['CLASSIC', 'SIEGE', 'CORRUPTION'] },
        customTheme: { type: 'string' },
      },
      required: ['template'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        theme: { type: 'string' },
      },
      required: ['name', 'description'],
    },
  },
};
```

#### Tool Registry

Manages all available tools:

```javascript
import { toolRegistry } from './AIToolSystem';

// Get all tools
const allTools = toolRegistry.getAll();

// Get tools by category
const campaignTools = toolRegistry.getByCategory('campaign');
const levelTools = toolRegistry.getByCategory('level');
const enemyTools = toolRegistry.getByCategory('enemy');
const narrativeTools = toolRegistry.getByCategory('narrative');

// Register custom tool
toolRegistry.register('my_custom_tool', {
  name: 'my_custom_tool',
  description: 'Does something custom',
  parameters: { ... },
  outputSchema: { ... },
});
```

#### Tool Executor

Handles running tools with retry logic and partial recovery:

```javascript
import { toolExecutor, ToolExecutor } from './AIToolSystem';

// Execute single tool
const metadata = await toolExecutor.executeTool('generate_campaign_metadata', {
  template: 'CLASSIC',
  customTheme: 'dark horror',
});

// Execute multiple tools in parallel
const { results, errors } = await toolExecutor.executeToolBatch([
  { name: 'generate_act', params: { actNumber: 1, ... }, key: 'act1' },
  { name: 'generate_act', params: { actNumber: 2, ... }, key: 'act2' },
  { name: 'generate_act', params: { actNumber: 3, ... }, key: 'act3' },
], { parallel: true });

// Execute pipeline with dependencies
const campaign = await toolExecutor.executePipeline(PIPELINES.campaign);
```

#### Partial Result Recovery

When generation fails, partial results are cached and can be recovered:

```javascript
// Results are automatically cached
await toolExecutor.executeTool('generate_act', { actNumber: 1, ... });

// If later steps fail, recover what we have
const recovered = toolExecutor.recoverPartialResults();
// { generate_campaign_metadata: {...}, generate_act: {...} }

// Check cached results
const cached = toolExecutor.getCachedResults();
```

### 3. Generators

Higher-level generators that use the tool system:

#### CampaignGenerator (`src/neural/CampaignGenerator.js`)

Generates complete campaigns with acts, levels, bosses, and quests.

```javascript
import { CampaignGenerator } from './CampaignGenerator';

const generator = new CampaignGenerator();
const campaign = await generator.generateCampaign({
  template: 'CLASSIC',
  actCount: 4,
  difficulty: 'normal',
});
```

#### LevelGenerator (`src/neural/LevelGenerator.js`)

Generates dungeon layouts with rooms, corridors, and entities.

```javascript
import { LevelGenerator } from './LevelGenerator';

const generator = new LevelGenerator();
const level = await generator.generateLevel({
  theme: 'cathedral',
  difficulty: 2,
  width: 40,
  height: 40,
});
```

#### DialogueGenerator (`src/neural/DialogueGenerator.js`)

Generates contextual NPC dialogue based on game state.

```javascript
import { DialogueGenerator } from './DialogueGenerator';

const generator = new DialogueGenerator();
const dialogue = await generator.generate('CAIN', {
  playerClass: 'warrior',
  playerLevel: 10,
  recentBossKills: ['SKELETON_KING'],
  mood: 'celebration',
});
```

### 4. NeuralInterop (`src/neural/NeuralInterop.js`)

Bridges the generation system to the game engine:

```javascript
import NeuralInterop from './NeuralInterop';

// Initialize with WASM game instance
const interop = new NeuralInterop(gameInstance);

// Inject generated level into game
interop.injectLevel(generatedLevel);

// Inject enemies
interop.injectEnemies(enemyPlacements);

// Update NPC dialogue
interop.updateDialogue('CAIN', generatedDialogue);
```

## Adding a New Game

To adapt this system for a different game, follow these steps:

### Step 1: Define Your Content Structure

Create schemas for your game's content types. Example for a space game:

```javascript
// src/neural/games/space/schemas.js
export const SHIP_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    class: { type: 'string', enum: ['fighter', 'cruiser', 'carrier'] },
    weapons: { type: 'array' },
    shields: { type: 'number' },
  },
  required: ['name', 'class'],
};

export const MISSION_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    type: { type: 'string', enum: ['combat', 'escort', 'exploration'] },
    objectives: { type: 'array' },
    rewards: { type: 'object' },
  },
  required: ['id', 'title', 'type', 'objectives'],
};
```

### Step 2: Create Custom Tools

Register tools specific to your game:

```javascript
// src/neural/games/space/tools.js
import { toolRegistry } from '../../AIToolSystem';
import { SHIP_SCHEMA, MISSION_SCHEMA } from './schemas';

// Register ship generation tool
toolRegistry.register('generate_ship', {
  name: 'generate_ship',
  description: 'Generate a spaceship with stats and loadout',
  parameters: {
    type: 'object',
    properties: {
      shipClass: { type: 'string', enum: ['fighter', 'cruiser', 'carrier'] },
      faction: { type: 'string' },
      powerLevel: { type: 'number', minimum: 1, maximum: 10 },
    },
    required: ['shipClass'],
  },
  outputSchema: SHIP_SCHEMA,
});

// Register mission generation tool
toolRegistry.register('generate_mission', {
  name: 'generate_mission',
  description: 'Generate a space mission with objectives',
  parameters: {
    type: 'object',
    properties: {
      missionType: { type: 'string', enum: ['combat', 'escort', 'exploration'] },
      difficulty: { type: 'number' },
      sector: { type: 'string' },
    },
    required: ['missionType', 'difficulty'],
  },
  outputSchema: MISSION_SCHEMA,
});
```

### Step 3: Create Custom Pipelines

Define generation pipelines for complex content:

```javascript
// src/neural/games/space/pipelines.js
export const SPACE_PIPELINES = {
  campaign: [
    {
      name: 'generate_campaign_metadata',
      params: (ctx) => ({
        template: ctx.template || 'SPACE_OPERA',
        customTheme: ctx.customTheme,
      }),
      key: 'metadata',
    },
    {
      name: 'generate_mission',
      params: (ctx) => ({
        missionType: 'exploration',
        difficulty: 1,
        sector: ctx.metadata?.startingSector,
      }),
      key: 'firstMission',
    },
    {
      name: 'generate_ship',
      params: (ctx) => ({
        shipClass: 'fighter',
        faction: 'player',
        powerLevel: 1,
      }),
      key: 'starterShip',
    },
  ],
};
```

### Step 4: Create a Generator Class

Wrap the tools in a high-level generator:

```javascript
// src/neural/games/space/SpaceGenerator.js
import { toolExecutor } from '../../AIToolSystem';
import { SPACE_PIPELINES } from './pipelines';
import './tools'; // Register tools

export class SpaceGenerator {
  async generateCampaign(options = {}) {
    const executor = new ToolExecutor({
      onProgress: options.onProgress,
    });

    // Use pipeline with initial context
    const result = await executor.executePipeline(SPACE_PIPELINES.campaign);

    return {
      metadata: result.metadata,
      missions: [result.firstMission],
      playerShip: result.starterShip,
    };
  }

  async generateMission(options = {}) {
    return toolExecutor.executeTool('generate_mission', options);
  }

  async generateShip(options = {}) {
    return toolExecutor.executeTool('generate_ship', options);
  }
}
```

### Step 5: Create an Interop Layer

Bridge generated content to your game engine:

```javascript
// src/neural/games/space/SpaceInterop.js
export class SpaceInterop {
  constructor(gameEngine) {
    this.engine = gameEngine;
  }

  injectShip(shipData) {
    // Convert AI-generated data to engine format
    const engineShip = {
      id: this.engine.createEntity(),
      name: shipData.name,
      classId: this.getClassId(shipData.class),
      weapons: shipData.weapons.map(w => this.convertWeapon(w)),
      shieldStrength: shipData.shields,
    };

    this.engine.spawnShip(engineShip);
    return engineShip.id;
  }

  injectMission(missionData) {
    this.engine.missionManager.addMission({
      id: missionData.id,
      title: missionData.title,
      objectives: missionData.objectives.map(o => this.convertObjective(o)),
      onComplete: () => this.handleMissionComplete(missionData),
    });
  }

  getClassId(className) {
    const classMap = { fighter: 1, cruiser: 2, carrier: 3 };
    return classMap[className] || 1;
  }

  convertWeapon(weapon) {
    // Map AI weapon descriptions to engine weapon IDs
    return { ... };
  }

  convertObjective(objective) {
    // Map AI objectives to engine format
    return { ... };
  }
}
```

### Step 6: Wire It Up

Connect everything in your game's initialization:

```javascript
// src/games/space/index.js
import { SpaceGenerator } from './SpaceGenerator';
import { SpaceInterop } from './SpaceInterop';
import { providerManager } from '../../neural/providers';

export async function initializeSpaceGame(engine, aiConfig) {
  // Configure AI provider
  providerManager.configure(aiConfig);

  // Create generator and interop
  const generator = new SpaceGenerator();
  const interop = new SpaceInterop(engine);

  // Generate initial content
  const campaign = await generator.generateCampaign({
    onProgress: (p) => console.log('Generating:', p),
  });

  // Inject into engine
  interop.injectShip(campaign.playerShip);
  campaign.missions.forEach(m => interop.injectMission(m));

  return { generator, interop, campaign };
}
```

## Tool Categories

The default installation includes these tool categories:

| Category | Tools | Purpose |
|----------|-------|---------|
| campaign | generate_campaign_metadata, generate_act, generate_act_levels, generate_boss, generate_quests | High-level campaign structure |
| level | generate_room_layout, generate_corridors, place_special_tiles | Dungeon layout generation |
| enemy | generate_spawn_points, place_enemies_at_spawn, place_boss_encounter | Enemy placement |
| narrative | generate_dialogue, generate_area_lore | Story and dialogue |
| utility | repair_json, validate_grid | Local helper tools |

## Error Handling & Recovery

The system handles failures gracefully:

### Retry Logic

```javascript
const executor = new ToolExecutor({
  maxRetries: 3,        // Retry failed calls up to 3 times
  retryDelay: 1000,     // Start with 1 second delay
  // Uses exponential backoff: 1s, 2s, 4s
});
```

### Partial Results

When a tool returns data missing some required fields:

```javascript
const result = await toolExecutor.executeTool('generate_act', params);
// Even if some optional fields are missing, usable data is returned

// Check what was recovered
const cached = toolExecutor.getCachedResults();
// Each result has status: 'success' | 'partial' | 'failed'
```

### JSON Repair

AI responses often have malformed JSON. The system auto-repairs:

- Trailing commas: `{"a": 1,}` → `{"a": 1}`
- Missing commas: `{"a": 1 "b": 2}` → detected and reported
- Extra text: `Here is the JSON: {...}` → `{...}`
- "null or {}" patterns: `null or {"x": 1}` → `null`

## Configuration

### Neural Config (`src/neural/config.js`)

```javascript
const NeuralConfig = {
  // AI Provider settings
  provider: 'openrouter',
  apiKey: process.env.OPENROUTER_API_KEY,
  model: 'anthropic/claude-3-haiku',
  imageModel: 'openai/dall-e-3',

  // Generation defaults
  temperature: 0.7,
  maxTokens: 2000,

  // Tool execution
  maxRetries: 3,
  retryDelay: 1000,

  // Caching
  enableCache: true,
  cacheTTL: 300000, // 5 minutes
};
```

### Per-Request Options

```javascript
await toolExecutor.executeTool('generate_act', params, {
  forceRefresh: true,  // Ignore cache
  temperature: 0.9,    // Higher creativity
  maxTokens: 4000,     // Longer response
});
```

## Testing

Mock providers are available for testing without API calls:

```javascript
import { MockProvider, MalformedMockProvider } from '../tests/fixtures/mockResponses';

// Use mock provider
const executor = new ToolExecutor({
  provider: new MockProvider(),
});

// Test error handling
const errorExecutor = new ToolExecutor({
  provider: new MalformedMockProvider(),
});
```

Run tests:

```bash
npm test -- --config=jest.neural.config.js
```

## Best Practices

1. **Break down complex generation** - Use multiple small tools instead of one large prompt
2. **Define strict schemas** - Clear output schemas improve AI response quality
3. **Use pipelines for dependencies** - When step B needs step A's output, use a pipeline
4. **Handle partial results** - Always check for and use partial data when full generation fails
5. **Cache aggressively** - Repeated calls with same params return cached results
6. **Test with mocks** - Use MockProvider for unit tests, real providers for integration tests
7. **Monitor progress** - Use onProgress callback to show generation status to users
