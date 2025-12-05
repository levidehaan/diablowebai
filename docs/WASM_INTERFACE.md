# WASM Engine Interface Documentation

This document details how JavaScript communicates with the Diablo WASM engine.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Exported WASM Functions](#2-exported-wasm-functions)
3. [Worker Communication Protocol](#3-worker-communication-protocol)
4. [DApi Callbacks](#4-dapi-callbacks)
5. [Neural AI Memory Bridge](#5-neural-ai-memory-bridge)
6. [Game Initialization Flow](#6-game-initialization-flow)
7. [Message Flow Examples](#7-message-flow-examples)
8. [Memory Access](#8-memory-access)

---

## 1. Architecture Overview

```
┌─────────────────┐     postMessage      ┌──────────────────┐
│   Main Thread   │ ◄─────────────────► │   Game Worker    │
│   (React App)   │                      │ (game.worker.js) │
└─────────────────┘                      └────────┬─────────┘
                                                  │
                                         ┌────────▼─────────┐
                                         │   WASM Module    │
                                         │ (DiabloSpawn.js) │
                                         └──────────────────┘
```

**Key Files:**
- Worker: `/src/api/game.worker.js` (813 lines)
- WASM Bindings: `/src/api/DiabloSpawn.jscc` (Emscripten compiled)
- Main Loader: `/src/api/loader.js`
- Neural Bridge: `/src/neural/WASMBridge.js`

---

## 2. Exported WASM Functions

### Core Game API (DApi_*)

| Function | Parameters | Description |
|----------|------------|-------------|
| `_DApi_Init` | `(timestamp, offscreen, major, minor, patch)` | Initialize game engine |
| `_DApi_Render` | `(timestamp)` | Render current frame |
| `_DApi_Key` | `(keyCode, pressed)` | Handle keyboard input |
| `_DApi_Mouse` | `(x, y, buttons)` | Handle mouse input |
| `_DApi_Char` | `(charCode)` | Handle text input |
| `_DApi_AllocPacket` | `(size)` | Allocate network packet |
| `_DApi_SyncText` | `(size)` | Sync text to WASM |
| `_DApi_SyncTextPtr` | `()` | Get text buffer pointer |

### Network Functions

| Function | Description |
|----------|-------------|
| `_SNet_InitWebsocket` | Initialize WebSocket |
| `_SNet_WebsocketStatus` | Report connection status |

### Memory Functions

| Function | Description |
|----------|-------------|
| `_malloc` | Allocate WASM heap memory |
| `_free` | Free WASM heap memory |
| `_memcpy` | Copy memory |

**Total Exports:** ~47 functions including C++ utilities

---

## 3. Worker Communication Protocol

### Messages: Main Thread → Worker

| Action | Parameters | Description |
|--------|------------|-------------|
| `init` | `{files, mpq, spawn, offscreen}` | Initialize game |
| `event` | `{func, params}` | Call WASM API function |
| `packet` | `{data}` | Single network packet |
| `packetBatch` | `{batch}` | Multiple packets |

#### Neural AI Messages

| Action | Parameters | Description |
|--------|------------|-------------|
| `neural_scan_memory` | `{}` | Scan for dungeon grid |
| `neural_read_grid` | `{}` | Read 40×40 tile grid |
| `neural_write_grid` | `{grid}` | Write 40×40 tile grid |
| `neural_read_tile` | `{x, y}` | Read single tile |
| `neural_write_tile` | `{x, y, tileId}` | Write single tile |
| `neural_get_info` | `{}` | Get memory info |
| `neural_inject_level` | `{levelData}` | Queue level injection |

### Messages: Worker → Main Thread

| Action | Parameters | Description |
|--------|------------|-------------|
| `loaded` | `{}` | Initialization complete |
| `render` | `{batch}` | Render data (images, text) |
| `audio` | `{func, params}` | Audio operation |
| `audioBatch` | `{batch}` | Batch audio ops |
| `fs` | `{func, params}` | File system op |
| `cursor` | `{x, y}` | Cursor position |
| `keyboard` | `{rect}` | Show virtual keyboard |
| `progress` | `{text, loaded, total}` | Loading progress |
| `exit` | `{}` | Game exited |
| `current_save` | `{name}` | Active save file |
| `error` | `{error, stack}` | Runtime error |
| `failed` | `{error, stack}` | Init failed |

#### Neural AI Response Messages

| Action | Parameters | Description |
|--------|------------|-------------|
| `neural_scan_result` | `{success, pointer, stats}` | Scan results |
| `neural_grid_result` | `{success, grid}` | Grid data |
| `neural_write_result` | `{success}` | Write confirmation |
| `neural_tile_result` | `{success, value}` | Tile read/write result |
| `neural_info_result` | `{heapSize, pointer}` | Memory info |
| `wasm_discovery` | `{exports}` | WASM exports catalog |

---

## 4. DApi Callbacks

The WASM engine calls back into JavaScript through these functions:

### File System

```javascript
DApi.get_file_size(path)
// Returns: file size in bytes or 0 if not found

DApi.get_file_contents(path, array, offset)
// Copies file data to WASM heap at array+offset

DApi.put_file_contents(path, array)
// Creates/updates file from WASM heap data

DApi.remove_file(path)
// Deletes file
```

### Rendering

```javascript
DApi.draw_begin()
// Start frame batch

DApi.draw_blit(x, y, w, h, data)
// Draw image region (raw pixels)

DApi.draw_clip_text(x0, y0, x1, y1)
// Set text clipping rectangle

DApi.draw_text(x, y, text, color)
// Draw text (color = RGB integer)

DApi.draw_belt(items)
// Draw item belt UI

DApi.draw_end()
// Finish frame, send to main thread
```

### Audio

```javascript
DApi.create_sound(soundId, data)
// Create sound from raw buffer

DApi.create_sound_float(soundId, floatData)
// Create sound from float buffer

DApi.duplicate_sound(newId, sourceId)
// Clone existing sound

DApi.play_sound(soundId)
// Play sound

DApi.stop_sound(soundId)
// Stop sound

DApi.set_volume(soundId, volume)
// Set volume (0-255)

DApi.delete_sound(soundId)
// Delete sound resource
```

### Input

```javascript
DApi.set_cursor(x, y)
// Update cursor position

DApi.open_keyboard(rect)
// Show virtual keyboard with bounds

DApi.close_keyboard()
// Hide virtual keyboard
```

### Network

```javascript
DApi.use_websocket(flag)
// Enable (1) or disable (0) WebSocket

DApi.websocket_closed()
// Returns: true if disconnected

DApi.websocket_send(data)
// Send packet (ArrayBuffer)
```

### Game State

```javascript
DApi.current_save_id(id)
// Notifies of active save file

DApi.exit_game()
// Game exit request

DApi.exit_error(error)
// Fatal error notification
```

---

## 5. Neural AI Memory Bridge

### Memory Layout

The dungeon grid is stored in WASM heap as a 40×40 byte array:

```
Grid Size: 1600 bytes (40 × 40)
Index Formula: offset = basePointer + (y * 40) + x
Tile Range: 0-60 (typically)
```

### Memory Scanning

The scanner looks for 40×40 patterns matching dungeon characteristics:

```javascript
// Criteria for valid dungeon grid:
- >= 100 floor tiles
- >= 50 wall tiles
- >= 1 stair tile
- < 800 empty bytes (0x00)
```

### Grid Operations

```javascript
// Read entire grid
worker.postMessage({action: "neural_read_grid"});
// Response: {action: "neural_grid_result", grid: [[...], ...]}

// Write entire grid
worker.postMessage({action: "neural_write_grid", grid: grid2D});
// Response: {action: "neural_write_result", success: true}

// Read single tile
worker.postMessage({action: "neural_read_tile", x: 10, y: 15});
// Response: {action: "neural_tile_result", value: 13}

// Write single tile
worker.postMessage({action: "neural_write_tile", x: 10, y: 15, tileId: 37});
// Response: {action: "neural_tile_result", success: true}
```

### Level Injection

Queue level data for injection during level transitions:

```javascript
worker.postMessage({
  action: "neural_inject_level",
  levelData: {
    grid: [[0,1,1,...], [0,0,0,...], ...],
    monsters: [...],
    objects: [...]
  }
});
```

---

## 6. Game Initialization Flow

```
1. Main Thread
   └─► Create Worker (game.worker.js)
   └─► Send {action: "init", files, mpq, spawn, offscreen}
       └─► Transfer file buffers (ownership transfer)

2. Worker
   └─► Load WASM module (DiabloSpawn.wasm)
   └─► Call wasm._DApi_Init(timestamp, offscreen, version...)
   └─► Discover and catalog WASM exports
   └─► Start render loop: setInterval(50ms)
       └─► call_api("DApi_Render", timestamp)
   └─► Send {action: "loaded"}

3. Main Thread
   └─► Receive "loaded"
   └─► Can now send input events
```

### Render Loop

```javascript
// 20 FPS render loop (50ms interval)
setInterval(() => {
  try {
    call_api("DApi_Render", Date.now());
  } catch (e) {
    // Handle error
  }
}, 50);
```

---

## 7. Message Flow Examples

### Keyboard Input

```javascript
// Main → Worker
worker.postMessage({
  action: "event",
  func: "DApi_Key",
  params: [13, 1]  // Enter key pressed
});

// Worker executes
call_api("DApi_Key", 13, 1);
// → wasm._DApi_Key(13, 1)
```

### Mouse Input

```javascript
// Main → Worker
worker.postMessage({
  action: "event",
  func: "DApi_Mouse",
  params: [320, 240, 1]  // x, y, left button
});
```

### Rendering

```javascript
// Worker → Main
worker.postMessage({
  action: "render",
  batch: {
    images: [{x:0, y:0, w:640, h:480, data: Uint8ClampedArray}],
    text: [{x:10, y:20, text:"Level 1", color: 0xFFFFFF}],
    belt: itemArray,
    clip: {x0:0, y0:0, x1:640, y1:480}
  }
}, [imageBuffer]);  // Transferable

// Main thread draws
context.putImageData(imageData, x, y);
```

### File Save

```javascript
// WASM calls DApi.put_file_contents("spawn0.sv", data)
// Worker sends to main:
worker.postMessage({
  action: "fs",
  func: "update",
  params: ["spawn0.sv", saveData]
});
```

---

## 8. Memory Access

### WASM Heap Views

```javascript
wasm.HEAPU8     // Uint8Array - byte access
wasm.HEAPU16    // Uint16Array - 16-bit access
wasm.HEAPU32    // Uint32Array - 32-bit access
wasm.HEAP32     // Int32Array - signed 32-bit
wasm.HEAPF32    // Float32Array
wasm.HEAPF64    // Float64Array
wasm.memory     // WebAssembly.Memory object
```

### Direct Memory Manipulation

```javascript
// Read byte at offset
const value = wasm.HEAPU8[offset];

// Write byte at offset
wasm.HEAPU8[offset] = newValue;

// Read tile from dungeon grid
const tile = wasm.HEAPU8[gridPointer + (y * 40) + x];

// Write tile to dungeon grid
wasm.HEAPU8[gridPointer + (y * 40) + x] = tileId;
```

### Memory Discovery

The grid location varies by build, so it must be discovered at runtime:

```javascript
// Scan heap for dungeon pattern
for (let offset = 0; offset < heapSize - 1600; offset++) {
  if (matchesDungeonPattern(offset)) {
    gridPointer = offset;
    break;
  }
}
```

---

## Key Takeaways

1. **Worker Isolation:** All WASM execution happens in a Web Worker for performance
2. **Message Passing:** Main thread and worker communicate via `postMessage`
3. **Transferables:** Large buffers are transferred (ownership) rather than copied
4. **20 FPS Render:** Game renders at 20 frames per second (50ms interval)
5. **Neural Memory:** AI can directly read/write dungeon grid in WASM heap
6. **Audio Batching:** Sound operations are batched to reduce message overhead
7. **File System:** Virtual file system synced between worker and main thread

---

*Last Updated: December 2024*
