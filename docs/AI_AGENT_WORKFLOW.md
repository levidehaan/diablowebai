# AI Agent Workflow Analysis

## Current State vs What's Actually Needed

### The Gap

We built tools, but the **end-to-end pipeline** is broken:

```
Current (Broken):
Campaign JSON → ??? → ModTools → DUN files → MPQWriter → Download MPQ → ??? → Play

What We Need:
Campaign JSON → CampaignToDUN → Validate → Build MPQ → Store in fs → Start Game → Play Mods!
                                              ↓
                                    Show AI what it created
```

### Critical Questions

**Q: How does the MPQ swap work?**

The game loads `spawn.mpq` from `fs.files` Map BEFORE starting. So:

```javascript
// In fs.js / loader.js:
fs.files.set('spawn.mpq', modifiedMpqData);  // Replace with our mod
worker.postMessage({action: "init", files: fs.files, ...});  // Start game with mod
```

**The swap must happen BEFORE game init, not during gameplay.**

**Q: Can we mod during gameplay?**

No - the MPQ is loaded once at startup. For runtime changes, we'd need WASMBridge memory injection (separate approach).

---

## What the AI Agent Actually Needs

### 1. Campaign-to-Level Converter (MISSING)

Convert AI campaign JSON to proper DUN files:

```javascript
// What we have in campaign JSON:
{
  "acts": [{
    "levels": [{
      "grid": [[0,1,1,0], [0,0,0,0], ...],  // Binary 0/1
      "spawns": [{x: 5, y: 5, type: "skeleton"}]
    }]
  }]
}

// What we need for DUN:
{
  "baseTiles": [[13,1,1,13], [13,13,13,13], ...],  // Proper tile IDs
  "monsters": [...],  // At 2x resolution
  "width": 16,
  "height": 16
}
```

**Tool needed:** `convertCampaignToLevels(campaign) → DUN files`

### 2. Level Validator (MISSING)

Before export, validate levels will work:

```javascript
validateLevel(dunData) → {
  valid: boolean,
  errors: [
    "No stairs up found",
    "Player spawn area blocked",
    "Invalid tile ID 999 at (5,5)",
  ],
  warnings: [
    "Level has no monsters",
    "Exit stairs unreachable from entry",
  ]
}
```

**Checks needed:**
- Has stairs up (entry point)
- Has stairs down (exit point)
- Entry is accessible (not surrounded by walls)
- Path exists from entry to exit
- All tile IDs are valid for theme
- Monster IDs are valid

### 3. Available Tile Reference (MISSING)

Agent needs to know what tiles exist:

```javascript
getAvailableTiles('cathedral') → {
  floors: [13, 14, 15],          // Can use these for walkable
  walls: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  special: {
    stairsUp: 36,
    stairsDown: 37,
    door: 25,
    doorOpen: 26,
    pillar: 42,
  },
  // WARNING: These are the ONLY valid tiles
  // Using other IDs will cause visual glitches
}
```

### 4. MPQ Swap Integration (MISSING)

Hook into game startup to use modded MPQ:

```javascript
// In App.js or loader.js:
async startModdedGame(modifiedMpq) {
  const fs = await api.fs;
  fs.files.set('spawn.mpq', modifiedMpq);  // Replace!
  await this.start();  // Start with mod
}
```

### 5. Quick Preview Mode (MISSING)

Let agent see level without full game:

```javascript
previewLevel(dunData) → {
  ascii: "####\n#..<\n#..#\n####",
  minimap: ImageData,  // Visual preview
  pathCheck: {
    entryToExit: true,
    blockedAreas: [[5,5], [6,5]],
  }
}
```

### 6. Test Feedback (MISSING)

After game starts, report what loaded:

```javascript
// Hook in game.worker.js
onLevelLoad(levelNum) {
  postMessage({
    action: 'level_loaded',
    level: levelNum,
    tileCount: countTiles(),
    monsterCount: countMonsters(),
  });
}
```

---

## Complete Agent Tool Set

### Current Tools
| Tool | Purpose | Status |
|------|---------|--------|
| listFiles | Browse MPQ | ✅ Works |
| readLevel | Parse DUN | ✅ Works |
| modifyTiles | Edit tiles | ✅ Works |
| placeMonsters | Add spawns | ✅ Works |
| generateLevel | Create level | ⚠️ Basic |
| previewLevel | ASCII view | ✅ Works |

### Missing Tools
| Tool | Purpose | Priority |
|------|---------|----------|
| convertCampaign | Campaign → DUNs | 🔴 Critical |
| validateLevel | Check validity | 🔴 Critical |
| getTileReference | Available tiles | 🟡 Important |
| swapMPQ | Replace spawn.mpq | 🔴 Critical |
| buildAndLoad | Build + start game | 🔴 Critical |
| getLoadFeedback | Verify it worked | 🟡 Important |

