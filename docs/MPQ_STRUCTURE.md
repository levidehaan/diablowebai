# MPQ File Structure Documentation

This document details the structure and contents of the spawn.mpq archive used by Diablo Web.

---

## Table of Contents

1. [MPQ Archive Basics](#1-mpq-archive-basics)
2. [File Type Breakdown](#2-file-type-breakdown)
3. [Directory Structure](#3-directory-structure)
4. [Detailed File Types](#4-detailed-file-types)
5. [MPQ Reader Implementation](#5-mpq-reader-implementation)
6. [Important Constants](#6-important-constants)
7. [Tile ID Reference](#7-tile-id-reference)
8. [Key Code Locations](#8-key-code-locations)

---

## 1. MPQ Archive Basics

**File Location:** `/public/spawn.mpq` (~25 MB)

**Total Files:** 2,907 files (documented in `/src/mpqcmp/ListFile.txt`)

### Header Structure

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0 | 4 | Magic | `0x1A51504D` ("MPQ\x1A") |
| 4 | 4 | Header Size | Size of header |
| 8 | 4 | Archive Size | Total archive size |
| 12 | 2 | Format Version | MPQ format version |
| 14 | 2 | Block Size ID | Block size = `1 << (9 + sizeId)` |
| 16 | 4 | Hash Table Offset | Position of hash table |
| 20 | 4 | Block Table Offset | Position of block table |
| 24 | 4 | Hash Table Entries | Number of hash entries |
| 28 | 4 | Block Table Entries | Number of block entries |

### Key Properties

- **Block Size:** Typically 2048 or 4096 bytes
- **Hash Table Entry Size:** 16 bytes (encrypted)
- **Block Table Entry Size:** 16 bytes (encrypted)
- **Encryption:** Uses Diablo's proprietary hash algorithm

---

## 2. File Type Breakdown

| Extension | Count | Description |
|-----------|-------|-------------|
| `.wav` | 1,146 | Sound effects and music |
| `.cl2` | 1,121 | Compressed sprites |
| `.cel` | 281 | CEL sprite format |
| `.trn` | 146 | Palette transforms |
| `.pcx` | 78 | Bitmap graphics |
| `.dun` | 48 | Dungeon level layouts |
| `.pal` | 41 | Color palettes (256 colors) |
| `.gif` | 13 | Images (Hell level) |
| `.smk` | 10 | Video/cinematics |
| `.sol` | 6 | Light/shadow maps |
| `.til` | 5 | Tile definitions |
| `.min` | 5 | Sub-tile definitions |
| `.bin` | 4 | Binary data |
| `.amp` | 4 | Animation metadata |

---

## 3. Directory Structure

```
spawn.mpq/
├── CtrlPan/              # Control panel UI
│   └── panel8.cel        # UI elements
├── Data/                 # Game data
│   ├── inv/              # Inventory screens
│   └── char/             # Character interface
├── Gendata/              # General data
│   ├── diablo1.smk       # Opening cinematic
│   ├── diabend.smk       # Ending cinematic
│   └── cut*.pal          # Cutscene palettes
├── Items/                # Item graphics
│   └── *.cel             # Item sprites
├── Levels/               # Level data (CRITICAL)
│   ├── L1Data/           # Cathedral (dlvl 1-4)
│   │   ├── L1.dun        # Base layout
│   │   ├── L1.til        # Tile definitions
│   │   ├── L1.min        # Sub-tiles
│   │   ├── L1.sol        # Lighting
│   │   ├── L1.pal        # Palette
│   │   ├── L1s.cel       # Special tiles
│   │   ├── L1.amp        # Metadata
│   │   └── [quest files] # sklkng*.dun, banner*.dun, etc.
│   ├── L2Data/           # Catacombs (dlvl 5-8)
│   ├── L3Data/           # Caves (dlvl 9-12)
│   ├── L4Data/           # Hell (dlvl 13-16)
│   └── TownData/         # Town/Tristram
│       ├── town.dun
│       └── sector*.dun   # Town sectors
├── Missiles/             # Projectile sprites
│   └── *.cl2             # Missile animations
├── Monsters/             # Monster sprites
│   ├── acid/
│   ├── bat/
│   ├── black/
│   └── [etc.]
├── Sfx/                  # Sound effects
│   ├── Items/
│   ├── Misc/
│   ├── Towners/          # NPC dialogue
│   └── Warrior/          # Class sounds
└── UniQlvl/              # Unique level data
```

---

## 4. Detailed File Types

### 4.1 DUN Files (Level Layouts)

**Purpose:** Store dungeon map data with tile placements

**Format:**
```
Offset    Size       Description
0         2 (WORD)   Width (little-endian)
2         2 (WORD)   Height (little-endian)
4         W×H×2      Base tile layer (WORDs, tile index + 1)
...       W×H×8      Items layer (4x resolution, optional)
...       W×H×8      Monsters layer (4x resolution, optional)
...       W×H×8      Objects layer (4x resolution, optional)
```

**Notes:**
- Tile value 0 = default floor tile
- Other values = actual tile index + 1
- Sub-layers are 2x resolution (2W × 2H)

**Reference:** https://github.com/savagesteel/d1-file-formats/blob/master/PC-Mac/DUN.md

**Key DUN Files:**
| File | Purpose |
|------|---------|
| `l1data/sklkng.dun` | Skeleton King's lair |
| `l1data/banner1.dun` | Ogden's Sign quest |
| `l2data/blind1.dun` | Halls of the Blind |
| `l2data/blood1.dun` | Valor quest |
| `l3data/anvil.dun` | Anvil of Fury |
| `l4data/diab1.dun` | Diablo's lair |
| `towndata/town.dun` | Tristram |

### 4.2 TIL Files (Tile Definitions)

**Purpose:** Arrange 4 sub-tiles into 128×128 pixel tiles

**Format (per tile):**
```
WORD[0] = Top sub-tile index + 1
WORD[1] = Right sub-tile index + 1
WORD[2] = Left sub-tile index + 1
WORD[3] = Bottom sub-tile index + 1
```

### 4.3 MIN Files (Sub-tile Definitions)

**Purpose:** Define 64×32 pixel squares from CEL frame indices

**Format:**
- Cathedral/Catacombs/Caves: 10 WORDs per entry
- Town/Hell: 16 WORDs per entry

**WORD Encoding:**
- Bits 0-3: Frame type (0=floor, 1-5=wall types)
- Bits 4-15: CEL frame index + 1 (0 = transparent)

### 4.4 SOL Files (Lighting)

**Purpose:** Light and shadow data for level tiles

### 4.5 CEL Files (Sprites)

**Purpose:** RLE-compressed sprite graphics

**RLE Encoding:**
| Byte Value | Meaning |
|------------|---------|
| 0x00-0x7E | N opaque pixels follow |
| 0x81-0xFF | (256 - N) transparent pixels |
| 0x7F | 127 opaque pixels, line continues |
| 0x80 | 128 transparent pixels |

**CEL Types (for levels):**
| Type | Size | Description |
|------|------|-------------|
| 0 | 0x400 | Upper wall, no transparency |
| 1 | Variable | Regular RLE-compressed |
| 2-3 | 0x220 | Floor tiles |
| 4-5 | 0x320 | Wall bottom |

### 4.6 CL2 Files (Compressed Sprites)

**Purpose:** Enhanced sprite format for animations (missiles, effects)

### 4.7 PAL Files (Palettes)

**Purpose:** 256-color RGB palettes

**Format:** 768 bytes (256 × 3 RGB triplets)

**Key Palettes:**
- `l1data/l1.pal` - Cathedral
- `l2data/l2.pal` - Catacombs
- `l3data/l3.pal` - Caves
- `l4data/l4.pal` - Hell
- `towndata/town.pal` - Town

### 4.8 TRN Files (Palette Transforms)

**Purpose:** Color remapping for monster/item variants

**Format:** 256-byte lookup table (original → new palette index)

**Examples:**
- `monsters/acid/acidb.trn` - Blue acid demon variant
- `monsters/bat/orange.trn` - Orange bat variant

---

## 5. MPQ Reader Implementation

**Location:** `/src/api/savefile.js`

### File Flags

```javascript
Flags = {
  CompressPkWare: 0x00000100,   // PKZip compression
  CompressMulti:  0x00000200,   // Multi-block compression
  Compressed:     0x0000FF00,   // Any compression
  Encrypted:      0x00010000,   // File encrypted
  FixSeed:        0x00020000,   // Seed check
  PatchFile:      0x00100000,   // Patch data
  SingleUnit:     0x01000000,   // Single block
  DummyFile:      0x02000000,   // Placeholder
  SectorCrc:      0x04000000,   // CRC check
  Exists:         0x80000000,   // File exists
};
```

### Key Methods

```javascript
read(name)           // Read and decompress file
readRaw(name)        // Read without decompression
fileIndex(name)      // Find file hash entry
listFiles()          // Get list from (listfile)
hasFile(name)        // Check existence
getFileInfo(name)    // Get file metadata
```

### Decompression

1. **PKZip (DEFLATE):** `pkzip_decompress()`
2. **Multi-block:** For larger files
3. **No compression:** Raw data

---

## 6. Important Constants

### MPQ Magic Values

| Constant | Value | Description |
|----------|-------|-------------|
| Header Magic | `0x1A51504D` | "MPQ\x1A" |
| Hash Seed | `0x7FED7FED` | Hash table seed |
| Encryption Seed | `0xEEEEEEEE` | Initial encryption |
| Hash Table Size | 1280 | Entries count |

### Hash Types

| Type | Purpose |
|------|---------|
| 0 | Hash A |
| 1 | Hash B |
| 2 | Hash C |
| 3 | Encryption key |

### Save File Passwords

| Pattern | Password | Description |
|---------|----------|-------------|
| `spawn*.sv` | `lshbkfg1` | Single-player spawn |
| `share_*.sv` | `lshbkfg1` | Multiplayer spawn |
| `multi_*.sv` | `szqnlsk1` | Multiplayer retail |
| `*.sv` (default) | `xrgyrkj1` | Single-player retail |

---

## 7. Tile ID Reference

### Cathedral (L1)

| Tile Type | ID Range | Notes |
|-----------|----------|-------|
| Floors | 13-15 | Floor varieties |
| Walls | 1-12 | Orientation-based |
| Doors | 25-26 | Closed/open |
| Stairs Up | 36 | |
| Stairs Down | 37 | |
| Pillars | 42 | |
| Altar | 43 | |

### Catacombs (L2)

| Tile Type | ID Range |
|-----------|----------|
| Floors | 130-135 |
| Walls | 100-120 |
| Doors | 140-141 |
| Stairs Up | 142 |
| Stairs Down | 143 |
| Arches | 145-150 |

### Caves (L3)

| Tile Type | ID Range |
|-----------|----------|
| Floors | 200-210 |
| Walls | 180-199 |
| Stairs Up | 210 |
| Stairs Down | 211 |
| Lava | 220-225 |
| Bridges | 230 |

### Hell (L4)

| Tile Type | ID Range |
|-----------|----------|
| Floors | 300-310 |
| Walls | 280-299 |
| Stairs Up | 310 |
| Stairs Down | 311 |
| Pentagrams | 320 |

---

## 8. Key Code Locations

| Component | File Path |
|-----------|-----------|
| MPQ Reader | `/src/api/savefile.js` |
| DUN Parser/Writer | `/src/neural/DUNParser.js` |
| CEL Encoder | `/src/neural/CELEncoder.js` |
| Tile Mapper | `/src/neural/TileMapper.js` |
| Level Validator | `/src/neural/LevelValidator.js` |
| Asset Registry | `/src/neural/AssetRegistry.js` |
| Mod Tools | `/src/neural/ModTools.js` |
| ListFile | `/src/mpqcmp/ListFile.txt` |
| MPQ Worker | `/src/mpqcmp/mpqcmp.worker.js` |

---

*Last Updated: December 2024*
