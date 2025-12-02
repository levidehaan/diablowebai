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

### AI-Generated Campaigns
Create entirely new Diablo experiences:
- **Campaign Templates**: Classic Descent, Under Siege, Spreading Corruption, Sacred Relics
- **Procedural Storylines**: AI-generated narrative arcs with progression gates
- **World Building**: Multiple dungeon levels, overworld maps, and boss lairs
- **Progression System**: Kill bosses to unlock new areas

### Custom Character Generation
AI can generate new monsters and characters:
- **Sprite Generation**: Pass requirements (size, description) to generate new sprites
- **Browser-side Resizing**: Automatic conversion to game-compatible formats
- **CL2/CEL Conversion**: AI images converted to Diablo's 256-color palette

### Smart Enemy Placement
Instead of real-time AI control (too many API calls), the system:
- **Places enemies** at design time based on difficulty
- **Controls spawn locations** and enemy types per area
- **Creates boss encounters** with appropriate minions
- **Gates progression** via required boss kills

### Save, Export & Import
Full client-side storage with IndexedDB:
- **Save Games**: Persist campaigns and progress locally
- **Export Campaigns**: Share AI-generated campaigns as JSON files
- **Import Campaigns**: Load campaigns created on other machines
- **Cross-Browser**: Works on any modern browser

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
├── config.js             # Multi-provider configuration
├── index.js              # Main entry point
├── NeuralInterop.js      # WASM <-> JS bridge
├── LevelGenerator.js     # AI dungeon generation
├── NarrativeEngine.js    # Dynamic dialogue & quests
├── CommanderAI.js        # Tactical NPC behavior (reference)
├── EnemyPlacement.js     # Design-time enemy spawning
├── CampaignGenerator.js  # AI storyline & mission creation
├── WorldBuilder.js       # Level & area construction
├── GameStorage.js        # IndexedDB persistence & export
├── AssetPipeline.js      # AI asset generation + resizing
├── AIConfigPanel.js      # Provider configuration UI
├── CampaignManager.js    # Campaign management UI
├── AIConfigPanel.scss    # Provider UI styles
├── CampaignManager.scss  # Campaign UI styles
└── providers/            # AI provider implementations
    └── index.js          # OpenRouter, OpenAI, Gemini, Anthropic, Local
```

### Module Descriptions

| Module | Purpose |
|--------|---------|
| **NeuralInterop** | Bridges JavaScript AI systems with the WASM game engine |
| **LevelGenerator** | Generates 40x40 dungeon grids with A* pathfinding validation |
| **NarrativeEngine** | Maintains story context and generates contextual dialogue |
| **EnemyPlacement** | Places enemies at design time based on difficulty |
| **CampaignGenerator** | Creates storylines, missions, and progression gates |
| **WorldBuilder** | Constructs worlds with levels, areas, and transitions |
| **GameStorage** | IndexedDB storage with export/import functionality |
| **AssetPipeline** | Converts AI images to CL2 format with browser resizing |
| **CampaignManager** | React UI for creating/loading/exporting campaigns |

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

### Campaign Generation

```javascript
// Generate a new campaign
const campaign = await neuralAugmentation.generateCampaign('CLASSIC', {
  customTheme: 'Ancient Egyptian tombs',
});

// Campaign structure
{
  id: 'campaign_123',
  name: 'The Darkness Returns',
  acts: [
    {
      name: 'Act 1: Desecrated Halls',
      theme: 'Cathedral',
      levels: [...],
      boss: { name: 'The Defiler', type: 'SKELETON_KING' },
      unlockCondition: null,
    },
    // ... more acts
  ],
  quests: [...],
}
```

**Campaign Templates:**
- `CLASSIC`: Traditional 4-act dungeon descent
- `SIEGE`: Defend Tristram from waves (3 acts)
- `CORRUPTION`: Time-limited cleansing missions
- `QUEST`: Collect sacred relics across 5 acts

### Enemy Placement

```javascript
// Generate enemy placements for an area
const placements = await enemyPlacement.generatePlacements({
  name: 'Cathedral Level 2',
  difficulty: 3,
  spawnPoints: [
    { x: 10, y: 15, template: 'PATROL' },
    { x: 25, y: 20, template: 'AMBUSH' },
  ],
  bossArea: {
    x: 20, y: 5,
    bossType: 'SKELETON_KING',
    progressionGate: 'cathedral_level_3',
  },
});

// Returns array of enemy spawns
[
  { x: 10, y: 15, enemyType: 'SKELETON', difficulty: 2 },
  { x: 20, y: 5, enemyType: 'SKELETON_KING', isBoss: true, progressionGate: '...' },
  // ...
]
```

### Save/Export/Import

```javascript
// Save current game
await GameStorage.saveGameState(campaign, world, progress);

// List saved campaigns
const saved = await GameStorage.getSavedCampaigns();

// Export to file
await GameStorage.exporter.exportToFile(campaignId);
// Downloads: diablo-campaign-the-darkness-returns-1699999999.json

// Import from file
const campaign = await GameStorage.importer.importFromFile(file);
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

## Deploying to GitHub Pages

This project can be deployed to GitHub Pages for free hosting. There are two methods:

### Method 1: Automatic Deployment (GitHub Actions)

The repository includes a GitHub Actions workflow that automatically deploys when you push to `main`.

1. **Fork or clone this repository**

2. **Enable GitHub Pages in your repository settings:**
   - Go to Settings > Pages
   - Under "Build and deployment", select "GitHub Actions"

3. **Push to main branch:**
   ```bash
   git push origin main
   ```

   The workflow will automatically build and deploy your site.

4. **Access your site at:**
   ```
   https://[your-username].github.io/[repo-name]/
   ```

### Method 2: Manual Deployment (gh-pages branch)

If you prefer manual control over deployments:

1. **Install gh-pages:**
   ```bash
   npm install
   ```

2. **Build and deploy:**
   ```bash
   npm run deploy:manual
   ```

   This builds the project and pushes to the `gh-pages` branch.

3. **Configure GitHub Pages:**
   - Go to Settings > Pages
   - Under "Build and deployment", select "Deploy from a branch"
   - Choose `gh-pages` branch and `/ (root)` folder

### Important Notes

- **All features work on GitHub Pages** - The Neural Augmentation system uses client-side storage (IndexedDB) and API calls are made directly from the browser
- **API Keys** - When you configure an AI provider, your API key is stored in localStorage on your browser only
- **Game Files** - The shareware `spawn.mpq` is included; for the full game, users need to provide their own `DIABDAT.MPQ`
- **Custom Domain** - You can configure a custom domain in Settings > Pages

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

### Completed
- [x] AI-driven procedural level generation
- [x] Dynamic NPC dialogue with context
- [x] Campaign generation system
- [x] World building with progression gates
- [x] Smart enemy placement (design-time)
- [x] Save/Export/Import campaigns
- [x] Multi-provider AI support
- [x] Browser-side image resizing
- [x] IndexedDB persistence
- [x] Full game loop integration with campaigns
- [x] Custom character sprite generation UI
- [x] GitHub Pages deployment support

### Planned
- [ ] Procedural item generation with AI descriptions
- [ ] AI-generated monster variants
- [ ] Overworld exploration areas
- [ ] Multiplayer with campaign sharing
- [ ] Voice synthesis for NPC dialogue
- [ ] Campaign rating and sharing platform
