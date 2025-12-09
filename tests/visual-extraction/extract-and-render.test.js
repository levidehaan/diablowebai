/**
 * Visual Extraction and Rendering Test
 *
 * This test extracts files from spawn.mpq and renders CEL/CL2 files.
 * Uses Puppeteer for browser-based rendering since canvas requires native compilation.
 *
 * Run with: node tests/visual-extraction/extract-and-render.test.js
 *
 * Output:
 *   tests/render-results/report.json - Extraction report
 *   tests/render-results/raw/       - Raw RGBA data files
 */

const fs = require('fs');
const path = require('path');

// Paths
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
const RESULTS_DIR = path.join(__dirname, '..', 'render-results');
const RAW_DIR = path.join(RESULTS_DIR, 'raw');

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
    'items\\armor2.cel',
    'items\\bottle.cel',
    'items\\fbttleor.cel',
    'items\\goldflip.cel',
    'items\\scroll.cel',
    'items\\staff.cel',
    'data\\inv\\objcurs.cel',
    'levels\\l1data\\l1s.cel',
  ],
  cl2: [
    'missiles\\firebolt.cl2',
    'missiles\\arrows.cl2',
    'monsters\\scav\\scava.cl2',
    'monsters\\skelaxe\\sklaxa.cl2',
    'monsters\\zombie\\zombiea.cl2',
    'plrgfx\\warrior\\wla\\wlawl.cl2',
  ],
  pal: [
    'levels\\l1data\\l1.pal',
    'levels\\l2data\\l2.pal',
    'levels\\l3data\\l3.pal',
    'levels\\l4data\\l4.pal',
  ],
  dun: [
    'levels\\l1data\\sking.dun',
    'levels\\l2data\\blood1.dun',
    'levels\\l3data\\anvil.dun',
    'levels\\l4data\\diab1.dun',
  ],
};

// Default Diablo palette (256 colors)
function createDefaultPalette() {
  const palette = [];
  for (let i = 0; i < 256; i++) {
    if (i === 0) {
      palette.push([0, 0, 0]);
    } else if (i < 32) {
      const v = Math.floor((i / 31) * 255);
      palette.push([v, v, v]);
    } else if (i < 64) {
      const v = (i - 32) / 31;
      palette.push([Math.floor(100 + v * 155), Math.floor(v * 80), Math.floor(v * 40)]);
    } else if (i < 96) {
      const v = (i - 64) / 31;
      palette.push([Math.floor(v * 60), Math.floor(80 + v * 175), Math.floor(v * 60)]);
    } else if (i < 128) {
      const v = (i - 96) / 31;
      palette.push([Math.floor(v * 60), Math.floor(v * 60), Math.floor(100 + v * 155)]);
    } else if (i < 160) {
      const v = (i - 128) / 31;
      palette.push([Math.floor(180 + v * 75), Math.floor(140 + v * 115), Math.floor(v * 60)]);
    } else if (i < 192) {
      const v = (i - 160) / 31;
      palette.push([Math.floor(80 + v * 120), Math.floor(v * 60), Math.floor(100 + v * 155)]);
    } else if (i < 224) {
      const v = (i - 192) / 31;
      palette.push([Math.floor(180 + v * 75), Math.floor(120 + v * 80), Math.floor(80 + v * 80)]);
    } else {
      const v = (i - 224) / 31;
      palette.push([Math.floor(200 + v * 55), Math.floor(200 + v * 55), Math.floor(200 + v * 55)]);
    }
  }
  return palette;
}

