# DiabloWeb AI - MPQ Modding Plan

## Executive Summary

This document outlines the plan to create **actual game modifications** by editing MPQ files directly in the browser. This approach creates real, exportable mods that modify the game at the file level - not overlays.

**Goal:** AI-driven creation of new levels, monsters, quests, and eventually graphics - all packaged as downloadable MPQ mods.

---

## Part 1: Architecture Overview

### Current State
```
AI Generation → JSON Data → Overlay System → Game (unchanged)
```

### Target State
```
AI Generation → MPQ Editor → Modified spawn.mpq → Truly Modified Game
                    ↓
              Downloadable Mod
```

### Key Components

| Component | Purpose | Status |
|-----------|---------|--------|
| MPQReader | Read MPQ archives | ✅ Exists (savefile.js) |
| MPQWriter | Write MPQ archives | 🔧 Need to implement |
| DUNParser | Parse level layouts | 🔧 Need to implement |
| DUNWriter | Create level layouts | 🔧 Need to implement |
| AIModTools | AI tool interface | 🔧 Need to implement |
| ModEditor UI | Real-time status display | 🔧 Need to implement |

---

## Part 2: File Format Reference

### DUN Files (Level Maps)

**Location in MPQ:** `levels/l1data/`, `levels/l2data/`, etc.

**Structure:**
```
Offset  Size    Description
0       2       Width (WORD, little-endian)
2       2       Height (WORD, little-endian)
4       W×H×2   Base layer (tile indices, 0 = default floor)
...     W×H×8   Items layer (4x resolution, optional)
...     W×H×8   Monsters layer (4x resolution, optional)
...     W×H×8   Objects layer (4x resolution, optional)
```

**Tile Index Notes:**
- Stored value = actual_index + 1
- Value 0 = use default floor tile
- Maps to TIL file entries

**Key DUN Files:**
| File | Purpose |
|------|---------|
| skngdo.dun | Skeleton King entrance |
| l1.dun | Cathedral base layout |
| vile1.dun, vile2.dun | Lazarus quest areas |
| diab1-4.dun | Diablo's lair sections |

### MIN Files (Sub-tiles)

**Purpose:** Define 64×32 pixel level squares from CEL frames

**Structure per sub-tile:**
- 10 WORDs (Cathedral, Catacombs, Caves)
- 16 WORDs (Town, Hell)

**WORD encoding:**
- Bits 0-3: Frame type (0=floor, 1-5=wall types)
- Bits 4-15: CEL frame index + 1 (0 = transparent)

### TIL Files (Tiles)

**Purpose:** Arrange 4 sub-tiles into 128×128 tiles

**Structure per tile:**
```
WORD[0] = Top sub-tile index + 1
WORD[1] = Right sub-tile index + 1
WORD[2] = Left sub-tile index + 1
WORD[3] = Bottom sub-tile index + 1
```

### CEL Files (Graphics)

**RLE Encoding:**
| Byte Value | Meaning |
|------------|---------|
| 0x00-0x7E | N opaque pixels follow |
| 0x81-0xFF | (256 - N) transparent pixels |
| 0x7F | 127 opaque pixels, line continues |
| 0x80 | 128 transparent pixels, line continues |

**Level CEL Types:**
| Type | Size | Description |
|------|------|-------------|
| 0 | 0x400 | Upper wall, no transparency |
| 1 | Variable | Regular RLE |
| 2-3 | 0x220 | Floor tiles |
| 4-5 | 0x320 | Wall bottom |

---

## Part 3: Implementation Plan

### Phase 1: MPQ Read/Write Infrastructure

#### 1.1 Enhance MPQReader
- Already exists in `src/api/savefile.js`
- Add file listing capability
- Add directory enumeration

#### 1.2 Create MPQWriter
```javascript
// src/neural/MPQWriter.js
class MPQWriter {
  constructor(originalMpq) {
    this.files = new Map(); // Modified files
    this.original = originalMpq;
  }

  // Copy file from original
  copyFile(path) {}

  // Add/replace file
  setFile(path, data) {}

  // Remove file
  deleteFile(path) {}

  // Build new MPQ
  build() {} // Returns Uint8Array
}
```

