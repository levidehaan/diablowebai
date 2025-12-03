import DiabloBinary from './Diablo.wasm';
import DiabloModule from './Diablo.jscc';
import SpawnBinary from './DiabloSpawn.wasm';
import SpawnModule from './DiabloSpawn.jscc';
import axios from 'axios';

import websocket_open from './websocket';

const DiabloSize = 1466809;
const SpawnSize = 1337416;

/* eslint-disable-next-line no-restricted-globals */
const worker = self;

let canvas = null, context = null;
let imageData = null;
let files = null;
let renderBatch = null;
let drawBelt = null;
let is_spawn = false;
let websocket = null;

function onError(err, action="error") {
  if (err instanceof Error) {
    worker.postMessage({action, error: err.toString(), stack: err.stack});
  } else {
    worker.postMessage({action, error: err.toString()});
  }
}

const ChunkSize = 1 << 20;
class RemoteFile {
  constructor(url) {
    const request = new XMLHttpRequest();
    request.open('HEAD', url, false);
    request.send();
    if (request.status < 200 || request.status >= 300) {
      throw Error('Failed to load remote file');
    }
    this.byteLength = parseInt(request.getResponseHeader('Content-Length'));

    this.url = url;

    this.buffer = new Uint8Array(this.byteLength);
    this.chunks = new Uint8Array(((this.byteLength + ChunkSize - 1) >> 20) | 0);
  }

  subarray(start, end) {
    let chunk0 = (start / ChunkSize) | 0;
    let chunk1 = ((end + ChunkSize - 1) / ChunkSize) | 0;
    let missing0 = chunk1, missing1 = chunk0;
    for (let i = chunk0; i < chunk1; ++i) {
      if (!this.chunks[i]) {
        missing0 = Math.min(missing0, i);
        missing1 = Math.max(missing1, i);
      }
    }
    if (missing0 <= missing1) {
      const request = new XMLHttpRequest();
      request.open('GET', this.url, false);
      request.setRequestHeader('Range', `bytes=${missing0 * ChunkSize}-${Math.min(missing1 * ChunkSize + ChunkSize - 1, this.byteLength - 1)}`);
      request.responseType = 'arraybuffer';
      request.send();
      if (request.status < 200 || request.status >= 300) {
        throw Error('Failed to load remote file');
      } else {
        const header = request.getResponseHeader('Content-Range');
        let m, start = 0;
        if (header && (m = header.match(/bytes (\d+)-(\d+)\/(\d+)/))) {
          start = parseInt(m[1]);
        }
        this.buffer.set(new Uint8Array(request.response), start);
        chunk0 = ((start + ChunkSize - 1) / ChunkSize) | 0;
        chunk1 = ((start + request.response.byteLength + ChunkSize - 1) / ChunkSize) | 0;
        for (let i = chunk0; i < chunk1; ++i) {
          this.chunks[i] = 1;
        }
      }
    }
    return this.buffer.subarray(start, end);
  }
}

