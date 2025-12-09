/**
 * Visual Extraction and Rendering Test
 *
 * This test extracts files from spawn.mpq and renders CEL/CL2 files to PNG.
 * It creates a visual gallery that can be inspected to verify rendering.
 *
 * Run with: node tests/visual-extraction/extract-and-render.test.js
 *
 * Output:
 *   tests/render-results/cel/    - PNG renders of CEL files
 *   tests/render-results/cl2/    - PNG renders of CL2 files
 *   tests/render-results/report.json - Success/failure report
 *   tests/render-results/index.html  - Visual gallery
 */

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

// Paths
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
const RESULTS_DIR = path.join(__dirname, '..', 'render-results');

// Ensure output directories exist
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// MPQ Reading helpers (simplified from savefile.js)
const HASH_TABLE_SIZE = 0x500;
let hashTable = null;

function initHashTable() {
  hashTable = new Uint32Array(HASH_TABLE_SIZE * 4);
  let seed = 0x00100001;

  for (let i = 0; i < 256; i++) {
    for (let j = i; j < HASH_TABLE_SIZE; j += 256) {
      seed = (seed * 125 + 3) % 0x2AAAAB;
      const temp1 = (seed & 0xFFFF) << 16;
      seed = (seed * 125 + 3) % 0x2AAAAB;
      const temp2 = seed & 0xFFFF;
      hashTable[j] = (temp1 | temp2) >>> 0;
    }
  }
}

function mpqHash(str, type) {
  if (!hashTable) initHashTable();

  let seed1 = 0x7FED7FED;
  let seed2 = 0xEEEEEEEE;

  str = str.toUpperCase().replace(/\//g, '\\');

  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    seed1 = hashTable[type * 256 + ch] ^ ((seed1 + seed2) >>> 0);
    seed2 = ((ch + seed1 + seed2 * 33 + 3) >>> 0);
  }

  return seed1 >>> 0;
}

function decrypt(data, key) {
  if (!hashTable) initHashTable();

  let seed = key;
  let seed2 = 0xEEEEEEEE;
  const result = new Uint32Array(data.length / 4);

  for (let i = 0; i < result.length; i++) {
    seed2 = (seed2 + hashTable[0x400 + (seed & 0xFF)]) >>> 0;
    const value = data[i * 4] |
                  (data[i * 4 + 1] << 8) |
                  (data[i * 4 + 2] << 16) |
                  (data[i * 4 + 3] << 24);
    const decrypted = ((value ^ (seed + seed2)) >>> 0);
    result[i] = decrypted;
    seed = (((~seed << 21) >>> 0) + 0x11111111) | ((seed >>> 11));
    seed2 = ((decrypted + seed2 + (seed2 << 5) + 3) >>> 0);
  }

  return new Uint8Array(result.buffer);
}

// zlib decompression
const zlib = require('zlib');

function decompress(data, uncompressedSize) {
  if (data.length === 0) return new Uint8Array(0);

  const compressionType = data[0];

  if (compressionType === 0x02) {
    // zlib
    try {
      const decompressed = zlib.inflateSync(Buffer.from(data.slice(1)));
      return new Uint8Array(decompressed);
    } catch (e) {
      console.error('zlib decompression failed:', e.message);
      return null;
    }
  } else if (compressionType === 0x00) {
    // No compression
    return data.slice(1);
  }

  // Unknown compression
  console.warn(`Unknown compression type: 0x${compressionType.toString(16)}`);
  return null;
}

// MPQ file list structure
class MPQReader {
  constructor(buffer) {
    this.buffer = new Uint8Array(buffer);
    this.view = new DataView(this.buffer.buffer);
    this.files = new Map();
    this.parseHeader();
  }

