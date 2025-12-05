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
- [ ] Design unified pipeline: AI Intent → Parameters → MPQ Build → Game Load
- [ ] Create parameter validation layer
- [ ] Implement rollback mechanism for failed builds
- [ ] Add caching for frequently used configurations

---

## 2. Visual Grid System for AI

### 2.1 Grid Image Generator
- [ ] Create JavaScript canvas-based grid renderer
  - [ ] Support configurable grid dimensions (e.g., 100x100, 500x500)
  - [ ] Alphanumeric coordinate system (e.g., "348baab x 212ccaq")
  - [ ] Color-coded tile types with legend
  - [ ] Zoom levels (overview → detailed)
- [ ] Tile type visualization
  - [ ] Roads (brown/tan paths)
  - [ ] Water (blue areas)
  - [ ] Buildings/houses (gray rectangles with labels)
  - [ ] NPCs/people (colored dots with names)
  - [ ] Dungeon entrances (red/dark markers)
  - [ ] Bridges (crossing water)
  - [ ] Walls/barriers (solid lines)
  - [ ] Vegetation/trees (green markers)
  - [ ] Interactive objects (chests, shrines, etc.)

### 2.2 AI Interaction Protocol
- [ ] Define grid command vocabulary for AI
  - [ ] `ZOOM <start_coord> <end_coord>` - Get detailed view of area
  - [ ] `PLACE <type> <coord>` - Place single item
  - [ ] `ROAD <start_coord> <end_coord>` - Auto-pathing road
  - [ ] `REGION <type> <coord1> <coord2> <coord3> <coord4>` - Define area
  - [ ] `BUILDING <type> <coord> <size>` - Place structure
  - [ ] `SPAWN_ZONE <monster_type> <coord> <radius> <density>`
  - [ ] `DUNGEON_ENTRANCE <dungeon_id> <coord>`
  - [ ] `NPC <npc_type> <coord> <name> <dialogue_id>`
- [ ] Collision detection system
  - [ ] Auto-route roads around obstacles
  - [ ] Prevent overlapping structures
  - [ ] Ensure walkable paths between key locations
- [ ] Batch command processing
  - [ ] Collect all AI commands during session
  - [ ] Validate complete layout before building
  - [ ] Generate final configuration from command history

### 2.3 Grid State Management
- [ ] Save/load grid states
- [ ] Undo/redo for AI decisions
- [ ] Version history of grid modifications
- [ ] Export grid as JSON configuration

---

## 3. Dungeon Parameter Control

### 3.1 Per-Level Configuration
- [ ] Create dungeon configuration schema
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
- [ ] Level-specific settings
  - [ ] Monster level/difficulty
  - [ ] Monster type restrictions
  - [ ] Boss placement (which level, which room type)
  - [ ] Loot chest density
  - [ ] Loot quality tiers
  - [ ] Light/dark ambiance
  - [ ] Special room types to include

### 3.2 Monster Configuration
- [ ] Monster pool management per dungeon level
- [ ] Unique/champion monster spawn rates
- [ ] Boss configuration
  - [ ] Boss type selection
  - [ ] Boss level/stats
  - [ ] Boss loot table
  - [ ] Boss spawn conditions (room cleared, etc.)
- [ ] Monster behavior hints (aggressive, patrol, ambush)

### 3.3 Loot Configuration
- [ ] Chest/container placement density
- [ ] Item quality distribution curves
- [ ] Gold drop multipliers
- [ ] Unique item placement (quest items, etc.)
- [ ] Shrine types and frequency

### 3.4 Visual Theme Control
- [ ] Texture set selection per level
  - [ ] Cathedral (gray stone, stained glass)
  - [ ] Catacombs (bone, crypts)
  - [ ] Caves (natural rock, water)
  - [ ] Hell (fire, blood, demonic)
- [ ] Color palette modifications
- [ ] Ambient effects (fog, particles)

---

## 4. MPQ Content Management

### 4.1 MPQ Builder Improvements
- [ ] Full MPQ creation (not just modification)
  - [ ] Create new MPQ from scratch with only needed files
  - [ ] Proper hash table and block table generation
  - [ ] File compression support (PKWARE, Huffman)
- [ ] File type handlers
  - [ ] DUN file builder (level layouts)
  - [ ] Monster data modifier
  - [ ] Item data modifier
  - [ ] Quest data builder
  - [ ] Dialogue text packer

### 4.2 Asset Management
- [ ] Catalog all available sprites/textures in spawn.mpq
- [ ] Asset reuse mapping (which assets can be repurposed)
- [ ] Asset combination rules (valid tile combinations)
- [ ] Missing asset fallback system

### 4.3 Validation & Testing
- [ ] MPQ integrity checker
- [ ] Level walkability validator
- [ ] Quest completability checker
- [ ] Performance impact estimator

---

## 5. Event System Integration

### 5.1 Game Event Discovery
- [ ] Document all hookable game events
  - [ ] `MONSTER_KILLED` (monster_id, killer, location)
  - [ ] `BOSS_KILLED` (boss_id, killer, location)
  - [ ] `LEVEL_ENTERED` (level_id, player)
  - [ ] `LEVEL_CLEARED` (level_id, player)
  - [ ] `ITEM_PICKED_UP` (item_id, player)
  - [ ] `QUEST_ITEM_FOUND` (quest_id, item_id)
  - [ ] `NPC_TALKED` (npc_id, dialogue_id)
  - [ ] `SHRINE_ACTIVATED` (shrine_type, location)
  - [ ] `PLAYER_DIED` (player, killer, location)
  - [ ] `GOLD_COLLECTED` (amount, total)

