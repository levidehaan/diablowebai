# DiabloWeb AI - Master Development Plan

> **THIS DOCUMENT IS THE SINGLE SOURCE OF TRUTH**
>
> All other planning documents (GAMEPLAN.md, UPGRADES.md, docs/*.md) are now supplementary reference only.
> This document supersedes all previous planning and tracks the actual state of the project.

**Last Updated:** 2024-12-09
**Status:** In Development - Phase 0 (Testing Foundation)

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Current Critical Issues](#current-critical-issues)
3. [Development Phases](#development-phases)
4. [Phase 0: Testing Foundation](#phase-0-testing-foundation)
5. [Phase 1: File Format Verification](#phase-1-file-format-verification)
6. [Phase 2: MPQ Read/Write Completeness](#phase-2-mpq-readwrite-completeness)
7. [Phase 3: WASM Integration](#phase-3-wasm-integration)
8. [Phase 4: Campaign Package System](#phase-4-campaign-package-system)
9. [Phase 5: AI Mod Editor Integration](#phase-5-ai-mod-editor-integration)
10. [Testing Infrastructure](#testing-infrastructure)
11. [File Format Reference](#file-format-reference)
12. [Architecture Overview](#architecture-overview)

---

## Project Overview

DiabloWeb AI is a web-based tool for creating AI-generated Diablo campaigns. The system should:

1. **Read** any file from a Diablo MPQ archive
2. **Display** all file types correctly (CEL, CL2, DUN, PAL, TIL, MIN, etc.)
3. **Edit** files via AI-powered tools
4. **Generate** new content (levels, monsters, items, graphics)
5. **Save** to a valid MPQ that the WASM engine can load
6. **Package** campaigns as distributable .dcpk files
7. **Play** generated campaigns in the browser via DevilutionX WASM

### Current State Summary

| Component | Status | Notes |
|-----------|--------|-------|
| MPQ Reading | Partial | Works for most files, some compression types unsupported |
| MPQ Writing | Partial | Basic implementation, needs validation |
| CEL Decoding | Partial | Works for some files, dimension detection unreliable |
| CL2 Decoding | Partial | Different RLE than CEL, detection issues |
| DUN Parsing | Complete | Fully implemented |
| TIL/MIN/SOL Parsing | Not Implemented | Format documented but no parser |
| PAL Parsing | Complete | Works correctly |
| DCPK Format | Complete | But only includes DUN files, missing graphics |
| Campaign Editor | Broken | TypeError in renderCharacters/renderQuests |
| WASM Loading | Works | DevilutionX loads correctly |
| Level Injection | Partial | Memory scanning implemented, injection untested |
| Testing | Minimal | Basic tests exist, no visual verification |

---

## Current Critical Issues

### Issue 1: Campaign Blueprint Editor Crashes

**Error:** `TypeError: Cannot read properties of undefined (reading 'length')`

**Location:** `CampaignBlueprintPanel.js:841` (renderCharacters) and `:898` (renderQuests)

**Cause:** Blueprint object is missing `characters` and `quests` arrays when loaded from DCPK.

**Fix Required:** Add null checks and default arrays in CampaignBlueprintPanel.

### Issue 2: DCPK Files Only Contain DUN Files

**Problem:** Generated .dcpk packages only include DUN level layouts. Missing:
- CEL/CL2 graphics (monsters, items, UI)
- TIL/MIN tileset definitions
- PAL palettes
- SOL collision data

**Impact:** Campaigns can't display any custom graphics.

**Fix Required:** Extend CampaignPackage to embed all required assets.

### Issue 3: CEL/CL2 Rendering Unreliable

**Problem:** FileViewer shows "ImageData created" but canvas may be empty or incorrect.

**Cause:** Dimension detection is heuristic-based and often wrong.

**Fix Required:** Build comprehensive test suite that extracts and renders every file.

### Issue 4: No Visual Test Verification

**Problem:** Can't verify if rendering is correct without manual inspection.

**Fix Required:** Create automated test system that:
1. Extracts files from MPQ
2. Renders them to PNG
3. Commits PNGs to repository for visual inspection
4. Optionally compares against known-good reference images

---

## Development Phases

```
Phase 0: Testing Foundation (CURRENT)
   ├── Create headless browser test infrastructure
   ├── Build file extraction test system
   └── Generate reference images from MPQ files

Phase 1: File Format Verification
   ├── Test every file type extraction from MPQ
   ├── Test every format decoder (CEL, CL2, DUN, etc.)
   └── Fix decoders that produce incorrect output

Phase 2: MPQ Read/Write Completeness
   ├── Implement missing compression types
   ├── Test MPQ creation from scratch
   └── Validate created MPQs load in WASM

Phase 3: WASM Integration
   ├── Test level injection into running game
   ├── Test monster/object spawning
   └── Test custom graphics rendering in game

Phase 4: Campaign Package System
   ├── Extend DCPK to include all required files
   ├── Test complete campaign loading
   └── Test end-to-end: generate → package → play

Phase 5: AI Mod Editor Integration
   ├── Fix Campaign Blueprint Editor bugs
   ├── Connect AI tools to file editors
   └── Full workflow testing
```

---

## Phase 0: Testing Foundation

> **Goal:** Create infrastructure to automatically test all file format handling.

### 0.1 Test Infrastructure Setup

Create new test files:

```
tests/
├── visual-extraction/
│   ├── extract-all-files.test.js    # Extract every file from MPQ
│   ├── render-cel-files.test.js     # Render all CEL to PNG
│   ├── render-cl2-files.test.js     # Render all CL2 to PNG
│   ├── parse-dun-files.test.js      # Parse all DUN files
│   └── render-results/              # Output directory for PNGs
├── format-verification/
│   ├── cel-format.test.js           # CEL format unit tests
│   ├── cl2-format.test.js           # CL2 format unit tests
│   ├── dun-format.test.js           # DUN format unit tests
│   ├── mpq-format.test.js           # MPQ format unit tests
│   └── til-min-format.test.js       # TIL/MIN format tests
├── wasm-integration/
│   ├── level-injection.test.js      # Inject levels into WASM
│   ├── mpq-loading.test.js          # Load custom MPQ in WASM
│   └── campaign-play.test.js        # Full campaign playthrough
└── e2e/
    ├── mod-editor.test.js           # Mod Editor UI tests
    └── campaign-builder.test.js     # Campaign Builder tests
```

### 0.2 File Extraction Test System

**Test Script: `tests/visual-extraction/extract-all-files.test.js`**

This script will:
1. Load spawn.mpq
2. List all 1029 files
3. Attempt to extract each one
4. Log success/failure
5. Save extracted files to `tests/extracted/`

**Command:** `npm run test:extract`

### 0.3 Visual Rendering Test System

**Test Script: `tests/visual-extraction/render-cel-files.test.js`**

This script will:
1. Load each CEL file from spawn.mpq
2. Decode using CELEncoder
3. Render to canvas
4. Export as PNG to `tests/render-results/cel/`
5. Create an index.html showing all renders

**Output:**
```
tests/render-results/
├── cel/
│   ├── ctrlpan_panel8.png
│   ├── items_fbttleor.png
│   └── ... (all CEL files)
├── cl2/
│   ├── monsters_scav_scavs.png
│   └── ... (all CL2 files)
├── index.html              # Visual gallery of all renders
└── report.json             # Success/failure for each file
```

### 0.4 Headless Browser Setup

Using Puppeteer for browser-based testing:

```javascript
// tests/helpers/browser-test.js
const puppeteer = require('puppeteer');

async function createTestBrowser() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  return browser;
}

async function renderInBrowser(html, screenshotPath) {
  const browser = await createTestBrowser();
  const page = await browser.newPage();
  await page.setContent(html);
  await page.screenshot({ path: screenshotPath });
  await browser.close();
}
```

### 0.5 Test Commands

Add to `package.json`:

```json
{
  "scripts": {
    "test:extract": "node tests/visual-extraction/extract-all-files.test.js",
    "test:render": "node tests/visual-extraction/render-all.test.js",
    "test:formats": "jest tests/format-verification/",
    "test:wasm": "jest tests/wasm-integration/",
    "test:e2e": "jest tests/e2e/",
    "test:all": "npm run test:formats && npm run test:wasm && npm run test:e2e"
  }
}
```

---

## Phase 1: File Format Verification

> **Goal:** Ensure every file format can be correctly read and decoded.

### 1.1 CEL Format

**File:** `src/neural/CELEncoder.js`

**Current Issues:**
- Dimension detection is heuristic (line 732-793)
- Frame header detection incomplete (line 808-830)
- Some CEL files render as empty or wrong dimensions

**Tests Needed:**
1. Parse CEL header correctly
2. Extract correct number of frames
3. Detect dimensions accurately
4. Decode RLE properly
5. Render to correct pixel output

**Reference Files to Test:**
- `ctrlpan/panel8.cel` - UI panel
- `items/fbttleor.cel` - Item sprite
- `data/inv/inv_sor.cel` - Inventory background

### 1.2 CL2 Format

**File:** `src/neural/CELEncoder.js`

**Current Issues:**
- CL2 RLE encoding is different from CEL (line 1222)
- 8-direction detection unreliable
- Falls back to CEL decoder on errors

**Tests Needed:**
1. Detect mono-group vs multi-group correctly
2. Parse 8 direction offsets
3. Decode CL2-specific RLE (0x80-0xBE fill, 0xBF-0xFF literal)
4. Render all animation frames

**Reference Files to Test:**
- `plrgfx/warrior/wlh/wlhwl.cl2` - Warrior animation
- `monsters/scav/scavs.cl2` - Monster animation
- `missiles/firebolt.cl2` - Projectile animation

### 1.3 DUN Format

**File:** `src/neural/DUNParser.js`

**Status:** Fully implemented

**Tests Needed:**
1. Parse header (width, height)
2. Parse base tile layer
3. Parse optional items/monsters/objects layers
4. Write DUN and verify round-trip

**Reference Files:**
- `levels/l1data/quest1.dun` - Cathedral level
- `levels/towndata/town.dun` - Town layout

### 1.4 TIL/MIN/SOL Formats

**Status:** NOT IMPLEMENTED

**Required:**
1. Create TILParser.js - Parse tile arrangement (4 sub-tiles per tile)
2. Create MINParser.js - Parse miniset definitions
3. Create SOLParser.js - Parse solidity/collision data

**Format Specifications:**

**TIL (Tile Arrangement):**
```
Entry = 4 WORDs (8 bytes)
  WORD[0] = Top sub-tile index + 1
  WORD[1] = Right sub-tile index + 1
  WORD[2] = Left sub-tile index + 1
  WORD[3] = Bottom sub-tile index + 1
```

**MIN (Miniset):**
```
Variable entries per theme:
  Cathedral/Catacombs/Caves: 10 WORDs per entry
  Town/Hell: 16 WORDs per entry

WORD encoding:
  Bits 0-3: Frame type (0=floor, 1-5=wall types)
  Bits 4-15: CEL frame index + 1 (0 = transparent)
```

**SOL (Solidity):**
```
1 byte per sub-tile
  0 = walkable
  1 = blocked
  Other values = special (lava, water, etc.)
```

### 1.5 PAL Format

**File:** `src/neural/CELEncoder.js:parsePalette()`

**Status:** Implemented

**Tests Needed:**
1. Parse 768 bytes (256 RGB triplets)
2. Verify color accuracy
3. Test with each theme palette (l1.pal, l2.pal, etc.)

---

## Phase 2: MPQ Read/Write Completeness

> **Goal:** Fully read and write MPQ archives.

### 2.1 MPQ Reading

**File:** `src/api/savefile.js`

**Implemented Compression:**
- PKWare DCL (0x08) - Implemented
- zlib/DEFLATE (0x02) - Implemented
- No compression (0x00) - Implemented

**NOT Implemented:**
- Huffman (0x01) - Audio files, logs warning
- bzip2 (0x10) - Not used in Diablo
- IMA ADPCM (0x40, 0x41) - Audio compression
- LZMA (0x12) - Not used in Diablo

**Tests Needed:**
1. Extract every file from spawn.mpq
2. Verify extraction produces correct byte count
3. Compare extracted files against known hashes

### 2.2 MPQ Writing

**File:** `src/neural/MPQBuilder.js`

**Tests Needed:**
1. Create MPQ with single file
2. Create MPQ with multiple files
3. Create MPQ with compressed files
4. Verify created MPQ loads in WASM engine
5. Verify hash table is correct
6. Verify block table is correct

**Validation Process:**
```javascript
// Test round-trip
1. Extract file from spawn.mpq
2. Create new MPQ with just that file
3. Extract file from new MPQ
4. Compare bytes - must be identical
```

### 2.3 MPQ Validation Suite

**Create:** `tests/mpq-validation.test.js`

```javascript
describe('MPQ Creation', () => {
  test('creates valid MPQ header', () => {
    const mpq = new MPQBuilder();
    mpq.addFile('test.txt', Buffer.from('hello'));
    const buffer = mpq.build();

    // Verify magic
    expect(buffer.readUInt32LE(0)).toBe(0x1A51504D);
    // Verify header size
    expect(buffer.readUInt32LE(4)).toBe(32);
  });

  test('MPQ loads in WASM engine', async () => {
    const mpq = createTestMPQ();
    const fs = createVirtualFS();
    fs.set('test.mpq', mpq);

    // Try to load in WASM
    const result = await loadMPQInWASM(fs);
    expect(result.success).toBe(true);
  });
});
```

---

## Phase 3: WASM Integration

> **Goal:** Inject content into running game.

### 3.1 Memory Layout Discovery

**File:** `src/api/game.worker.js`

**Required Pointers:**
| Array | Size | Purpose |
|-------|------|---------|
| `dLevel[40][40]` | 1,600 bytes | Tile IDs |
| `dMonster[40][40]` | 1,600 bytes | Monster positions |
| `dObject[40][40]` | 1,600 bytes | Object positions |
| `dFlags[40][40]` | 1,600 bytes | Tile flags |

**Discovery Method:**
1. Enter dungeon level
2. Scan WASM heap for 40x40 patterns
3. Verify by reading known tile positions
4. Cache discovered offsets

### 3.2 Level Injection Tests

**Test Script:** `tests/wasm-integration/level-injection.test.js`

```javascript
describe('Level Injection', () => {
  test('can write to dLevel array', async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto('http://localhost:3000');

    // Wait for game to load
    await page.waitForFunction(() => window.Module?.ready);

    // Inject test pattern
    await page.evaluate(() => {
      const testGrid = new Array(40).fill(0).map(() =>
        new Array(40).fill(13) // All floor tiles
      );
      window.injectLevel(testGrid);
    });

    // Take screenshot
    await page.screenshot({ path: 'tests/screenshots/injected-level.png' });

    await browser.close();
  });
});
```

### 3.3 Custom MPQ Loading Test

**Test:** Load a custom MPQ and verify game uses its files.

```javascript
test('game loads custom MPQ files', async () => {
  // Create MPQ with custom level
  const customDUN = createTestDUN();
  const mpq = new MPQBuilder();
  mpq.addFile('levels/l1data/quest1.dun', customDUN);

  // Inject into virtual filesystem
  await page.evaluate((mpqData) => {
    window.fs.files.set('custom.mpq', new Uint8Array(mpqData));
  }, Array.from(mpq.build()));

  // Start game with custom MPQ
  await page.evaluate(() => window.loadGame('custom.mpq'));

  // Enter dungeon and verify custom level loaded
  // ...
});
```

---

## Phase 4: Campaign Package System

> **Goal:** Create complete, playable campaign packages.

### 4.1 DCPK Format Extension

**Current DCPK Structure:**
```json
{
  "magic": "DCPK",
  "version": 1,
  "campaign": { /* metadata */ },
  "dunFiles": { /* level layouts only */ }
}
```

**Required DCPK Structure:**
```json
{
  "magic": "DCPK",
  "version": 2,
  "campaign": { /* metadata */ },
  "dunFiles": { /* level layouts */ },
  "assets": {
    "cel": { /* custom CEL files base64 */ },
    "cl2": { /* custom CL2 files base64 */ },
    "pal": { /* custom palettes base64 */ }
  },
  "mpqData": "base64..." // Complete modified MPQ
}
```

### 4.2 Required Files Per Campaign

**Minimum Required:**
- DUN files for all levels (1-16)
- Base theme assets (inherited from spawn.mpq)

**For Custom Content:**
- Custom monster sprites (CL2)
- Custom item sprites (CEL)
- Custom tilesets (TIL/MIN + CEL)
- Custom palettes (PAL)

### 4.3 Campaign Loading Test

**End-to-End Test:**
```javascript
test('complete campaign playthrough', async () => {
  // 1. Load DCPK file
  const dcpk = await loadDCPK('tests/fixtures/test-campaign.dcpk');

  // 2. Inject into game filesystem
  await injectCampaign(dcpk);

  // 3. Start new game
  await startGame();

  // 4. Enter first dungeon
  await enterDungeon();

  // 5. Verify custom level loaded
  const screenshot = await takeScreenshot();
  expect(screenshot).toMatchSnapshot();

  // 6. Progress through all levels
  for (let level = 1; level <= 4; level++) {
    await goDownStairs();
    await verifyLevelLoaded(level);
  }
});
```

---

## Phase 5: AI Mod Editor Integration

> **Goal:** Connect AI tools to working file editors.

### 5.1 Fix Campaign Blueprint Panel

**File:** `src/neural/CampaignBlueprintPanel.js`

**Required Fixes:**

```javascript
// Line 841 - renderCharacters()
renderCharacters() {
  const { blueprint } = this.state;
  if (!blueprint) return null;

  // FIX: Add null check for characters
  const characters = blueprint.characters || [];

  return (
    <div className="blueprint-characters">
      {characters.length === 0 ? (
        <div className="empty-state">No characters defined</div>
      ) : (
        characters.map(char => /* render character */)
      )}
    </div>
  );
}