const DApi = {
  exit_error(error) {
    throw Error(error);
  },

  exit_game() {
    worker.postMessage({action: "exit"});
  },
  current_save_id(id) {
    worker.postMessage({action: "current_save", name: id >= 0 ? (is_spawn ? `spawn${id}.sv` : `single_${id}.sv`) : null});
  },

  get_file_size(path) {
    const data = files.get(path.toLowerCase());
    return data ? data.byteLength : 0;
  },
  get_file_contents(path, array, offset) {
    const data = files.get(path.toLowerCase());
    if (data) {
      array.set(data.subarray(offset, offset + array.byteLength));
    }
  },
  put_file_contents(path, array) {
    path = path.toLowerCase();
    // if (!path.match(/^(spawn\d+\.sv|single_\d+\.sv|config\.ini)$/i)) {
    //   alert(`Bad file name: ${path}`);
    // }
    files.set(path, array);
    worker.postMessage({action: "fs", func: "update", params: [path, array]});
  },
  remove_file(path) {
    path = path.toLowerCase();
    files.delete(path);
    worker.postMessage({action: "fs", func: "delete", params: [path]});
  },

  set_cursor(x, y) {
    worker.postMessage({action: "cursor", x, y});
  },
  open_keyboard(...args) {
    worker.postMessage({action: "keyboard", rect: [...args]});
  },
  close_keyboard() {
    worker.postMessage({action: "keyboard", rect: null});
  },

  use_websocket(flag) {
    if (flag) {
      if (!websocket || websocket.readyState !== 1) {
        const sock = websocket = websocket_open('wss://diablo.rivsoft.net/websocket', data => {
          if (websocket === sock) {
            try_api(() => {
              const ptr = wasm._DApi_AllocPacket(data.byteLength);
              wasm.HEAPU8.set(new Uint8Array(data), ptr);
            });
          }
        }, code => {
          if (typeof code !== "number") {
            throw code;
          } else {
            call_api("SNet_WebsocketStatus", code);
          }
        });
      } else {
        call_api("SNet_WebsocketStatus", 0);
      }
    } else {
      if (websocket) {
        websocket.close();
      }
      websocket = null;
    }
  },
  websocket_closed() {
    return websocket ? websocket.readyState !== 1 : false;
  },
};
/*
let frameTime = 0, lastTime = 0;
function getFPS() {
  const time = performance.now();
  if (!lastTime) {
    lastTime = time;
  }
  frameTime = 0.9 * frameTime + 0.1 * (time - lastTime);
  lastTime = time;
  return frameTime ? 1000.0 / frameTime : 0.0;
}
*/
const DApi_renderLegacy = {
  draw_begin() {
    renderBatch = {
      images: [],
      text: [],
      clip: null,
      belt: drawBelt,
    };
    drawBelt = null;
  },
  draw_blit(x, y, w, h, data) {
    renderBatch.images.push({x, y, w, h, data: data.slice()});
  },
  draw_clip_text(x0, y0, x1, y1) {
    renderBatch.clip = {x0, y0, x1, y1};
  },
  draw_text(x, y, text, color) {
    renderBatch.text.push({x, y, text, color});
  },
  draw_end() {
    //DApi.draw_text(10, 10, `FPS: ${getFPS().toFixed(1)} (Transfer)`, 0xFFCC00);
    const transfer = renderBatch.images.map(({data}) => data.buffer);
    if (renderBatch.belt) {
      transfer.push(renderBatch.belt.buffer);
    }
    worker.postMessage({action: "render", batch: renderBatch}, transfer);
    renderBatch = null;
  },
  draw_belt(items) {
    drawBelt = items.slice();
  },
};

const DApi_renderOffscreen = {
  draw_begin() {
    context.save();
    context.font = 'bold 13px Times New Roman';
  },
  draw_blit(x, y, w, h, data) {
    imageData.data.set(data);
    context.putImageData(imageData, x, y);
  },
  draw_clip_text(x0, y0, x1, y1) {
    context.beginPath();
    context.rect(x0, y0, x1 - x0, y1 - y0);
    context.clip();
  },
  draw_text(x, y, text, color) {
    const r = ((color >> 16) & 0xFF);
    const g = ((color >> 8) & 0xFF);
    const b = (color & 0xFF);
    context.fillStyle = `rgb(${r}, ${g}, ${b})`;
    context.fillText(text, x, y + 22);
  },
  draw_end() {
    //DApi.draw_text(10, 10, `FPS: ${getFPS().toFixed(1)} (Offscreen)`, 0xFFCC00);
    context.restore();
    const bitmap = canvas.transferToImageBitmap();
    const transfer = [bitmap];
    if (drawBelt) {
      transfer.push(drawBelt.buffer);
    }
    worker.postMessage({action: "render", batch: {bitmap, belt: drawBelt}}, transfer);
    drawBelt = null;
  },
  draw_belt(items) {
    drawBelt = items.slice();
  },
};

