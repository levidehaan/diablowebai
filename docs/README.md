# Diablo Web AI - Technical Documentation

This directory contains technical documentation for the Diablo Web AI project.

## Documentation Index

### Core Systems

| Document | Description |
|----------|-------------|
| [MPQ_STRUCTURE.md](./MPQ_STRUCTURE.md) | MPQ archive format, file types, directory structure |
| [WASM_INTERFACE.md](./WASM_INTERFACE.md) | WASM engine interface, worker protocol, memory access |
| [GAME_DATA_FORMATS.md](./GAME_DATA_FORMATS.md) | DUN files, monsters, items, quests, dungeons |

### Roadmap

| Document | Description |
|----------|-------------|
| [../UPGRADES.md](../UPGRADES.md) | Feature roadmap and task checklist |

---

## Quick Reference

### File Types in spawn.mpq

| Type | Count | Purpose |
|------|-------|---------|
| `.dun` | 48 | Level layouts |
| `.cel` | 281 | Sprites |
| `.cl2` | 1,121 | Compressed sprites |
| `.wav` | 1,146 | Audio |
| `.pal` | 41 | Palettes |
| `.trn` | 146 | Color transforms |
| `.til` | 5 | Tile definitions |
| `.min` | 5 | Sub-tile definitions |
| `.sol` | 6 | Lighting |

### WASM API Functions

```javascript
// Core input/rendering
_DApi_Init(timestamp, offscreen, major, minor, patch)
_DApi_Render(timestamp)
_DApi_Key(keyCode, pressed)
_DApi_Mouse(x, y, buttons)

// Neural AI (level injection)
neural_read_grid()    // Read 40x40 dungeon grid
neural_write_grid()   // Write 40x40 dungeon grid
neural_inject_level() // Queue level data
```

### Dungeon Themes

| Theme | Levels | Tile IDs |
|-------|--------|----------|
| Cathedral | 1-4 | Floors: 13-15, Walls: 1-12, Stairs: 36-37 |
| Catacombs | 5-8 | Floors: 130-135, Walls: 100-120, Stairs: 142-143 |
| Caves | 9-12 | Floors: 200-210, Walls: 180-199, Stairs: 210-211 |
| Hell | 13-16 | Floors: 300-310, Walls: 280-299, Stairs: 310-311 |

### Key Source Files

| Component | Location |
|-----------|----------|
| MPQ Reader | `/src/api/savefile.js` |
| Game Worker | `/src/api/game.worker.js` |
| DUN Parser | `/src/neural/DUNParser.js` |
| Tile Mapper | `/src/neural/TileMapper.js` |
| Monster Mapper | `/src/neural/MonsterMapper.js` |
| Campaign Generator | `/src/neural/CampaignGenerator.js` |

---

## Contributing

When adding new documentation:

1. Use markdown format
2. Include table of contents for long documents
3. Add to this README index
4. Use code blocks for data structures
5. Include "Last Updated" dates

---

*Last Updated: December 2024*
