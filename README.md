# Diablo Web AI - Neural Augmented Edition

A browser-based port of Diablo enhanced with AI-driven procedural content generation, dynamic narratives, and adaptive NPC behavior.

**Play the original version:** https://d07RiV.github.io/diabloweb/

---

## What's New: Neural Augmentation System

This fork transforms the static Diablo experience into a **living, AI-driven game** with:

### AI-Generated Dungeons
Instead of the same dungeon layouts, the AI generates unique 40x40 tile dungeons with:
- Procedurally generated room layouts based on level theme
- Guaranteed connectivity between entrance and exit
- Dynamic monster spawn point placement
- Theme-aware generation (Cathedral, Catacombs, Caves, Hell)

### Dynamic NPC Dialogue
NPCs now respond contextually based on your progress:
- **Deckard Cain** references bosses you've defeated
- **Ogden** comments on your wounds after battle
- **Griswold** offers advice based on your class
- Story context is maintained across sessions

### Adaptive Monster AI
Monsters now fight tactically instead of blindly charging:
- **Squad Formations**: Monsters coordinate in LINE, WEDGE, FLANK, or SURROUND patterns
- **Boss Personalities**: The Butcher relentlessly pursues; Skeleton King summons minions
- **Utility-Based Decisions**: Wounded monsters may retreat; ranged units maintain distance

### Dynamic Quest Generation
AI-generated side quests based on your current situation:
- Kill quests with tracked progress
- Exploration objectives
- Boss challenges with appropriate rewards

---

## Quick Start

### Playing Locally

```bash
# Install dependencies
npm install

# Start development server
npm start

# Open http://localhost:3000
```

### With AI Features Enabled

The Neural Augmentation system works in two modes:

1. **Mock Mode** (No API key): Uses built-in procedural generation
2. **AI Mode**: Uses your preferred AI provider for enhanced content

On first launch, you'll see a configuration panel to set up your AI provider.

### Supported AI Providers

| Provider | Text Generation | Image Generation | Setup |
|----------|----------------|------------------|-------|
| **OpenRouter** | All models | Via compatible endpoints | Recommended - access to 100+ models |
| **OpenAI** | GPT-4, GPT-3.5 | DALL-E 3 | Direct API key |
| **Google Gemini** | Gemini Pro/Ultra | Imagen | Google AI API key |
| **Anthropic** | Claude 3 | - | Direct API key |
| **Local (Ollama)** | Any local model | - | No API key needed |

### Environment Variables (Optional)

```bash
# For OpenRouter (recommended)
REACT_APP_AI_PROVIDER=openrouter
REACT_APP_OPENROUTER_API_KEY=sk-or-...

# For OpenAI
REACT_APP_AI_PROVIDER=openai
REACT_APP_OPENAI_API_KEY=sk-...

# For Gemini
REACT_APP_AI_PROVIDER=gemini
REACT_APP_GEMINI_API_KEY=...

# For local models
REACT_APP_AI_PROVIDER=local
REACT_APP_LOCAL_ENDPOINT=http://localhost:11434
```

---

## Neural Augmentation Architecture

```
src/neural/
├── config.js           # Multi-provider configuration
├── index.js            # Main entry point
├── NeuralInterop.js    # WASM <-> JS bridge
├── LevelGenerator.js   # AI dungeon generation
├── NarrativeEngine.js  # Dynamic dialogue & quests
├── CommanderAI.js      # Tactical NPC behavior
├── AssetPipeline.js    # AI asset generation
└── providers/          # AI provider implementations
    ├── index.js
    ├── openrouter.js
    ├── openai.js
    ├── gemini.js
    └── local.js
```

### Module Descriptions

| Module | Purpose |
|--------|---------|
| **NeuralInterop** | Bridges JavaScript AI systems with the WASM game engine |
| **LevelGenerator** | Generates 40x40 dungeon grids with A* pathfinding validation |
| **NarrativeEngine** | Maintains story context and generates contextual dialogue |
| **CommanderAI** | Coordinates monster squads with tactical formations |
| **AssetPipeline** | Converts AI-generated images to Diablo's CL2 format |

---

## AI Provider Compatibility

### What Works With Every Provider

The system uses simple, compatible prompt patterns:

```javascript
// Level Generation - expects JSON output
"Generate a 40x40 dungeon grid as JSON..."

// Dialogue - simple text completion
"You are Deckard Cain. The player just defeated the Butcher..."

// Tactics - expects JSON decisions
"Analyze this tactical situation and provide orders as JSON..."
```