let audioBatch = null, audioTransfer = null;
let maxSoundId = 0, maxBatchId = 0;
["create_sound_raw", "create_sound", "duplicate_sound"].forEach(func => {
  DApi[func] = function(...params) {
    if (audioBatch) {
      maxBatchId = params[0] + 1;
      audioBatch.push({func, params});
      if (func !== "duplicate_sound") {
        audioTransfer.push(params[1].buffer);
      }
    } else {
      maxSoundId = params[0] + 1;
      const transfer = [];
      if (func !== "duplicate_sound") {
        transfer.push(params[1].buffer);
      }
      worker.postMessage({action: "audio", func, params}, transfer);
    }
  };
});
["play_sound", "set_volume", "stop_sound", "delete_sound"].forEach(func => {
  DApi[func] = function(...params) {
    if (audioBatch && params[0] >= maxSoundId) {
      audioBatch.push({func, params});
    } else {
      worker.postMessage({action: "audio", func, params});
    }
  }
});

let packetBatch = null;
DApi.websocket_send = function(data) {
  if (websocket) {
    websocket.send(data);
  } else if (packetBatch) {
    packetBatch.push(data.slice().buffer);
  } else {
    worker.postMessage({action: "packet", buffer: data});
  }
};

worker.DApi = DApi;

let wasm = null;

function try_api(func) {
  try {
    func();
  } catch (e) {
    onError(e);
  }
}

function call_api(func, ...params) {
  try_api(() => {
    const nested = (audioBatch != null);
    if (!nested) {
      audioBatch = [];
      audioTransfer = [];
      packetBatch = [];
    }
    if (func !== "text") {
      wasm["_" + func](...params);
    } else {
      const ptr = wasm._DApi_SyncTextPtr();
      const text = params[0];
      const length = Math.min(text.length, 255);
      const heap = wasm.HEAPU8;
      for (let i = 0; i < length; ++i) {
        heap[ptr + i] = text.charCodeAt(i);
      }
      heap[ptr + length] = 0;
      wasm._DApi_SyncText(params[1]);
    }
    if (!nested) {
      if (audioBatch.length) {
        maxSoundId = maxBatchId;
        worker.postMessage({action: "audioBatch", batch: audioBatch}, audioTransfer);
      }
      if (packetBatch.length) {
        worker.postMessage({action: "packetBatch", batch: packetBatch}, packetBatch);
      }
      audioBatch = null;
      audioTransfer = null;
      packetBatch = null;
    }
  });
}

function progress(text, loaded, total) {
  worker.postMessage({action: "progress", text, loaded, total});
}

const readFile = (file, progress) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    if (progress) {
      progress({loaded: file.size});
    }
    resolve(reader.result);
  };
  reader.onerror = () => reject(reader.error);
  reader.onabort = () => reject();
  if (progress) {
    reader.addEventListener("progress", progress);
  }
  reader.readAsArrayBuffer(file);
});

async function initWasm(spawn, progress) {
  const binary = await axios.request({
    url: spawn ? SpawnBinary : DiabloBinary,
    responseType: 'arraybuffer',
    onDownloadProgress: progress,
  });
  const result = await (spawn ? SpawnModule : DiabloModule)({wasmBinary: binary.data}).ready;
  progress({loaded: 2000000});
  return result;
}