**MPQ Write Strategy:**
1. Parse original MPQ header and tables
2. Track modified/added/deleted files
3. Rebuild with:
   - New hash table
   - New block table
   - Modified file blocks
   - Proper encryption

### Phase 2: DUN File System

#### 2.1 DUNParser
```javascript
// src/neural/DUNParser.js
class DUNParser {
  static parse(buffer) {
    const view = new DataView(buffer);
    return {
      width: view.getUint16(0, true),
      height: view.getUint16(2, true),
      baseTiles: [], // 2D array of tile indices
      items: [],     // 4x resolution layer
      monsters: [],  // 4x resolution layer
      objects: [],   // 4x resolution layer
    };
  }
}
```

#### 2.2 DUNWriter
```javascript
// src/neural/DUNWriter.js
class DUNWriter {
  static write(dunData) {
    const size = 4 + (dunData.width * dunData.height * 2);
    const buffer = new ArrayBuffer(size);
    // ... write header and layers
    return new Uint8Array(buffer);
  }
}
```

### Phase 3: AI Modding Tools

#### 3.1 Tool System for AI
```javascript
const MOD_TOOLS = {
  // List available files
  listFiles: {
    description: "List files in MPQ matching pattern",
    parameters: { pattern: "glob pattern" },
    execute: (mpq, { pattern }) => { /* ... */ }
  },

  // Read DUN file
  readLevel: {
    description: "Read and parse a level DUN file",
    parameters: { path: "levels/l1data/..." },
    execute: (mpq, { path }) => { /* ... */ }
  },

  // Modify level
  modifyLevel: {
    description: "Modify tiles in a level",
    parameters: {
      path: "DUN file path",
      changes: [{ x, y, tile }]
    },
    execute: (mpq, params) => { /* ... */ }
  },

  // Generate new level
  generateLevel: {
    description: "Generate new level from AI description",
    parameters: {
      theme: "cathedral|catacombs|caves|hell",
      description: "AI prompt for level",
      size: { width, height }
    },
    execute: async (mpq, params) => { /* ... */ }
  },

  // Place monsters
  placeMonsters: {
    description: "Add monsters to level",
    parameters: {
      level: "DUN path",
      spawns: [{ x, y, type, difficulty }]
    },
    execute: (mpq, params) => { /* ... */ }
  },

  // Preview changes
  previewLevel: {
    description: "Generate ASCII preview of level",
    parameters: { path: "DUN path" },
    execute: (mpq, { path }) => { /* ... */ }
  },

  // Build and export
  buildMod: {
    description: "Compile all changes into downloadable MPQ",
    execute: (mpq) => { /* ... */ }
  }
};
```

### Phase 4: Real-Time Editing UI

#### 4.1 ModEditor Component
```jsx
// src/neural/ModEditor.js
class ModEditor extends React.Component {
  state = {
    operations: [],     // Log of AI operations
    currentFile: null,  // Currently editing file
    preview: null,      // ASCII/visual preview
    status: 'idle',     // idle|working|error|complete
    progress: 0,        // 0-100
    modifiedFiles: [],  // List of changed files
  };

  // Render operation log with status icons
  // Show file tree with modification indicators
  // Display level preview
  // Export button for completed mod
}
```

#### 4.2 Operation Display
```
┌─────────────────────────────────────────────────────┐
│ AI Mod Editor                              [Export] │
├─────────────────────────────────────────────────────┤
│ Operations:                                         │
│ ✓ Read spawn.mpq                          [100%]   │
│ ✓ Parse levels/l1data/skngdo.dun         [100%]   │
│ ⟳ Generating new cathedral level...       [45%]   │
│ ○ Place 15 skeleton spawns                [0%]    │
│ ○ Build modified MPQ                      [0%]    │
├─────────────────────────────────────────────────────┤
│ Preview: skngdo.dun                                 │
│ ┌────────────────────────────────────┐             │
│ │ ########################################         │
│ │ #......................................#         │
│ │ #....<..........##########..........>#.#         │
│ │ #..............##        ##...........#         │
│ │ ########################################         │
│ └────────────────────────────────────┘             │
├─────────────────────────────────────────────────────┤
│ Modified Files: 3                                   │
│  • levels/l1data/skngdo.dun [+245 bytes]          │
│  • levels/l1data/l1.dun [modified]                │
│  • monsters.bin [+12 entries]                      │
└─────────────────────────────────────────────────────┘
```