**Compatibility Matrix:**

| Feature | OpenRouter | OpenAI | Gemini | Claude | Llama/Local |
|---------|------------|--------|--------|--------|-------------|
| Dungeon Generation | Full | Full | Full | Full | Full |
| NPC Dialogue | Full | Full | Full | Full | Full |
| Quest Generation | Full | Full | Full | Full | Full |
| Tactical AI | Full | Full | Full | Full | Partial* |
| Image Generation | Via models | DALL-E | Imagen | - | Stable Diffusion |

*Smaller local models may produce less coherent tactical decisions

### OpenRouter Benefits

OpenRouter is recommended because:
- Access to 100+ models from one API key
- Automatic fallback if a model is unavailable
- Pay-per-use with no monthly minimums
- Model comparison to find best price/quality

---

## Configuration UI

On first launch (or via Settings), you can configure:

1. **AI Provider**: OpenRouter, OpenAI, Gemini, Anthropic, or Local
2. **API Key**: Your provider's API key
3. **Text Model**: Which model to use for text generation
4. **Image Model**: Which model to use for asset generation (optional)
5. **Feature Toggles**: Enable/disable individual AI features

Settings are stored in browser localStorage.

---

## Feature Details

### AI Level Generation

```javascript
// The AI receives constraints and generates layouts
const level = await levelGenerator.generate(DTYPE_CATHEDRAL, depth);

// Returns:
{
  grid: [[0,1,1,...], ...],  // 40x40 tile array
  rooms: [{x, y, width, height}, ...],
  entities: [{type: 'MONSTER_SPAWN', x, y, count}, ...]
}
```

**Tile Types:**
- `0` Floor - walkable area
- `1` Wall - impassable
- `2` Door - connecting rooms
- `3` Stairs Up - level entrance
- `4` Stairs Down - level exit

### Dynamic Dialogue

```javascript
// Context is automatically tracked
narrativeEngine.recordEvent('BOSS_DEFEATED', { boss: 'BUTCHER' });

// Dialogue reflects context
const dialogue = await narrativeEngine.generateDialogue('OGDEN');
// "Thank the Light! You've slain that butcher! The town sleeps easier..."
```

### Commander AI Formations

```
LINE Formation        SURROUND Formation
  M M M                    M
    ↓                    M P M
    P                      M

FLANK Formation       WEDGE Formation
 M     M                  M
   ↘ ↙                   M M
    P                    M P M
```

---

## Development

### Running Tests

```bash
# Unit tests for neural modules
npm run test:neural

# Integration tests (requires browser)
npm run test:integration

# All tests
npm run test:all
```

### Docker Development

```bash
# Build container
npm run docker:build

# Development with hot reload
npm run docker:dev

# Run tests in container
npm run docker:test
```

### Building for Production

```bash
npm run build
```

---

## Original Project

This project is based on:
- **devilution**: https://github.com/diasurgical/devilution
- **diabloweb**: https://github.com/d07RiV/diabloweb

The original WebAssembly compilation removes all native dependencies and exposes a minimal JavaScript interface, allowing the game to run entirely in the browser.

### Game Data

- **Shareware**: Included `spawn.mpq` allows playing the demo
- **Full Game**: Requires `DIABDAT.MPQ` from [GoG](https://www.gog.com/game/diablo)

---

## Technical Notes

### WASM Integration

The Neural Interop Layer provides bidirectional communication:

```javascript
// Initialize with WASM module
neuralInterop.initialize(wasmModule);

// Read game state
const state = neuralInterop.extractGameState();

// Inject AI decisions
neuralInterop.injectCommand('MOVE_MONSTER', { monsterId, targetX, targetY });
```

### Memory Safety

- Pointers are refreshed after WASM memory growth
- LRU caching prevents memory bloat
- Automatic cleanup of dead entities

### Offline Support

When no API key is configured, the system falls back to:
- **MockLevelGenerator**: Procedural room-based generation
- **MockDialogueGenerator**: Pre-written thematic dialogue
- **MockCommanderAI**: Simple distance-based tactics

This ensures the game remains fully playable offline.

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run tests: `npm run test:all`
4. Submit a pull request

---

## License

Based on the original Diablo decompilation project. See [devilution](https://github.com/diasurgical/devilution) for license details.

---

## Roadmap

- [ ] Procedural item generation with AI descriptions
- [ ] AI-generated monster variants
- [ ] Persistent world state across sessions
- [ ] Multiplayer with synchronized AI state
- [ ] Voice synthesis for NPC dialogue