async function init_game(mpq, spawn, offscreen) {
  is_spawn = spawn;
  if (offscreen) {
    canvas = new OffscreenCanvas(640, 480);
    context = canvas.getContext("2d");
    imageData = context.createImageData(640, 480);
    Object.assign(DApi, DApi_renderOffscreen);
  } else {
    Object.assign(DApi, DApi_renderLegacy);
  }

  if (!mpq) {
    const name = (spawn ? 'spawn.mpq' : 'diabdat.mpq');
    if (!files.has(name)) {
      // This should never happen, but we do support remote loading
      files.set(name, new RemoteFile(`${process.env.PUBLIC_URL}/${name}`));
    }
  }

  progress("Loading...");
  let mpqLoaded = 0, mpqTotal = (mpq ? mpq.size : 0), wasmLoaded = 0, wasmTotal = (spawn ? SpawnSize : DiabloSize);
  const wasmWeight = 5;
  function updateProgress() {
    progress("Loading...", mpqLoaded + wasmLoaded * wasmWeight, mpqTotal + wasmTotal * wasmWeight);
  }
  const loadWasm = initWasm(spawn, e => {
    wasmLoaded = Math.min(e.loaded, wasmTotal);
    updateProgress();
  });
  let loadMpq = mpq ? readFile(mpq, e => {
    mpqLoaded = e.loaded;
    updateProgress();
  }) : Promise.resolve(null);
  [wasm, mpq] = await Promise.all([loadWasm, loadMpq]);

  if (mpq) {
    files.set(spawn ? 'spawn.mpq' : 'diabdat.mpq', new Uint8Array(mpq));
  }

  progress("Initializing...");

  const vers = process.env.VERSION.match(/(\d+)\.(\d+)\.(\d+)/);

  //wasm._SNet_InitWebsocket();
  wasm._DApi_Init(Math.floor(performance.now()), offscreen ? 1 : 0, parseInt(vers[1]), parseInt(vers[2]), parseInt(vers[3]));

  // Discovery: Log all WASM exports for AI integration research
  if (typeof console !== 'undefined') {
    const wasmExports = Object.keys(wasm).filter(k => k.startsWith('_'));
    console.log('[WASM Discovery] Total exports:', wasmExports.length);

    // Group by category
    const categories = {
      DApi: wasmExports.filter(k => k.includes('DApi')),
      Level: wasmExports.filter(k => k.toLowerCase().includes('level') || k.toLowerCase().includes('dung')),
      Monster: wasmExports.filter(k => k.toLowerCase().includes('monster') || k.toLowerCase().includes('mon_')),
      Object: wasmExports.filter(k => k.toLowerCase().includes('object') || k.toLowerCase().includes('obj_')),
      Player: wasmExports.filter(k => k.toLowerCase().includes('player') || k.toLowerCase().includes('plr_')),
      Item: wasmExports.filter(k => k.toLowerCase().includes('item')),
      Quest: wasmExports.filter(k => k.toLowerCase().includes('quest')),
      Memory: wasmExports.filter(k => k.includes('malloc') || k.includes('free') || k.includes('HEAP')),
    };

    Object.entries(categories).forEach(([cat, funcs]) => {
      if (funcs.length > 0) {
        console.log(`[WASM] ${cat}:`, funcs.slice(0, 20).join(', ') + (funcs.length > 20 ? `... (+${funcs.length - 20} more)` : ''));
      }
    });

    // Also expose for debugging
    worker.postMessage({
      action: 'wasm_discovery',
      exports: wasmExports,
      categories: categories
    });
  }

  setInterval(() => {
    call_api("DApi_Render", Math.floor(performance.now()));
  }, 50);
}

// ============================================================
// Neural AI Memory Bridge - for AI level injection
// ============================================================

const NEURAL_DMAXX = 40;
const NEURAL_DMAXY = 40;
const NEURAL_GRID_SIZE = NEURAL_DMAXX * NEURAL_DMAXY;

// Memory pointer cache for neural operations
let neuralMemory = {
  dLevel: null,
  dMonster: null,
  dObject: null,
  discovered: false,
};

// Current level tracking for change detection
let neuralCurrentLevel = -1;
let neuralPendingLevel = null;

/**
 * Scan WASM memory to find dungeon arrays
 */