// CEL decoding
function decodeCEL(data, palette, filename = '') {
  if (!data || data.length < 4) return null;

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const frameCount = view.getUint32(0, true);

  if (frameCount === 0 || frameCount > 1000) return null;

  const frameOffsets = [];
  for (let i = 0; i <= frameCount; i++) {
    if (4 + i * 4 >= data.length) return null;
    frameOffsets.push(view.getUint32(4 + i * 4, true));
  }

  const frameStart = frameOffsets[0];
  const frameEnd = frameOffsets[1] || data.length;
  const frameData = data.slice(frameStart, frameEnd);
  const frameSize = frameData.length;

  // Estimate dimensions
  let width, height;
  if (filename.includes('item') || filename.includes('goldflip') ||
      filename.includes('scroll') || filename.includes('bottle')) {
    width = 28; height = 28;
  } else if (filename.includes('panel')) {
    width = 640; height = 128;
  } else if (filename.includes('objcurs')) {
    width = 33; height = 32;
  } else if (filename.includes('l1s') || filename.includes('l2s') ||
             filename.includes('l3s') || filename.includes('l4s')) {
    width = 64; height = 32;
  } else {
    width = Math.ceil(Math.sqrt(frameSize * 2));
    height = width;
  }

  // Decode RLE
  const pixels = new Uint8Array(width * height);
  let x = 0, y = height - 1, i = 0;

  while (i < frameData.length && y >= 0) {
    const cmd = frameData[i++];
    if (cmd >= 0x81) {
      x += 256 - cmd;
    } else if (cmd <= 0x7E && cmd > 0) {
      for (let j = 0; j < cmd && i < frameData.length; j++) {
        if (x < width && y >= 0) pixels[y * width + x] = frameData[i++];
        else i++;
        x++;
      }
    } else {
      i++;
    }
    while (x >= width) { x -= width; y--; }
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

// CL2 decoding
function decodeCL2(data, palette, filename = '') {
  if (!data || data.length < 4) return null;

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const firstValue = view.getUint32(0, true);
  const isMultiGroup = firstValue > 0 && firstValue < data.length / 2;

  let frameCount, frameOffsets;

  if (isMultiGroup && data.length > 32) {
    const groupOffset = view.getUint32(0, true);
    if (groupOffset < data.length) {
      const groupView = new DataView(data.buffer, data.byteOffset + groupOffset);
      frameCount = groupView.getUint32(0, true);
      if (frameCount === 0 || frameCount > 100) frameCount = 1;
      frameOffsets = [groupOffset + 4 + (frameCount + 1) * 4];
      for (let i = 0; i <= frameCount; i++) {
        frameOffsets.push(groupOffset + groupView.getUint32(4 + i * 4, true));
      }
    } else {
      frameCount = 1;
      frameOffsets = [0, data.length];
    }
  } else {
    frameCount = view.getUint32(0, true);
    if (frameCount === 0 || frameCount > 1000) return null;
    frameOffsets = [];
    for (let i = 0; i <= frameCount; i++) {
      frameOffsets.push(view.getUint32(4 + i * 4, true));
    }
  }

  const frameStart = frameOffsets[0];
  const frameEnd = frameOffsets[1] || data.length;
  const frameData = data.slice(frameStart, frameEnd);

  let width = 96, height = 96;
  if (filename.includes('missiles')) { width = 32; height = 32; }
  else if (filename.includes('monsters')) { width = 128; height = 128; }

  const pixels = new Uint8Array(width * height);
  let x = 0, y = height - 1, i = 0;

  while (i < frameData.length && y >= 0) {
    const cmd = frameData[i++];
    if (cmd >= 0x01 && cmd <= 0x7F) {
      x += cmd;
    } else if (cmd >= 0x80 && cmd <= 0xBE) {
      const count = 191 - cmd;
      const fillColor = frameData[i++] || 0;
      for (let j = 0; j < count; j++) {
        if (x < width && y >= 0) pixels[y * width + x] = fillColor;
        x++;
        while (x >= width) { x -= width; y--; }
      }
      continue;
    } else if (cmd >= 0xBF) {
      const count = 256 - cmd;
      for (let j = 0; j < count && i < frameData.length; j++) {
        if (x < width && y >= 0) pixels[y * width + x] = frameData[i++];
        else i++;
        x++;
      }
    }
    while (x >= width) { x -= width; y--; }
  }

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

// DUN decoding
function decodeDUN(data, filename = '') {
  if (!data || data.length < 4) return null;

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const width = view.getUint16(0, true);
  const height = view.getUint16(2, true);

  if (width === 0 || height === 0 || width > 256 || height > 256) return null;

  const tiles = [];
  for (let y = 0; y < height; y++) {
    tiles[y] = [];
    for (let x = 0; x < width; x++) {
      const offset = 4 + (y * width + x) * 2;
      if (offset + 2 <= data.length) {
        tiles[y][x] = view.getUint16(offset, true);
      } else {
        tiles[y][x] = 0;
      }
    }
  }

  return { width, height, tiles };
}

// Generate HTML gallery
function generateGallery(results) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>DiabloWeb AI - Extraction Results</title>
  <style>
    body { font-family: monospace; background: #1a1a2e; color: #eee; padding: 20px; }
    h1 { color: #d4af37; }
    h2 { color: #8b0000; border-bottom: 1px solid #8b0000; }
    .section { margin: 20px 0; }
    .item { display: inline-block; margin: 10px; padding: 10px; background: #2a2a4e; border-radius: 8px; }
    .success { color: #4caf50; }
    .error { color: #f44336; }
    table { border-collapse: collapse; width: 100%; }
    td, th { border: 1px solid #444; padding: 8px; text-align: left; }
    th { background: #333; }
    .stats { background: #2a2a4e; padding: 15px; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>DiabloWeb AI - File Extraction Test Results</h1>
  <p>Generated: ${new Date().toISOString()}</p>

  <div class="stats">
    <h3>Summary</h3>
    <table>
      <tr><th>File Type</th><th>Success</th><th>Failed</th><th>Total</th></tr>
      <tr><td>CEL</td><td class="success">${results.cel.success}</td><td class="error">${results.cel.total - results.cel.success}</td><td>${results.cel.total}</td></tr>
      <tr><td>CL2</td><td class="success">${results.cl2.success}</td><td class="error">${results.cl2.total - results.cl2.success}</td><td>${results.cl2.total}</td></tr>
      <tr><td>PAL</td><td class="success">${results.pal.success}</td><td class="error">${results.pal.total - results.pal.success}</td><td>${results.pal.total}</td></tr>
      <tr><td>DUN</td><td class="success">${results.dun.success}</td><td class="error">${results.dun.total - results.dun.success}</td><td>${results.dun.total}</td></tr>
    </table>
  </div>

  <div class="section">
    <h2>CEL Files</h2>
    <table>
      <tr><th>File</th><th>Status</th><th>Details</th></tr>
      ${results.cel.items.map(item => `
        <tr>
          <td>${item.name}</td>
          <td class="${item.success ? 'success' : 'error'}">${item.success ? 'OK' : 'FAIL'}</td>
          <td>${item.success ? `${item.width}x${item.height} (${item.frames} frames)` : item.error}</td>
        </tr>
      `).join('')}
    </table>
  </div>

  <div class="section">
    <h2>CL2 Files</h2>
    <table>
      <tr><th>File</th><th>Status</th><th>Details</th></tr>
      ${results.cl2.items.map(item => `
        <tr>
          <td>${item.name}</td>
          <td class="${item.success ? 'success' : 'error'}">${item.success ? 'OK' : 'FAIL'}</td>
          <td>${item.success ? `${item.width}x${item.height} (${item.frames} frames)` : item.error}</td>
        </tr>
      `).join('')}
    </table>
  </div>

  <div class="section">
    <h2>PAL Files</h2>
    <table>
      <tr><th>File</th><th>Status</th><th>Details</th></tr>
      ${results.pal.items.map(item => `
        <tr>
          <td>${item.name}</td>
          <td class="${item.success ? 'success' : 'error'}">${item.success ? 'OK' : 'FAIL'}</td>
          <td>${item.success ? `${item.colors} colors` : item.error}</td>
        </tr>
      `).join('')}
    </table>
  </div>

  <div class="section">
    <h2>DUN Files</h2>
    <table>
      <tr><th>File</th><th>Status</th><th>Details</th></tr>
      ${results.dun.items.map(item => `
        <tr>
          <td>${item.name}</td>
          <td class="${item.success ? 'success' : 'error'}">${item.success ? 'OK' : 'FAIL'}</td>
          <td>${item.success ? `${item.width}x${item.height} tiles` : item.error}</td>
        </tr>
      `).join('')}
    </table>
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
  ensureDir(RESULTS_DIR);
  ensureDir(RAW_DIR);

  // Load spawn.mpq
  const mpqPath = path.join(PUBLIC_DIR, 'spawn.mpq');
  if (!fs.existsSync(mpqPath)) {
    console.error('spawn.mpq not found at', mpqPath);
    process.exit(1);
  }

  console.log('Loading spawn.mpq...');
  const mpqBuffer = fs.readFileSync(mpqPath);
  const mpq = new MPQReader(mpqBuffer);
  console.log(`MPQ loaded: ${mpqBuffer.length} bytes`);
  console.log(`  Header size: ${mpq.headerSize}`);
  console.log(`  Archive size: ${mpq.archiveSize}`);
  console.log(`  Hash table: ${mpq.hashTableSize} entries`);
  console.log(`  Block table: ${mpq.blockTableSize} entries\n`);

  // Get default palette
  let palette = createDefaultPalette();

  // Try to load a real palette
  const palData = mpq.findFile('levels\\l1data\\l1.pal');
  if (palData && palData.length === 768) {
    console.log('Loaded l1.pal palette\n');
    for (let i = 0; i < 256; i++) {
      palette[i] = [palData[i * 3], palData[i * 3 + 1], palData[i * 3 + 2]];
    }
  }

  const results = {
    cel: { total: 0, success: 0, items: [] },
    cl2: { total: 0, success: 0, items: [] },
    pal: { total: 0, success: 0, items: [] },
    dun: { total: 0, success: 0, items: [] },
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
          // Save raw RGBA data
          const rawFilename = filename.replace(/\\/g, '_').replace(/\//g, '_') + '.raw';
          fs.writeFileSync(path.join(RAW_DIR, rawFilename), Buffer.from(decoded.rgba));

          item.success = true;
          item.width = decoded.width;
          item.height = decoded.height;
          item.frames = decoded.frameCount;
          results.cel.success++;
          console.log(`  [OK] ${filename} (${decoded.width}x${decoded.height}, ${decoded.frameCount} frames)`);
        } else {
          item.error = 'Decode failed';
        }
      }
    } catch (e) {
      item.error = e.message;
    }

    if (!item.success) {
      console.log(`  [FAIL] ${filename}: ${item.error}`);
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
          const rawFilename = filename.replace(/\\/g, '_').replace(/\//g, '_') + '.raw';
          fs.writeFileSync(path.join(RAW_DIR, rawFilename), Buffer.from(decoded.rgba));

          item.success = true;
          item.width = decoded.width;
          item.height = decoded.height;
          item.frames = decoded.frameCount;
          results.cl2.success++;
          console.log(`  [OK] ${filename} (${decoded.width}x${decoded.height}, ${decoded.frameCount} frames)`);
        } else {
          item.error = 'Decode failed';
        }
      }
    } catch (e) {
      item.error = e.message;
    }

    if (!item.success) {
      console.log(`  [FAIL] ${filename}: ${item.error}`);
    }

    results.cl2.items.push(item);
  }

  // Process PAL files
  console.log('\nProcessing PAL files...');
  for (const filename of KNOWN_FILES.pal) {
    results.pal.total++;
    const item = { name: filename, success: false };

    try {
      const data = mpq.findFile(filename);
      if (!data) {
        item.error = 'File not found';
      } else if (data.length === 768) {
        item.success = true;
        item.colors = 256;
        results.pal.success++;
        console.log(`  [OK] ${filename} (256 colors)`);
      } else {
        item.error = `Invalid size: ${data.length} bytes (expected 768)`;
      }
    } catch (e) {
      item.error = e.message;
    }

    if (!item.success) {
      console.log(`  [FAIL] ${filename}: ${item.error}`);
    }

    results.pal.items.push(item);
  }

  // Process DUN files
  console.log('\nProcessing DUN files...');
  for (const filename of KNOWN_FILES.dun) {
    results.dun.total++;
    const item = { name: filename, success: false };

    try {
      const data = mpq.findFile(filename);
      if (!data) {
        item.error = 'File not found';
      } else {
        const decoded = decodeDUN(new Uint8Array(data), filename);
        if (decoded) {
          item.success = true;
          item.width = decoded.width;
          item.height = decoded.height;
          results.dun.success++;
          console.log(`  [OK] ${filename} (${decoded.width}x${decoded.height} tiles)`);
        } else {
          item.error = 'Decode failed';
        }
      }
    } catch (e) {
      item.error = e.message;
    }

    if (!item.success) {
      console.log(`  [FAIL] ${filename}: ${item.error}`);
    }

    results.dun.items.push(item);
  }

  // Generate report
  console.log('\nGenerating report...');
  generateGallery(results);
  fs.writeFileSync(path.join(RESULTS_DIR, 'report.json'), JSON.stringify(results, null, 2));

  // Summary
  console.log('\n========================================');
  console.log('  Results Summary');
  console.log('========================================');
  console.log(`CEL: ${results.cel.success}/${results.cel.total} successful`);
  console.log(`CL2: ${results.cl2.success}/${results.cl2.total} successful`);
  console.log(`PAL: ${results.pal.success}/${results.pal.total} successful`);
  console.log(`DUN: ${results.dun.success}/${results.dun.total} successful`);
  console.log(`\nResults saved to: ${RESULTS_DIR}/index.html`);
  console.log('Raw RGBA data saved to: ' + RAW_DIR);
  console.log('========================================\n');

  const totalSuccess = results.cel.success + results.cl2.success +
                       results.pal.success + results.dun.success;
  const totalTests = results.cel.total + results.cl2.total +
                     results.pal.total + results.dun.total;

  return totalSuccess > 0 && totalSuccess === totalTests;
}

// Run tests
runTests()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