  parseHeader() {
    // Check magic
    const magic = this.view.getUint32(0, true);
    if (magic !== 0x1A51504D) {
      throw new Error('Invalid MPQ magic');
    }

    this.headerSize = this.view.getUint32(4, true);
    this.archiveSize = this.view.getUint32(8, true);
    this.formatVersion = this.view.getUint16(12, true);
    this.blockSize = 512 << this.view.getUint16(14, true);
    this.hashTableOffset = this.view.getUint32(16, true);
    this.blockTableOffset = this.view.getUint32(20, true);
    this.hashTableSize = this.view.getUint32(24, true);
    this.blockTableSize = this.view.getUint32(28, true);

    // Decrypt hash table
    const hashTableData = this.buffer.slice(
      this.hashTableOffset,
      this.hashTableOffset + this.hashTableSize * 16
    );
    const hashKey = mpqHash('(hash table)', 3);
    this.hashTableDecrypted = decrypt(hashTableData, hashKey);
    this.hashTableView = new DataView(this.hashTableDecrypted.buffer);

    // Decrypt block table
    const blockTableData = this.buffer.slice(
      this.blockTableOffset,
      this.blockTableOffset + this.blockTableSize * 16
    );
    const blockKey = mpqHash('(block table)', 3);
    this.blockTableDecrypted = decrypt(blockTableData, blockKey);
    this.blockTableView = new DataView(this.blockTableDecrypted.buffer);
  }

  findFile(filename) {
    const hashA = mpqHash(filename, 1);
    const hashB = mpqHash(filename, 2);
    const startIndex = mpqHash(filename, 0) % this.hashTableSize;

    for (let i = 0; i < this.hashTableSize; i++) {
      const index = (startIndex + i) % this.hashTableSize;
      const entryOffset = index * 16;

      const entryHashA = this.hashTableView.getUint32(entryOffset, true);
      const entryHashB = this.hashTableView.getUint32(entryOffset + 4, true);
      const blockIndex = this.hashTableView.getUint32(entryOffset + 12, true);

      if (blockIndex === 0xFFFFFFFF) {
        return null; // Empty entry, file not found
      }

      if (entryHashA === hashA && entryHashB === hashB) {
        return this.readBlock(blockIndex, filename);
      }
    }

    return null;
  }

  readBlock(blockIndex, filename) {
    const blockOffset = blockIndex * 16;
    const fileOffset = this.blockTableView.getUint32(blockOffset, true);
    const compressedSize = this.blockTableView.getUint32(blockOffset + 4, true);
    const uncompressedSize = this.blockTableView.getUint32(blockOffset + 8, true);
    const flags = this.blockTableView.getUint32(blockOffset + 12, true);

    const FLAG_COMPRESSED = 0x00000200;
    const FLAG_ENCRYPTED = 0x00010000;
    const FLAG_SINGLE_UNIT = 0x01000000;

    let data = this.buffer.slice(fileOffset, fileOffset + compressedSize);

    // Handle encryption
    if (flags & FLAG_ENCRYPTED) {
      const baseName = filename.split('\\').pop().split('/').pop();
      const decryptKey = mpqHash(baseName, 3);
      data = decrypt(data, decryptKey);
    }

    // Handle compression
    if (flags & FLAG_COMPRESSED) {
      if (flags & FLAG_SINGLE_UNIT) {
        // Single unit compression
        data = decompress(data, uncompressedSize);
      } else {
        // Multi-sector compression (simplified - just try decompressing)
        const result = decompress(data, uncompressedSize);
        if (result) {
          data = result;
        }
      }
    }

    return data;
  }
}