// Line 898 - renderQuests()
renderQuests() {
  const { blueprint } = this.state;
  if (!blueprint) return null;

  // FIX: Add null check for quests
  const quests = blueprint.quests || [];

  // ... similar fix
}
```

### 5.2 File Viewer Integration

**Current FileViewer Shows:**
- File hex dump
- Some format-specific rendering (broken)

**Required:**
- CEL: Animated preview with frame controls
- CL2: 8-direction animation preview
- DUN: Visual level map with tile legend
- PAL: Color palette grid

### 5.3 AI Tool Connections

**ModTools.js** provides AI editing capabilities:
- `generateMonster()` - Create monster variants
- `generateItem()` - Create item variants
- `generateLevel()` - Create level layouts

**Required Connections:**
1. ModTools → CELEncoder (for graphics)
2. ModTools → DUNParser (for levels)
3. ModTools → MPQBuilder (for packaging)
4. ModTools → CampaignPackage (for distribution)

---

## Testing Infrastructure

### Test Categories

| Category | Tool | Purpose |
|----------|------|---------|
| Unit | Jest | Individual function testing |
| Format | Jest | File format parsing verification |
| Visual | Puppeteer + Screenshots | Rendering verification |
| Integration | Puppeteer | Component interaction |
| E2E | Puppeteer | Full workflow testing |
| WASM | Puppeteer | Game engine integration |

### Running Tests

```bash
# Run all tests
npm run test:all