function handleNeuralScanMemory() {
  if (!wasm || !wasm.HEAPU8) {
    worker.postMessage({
      action: 'neural_scan_result',
      success: false,
      error: 'WASM not available'
    });
    return;
  }

  const heap = wasm.HEAPU8;
  const heapSize = heap.length;

  console.log('[Neural] Scanning memory... Size:', heapSize);

  const candidates = [];

  // Search for repeating 40-byte patterns that look like dungeon rows
  // Cathedral tiles are typically 0-60 range
  for (let offset = 0; offset < heapSize - NEURAL_GRID_SIZE; offset += 4) {
    // Quick check: sample some tiles
    const sample = [
      heap[offset],
      heap[offset + 40],
      heap[offset + 80],
    ];

    // Dungeon tiles are typically 0-60 for cathedral
    const isDungeonLike = sample.every(v => v >= 0 && v <= 60);

    if (isDungeonLike) {
      // Count floor and wall tiles in a 40x40 region
      let floors = 0;
      let walls = 0;
      let stairs = 0;
      let zeros = 0;

      for (let i = 0; i < NEURAL_GRID_SIZE; i++) {
        const tile = heap[offset + i];
        if (tile === 0) zeros++;
        else if (tile >= 13 && tile <= 15) floors++;
        else if (tile >= 1 && tile <= 12) walls++;
        else if (tile === 36 || tile === 37) stairs++;
      }

      // A valid dungeon level should have significant floors, walls, and stairs
      // Not too many zeros (empty memory)
      if (floors > 100 && walls > 50 && stairs >= 1 && zeros < 800) {
        candidates.push({
          offset,
          floors,
          walls,
          stairs,
          zeros,
          score: floors + walls * 2 + stairs * 50 - zeros,
        });
      }
    }
  }

  if (candidates.length > 0) {
    // Sort by score, best match first
    candidates.sort((a, b) => b.score - a.score);

    const best = candidates[0];
    neuralMemory.dLevel = best.offset;
    neuralMemory.discovered = true;

    console.log('[Neural] Found dLevel at offset:', best.offset);
    console.log('[Neural] Stats - floors:', best.floors, 'walls:', best.walls, 'stairs:', best.stairs);

    worker.postMessage({
      action: 'neural_scan_result',
      success: true,
      pointer: best.offset,
      stats: {
        floors: best.floors,
        walls: best.walls,
        stairs: best.stairs,
        candidates: candidates.length,
      }
    });
  } else {
    console.log('[Neural] No dungeon arrays found');
    worker.postMessage({
      action: 'neural_scan_result',
      success: false,
      error: 'No dungeon arrays found'
    });
  }
}

/**
 * Read entire dungeon grid
 */
function handleNeuralReadGrid() {
  if (!neuralMemory.dLevel || !wasm.HEAPU8) {
    worker.postMessage({
      action: 'neural_grid_result',
      success: false,
      error: 'dLevel not discovered'
    });
    return;
  }

  const grid = [];
  const heap = wasm.HEAPU8;

  for (let y = 0; y < NEURAL_DMAXY; y++) {
    grid[y] = [];
    for (let x = 0; x < NEURAL_DMAXX; x++) {
      const offset = neuralMemory.dLevel + y * NEURAL_DMAXX + x;
      grid[y][x] = heap[offset];
    }
  }

  worker.postMessage({
    action: 'neural_grid_result',
    success: true,
    grid: grid
  });
}

/**
 * Write entire dungeon grid
 */
function handleNeuralWriteGrid(grid) {
  if (!neuralMemory.dLevel || !wasm.HEAPU8) {
    worker.postMessage({
      action: 'neural_write_result',
      success: false,
      error: 'dLevel not discovered'
    });
    return;
  }

  if (!grid || grid.length !== NEURAL_DMAXY) {
    worker.postMessage({
      action: 'neural_write_result',
      success: false,
      error: 'Invalid grid dimensions'
    });
    return;
  }

  const heap = wasm.HEAPU8;

  for (let y = 0; y < NEURAL_DMAXY; y++) {
    if (!grid[y] || grid[y].length !== NEURAL_DMAXX) {
      worker.postMessage({
        action: 'neural_write_result',
        success: false,
        error: `Invalid row ${y}`
      });
      return;
    }

    for (let x = 0; x < NEURAL_DMAXX; x++) {
      const offset = neuralMemory.dLevel + y * NEURAL_DMAXX + x;
      heap[offset] = grid[y][x];
    }
  }

  console.log('[Neural] Wrote dungeon grid');
  worker.postMessage({
    action: 'neural_write_result',
    success: true
  });
}

/**
 * Read single tile
 */
function handleNeuralReadTile(x, y) {
  if (!neuralMemory.dLevel || !wasm.HEAPU8) {
    worker.postMessage({
      action: 'neural_tile_result',
      success: false,
      error: 'dLevel not discovered'
    });
    return;
  }

  if (x < 0 || x >= NEURAL_DMAXX || y < 0 || y >= NEURAL_DMAXY) {
    worker.postMessage({
      action: 'neural_tile_result',
      success: false,
      error: 'Coordinates out of bounds'
    });
    return;
  }

  const offset = neuralMemory.dLevel + y * NEURAL_DMAXX + x;
  const tile = wasm.HEAPU8[offset];

  worker.postMessage({
    action: 'neural_tile_result',
    success: true,
    x,
    y,
    tile
  });
}