// Known file list from spawn.mpq (subset for testing)
const KNOWN_FILES = {
  cel: [
    'ctrlpan\\panel8.cel',
    'ctrlpan\\panel8bu.cel',
    'ctrlpan\\spelicon.cel',
    'data\\inv\\inv.cel',
    'data\\inv\\inv_sor.cel',
    'data\\inv\\objcurs.cel',
    'gendata\\cutstart.cel',
    'gendata\\cuttt.cel',
    'items\\armor2.cel',
    'items\\bldstn.cel',
    'items\\bottle.cel',
    'items\\brain.cel',
    'items\\cleaver.cel',
    'items\\fbow.cel',
    'items\\fbttle.cel',
    'items\\fbttleor.cel',
    'items\\goldflip.cel',
    'items\\hlmut.cel',
    'items\\mush.cel',
    'items\\rock.cel',
    'items\\scroll.cel',
    'items\\shield.cel',
    'items\\staff.cel',
    'items\\swrdflip.cel',
    'levels\\l1data\\l1s.cel',
    'levels\\l2data\\l2s.cel',
    'levels\\l3data\\l3s.cel',
    'levels\\l4data\\l4s.cel',
  ],
  cl2: [
    'missiles\\arrows.cl2',
    'missiles\\farrow.cl2',
    'missiles\\firebolt.cl2',
    'missiles\\firewahc.cl2',
    'missiles\\holy.cl2',
    'missiles\\magball.cl2',
    'missiles\\miniltng.cl2',
    'monsters\\acid\\acida.cl2',
    'monsters\\acid\\acidd.cl2',
    'monsters\\bat\\bata.cl2',
    'monsters\\darkmage\\dmagea.cl2',
    'monsters\\falspear\\phalla.cl2',
    'monsters\\fat\\fata.cl2',
    'monsters\\fireman\\firemana.cl2',
    'monsters\\goatbow\\goatba.cl2',
    'monsters\\goatlord\\goatla.cl2',
    'monsters\\goatmace\\goatma.cl2',
    'monsters\\mage\\magea.cl2',
    'monsters\\rhino\\rhinoa.cl2',
    'monsters\\scav\\scava.cl2',
    'monsters\\scav\\scavs.cl2',
    'monsters\\skelaxe\\sklaxa.cl2',
    'monsters\\skelbow\\sklbwa.cl2',
    'monsters\\skelsd\\sklsda.cl2',
    'monsters\\snake\\snakea.cl2',
    'monsters\\sneak\\sneaka.cl2',
    'monsters\\succ\\succa.cl2',
    'monsters\\thin\\thina.cl2',
    'monsters\\tsneak\\tsneaka.cl2',
    'monsters\\zombie\\zombiea.cl2',
    'plrgfx\\rogue\\rla\\rlaat.cl2',
    'plrgfx\\rogue\\rla\\rlaaw.cl2',
    'plrgfx\\rogue\\rla\\rlafm.cl2',
    'plrgfx\\rogue\\rla\\rlast.cl2',
    'plrgfx\\rogue\\rla\\rlawl.cl2',
    'plrgfx\\sorceror\\sla\\slaat.cl2',
    'plrgfx\\sorceror\\sla\\slafm.cl2',
    'plrgfx\\sorceror\\sla\\slast.cl2',
    'plrgfx\\sorceror\\sla\\slawl.cl2',
    'plrgfx\\warrior\\wla\\wlaat.cl2',
    'plrgfx\\warrior\\wla\\wlafm.cl2',
    'plrgfx\\warrior\\wla\\wlast.cl2',
    'plrgfx\\warrior\\wla\\wlawl.cl2',
  ],
  pal: [
    'gendata\\diablo.pal',
    'levels\\l1data\\l1.pal',
    'levels\\l1data\\l1_1.pal',
    'levels\\l1data\\l1_2.pal',
    'levels\\l1data\\l1_3.pal',
    'levels\\l1data\\l1_4.pal',
    'levels\\l1data\\l1_5.pal',
    'levels\\l1data\\l1palg.pal',
    'levels\\l2data\\l2.pal',
    'levels\\l3data\\l3.pal',
    'levels\\l4data\\l4.pal',
  ],
  dun: [
    'levels\\l1data\\sking.dun',
    'levels\\l1data\\sklking.dun',
    'levels\\l2data\\blood1.dun',
    'levels\\l2data\\blood2.dun',
    'levels\\l2data\\bonecha1.dun',
    'levels\\l2data\\bonecha2.dun',
    'levels\\l2data\\bonestr1.dun',
    'levels\\l2data\\bonestr2.dun',
    'levels\\l3data\\anvil.dun',
    'levels\\l4data\\diab1.dun',
    'levels\\l4data\\diab2a.dun',
    'levels\\l4data\\diab3a.dun',
    'levels\\l4data\\diab4a.dun',
    'levels\\l4data\\vile1.dun',
  ],
};