# Run specific test suites
npm run test:formats    # File format tests
npm run test:visual     # Visual rendering tests
npm run test:wasm       # WASM integration tests
npm run test:e2e        # End-to-end tests

# Generate visual renders
npm run test:render     # Outputs to tests/render-results/
```

### CI/CD Integration

**GitHub Actions Workflow:**
```yaml
name: Test Suite

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm install --legacy-peer-deps

      - name: Run format tests
        run: npm run test:formats

      - name: Run WASM tests
        run: npm run test:wasm

      - name: Build
        run: npm run build

      - name: Run E2E tests
        run: npm run test:e2e
```

---

## File Format Reference

### CEL Format

```
Header:
  DWORD frameCount

Frame Offsets (frameCount + 1 DWORDs):
  DWORD[0] = offset to frame 0
  DWORD[1] = offset to frame 1
  ...
  DWORD[n] = end of last frame

Frame Data (RLE encoded):
  Byte values:
    0x00-0x7E: N opaque pixels follow
    0x7F: 127 opaque pixels, line continues
    0x80: 128 transparent pixels, line continues
    0x81-0xFF: (256 - N) transparent pixels
```

### CL2 Format

```
Mono-group (single animation):
  Same as CEL

Multi-group (8 directions):
  Header: 8 DWORDs (offsets to each direction)
  Each direction: CEL-like structure with different RLE