---

## Proposed Workflow

### Step 1: Campaign Generation (Existing)
```
User: "Generate a 4-level dungeon campaign"
AI: Uses CampaignGenerator → campaign.json
```

### Step 2: Level Conversion (NEW)
```javascript
// NEW TOOL: convertCampaignToMod
for (const act of campaign.acts) {
  for (const level of act.levels) {
    // Convert binary grid to proper tiles
    const dunData = TileMapper.convertToTileGrid(level.grid, theme);

    // Add monsters from spawn data
    if (level.spawns) {
      dunData.monsters = MonsterMapper.convertPlacements(level.spawns);
    }

    // Validate
    const validation = validateLevel(dunData);
    if (!validation.valid) {
      // Fix issues or report
    }

    // Store for MPQ
    modifiedFiles.set(`levels/l1data/ai_level_${i}.dun`, dunData);
  }
}
```

### Step 3: Build Modified MPQ (NEW)
```javascript
// NEW TOOL: buildModdedMPQ
const writer = new MPQWriter(originalSpawnMpq);
for (const [path, data] of modifiedFiles) {
  writer.setFile(path, DUNParser.write(data));
}
const modifiedMpq = writer.build();
```

### Step 4: Swap and Start (NEW)
```javascript
// NEW TOOL: launchWithMod
fs.files.set('spawn.mpq', modifiedMpq);
this.start();  // Game loads with our mod!
```

### Step 5: Verify (NEW)
```javascript
// Game worker sends feedback
worker.onmessage = (e) => {
  if (e.data.action === 'level_loaded') {
    console.log('AI level loaded successfully!');
    // Report to agent
  }
};
```

---

## Testing the Agent Can Do

### 1. Structural Validation
```javascript
// Agent runs before export:
const result = await executeTool('validateLevel', { path: 'ai_level_1.dun' });
if (!result.valid) {
  // Fix the issues
  for (const error of result.errors) {
    if (error.includes('No stairs')) {
      await executeTool('modifyTiles', {
        path: 'ai_level_1.dun',
        changes: [{ x: 2, y: 2, tile: 36 }]  // Add stairs
      });
    }
  }
}
```

### 2. Pathfinding Check
```javascript
// Verify player can reach exit
const pathResult = await executeTool('checkPath', {
  path: 'ai_level_1.dun',
  from: 'stairs_up',
  to: 'stairs_down'
});
if (!pathResult.reachable) {
  // Level is broken, regenerate or fix
}
```

### 3. Visual Preview
```javascript
// Generate preview image
const preview = await executeTool('renderPreview', {
  path: 'ai_level_1.dun',
  showMonsters: true,
  showPath: true
});
// Display to user for approval
```

### 4. Build Verification
```javascript
// Test MPQ can be built
const buildResult = await executeTool('testBuild', {
  dryRun: true  // Don't actually save
});
if (buildResult.errors.length > 0) {
  // Fix issues
}
```

---

## The Actual Swap Mechanism

### Option A: Pre-Game Swap (Recommended)
```
1. Generate campaign
2. Convert to DUN files
3. Build modified MPQ
4. Store in fs.files['spawn.mpq']
5. Start game → Uses our mod!
```

**Pros:** Simple, reliable
**Cons:** Must restart game for changes

### Option B: Download & Manual Load
```
1. Generate campaign
2. Convert to DUN files
3. Build modified MPQ
4. User downloads spawn_modded.mpq
5. User loads it via "Load MPQ" button
6. Start game
```

**Pros:** User controls what loads
**Cons:** Extra steps

### Option C: IndexedDB Persistence
```
1. Generate campaign
2. Build modified MPQ
3. Save to IndexedDB as 'spawn_modded.mpq'
4. On next load, offer choice: "Play Original" or "Play AI Mod"
```

**Pros:** Persistent mods
**Cons:** More complex UI

---

## Implementation Priority

1. **Level Validator** - Agent must know if levels work
2. **Campaign Converter** - Bridge from AI output to DUN
3. **Swap Integration** - Actually load the mod
4. **Tile Reference** - Agent needs valid tile IDs
5. **Load Feedback** - Confirm mod loaded

---

## Files to Create/Modify

### New Files
- `src/neural/LevelValidator.js` - Validation logic
- `src/neural/CampaignConverter.js` - Campaign → DUN pipeline

### Modify
- `src/App.js` - Add `startModdedGame()` method
- `src/neural/ModTools.js` - Add new tools
- `src/api/game.worker.js` - Add load feedback

---

*This document should guide implementation of the complete AI agent workflow.*