// Default Diablo palette (256 colors)
function createDefaultPalette() {
  const palette = [];

  // Generate a basic palette that approximates Diablo's colors
  for (let i = 0; i < 256; i++) {
    if (i === 0) {
      palette.push([0, 0, 0]); // Transparent/black
    } else if (i < 32) {
      // Grays
      const v = Math.floor((i / 31) * 255);
      palette.push([v, v, v]);
    } else if (i < 64) {
      // Reds/Browns
      const v = (i - 32) / 31;
      palette.push([
        Math.floor(100 + v * 155),
        Math.floor(v * 80),
        Math.floor(v * 40),
      ]);
    } else if (i < 96) {
      // Greens
      const v = (i - 64) / 31;
      palette.push([
        Math.floor(v * 60),
        Math.floor(80 + v * 175),
        Math.floor(v * 60),
      ]);
    } else if (i < 128) {
      // Blues
      const v = (i - 96) / 31;
      palette.push([
        Math.floor(v * 60),
        Math.floor(v * 60),
        Math.floor(100 + v * 155),
      ]);
    } else if (i < 160) {
      // Yellows/Golds
      const v = (i - 128) / 31;
      palette.push([
        Math.floor(180 + v * 75),
        Math.floor(140 + v * 115),
        Math.floor(v * 60),
      ]);
    } else if (i < 192) {
      // Purples
      const v = (i - 160) / 31;
      palette.push([
        Math.floor(80 + v * 120),
        Math.floor(v * 60),
        Math.floor(100 + v * 155),
      ]);
    } else if (i < 224) {
      // Flesh tones
      const v = (i - 192) / 31;
      palette.push([
        Math.floor(180 + v * 75),
        Math.floor(120 + v * 80),
        Math.floor(80 + v * 80),
      ]);
    } else {
      // Light colors
      const v = (i - 224) / 31;
      palette.push([
        Math.floor(200 + v * 55),
        Math.floor(200 + v * 55),
        Math.floor(200 + v * 55),
      ]);
    }
  }

  return palette;
}

// CEL decoding
function decodeCEL(data, palette, filename = '') {
  if (!data || data.length < 4) return null;

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // Read frame count
  const frameCount = view.getUint32(0, true);

  if (frameCount === 0 || frameCount > 1000) {
    console.warn(`Invalid frame count: ${frameCount} in ${filename}`);
    return null;
  }

  // Read frame offsets
  const frameOffsets = [];
  for (let i = 0; i <= frameCount; i++) {
    if (4 + i * 4 >= data.length) {
      console.warn(`Truncated frame offsets in ${filename}`);
      return null;
    }
    frameOffsets.push(view.getUint32(4 + i * 4, true));
  }

  // Decode first frame
  const frameStart = frameOffsets[0];
  const frameEnd = frameOffsets[1] || data.length;
  const frameData = data.slice(frameStart, frameEnd);

  // Estimate dimensions from frame size
  const frameSize = frameData.length;
  let width, height;

  // Common dimensions based on file patterns
  if (filename.includes('item') || filename.includes('goldflip') ||
      filename.includes('scroll') || filename.includes('bottle') ||
      filename.includes('mush') || filename.includes('rock')) {
    width = 28;
    height = 28;
  } else if (filename.includes('panel')) {
    width = 640;
    height = 128;
  } else if (filename.includes('inv')) {
    width = 320;
    height = 320;
  } else if (filename.includes('objcurs')) {
    width = 33;
    height = 32;
  } else if (filename.includes('spelicon')) {
    width = 37;
    height = 38;
  } else {
    // Estimate from frame size
    width = Math.ceil(Math.sqrt(frameSize * 2));
    height = width;
  }

  // Decode RLE
  const pixels = new Uint8Array(width * height);
  let x = 0;
  let y = height - 1; // Bottom-up
  let i = 0;

  while (i < frameData.length && y >= 0) {
    const cmd = frameData[i++];

    if (cmd >= 0x81) {
      // Transparent pixels: (256 - cmd) transparent
      const count = 256 - cmd;
      x += count;
    } else if (cmd <= 0x7E && cmd > 0) {
      // Opaque pixels: cmd literal bytes follow
      for (let j = 0; j < cmd && i < frameData.length; j++) {
        if (x < width && y >= 0) {
          pixels[y * width + x] = frameData[i++];
        } else {
          i++;
        }
        x++;
      }
    } else {
      // 0x7F or 0x80 - continue line
      i++;
    }

    // Handle line wrap
    while (x >= width) {
      x -= width;
      y--;
    }
  }

  // Convert to RGBA
  const rgba = new Uint8Array(width * height * 4);
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const idx = py * width + px;
      const paletteIdx = pixels[idx];
      const color = palette[paletteIdx] || [0, 0, 0];

      rgba[idx * 4] = color[0];
      rgba[idx * 4 + 1] = color[1];
      rgba[idx * 4 + 2] = color[2];
      rgba[idx * 4 + 3] = paletteIdx === 0 ? 0 : 255;
    }
  }

  return { width, height, rgba, frameCount };
}