CL2 RLE (different from CEL!):
  0x01-0x7F: N transparent pixels (no data follows)
  0x80-0xBE: Fill (191 - N) pixels with following byte
  0xBF-0xFF: (256 - N) literal palette indices follow
```

### DUN Format

```
Header:
  WORD width (1-256)
  WORD height (1-256)

Base Layer:
  WORD[width * height] tile indices (+1, 0 = empty)

Sub-Layers (optional, 4x resolution):
  Items:    WORD[(width*2) * (height*2)]
  Monsters: WORD[(width*2) * (height*2)]
  Objects:  WORD[(width*2) * (height*2)]
```

### MPQ Format

```
Header (32 bytes):
  DWORD magic = 0x1A51504D ("MPQ\x1A")
  DWORD headerSize = 32
  DWORD archiveSize
  WORD  formatVersion = 0
  WORD  blockSize (power of 2)
  DWORD hashTableOffset
  DWORD blockTableOffset
  DWORD hashTableSize
  DWORD blockTableSize

Hash Table (16 bytes per entry):
  DWORD hashA
  DWORD hashB
  WORD  locale
  WORD  platform
  DWORD blockIndex

Block Table (16 bytes per entry):
  DWORD fileOffset
  DWORD compressedSize
  DWORD uncompressedSize
  DWORD flags
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Interface                            │
├─────────────────────────────────────────────────────────────────┤
│  ModEditor.js  │  FileViewer.js  │  CampaignBlueprintPanel.js   │
└───────┬────────┴────────┬────────┴────────┬─────────────────────┘
        │                 │                 │
        ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Neural Layer                               │