/**
 * Write single tile
 */
function handleNeuralWriteTile(x, y, tileId) {
  if (!neuralMemory.dLevel || !wasm.HEAPU8) {
    worker.postMessage({
      action: 'neural_tile_result',
      success: false,
      error: 'dLevel not discovered'
    });
    return;
  }

  if (x < 0 || x >= NEURAL_DMAXX || y < 0 || y >= NEURAL_DMAXY) {
    worker.postMessage({
      action: 'neural_tile_result',
      success: false,
      error: 'Coordinates out of bounds'
    });
    return;
  }

  const offset = neuralMemory.dLevel + y * NEURAL_DMAXX + x;
  wasm.HEAPU8[offset] = tileId;

  console.log(`[Neural] Wrote tile ${tileId} at (${x}, ${y})`);
  worker.postMessage({
    action: 'neural_tile_result',
    success: true,
    x,
    y,
    tile: tileId
  });
}

/**
 * Get neural memory info
 */
function handleNeuralGetInfo() {
  worker.postMessage({
    action: 'neural_info_result',
    initialized: !!wasm,
    discovered: neuralMemory.discovered,
    pointers: {
      dLevel: neuralMemory.dLevel,
      dMonster: neuralMemory.dMonster,
      dObject: neuralMemory.dObject,
    },
    heapSize: wasm?.HEAPU8?.length || 0,
    gridSize: NEURAL_GRID_SIZE,
    dimensions: { width: NEURAL_DMAXX, height: NEURAL_DMAXY },
    currentLevel: neuralCurrentLevel,
  });
}

/**
 * Inject a complete level (grid + monsters + objects)
 */
function handleNeuralInjectLevel(levelData) {
  if (!levelData) {
    worker.postMessage({
      action: 'neural_inject_result',
      success: false,
      error: 'No level data provided'
    });
    return;
  }

  // Store as pending level to inject when appropriate
  neuralPendingLevel = levelData;

  console.log('[Neural] Level data queued for injection');
  worker.postMessage({
    action: 'neural_inject_result',
    success: true,
    queued: true
  });

  // If we have dLevel discovered, try immediate injection
  if (neuralMemory.discovered && levelData.grid) {
    handleNeuralWriteGrid(levelData.grid);
    console.log('[Neural] Grid injected immediately');
  }
}

// ============================================================
// End Neural AI Memory Bridge
// ============================================================

worker.addEventListener("message", ({data}) => {
  switch (data.action) {
  case "init":
    files = data.files;
    init_game(data.mpq, data.spawn, data.offscreen).then(
      () => worker.postMessage({action: "loaded"}),
      e => onError(e, "failed"));
    break;
  case "event":
    call_api(data.func, ...data.params);
    break;
  case "packet":
    try_api(() => {
      const ptr = wasm._DApi_AllocPacket(data.buffer.byteLength);
      wasm.HEAPU8.set(new Uint8Array(data.buffer), ptr);
    });
    break;
  case "packetBatch":
    try_api(() => {
      for (let packet of data.batch) {
        const ptr = wasm._DApi_AllocPacket(packet.byteLength);
        wasm.HEAPU8.set(new Uint8Array(packet), ptr);
      }
    });
    break;

  // Neural AI Commands - for level injection
  case "neural_scan_memory":
    handleNeuralScanMemory();
    break;
  case "neural_read_grid":
    handleNeuralReadGrid();
    break;
  case "neural_write_grid":
    handleNeuralWriteGrid(data.grid);
    break;
  case "neural_read_tile":
    handleNeuralReadTile(data.x, data.y);
    break;
  case "neural_write_tile":
    handleNeuralWriteTile(data.x, data.y, data.tileId);
    break;
  case "neural_get_info":
    handleNeuralGetInfo();
    break;
  case "neural_inject_level":
    handleNeuralInjectLevel(data.levelData);
    break;

  default:
  }
});