// CL2 decoding (different RLE than CEL)
function decodeCL2(data, palette, filename = '') {
  if (!data || data.length < 4) return null;

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  // Check if multi-group (8 directions)
  const firstValue = view.getUint32(0, true);
  const isMultiGroup = firstValue > 0 && firstValue < data.length &&
                       firstValue === view.getUint32(4, true) - view.getUint32(0, true);

  let frameCount, frameOffsets;

  if (isMultiGroup && data.length > 32) {
    // Multi-group: 8 direction offsets at start
    const groupOffset = view.getUint32(0, true);
    const groupView = new DataView(data.buffer, data.byteOffset + groupOffset);
    frameCount = groupView.getUint32(0, true);

    if (frameCount === 0 || frameCount > 100) {
      frameCount = 1;
    }

    frameOffsets = [groupOffset + 4 + (frameCount + 1) * 4];
    for (let i = 0; i <= frameCount; i++) {
      frameOffsets.push(groupOffset + groupView.getUint32(4 + i * 4, true));
    }
  } else {
    // Mono-group
    frameCount = view.getUint32(0, true);
    if (frameCount === 0 || frameCount > 1000) {
      console.warn(`Invalid CL2 frame count: ${frameCount} in ${filename}`);
      return null;
    }

    frameOffsets = [];
    for (let i = 0; i <= frameCount; i++) {
      frameOffsets.push(view.getUint32(4 + i * 4, true));
    }
  }

  // Decode first frame using CL2 RLE
  const frameStart = frameOffsets[0];
  const frameEnd = frameOffsets[1] || data.length;
  const frameData = data.slice(frameStart, frameEnd);

  // Estimate dimensions
  let width = 96;
  let height = 96;

  if (filename.includes('plrgfx')) {
    width = 96;
    height = 96;
  } else if (filename.includes('missiles')) {
    width = 32;
    height = 32;
  } else if (filename.includes('monsters')) {
    width = 128;
    height = 128;
  }

  // Decode CL2 RLE (different from CEL!)
  const pixels = new Uint8Array(width * height);
  let x = 0;
  let y = height - 1;
  let i = 0;

  while (i < frameData.length && y >= 0) {
    const cmd = frameData[i++];

    if (cmd >= 0x01 && cmd <= 0x7F) {
      // Transparent: cmd pixels
      x += cmd;
    } else if (cmd >= 0x80 && cmd <= 0xBE) {
      // Fill: (191 - cmd) pixels with next byte
      const count = 191 - cmd;
      const fillColor = frameData[i++] || 0;
      for (let j = 0; j < count; j++) {
        if (x < width && y >= 0) {
          pixels[y * width + x] = fillColor;
        }
        x++;
        while (x >= width) {
          x -= width;
          y--;
        }
      }
      continue;
    } else if (cmd >= 0xBF) {
      // Literal: (256 - cmd) pixels
      const count = 256 - cmd;
      for (let j = 0; j < count && i < frameData.length; j++) {
        if (x < width && y >= 0) {
          pixels[y * width + x] = frameData[i++];
        } else {
          i++;
        }
        x++;
      }
    }

    while (x >= width) {
      x -= width;
      y--;
    }
  }

  // Convert to RGBA
  const rgba = new Uint8Array(width * height * 4);
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const idx = py * width + px;
      const paletteIdx = pixels[idx];
      const color = palette[paletteIdx] || [0, 0, 0];

      rgba[idx * 4] = color[0];
      rgba[idx * 4 + 1] = color[1];
      rgba[idx * 4 + 2] = color[2];
      rgba[idx * 4 + 3] = paletteIdx === 0 ? 0 : 255;
    }
  }

  return { width, height, rgba, frameCount, isMultiGroup };
}