### 5.2 Event Hooks Implementation
- [ ] Create event listener system in JavaScript
- [ ] Bridge WASM events to JavaScript callbacks
- [ ] Event filtering (only subscribe to relevant events)
- [ ] Event batching for performance

### 5.3 Quest Trigger System
- [ ] Define quest trigger conditions
  - [ ] Kill count triggers
  - [ ] Boss kill triggers
  - [ ] Item collection triggers
  - [ ] Location visited triggers
  - [ ] NPC dialogue triggers
  - [ ] Time-based triggers
- [ ] Quest state machine
  - [ ] Quest stages (not_started, in_progress, complete, failed)
  - [ ] Stage transition conditions
  - [ ] Reward distribution on completion

---

## 6. User Visibility & Debug UI

### 6.1 AI Decision Viewer
- [ ] Real-time display of AI reasoning
  - [ ] Current task/goal
  - [ ] Grid images being analyzed
  - [ ] Commands being generated
  - [ ] Validation results
- [ ] Expandable/collapsible sections
- [ ] Timestamp for each decision

### 6.2 Grid Visualization Panel
- [ ] Interactive map viewer
  - [ ] Pan and zoom controls
  - [ ] Layer toggles (terrain, objects, NPCs, spawn zones)
  - [ ] Coordinate display on hover
  - [ ] Click to select/inspect elements
- [ ] Side-by-side: AI's view vs User's view
- [ ] Highlight changes since last update

### 6.3 Dungeon Configuration Panel
- [ ] Visual dungeon structure
  - [ ] Level depth visualization
  - [ ] Monster distribution charts
  - [ ] Loot distribution charts
  - [ ] Boss placement indicators
- [ ] Editable parameters (user can tweak AI's choices)
- [ ] Validation warnings display

### 6.4 Story & Dialogue Preview
- [ ] Campaign storyline viewer
  - [ ] Act/chapter breakdown
  - [ ] Plot summary per section
  - [ ] Key characters list
- [ ] Dialogue preview
  - [ ] NPC conversation trees
  - [ ] Quest dialogue sequences
  - [ ] Dynamic dialogue variables
- [ ] Quest flow diagram
  - [ ] Quest dependencies
  - [ ] Unlock conditions
  - [ ] Rewards

### 6.5 Build Progress Monitor
- [ ] Step-by-step build visualization
  - [ ] Current phase (generating, converting, packing)
  - [ ] File-by-file progress
  - [ ] Error/warning log
- [ ] Estimated time remaining
- [ ] Cancel/pause functionality

---

## 7. Quest & Dialogue System

### 7.1 Quest Definition Schema
- [ ] Create comprehensive quest format
  ```javascript
  {
    questId: "rescue_cain",
    name: "The Search for Cain",
    description: "Find the wise sage Deckard Cain...",
    stages: [
      {
        stageId: "find_entrance",
        objective: "Locate the dungeon entrance",
        trigger: { type: "location", target: "cathedral_entrance" },
        dialogue: "cain_search_1"
      },
      {
        stageId: "defeat_boss",
        objective: "Defeat the Skeleton King",
        trigger: { type: "boss_killed", target: "skeleton_king" },
        dialogue: "cain_search_2"
      }
    ],
    rewards: {
      experience: 1000,
      gold: 500,
      items: ["identify_scroll_x5"]
    }
  }
  ```

### 7.2 Dialogue System
- [ ] Branching dialogue trees
- [ ] Condition-based dialogue options
- [ ] Variable substitution (player name, quest progress, etc.)
- [ ] Dialogue history tracking
- [ ] Voice line placeholders (for future audio)

### 7.3 Quest UI Integration
- [ ] Quest log panel
- [ ] Active quest tracker (HUD)
- [ ] Quest completion notifications
- [ ] Reward display popups

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

### 9.1 Completed Fixes
- [x] Fix AI editor overlay blocking close button (z-index conflict)
- [x] Add overlay backdrop to ModEditor for consistency
- [x] Hide AIGameOverlay when ModEditor is open
- [x] Fix detached ArrayBuffer error when reopening ModEditor
  - Root cause: Worker transfer detaches buffers
  - Fix: Make copy of MPQ buffer before worker transfer

### 9.2 Pending Fixes
- [ ] Add proper MPQ download after build
  - [ ] Auto-download modified MPQ when "Play Modded" is clicked
  - [ ] Show download notice with filename
  - [ ] "Load MPQ from Disk" button for reloading
- [ ] Fix ModEditor not loading spawn.mpq on reopen
  - [ ] Use the buffer copy stored in state
  - [ ] Validate buffer before attempting to parse
- [ ] Improve error messages for MPQ loading failures

### 9.3 Technical Debt
- [ ] Consolidate NeuralConfig across different modules
- [ ] Unify AI provider handling (OpenRouter vs direct API)
- [ ] Clean up mock generation fallback logic
- [ ] Add comprehensive error boundaries
- [ ] Improve logging for debugging

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

*Last Updated: December 2024*