├─────────────────────────────────────────────────────────────────┤
│ CELEncoder │ DUNParser │ MPQBuilder │ CampaignPackage │ ModTools│
└───────┬────┴─────┬─────┴──────┬─────┴───────┬─────────┴────┬────┘
        │          │            │             │              │
        ▼          ▼            ▼             ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        API Layer                                 │
├─────────────────────────────────────────────────────────────────┤
│       savefile.js (MPQ read)  │  game.worker.js (WASM bridge)   │
└────────────────┬──────────────┴───────────────┬─────────────────┘
                 │                              │
                 ▼                              ▼
┌────────────────────────────┐  ┌─────────────────────────────────┐
│       spawn.mpq            │  │    DevilutionX WASM Engine      │
│   (Diablo game data)       │  │    (Diablo.wasm / Spawn.wasm)   │
└────────────────────────────┘  └─────────────────────────────────┘
```

---

## Completion Checklist

### Phase 0: Testing Foundation
- [ ] Create test directory structure
- [ ] Implement file extraction test
- [ ] Implement visual rendering test
- [ ] Set up Puppeteer headless browser tests
- [ ] Create tests/render-results/ with all CEL/CL2 as PNG
- [ ] Add npm test scripts

### Phase 1: File Format Verification
- [ ] CEL decoding produces correct output for all files
- [ ] CL2 decoding produces correct output for all files
- [ ] DUN parsing handles all spawn.mpq DUN files
- [ ] Implement TIL parser
- [ ] Implement MIN parser
- [ ] Implement SOL parser
- [ ] PAL parsing verified for all palettes

### Phase 2: MPQ Read/Write
- [ ] Extract all 1029 files from spawn.mpq
- [ ] Create valid MPQ from scratch
- [ ] Round-trip test passes (extract → create → extract)
- [ ] Created MPQ loads in WASM engine

### Phase 3: WASM Integration
- [ ] Memory scanning finds dLevel reliably
- [ ] Level injection changes visible in game
- [ ] Monster spawning works
- [ ] Object placement works
- [ ] Custom MPQ loads correctly

### Phase 4: Campaign Package
- [ ] DCPK v2 format with all required assets
- [ ] Campaign loads in game
- [ ] All 16 levels accessible
- [ ] Custom content renders correctly

### Phase 5: AI Mod Editor
- [ ] Campaign Blueprint Editor loads without errors
- [ ] FileViewer renders all file types
- [ ] AI tools produce valid output
- [ ] Complete workflow: generate → edit → package → play

---

## Deprecated Documents

The following documents are now **reference only** and may contain outdated information:

- `GAMEPLAN.md` - Original WASM injection plan (partially superseded by MPQ approach)
- `UPGRADES.md` - Feature roadmap (completion status may be outdated)
- `docs/MPQ_MODDING_PLAN.md` - MPQ approach details (incorporated here)
- `docs/NEURAL_ARCHITECTURE.md` - System architecture (use Architecture section above)

---

*This document will be updated as development progresses. All changes should be committed with clear messages referencing the phase and task.*