// Save image to PNG
function savePNG(filename, width, height, rgba) {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const imageData = ctx.createImageData(width, height);
  imageData.data.set(rgba);
  ctx.putImageData(imageData, 0, 0);

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(filename, buffer);
}

// Generate HTML gallery
function generateGallery(results) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>DiabloWeb AI - Render Results</title>
  <style>
    body { font-family: Arial, sans-serif; background: #1a1a2e; color: #eee; margin: 0; padding: 20px; }
    h1 { color: #d4af37; }
    h2 { color: #8b0000; border-bottom: 1px solid #8b0000; padding-bottom: 10px; }
    .gallery { display: flex; flex-wrap: wrap; gap: 20px; }
    .item { background: #2a2a4e; padding: 15px; border-radius: 8px; text-align: center; }
    .item img { max-width: 200px; max-height: 200px; background: #000; image-rendering: pixelated; }
    .item .name { margin-top: 10px; font-size: 12px; word-break: break-all; }
    .item .status { font-size: 11px; margin-top: 5px; }
    .success { color: #4caf50; }
    .error { color: #f44336; }
    .stats { background: #2a2a4e; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
  </style>
</head>
<body>
  <h1>DiabloWeb AI - Visual Render Results</h1>
  <p>Generated: ${new Date().toISOString()}</p>

  <div class="stats">
    <h3>Summary</h3>
    <p>CEL Files: ${results.cel.success}/${results.cel.total} successful</p>
    <p>CL2 Files: ${results.cl2.success}/${results.cl2.total} successful</p>
  </div>

  <h2>CEL Files</h2>
  <div class="gallery">
    ${results.cel.items.map(item => `
      <div class="item">
        ${item.success ?
          `<img src="cel/${item.outputName}" alt="${item.name}" />` :
          `<div style="width:100px;height:100px;background:#300;display:flex;align-items:center;justify-content:center;">Error</div>`
        }
        <div class="name">${item.name}</div>
        <div class="status ${item.success ? 'success' : 'error'}">
          ${item.success ? `${item.width}x${item.height} (${item.frames} frames)` : item.error}
        </div>
      </div>
    `).join('')}
  </div>

  <h2>CL2 Files</h2>
  <div class="gallery">
    ${results.cl2.items.map(item => `
      <div class="item">
        ${item.success ?
          `<img src="cl2/${item.outputName}" alt="${item.name}" />` :
          `<div style="width:100px;height:100px;background:#300;display:flex;align-items:center;justify-content:center;">Error</div>`
        }
        <div class="name">${item.name}</div>
        <div class="status ${item.success ? 'success' : 'error'}">
          ${item.success ? `${item.width}x${item.height} (${item.frames} frames)` : item.error}
        </div>
      </div>
    `).join('')}
  </div>
</body>
</html>`;

  fs.writeFileSync(path.join(RESULTS_DIR, 'index.html'), html);
}

// Main test function
async function runTests() {
  console.log('\n========================================');
  console.log('  Visual Extraction Test');
  console.log('========================================\n');

  // Ensure directories exist
  ensureDir(path.join(RESULTS_DIR, 'cel'));
  ensureDir(path.join(RESULTS_DIR, 'cl2'));

  // Load spawn.mpq
  const mpqPath = path.join(PUBLIC_DIR, 'spawn.mpq');
  if (!fs.existsSync(mpqPath)) {
    console.error('spawn.mpq not found at', mpqPath);
    console.log('Please ensure spawn.mpq is in the public directory.');
    process.exit(1);
  }

  console.log('Loading spawn.mpq...');
  const mpqBuffer = fs.readFileSync(mpqPath);
  const mpq = new MPQReader(mpqBuffer);
  console.log(`MPQ loaded: ${mpqBuffer.length} bytes\n`);

  // Get default palette
  const palette = createDefaultPalette();

  // Try to load a real palette
  const palData = mpq.findFile('levels\\l1data\\l1.pal');
  if (palData && palData.length === 768) {
    console.log('Loaded l1.pal');
    for (let i = 0; i < 256; i++) {
      palette[i] = [palData[i * 3], palData[i * 3 + 1], palData[i * 3 + 2]];
    }
  }

  const results = {
    cel: { total: 0, success: 0, items: [] },
    cl2: { total: 0, success: 0, items: [] },
  };

  // Process CEL files
  console.log('Processing CEL files...');
  for (const filename of KNOWN_FILES.cel) {
    results.cel.total++;
    const item = { name: filename, success: false };

    try {
      const data = mpq.findFile(filename);
      if (!data) {
        item.error = 'File not found';
      } else {
        const decoded = decodeCEL(new Uint8Array(data), palette, filename);
        if (decoded) {
          const outputName = filename.replace(/\\/g, '_').replace(/\//g, '_') + '.png';
          savePNG(path.join(RESULTS_DIR, 'cel', outputName), decoded.width, decoded.height, decoded.rgba);
          item.success = true;
          item.outputName = outputName;
          item.width = decoded.width;
          item.height = decoded.height;
          item.frames = decoded.frameCount;
          results.cel.success++;
          console.log(`  ✓ ${filename} (${decoded.width}x${decoded.height})`);
        } else {
          item.error = 'Decode failed';
        }
      }
    } catch (e) {
      item.error = e.message;
    }

    if (!item.success) {
      console.log(`  ✗ ${filename}: ${item.error}`);
    }

    results.cel.items.push(item);
  }

  // Process CL2 files
  console.log('\nProcessing CL2 files...');
  for (const filename of KNOWN_FILES.cl2) {
    results.cl2.total++;
    const item = { name: filename, success: false };

    try {
      const data = mpq.findFile(filename);
      if (!data) {
        item.error = 'File not found';
      } else {
        const decoded = decodeCL2(new Uint8Array(data), palette, filename);
        if (decoded) {
          const outputName = filename.replace(/\\/g, '_').replace(/\//g, '_') + '.png';
          savePNG(path.join(RESULTS_DIR, 'cl2', outputName), decoded.width, decoded.height, decoded.rgba);
          item.success = true;
          item.outputName = outputName;
          item.width = decoded.width;
          item.height = decoded.height;
          item.frames = decoded.frameCount;
          results.cl2.success++;
          console.log(`  ✓ ${filename} (${decoded.width}x${decoded.height})`);
        } else {
          item.error = 'Decode failed';
        }
      }
    } catch (e) {
      item.error = e.message;
    }

    if (!item.success) {
      console.log(`  ✗ ${filename}: ${item.error}`);
    }

    results.cl2.items.push(item);
  }

  // Generate gallery and report
  console.log('\nGenerating gallery...');
  generateGallery(results);
  fs.writeFileSync(path.join(RESULTS_DIR, 'report.json'), JSON.stringify(results, null, 2));

  // Summary
  console.log('\n========================================');
  console.log('  Results Summary');
  console.log('========================================');
  console.log(`CEL: ${results.cel.success}/${results.cel.total} successful`);
  console.log(`CL2: ${results.cl2.success}/${results.cl2.total} successful`);
  console.log(`\nResults saved to: ${RESULTS_DIR}`);
  console.log(`View gallery at: ${path.join(RESULTS_DIR, 'index.html')}`);
  console.log('========================================\n');

  return results.cel.success > 0 || results.cl2.success > 0;
}

// Run tests
runTests()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
