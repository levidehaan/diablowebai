# Diablo Web AI - Upgrade Roadmap

This document tracks planned upgrades for the AI-driven game modification system. The goal is to create entirely new game experiences by leveraging Diablo's existing engine while controlling parameters, content, and structure through AI.

---

## Technical Documentation

Detailed technical documentation has been created in the `docs/` directory:

| Document | Description |
|----------|-------------|
| [docs/MPQ_STRUCTURE.md](docs/MPQ_STRUCTURE.md) | MPQ archive format, 2,907 files catalogued, all file types |
| [docs/WASM_INTERFACE.md](docs/WASM_INTERFACE.md) | WASM engine interface, worker protocol, memory access |
| [docs/GAME_DATA_FORMATS.md](docs/GAME_DATA_FORMATS.md) | DUN format, 100+ monsters, 64+ objects, quest triggers |

---

## Table of Contents

1. [Core Architecture](#1-core-architecture)
2. [Visual Grid System for AI](#2-visual-grid-system-for-ai)
3. [Dungeon Parameter Control](#3-dungeon-parameter-control)
4. [MPQ Content Management](#4-mpq-content-management)
5. [Event System Integration](#5-event-system-integration)
6. [User Visibility & Debug UI](#6-user-visibility--debug-ui)
7. [Quest & Dialogue System](#7-quest--dialogue-system)
8. [Multi-Stage World Building](#8-multi-stage-world-building)
9. [Current Issues & Fixes](#9-current-issues--fixes)

---

## 1. Core Architecture

### 1.1 MPQ Structure Understanding
- [x] Document all file types in spawn.mpq and their purposes *(see [docs/MPQ_STRUCTURE.md](docs/MPQ_STRUCTURE.md))*
  - [x] DUN files (level layouts, quest set-pieces)
  - [x] CEL/CL2 files (sprites, animations)
  - [x] PAL files (color palettes)
  - [x] TIL files (tile definitions)
  - [x] MIN files (miniset definitions)
  - [x] SOL files (solidity/collision data)
  - [x] AMP files (automap data)
  - [ ] TXT files (game data tables) - *not present in spawn.mpq*
- [x] Map which files control which game aspects
- [x] Create schema documentation for each modifiable file type

### 1.2 Engine Parameter Discovery
- [x] Identify all configurable dungeon generation parameters in the WASM engine *(see [docs/WASM_INTERFACE.md](docs/WASM_INTERFACE.md))*
  - [x] Level count per dungeon type
  - [x] Room density and size ranges
  - [x] Corridor width and branching
  - [x] Special room frequency
- [x] Document monster spawn parameters *(see [docs/GAME_DATA_FORMATS.md](docs/GAME_DATA_FORMATS.md))*
  - [x] Monster type pools per level
  - [x] Spawn density
  - [x] Difficulty scaling
- [x] Document item/loot parameters
  - [x] Chest/barrel density
  - [x] Item quality distribution
  - [x] Gold drop rates

### 1.3 Data Flow Pipeline
- [x] Design unified pipeline: AI Intent → Parameters → MPQ Build → Game Load *(see [src/neural/DataFlowPipeline.js](src/neural/DataFlowPipeline.js))*
- [x] Create parameter validation layer
- [x] Implement rollback mechanism for failed builds
- [x] Add caching for frequently used configurations

---

## 2. Visual Grid System for AI

> **Status**: Implemented in [src/neural/VisualGridSystem.js](src/neural/VisualGridSystem.js)

### 2.1 Grid Image Generator
- [x] Create JavaScript canvas-based grid renderer
  - [x] Support configurable grid dimensions (e.g., 100x100, 500x500)
  - [x] Alphanumeric coordinate system (e.g., "A1", "Z26", "AA27")
  - [x] Color-coded tile types with legend
  - [x] Zoom levels (overview → detailed) - 5 levels: OVERVIEW, REGION, STANDARD, DETAILED, CLOSE
- [x] Tile type visualization
  - [x] Roads (brown/tan paths)
  - [x] Water (blue areas)
  - [x] Buildings/houses (gray rectangles with labels)
  - [x] NPCs/people (colored dots with names)
  - [x] Dungeon entrances (red/dark markers)
  - [x] Bridges (crossing water)
  - [x] Walls/barriers (solid lines)
  - [x] Vegetation/trees (green markers)
  - [x] Interactive objects (chests, shrines, etc.)

### 2.2 AI Interaction Protocol
- [x] Define grid command vocabulary for AI
  - [x] `ZOOM <start_coord> <end_coord>` - Get detailed view of area
  - [x] `PLACE <type> <coord>` - Place single item
  - [x] `ROAD <start_coord> <end_coord>` - Auto-pathing road
  - [x] `REGION <type> <coord1> <coord2> <coord3> <coord4>` - Define area
  - [x] `BUILDING <type> <coord> <size>` - Place structure
  - [x] `SPAWN_ZONE <monster_type> <coord> <radius> <density>`
  - [x] `DUNGEON_ENTRANCE <dungeon_id> <coord>`
  - [x] `NPC <npc_type> <coord> <name> <dialogue_id>`
- [x] Collision detection system
  - [x] Walkability checking per tile type
  - [x] Prevent overlapping structures
  - [x] Path walkability validation
- [x] Batch command processing
  - [x] Execute multiple commands via `executeBatch()`
  - [ ] Validate complete layout before building - *pending integration*
  - [ ] Generate final configuration from command history - *pending*

### 2.3 Grid State Management
- [x] Save/load grid states (via `exportState()`/`importState()`)
- [x] Undo/redo for AI decisions (50-level history)
- [ ] Version history of grid modifications - *future enhancement*
- [x] Export grid as JSON configuration

---

## 3. Dungeon Parameter Control

> **Status**: Mostly implemented in [src/neural/DungeonConfig.js](src/neural/DungeonConfig.js)

### 3.1 Per-Level Configuration
- [x] Create dungeon configuration schema *(see DungeonConfig class)*
  ```javascript
  {
    dungeonId: "cathedral_1",
    levels: [
      {
        depth: 1,
        theme: "cathedral",
        monsterLevel: 3,
        monsterDensity: 0.4,
        monsterTypes: ["skeleton", "zombie", "fallen"],
        bossSpawn: null,
        lootDensity: 0.3,
        lootQuality: "normal",
        specialRooms: ["library", "altar"],
        lightLevel: 0.7
      },
      // ... more levels
    ],
    finalBoss: {
      type: "skeleton_king",
      level: 10,
      lootTable: "boss_tier_1"
    }
  }
  ```
- [x] Level-specific settings
  - [x] Monster level/difficulty
  - [x] Monster type restrictions
  - [x] Boss placement (which level, which room type)
  - [x] Loot chest density
  - [x] Loot quality tiers
  - [x] Light/dark ambiance
  - [x] Special room types to include

### 3.2 Monster Configuration
- [x] Monster pool management per dungeon level
- [x] Unique/champion monster spawn rates
- [x] Boss configuration
  - [x] Boss type selection
  - [x] Boss level/stats
  - [x] Boss loot table
  - [ ] Boss spawn conditions (room cleared, etc.) - *pending integration*
- [ ] Monster behavior hints (aggressive, patrol, ambush) - *future enhancement*

### 3.3 Loot Configuration
- [x] Chest/container placement density
- [x] Item quality distribution curves
- [x] Gold drop multipliers
- [x] Unique item placement (quest items, etc.)
- [ ] Shrine types and frequency - *pending*

### 3.4 Visual Theme Control
- [x] Texture set selection per level
  - [x] Cathedral (gray stone, stained glass)
  - [x] Catacombs (bone, crypts)
  - [x] Caves (natural rock, water)
  - [x] Hell (fire, blood, demonic)
- [ ] Color palette modifications - *future enhancement*
- [ ] Ambient effects (fog, particles) - *future enhancement*

---

## 4. MPQ Content Management

> **Status**: Core systems implemented in [src/neural/MPQBuilder.js](src/neural/MPQBuilder.js), [src/neural/AssetCatalog.js](src/neural/AssetCatalog.js), [src/neural/MPQValidator.js](src/neural/MPQValidator.js)

### 4.1 MPQ Builder Improvements
- [x] Full MPQ creation (not just modification) *(see MPQBuilder class)*
  - [x] Create new MPQ from scratch with only needed files
  - [x] Proper hash table and block table generation
  - [ ] File compression support (PKWARE, Huffman) - *basic support, PKWARE pending*
- [x] File type handlers
  - [x] DUN file builder (level layouts) *(see DUNBuilder class)*
  - [x] Monster data modifier *(see MonsterDataBuilder class)*
  - [x] Object/Item data modifier *(see ObjectDataBuilder class)*
  - [ ] Quest data builder - *pending quest format definition*
  - [ ] Dialogue text packer - *pending dialogue system*

### 4.2 Asset Management
- [x] Catalog all available sprites/textures in spawn.mpq *(see AssetCatalog)*
  - [x] Monster sprites (20+ monster types, 8 directions, animations)
  - [x] Object sprites (containers, shrines, decorative)
  - [x] Tile assets by theme (Cathedral, Catacombs, Caves, Hell, Town)
- [x] Asset reuse mapping (which assets can be repurposed) *(see ASSET_SUBSTITUTIONS)*
- [x] Asset combination rules (valid tile combinations) *(see COMBINATION_RULES)*
- [ ] Missing asset fallback system - *future enhancement*

### 4.3 Validation & Testing
- [x] MPQ integrity checker *(see MPQValidator.validateMPQ())*
  - [x] Header validation (magic, sizes, offsets)
  - [x] Hash table validation
  - [x] Block table validation
- [x] Level walkability validator *(see MPQValidator.validateWalkability())*
  - [x] Flood-fill reachability analysis
  - [x] Disconnected area detection
  - [x] Stairs/exit validation
- [x] Quest completability checker *(see MPQValidator.validateQuest())*
  - [x] Kill objective feasibility
  - [x] Boss existence validation
  - [x] Stage trigger validation
- [ ] Performance impact estimator - *future enhancement*

---

## 5. Event System Integration

### 5.1 Game Event Discovery
- [x] Document all hookable game events *(see [src/neural/GameEventDetector.js](src/neural/GameEventDetector.js))*
  - [x] `MONSTER_KILLED` (monster_id, killer, location)
  - [x] `BOSS_KILLED` (boss_id, killer, location)
  - [x] `LEVEL_ENTERED` (level_id, player)
  - [x] `LEVEL_CLEARED` (level_id, player)
  - [ ] `ITEM_PICKED_UP` (item_id, player) - *requires item tracking*
  - [ ] `QUEST_ITEM_FOUND` (quest_id, item_id) - *requires item tracking*
  - [ ] `NPC_TALKED` (npc_id, dialogue_id) - *requires NPC interaction hooks*
  - [x] `SHRINE_ACTIVATED` (shrine_type, location)
  - [x] `PLAYER_DIED` (player, killer, location)
  - [x] `GOLD_COLLECTED` (amount, total)

### 5.2 Event Hooks Implementation
- [x] Create event listener system in JavaScript *(see [src/neural/GameEventEmitter.js](src/neural/GameEventEmitter.js))*
- [x] Bridge WASM events to JavaScript callbacks *(via game.worker.js render loop)*
- [x] Event filtering (only subscribe to relevant events)
- [x] Event batching for performance *(events batched per frame)*

### 5.3 Quest Trigger System
- [x] Define quest trigger conditions *(see [src/neural/QuestTriggerSystem.js](src/neural/QuestTriggerSystem.js))*
  - [x] Kill count triggers
  - [x] Boss kill triggers
  - [ ] Item collection triggers - *pending item tracking*
  - [x] Location visited triggers
  - [ ] NPC dialogue triggers - *pending NPC hooks*
  - [ ] Time-based triggers - *future enhancement*
- [x] Quest state machine
  - [x] Quest stages (not_started, in_progress, complete, failed)
  - [x] Stage transition conditions
  - [ ] Reward distribution on completion - *pending*

---

## 6. User Visibility & Debug UI

> **Status**: Core debug panel implemented in [src/neural/AIDebugPanel.js](src/neural/AIDebugPanel.js)

### 6.1 AI Decision Viewer
- [x] Real-time display of AI reasoning *(see AIDebugPanel)*
  - [x] Event log with timestamps
  - [ ] Grid images being analyzed - *pending grid viewer integration*
  - [ ] Commands being generated - *pending*
  - [ ] Validation results - *pending*
- [x] Expandable/collapsible sections
- [x] Timestamp for each decision

### 6.2 Grid Visualization Panel
- [ ] Interactive map viewer - *pending React component*
  - [ ] Pan and zoom controls
  - [ ] Layer toggles (terrain, objects, NPCs, spawn zones)
  - [ ] Coordinate display on hover
  - [ ] Click to select/inspect elements
- [ ] Side-by-side: AI's view vs User's view
- [ ] Highlight changes since last update

### 6.3 Dungeon Configuration Panel
- [x] Visual dungeon structure *(see DungeonConfigPanel in AIDebugPanel)*
  - [x] Level depth visualization (16-level grid)
  - [ ] Monster distribution charts - *future*
  - [ ] Loot distribution charts - *future*
  - [x] Boss placement indicators
- [ ] Editable parameters (user can tweak AI's choices) - *future*
- [ ] Validation warnings display - *pending*

### 6.4 Story & Dialogue Preview
- [ ] Campaign storyline viewer - *future*
  - [ ] Act/chapter breakdown
  - [ ] Plot summary per section
  - [ ] Key characters list
- [ ] Dialogue preview - *future*
  - [ ] NPC conversation trees
  - [ ] Quest dialogue sequences
  - [ ] Dynamic dialogue variables
- [ ] Quest flow diagram - *future*
  - [ ] Quest dependencies
  - [ ] Unlock conditions
  - [ ] Rewards

### 6.5 Build Progress Monitor
- [x] Step-by-step build visualization *(see PipelineStatusPanel)*
  - [x] Current phase/stage indicator
  - [x] Progress bar
  - [ ] File-by-file progress - *future*
  - [ ] Error/warning log - *pending*
- [ ] Estimated time remaining - *future*
- [ ] Cancel/pause functionality - *future*

---

## 7. Quest & Dialogue System

> **Status**: Implemented in [src/neural/QuestSchema.js](src/neural/QuestSchema.js), [src/neural/DialogueSystem.js](src/neural/DialogueSystem.js), [src/neural/QuestUI.js](src/neural/QuestUI.js)

### 7.1 Quest Definition Schema
- [x] Create comprehensive quest format *(see QuestSchema.js)*
  - [x] Quest class with full lifecycle management
  - [x] QuestStage for multi-stage quests
  - [x] QuestObjective for sub-objectives
  - [x] QuestTrigger for 15+ trigger types
  - [x] QuestRewards for experience, gold, items, unlocks
  - [x] QuestBuilder fluent API for easy creation
  - [x] QuestTemplates for common patterns (kill, boss, explore, dungeon)
  - [x] Quest categories (main, side, bounty, exploration, etc.)
  - [x] Quest difficulty levels
  - [x] Prerequisites and required quests
  - [x] Time limits and repeatable quests

### 7.2 Dialogue System
- [x] Branching dialogue trees *(see DialogueSystem.js)*
  - [x] DialogueTree with multiple nodes
  - [x] DialogueNode for text, choice, branch, action types
  - [x] Conditional start points based on context
- [x] Condition-based dialogue options
  - [x] 15+ condition types (player level, quest status, NPC talked, items, flags, etc.)
  - [x] Condition evaluator with comparison operators
- [x] Variable substitution (player name, quest progress, etc.)
  - [x] `{variable.path}` syntax in dialogue text
  - [x] Nested object path support
- [x] Dialogue history tracking
  - [x] DialogueHistory class for persistence
  - [x] NPC conversation counts
  - [x] Choice history
- [x] Voice line placeholders (for future audio)
  - [x] `voiceLine` field on DialogueNode
- [x] DialogueBuilder fluent API
- [x] DialoguePresets for common patterns
- [x] Action system (start quest, give item, set flag, etc.)

### 7.3 Quest UI Integration
- [x] Quest log panel *(see QuestUI.js)*
  - [x] Tabbed interface (active, available, completed, all)
  - [x] Category grouping with expand/collapse
  - [x] Quest details panel with objectives and rewards
  - [x] Track/abandon quest actions
- [x] Active quest tracker (HUD)
  - [x] Configurable position (left/right)
  - [x] Current objective display
  - [x] Progress bar
- [x] Quest completion notifications
  - [x] Toast notification system
  - [x] Quest started/completed/objective notifications
  - [x] Auto-dismiss with configurable duration
- [x] Reward display popups
  - [x] Modal overlay with reward list
  - [x] Experience, gold, items display
  - [x] Celebration styling
- [x] Dialogue box component
  - [x] Typewriter text effect
  - [x] Choice selection
  - [x] Portrait and emotion display
  - [x] Skip/advance controls

---

## 8. Multi-Stage World Building

### 8.1 Multiple Towns/Villages
- [ ] Town template system
  - [ ] Town layout presets (small village, trading post, fortress)
  - [ ] NPC placement slots
  - [ ] Building types (shop, inn, blacksmith, etc.)
- [ ] Town-to-town travel system
  - [ ] Waypoint system between towns
  - [ ] Travel encounters (random events)
  - [ ] Map screen for town selection

### 8.2 Overworld Map
- [ ] Large-scale world map
  - [ ] Multiple regions/continents
  - [ ] Climate/biome zones
  - [ ] Road networks between locations
- [ ] Point-of-interest system
  - [ ] Towns and villages
  - [ ] Dungeon entrances
  - [ ] Wilderness areas
  - [ ] Hidden locations (unlockable)

### 8.3 Region-Based Content
- [ ] Different monster pools per region
- [ ] Region-specific items and loot
- [ ] Regional storylines that connect
- [ ] Progression requirements (unlock later regions)

### 8.4 World State Persistence
- [ ] Save world modifications
- [ ] Track cleared dungeons
- [ ] NPC state changes (alive/dead, moved, etc.)
- [ ] Player reputation per region

---

## 9. Current Issues & Fixes

> **Status**: Core error handling implemented in [src/neural/ErrorBoundary.js](src/neural/ErrorBoundary.js), [src/neural/Logger.js](src/neural/Logger.js)

### 9.1 Completed Fixes
- [x] Fix AI editor overlay blocking close button (z-index conflict)
- [x] Add overlay backdrop to ModEditor for consistency
- [x] Hide AIGameOverlay when ModEditor is open
- [x] Fix detached ArrayBuffer error when reopening ModEditor
  - Root cause: Worker transfer detaches buffers
  - Fix: Make copy of MPQ buffer before worker transfer
- [x] Add proper MPQ download after build *(see ModEditor.js)*
  - [x] Auto-download modified MPQ when "Play Modded" is clicked
  - [x] Show download notice with filename
  - [x] Download button in build success state
- [x] Fix ModEditor spawn.mpq loading on reopen
  - [x] Buffer copy stored in state
  - [x] Buffer validation before parsing
- [x] Improve error messages for MPQ loading failures *(see ErrorBoundary.js)*
  - [x] Comprehensive ErrorInfo class with context tracking
  - [x] MPQ-specific error handler (`handleMPQError`)
  - [x] WASM-specific error handler (`handleWASMError`)
  - [x] Network error handler (`handleNetworkError`)

### 9.2 Pending Fixes
- [ ] Consolidate NeuralConfig across different modules
- [ ] Unify AI provider handling (OpenRouter vs direct API)
- [ ] Clean up mock generation fallback logic

### 9.3 Error Handling & Debugging *(Implemented)*
- [x] Comprehensive error boundaries *(see ErrorBoundary.js)*
  - [x] React ErrorBoundary component with recovery UI
  - [x] ErrorInfo structured error class
  - [x] ErrorReporter centralized reporting system
  - [x] Error severity levels (low, medium, high, critical)
  - [x] Error types (network, wasm, mpq, render, validation, etc.)
  - [x] User-friendly error display components
  - [x] `withErrorBoundary` HOC for wrapping components
- [x] Structured logging system *(see Logger.js)*
  - [x] Multiple log levels (DEBUG, INFO, WARN, ERROR, SILENT)
  - [x] Category-specific loggers (MPQ, Quest, Dialogue, AI, WASM, etc.)
  - [x] Performance timing utilities
  - [x] Log history with filtering and export
  - [x] Console formatting with colors
  - [x] Subscriber system for log listeners
  - [x] localStorage persistence of log level

---

## Implementation Priority

### Phase 1: Foundation (Current Sprint)
1. Fix remaining ModEditor issues
2. Document MPQ structure
3. Implement event system hooks
4. Create basic dungeon parameter controls

### Phase 2: Visual Grid System
1. Build grid image generator
2. Define AI command protocol
3. Implement collision detection
4. Create user-facing grid viewer

### Phase 3: AI Integration
1. Connect visual grid to AI
2. Implement batch command processing
3. Build configuration generator
4. Add user visibility panels

### Phase 4: Content Expansion
1. Quest and dialogue system
2. Multiple dungeon configurations
3. Monster and loot customization
4. Town template system

### Phase 5: World Building
1. Multi-town support
2. Overworld map
3. Region system
4. World state persistence

---

## Notes

- **API Efficiency**: The visual grid system reduces AI API calls by using images as context instead of text descriptions of each tile
- **Engine Leverage**: We use Diablo's existing procedural generation but control the parameters - no need to generate raw dungeon grids
- **Backwards Compatible**: All modifications build on spawn.mpq, ensuring compatibility with the existing engine
- **User Control**: Every AI decision is visible and can be tweaked by the user before building

---

*Last Updated: December 5, 2024*