### Phase 5: AI Image Generation (Future)

#### 5.1 CEL Encoder Enhancement
- Already have RLE encoding in AssetPipeline.js
- Need to add proper CEL file structure
- Handle level CEL special types

#### 5.2 Workflow
```
AI Image Generation → Resize/Quantize → RLE Encode → CEL Frame → MPQ Insert
```

---

## Part 4: Available Libraries

### Browser-Compatible

| Library | Purpose | Notes |
|---------|---------|-------|
| [stormjs](https://github.com/wowserhq/stormjs) | MPQ R/W | WASM, last updated 2020 |
| [diablo-file-formats](https://www.npmjs.com/package/diablo-file-formats) | File parsing | CEL, DUN, PAL, TIL, MIN |
| Existing MpqReader | MPQ reading | In savefile.js |
| Existing AssetPipeline | CEL encoding | In AssetPipeline.js |

### Implementation Strategy

1. **Start with existing code:**
   - Use MpqReader from savefile.js for reading
   - Use compress.js architecture for writing

2. **Add diablo-file-formats:**
   ```bash
   npm install diablo-file-formats
   ```
   For DUN/CEL/PAL parsing

3. **Custom DUN writer:**
   - Simple binary format, easy to implement
   - More control than external library

4. **MPQ Writer:**
   - Adapt compress.js MPQ rebuilding logic
   - Or integrate stormjs if write support works

---

## Part 5: Testing Strategy

### Unit Tests
```javascript
// tests/mpqModding.test.js
describe('DUN Parser', () => {
  test('parses cathedral level correctly');
  test('handles empty monster layer');
  test('round-trips without data loss');
});

describe('MPQ Writer', () => {
  test('produces valid MPQ header');
  test('encrypts hash/block tables correctly');
  test('file can be read back');
});
```

### Integration Tests
1. Create test DUN file
2. Pack into test MPQ
3. Load in game worker
4. Verify level loads correctly

### Manual Tests
1. Generate AI level
2. Export modded MPQ
3. Replace spawn.mpq
4. Play to verify

---

## Part 6: File List for Implementation

### New Files
| File | Purpose |
|------|---------|
| `src/neural/MPQWriter.js` | MPQ archive creation |
| `src/neural/DUNParser.js` | Level file parsing |
| `src/neural/DUNWriter.js` | Level file creation |
| `src/neural/ModTools.js` | AI tool definitions |
| `src/neural/ModEditor.js` | React UI component |
| `src/neural/ModEditor.scss` | UI styling |

### Modified Files
| File | Changes |
|------|---------|
| `src/api/savefile.js` | Add file listing |
| `src/neural/index.js` | Export new modules |
| `src/App.js` | Add ModEditor integration |

---

## Part 7: Immediate Next Steps

1. **Create DUNParser.js** - Parse existing DUN files
2. **Create DUNWriter.js** - Write new DUN files
3. **Test with spawn.mpq** - Extract and repack a DUN
4. **Create ModTools.js** - AI tool interface
5. **Create ModEditor.js** - Basic UI skeleton
6. **Integrate into App.js** - Add mod editing mode

---

## Appendix A: spawn.mpq File Structure

Key directories:
```
levels/
  l1data/     - Cathedral levels
  l2data/     - Catacombs levels
  l3data/     - Caves levels
  l4data/     - Hell levels
  towndata/   - Town

monsters/     - Monster graphics

items/        - Item graphics

data/         - Game data files
```

---

## Appendix B: References

- [d1-file-formats](https://github.com/savagesteel/d1-file-formats) - File format specs
- [diablo-file-formats](https://github.com/doggan/diablo-file-formats) - JS parser library
- [stormjs](https://github.com/wowserhq/stormjs) - StormLib WASM port
- [diasurgical/modding-tools](https://github.com/diasurgical/modding-tools) - Tiled integration

---

*This document should be updated as implementation progresses.*
