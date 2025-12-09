/**
 * Visual Extraction and Rendering Test
 *
 * This test extracts files from spawn.mpq and renders CEL/CL2 files.
 * It uses a proper PKWare DCL decompressor and MPQ reader.
 *
 * Run with: node tests/visual-extraction/extract-and-render.test.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Paths
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');
const RESULTS_DIR = path.join(__dirname, '..', 'render-results');
const RAW_DIR = path.join(RESULTS_DIR, 'raw');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ============================================================================
// PKWare DCL Explode (Decompression) Implementation
// ============================================================================

const DistBits = new Uint8Array([
  0x02, 0x04, 0x04, 0x05, 0x05, 0x05, 0x05, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x06,
  0x06, 0x06, 0x06, 0x06, 0x06, 0x06, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07,
  0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07, 0x07,
  0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08, 0x08
]);

const DistCode = new Uint8Array([
  0x03, 0x0D, 0x05, 0x19, 0x09, 0x11, 0x01, 0x3E, 0x1E, 0x2E, 0x0E, 0x36, 0x16, 0x26, 0x06, 0x3A,
  0x1A, 0x2A, 0x0A, 0x32, 0x12, 0x22, 0x42, 0x02, 0x7C, 0x3C, 0x5C, 0x1C, 0x6C, 0x2C, 0x4C, 0x0C,
  0x74, 0x34, 0x54, 0x14, 0x64, 0x24, 0x44, 0x04, 0x78, 0x38, 0x58, 0x18, 0x68, 0x28, 0x48, 0x08,
  0xF0, 0x70, 0xB0, 0x30, 0xD0, 0x50, 0x90, 0x10, 0xE0, 0x60, 0xA0, 0x20, 0xC0, 0x40, 0x80, 0x00
]);

const ExLenBits = new Uint8Array([
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08
]);

const LenBase = new Uint16Array([
  0x0000, 0x0001, 0x0002, 0x0003, 0x0004, 0x0005, 0x0006, 0x0007,
  0x0008, 0x000A, 0x000E, 0x0016, 0x0026, 0x0046, 0x0086, 0x0106
]);

const LenBits = new Uint8Array([
  0x03, 0x02, 0x03, 0x03, 0x04, 0x04, 0x04, 0x05, 0x05, 0x05, 0x05, 0x06, 0x06, 0x06, 0x07, 0x07
]);

const LenCode = new Uint8Array([
  0x05, 0x03, 0x01, 0x06, 0x0A, 0x02, 0x0C, 0x14, 0x04, 0x18, 0x08, 0x30, 0x10, 0x20, 0x40, 0x00
]);

class BitReader {
  constructor(data) {
    this.data = data;
    this.pos = 0;
    this.bitBuf = 0;
    this.bitCount = 0;
  }

  readBit() {
    if (this.bitCount === 0) {
      if (this.pos >= this.data.length) return -1;
      this.bitBuf = this.data[this.pos++];
      this.bitCount = 8;
    }
    const bit = this.bitBuf & 1;
    this.bitBuf >>= 1;
    this.bitCount--;
    return bit;
  }

  readBits(count) {
    let result = 0;
    for (let i = 0; i < count; i++) {
      const bit = this.readBit();
      if (bit < 0) return -1;
      result |= bit << i;
    }
    return result;
  }

  peekBits(count) {
    const savedPos = this.pos;
    const savedBuf = this.bitBuf;
    const savedCount = this.bitCount;
    const result = this.readBits(count);
    this.pos = savedPos;
    this.bitBuf = savedBuf;
    this.bitCount = savedCount;
    return result;
  }
}

function pkwareExplode(input, outputSize) {
  if (input.length < 4) return null;

  const reader = new BitReader(input);
  const output = new Uint8Array(outputSize);
  let outPos = 0;

  // Read header
  const compressionType = reader.readBits(8);
  const dictSizeBits = reader.readBits(8);

  if (compressionType !== 0 && compressionType !== 1) return null;
  if (dictSizeBits < 4 || dictSizeBits > 6) return null;

  const dictSize = 1 << dictSizeBits;

  // Build length decode table
  const lenDecode = new Uint8Array(256);
  for (let i = 0; i < 16; i++) {
    const bits = LenBits[i];
    const code = LenCode[i];
    const count = 1 << (8 - bits);
    for (let j = 0; j < count; j++) {
      lenDecode[code | (j << bits)] = i;
    }
  }

  // Build distance decode table
  const distDecode = new Uint8Array(256);
  for (let i = 0; i < 64; i++) {
    const bits = DistBits[i];
    const code = DistCode[i];
    const count = 1 << (8 - bits);
    for (let j = 0; j < count; j++) {
      distDecode[code | (j << bits)] = i;
    }
  }

  while (outPos < outputSize) {
    const bit = reader.readBit();
    if (bit < 0) break;

    if (bit === 1) {
      // Literal byte
      let byte;
      if (compressionType === 0) {
        // Binary mode - literal byte
        byte = reader.readBits(8);
      } else {
        // ASCII mode - decode byte
        byte = reader.readBits(8);
      }
      if (byte < 0) break;
      output[outPos++] = byte;
    } else {
      // Copy from dictionary
      const peek = reader.peekBits(8);
      if (peek < 0) break;

      const lenIdx = lenDecode[peek];
      reader.readBits(LenBits[lenIdx]);

      let length = LenBase[lenIdx];
      if (ExLenBits[lenIdx] > 0) {
        const extra = reader.readBits(ExLenBits[lenIdx]);
        if (extra < 0) break;
        length += extra;
      }
      length += 2;

      if (length === 519) break; // End marker

      const distPeek = reader.peekBits(8);
      if (distPeek < 0) break;

      const distIdx = distDecode[distPeek];
      reader.readBits(DistBits[distIdx]);

      let distance = distIdx << dictSizeBits;
      const distLow = reader.readBits(dictSizeBits);
      if (distLow < 0) break;
      distance |= distLow;
      distance++;

      // Copy bytes
      for (let i = 0; i < length && outPos < outputSize; i++) {
        output[outPos] = output[outPos - distance];
        outPos++;
      }
    }
  }

  return output;
}

// ============================================================================
// MPQ Hash Table Functions
// ============================================================================

const hashtable = (function() {
  const ht = new Uint32Array(1280);
  let seed = 0x00100001;
  for (let i = 0; i < 256; i++) {
    for (let j = i; j < 1280; j += 256) {
      seed = (seed * 125 + 3) % 0x2AAAAB;
      const a = (seed & 0xFFFF) << 16;
      seed = (seed * 125 + 3) % 0x2AAAAB;
      const b = (seed & 0xFFFF);
      ht[j] = a | b;
    }
  }
  return ht;
})();

function mpqHash(name, type) {
  let seed1 = 0x7FED7FED;
  let seed2 = 0xEEEEEEEE;
  for (let i = 0; i < name.length; ++i) {
    let ch = name.charCodeAt(i);
    if (ch >= 0x61 && ch <= 0x7A) ch -= 0x20;
    if (ch === 0x2F) ch = 0x5C;
    seed1 = hashtable[type * 256 + ch] ^ (seed1 + seed2);
    seed2 = (ch + seed1 + seed2 * 33 + 3) | 0;
  }
  return seed1 >>> 0;
}

function decrypt(u32, key) {
  let seed = 0xEEEEEEEE;
  for (let i = 0; i < u32.length; ++i) {
    seed += hashtable[0x400 + (key & 0xFF)];
    u32[i] ^= seed + key;
    seed = (u32[i] + seed * 33 + 3) | 0;
    key = ((~key << 0x15) + 0x11111111) | (key >>> 0x0B);
  }
}

function decrypt8(u8, key) {
  const aligned = new Uint8Array(u8.length);
  aligned.set(u8);
  const u32 = new Uint32Array(aligned.buffer, 0, u8.length >> 2);
  decrypt(u32, key);
  u8.set(aligned);
}

function pathName(name) {
  const pos = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
  return name.substring(pos + 1);
}

// ============================================================================
// MPQ Reader
// ============================================================================

const Flags = {
  CompressPkWare: 0x00000100,
  CompressMulti: 0x00000200,
  Compressed: 0x0000FF00,
  Encrypted: 0x00010000,
  FixSeed: 0x00020000,
  SingleUnit: 0x01000000,
  Exists: 0x80000000,
};

function multiDecompress(data, outSize) {
  if (data.length === 0) return null;
  if (data.length === outSize) return data;

  const compressionType = data[0];
  const compressedData = data.subarray(1);

  if (compressionType === 0x08) {
    return pkwareExplode(compressedData, outSize);
  } else if (compressionType === 0x02) {
    try {
      return new Uint8Array(zlib.inflateSync(Buffer.from(compressedData)));
    } catch (e) {
      try {
        return new Uint8Array(zlib.inflateRawSync(Buffer.from(compressedData)));
      } catch (e2) {
        return null;
      }
    }
  } else if (compressionType === 0x00) {
    return compressedData.length >= outSize ? compressedData.subarray(0, outSize) : null;
  }

  // Try PKWare as fallback
  const result = pkwareExplode(compressedData, outSize);
  if (result) return result;

  console.warn(`Unknown compression: 0x${compressionType.toString(16)}`);
  return null;
}

class MpqReader {
  constructor(buffer) {
    this.buffer = buffer;
    this.u8 = new Uint8Array(buffer);
    this.u32 = new Uint32Array(buffer, 0, buffer.byteLength >> 2);
    this.readHeader();
  }

  readHeader() {
    const { u8, u32 } = this;
    if (u32[0] !== 0x1A51504D) throw Error('Invalid MPQ header');

    const sizeId = u8[14] + (u8[15] << 8);
    const hashOffset = u32[4];
    const blockOffset = u32[5];
    const hashCount = u32[6];
    const blockCount = u32[7];

    this.hashTable = this.readTable(hashOffset, hashCount, "(hash table)");
    this.blockTable = this.readTable(blockOffset, blockCount, "(block table)");
    this.blockSize = 1 << (9 + sizeId);
  }

  readTable(offset, count, key) {
    const buffer = new Uint32Array(this.buffer.slice(offset, offset + count * 16));
    decrypt(buffer, mpqHash(key, 3));
    return buffer;
  }

  fileIndex(name) {
    const { hashTable } = this;
    const length = hashTable.length >> 2;
    const index = mpqHash(name, 0) % length;
    const keyA = mpqHash(name, 1), keyB = mpqHash(name, 2);

    for (let i = index, count = 0; hashTable[i * 4 + 3] !== 0xFFFFFFFF && count < length; i = (i + 1) % length, ++count) {
      if (hashTable[i * 4] === keyA && hashTable[i * 4 + 1] === keyB && hashTable[i * 4 + 3] !== 0xFFFFFFFE) {
        return i;
      }
    }
    return null;
  }

  read(name) {
    const index = this.fileIndex(name);
    if (index == null) return null;

    const block = this.hashTable[index * 4 + 3];
    const info = {
      filePos: this.blockTable[block * 4],
      cmpSize: this.blockTable[block * 4 + 1],
      fileSize: this.blockTable[block * 4 + 2],
      flags: this.blockTable[block * 4 + 3],
      key: mpqHash(pathName(name), 3),
    };

    if (info.filePos + info.cmpSize > this.buffer.byteLength) return null;
    if (!(info.flags & Flags.Compressed)) info.cmpSize = info.fileSize;
    if (info.flags & Flags.FixSeed) info.key = (info.key + info.filePos) ^ info.fileSize;

    let data = new Uint8Array(this.buffer, info.filePos, info.cmpSize).slice();

    if (info.flags & Flags.SingleUnit) {
      if (info.flags & Flags.Encrypted) decrypt8(data, info.key);
      if (info.flags & Flags.CompressMulti) return multiDecompress(data, info.fileSize);
      else if (info.flags & Flags.CompressPkWare) return pkwareExplode(data, info.fileSize);
      return data;
    } else if (!(info.flags & Flags.Compressed)) {
      if (info.flags & Flags.Encrypted) {
        for (let i = 0; i < info.fileSize; i += this.blockSize) {
          decrypt8(data.subarray(i, Math.min(info.fileSize, i + this.blockSize)), info.key + i / this.blockSize);
        }
      }
      return data;
    } else {
      const numBlocks = Math.floor((info.fileSize + this.blockSize - 1) / this.blockSize);
      const tableSize = numBlocks + 1;
      if (data.length < tableSize * 4) return null;

      const blocks = new Uint32Array(data.buffer, data.byteOffset, tableSize);
      if (info.flags & Flags.Encrypted) decrypt(blocks, info.key - 1);

      const output = new Uint8Array(info.fileSize);
      for (let i = 0; i < numBlocks; ++i) {
        const oPos = i * this.blockSize;
        const uSize = Math.min(this.blockSize, info.fileSize - oPos);
        if (blocks[i + 1] > data.length) return null;

        let tmp = data.subarray(blocks[i], blocks[i + 1]);
        if (info.flags & Flags.Encrypted) decrypt8(tmp, info.key + i);
        if (info.flags & Flags.CompressMulti) tmp = multiDecompress(tmp, uSize);
        else if (info.flags & Flags.CompressPkWare) tmp = pkwareExplode(tmp, uSize);
        if (!tmp || tmp.length !== uSize) return null;
        output.set(tmp, oPos);
      }
      return output;
    }
  }

  listFiles() {
    const listfile = this.read('(listfile)');
    if (!listfile) return [];
    const text = new TextDecoder().decode(listfile);
    return text.split(/[\r\n]+/).filter(f => f.trim().length > 0);
  }

  hasFile(name) {
    return this.fileIndex(name) != null;
  }
}

// ============================================================================
// CEL/CL2 Decoders
// ============================================================================

function decodeCELRLE(rleData) {
  const pixels = [];
  let i = 0;
  while (i < rleData.length) {
    const cmd = rleData[i++];
    if (cmd === 0) continue;
    if (cmd >= 0x81) {
      const count = 256 - cmd;
      for (let j = 0; j < count; j++) pixels.push(0);
    } else if (cmd === 0x80) {
      for (let j = 0; j < 128; j++) pixels.push(0);
    } else if (cmd === 0x7F) {
      for (let j = 0; j < 127 && i < rleData.length; j++) pixels.push(rleData[i++]);
    } else {
      for (let j = 0; j < cmd && i < rleData.length; j++) pixels.push(rleData[i++]);
    }
  }
  return pixels;
}

function decodeCL2RLE(rleData) {
  const pixels = [];
  let i = 0;
  while (i < rleData.length) {
    const cmd = rleData[i++];
    if (cmd === 0) continue;
    if (cmd >= 0x01 && cmd <= 0x7F) {
      for (let j = 0; j < cmd; j++) pixels.push(0);
    } else if (cmd >= 0x80 && cmd <= 0xBE) {
      const count = 191 - cmd;
      const fillColor = rleData[i++] || 0;
      for (let j = 0; j < count; j++) pixels.push(fillColor);
    } else if (cmd >= 0xBF) {
      const count = 256 - cmd;
      for (let j = 0; j < count && i < rleData.length; j++) pixels.push(rleData[i++]);
    }
  }
  return pixels;
}

function decodeCEL(data, filename = '') {
  if (!data || data.length < 8) return null;

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
  if (frameStart >= data.length || frameEnd > data.length) return null;

  const frameData = data.slice(frameStart, frameEnd);
  const pixels = decodeCELRLE(frameData);

  // Estimate dimensions
  let width = 96, height = 96;
  const lower = filename.toLowerCase();
  if (lower.includes('items') || lower.includes('inv')) {
    width = 28; height = 28;
    if (pixels.length > 28*28) { width = 56; height = 56; }
  } else if (lower.includes('panel')) {
    width = 640; height = Math.ceil(pixels.length / 640);
  } else if (lower.includes('l1s') || lower.includes('l2s') || lower.includes('l3s') || lower.includes('l4s')) {
    width = 64; height = 32;
  } else if (lower.includes('objcurs')) {
    width = 33; height = 32;
  } else {
    // Try to find good dimensions
    const sqrt = Math.sqrt(pixels.length);
    if (Number.isInteger(sqrt)) { width = sqrt; height = sqrt; }
    else {
      for (const w of [96, 128, 64, 56, 32, 28]) {
        if (pixels.length % w === 0) { width = w; height = pixels.length / w; break; }
      }
    }
  }

  return { width, height, pixels, frameCount };
}

function decodeCL2(data, filename = '') {
  if (!data || data.length < 8) return null;

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const firstValue = view.getUint32(0, true);

  // Check for multi-group (8 directions)
  let isMultiGroup = false;
  let frameCount, frameData;

  if (firstValue > 0 && firstValue < data.length / 2 && data.length > 32) {
    // Might be multi-group - first value is offset to group 0
    isMultiGroup = true;
    const groupOffset = firstValue;
    if (groupOffset + 4 < data.length) {
      const groupView = new DataView(data.buffer, data.byteOffset + groupOffset);
      frameCount = groupView.getUint32(0, true);
      if (frameCount > 0 && frameCount < 100) {
        const frame0Start = groupView.getUint32(4, true);
        const frame0End = groupView.getUint32(8, true);
        if (groupOffset + frame0End <= data.length) {
          frameData = data.slice(groupOffset + frame0Start, groupOffset + frame0End);
        }
      }
    }
  }

  if (!frameData) {
    // Mono-group
    frameCount = view.getUint32(0, true);
    if (frameCount === 0 || frameCount > 1000) return null;

    const frame0Start = view.getUint32(4, true);
    const frame0End = view.getUint32(8, true);
    if (frame0End > data.length) return null;
    frameData = data.slice(frame0Start, frame0End);
    isMultiGroup = false;
  }

  if (!frameData) return null;

  const pixels = decodeCL2RLE(frameData);

  let width = 96, height = 96;
  const lower = filename.toLowerCase();
  if (lower.includes('missiles')) { width = 96; height = 96; }
  else if (lower.includes('monsters')) { width = 128; height = 128; }
  else if (lower.includes('plrgfx')) { width = 96; height = 96; }

  return { width, height, pixels, frameCount, isMultiGroup };
}

function decodeDUN(data) {
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
      tiles[y][x] = offset + 2 <= data.length ? view.getUint16(offset, true) : 0;
    }
  }
  return { width, height, tiles };
}

// ============================================================================
// Palette
// ============================================================================

function parsePalette(data) {
  if (!data) return null;
  const palette = [];
  // Skip any header bytes if present (some PAL files have 8-byte header)
  const offset = data.length === 776 ? 8 : 0;
  const palData = data.subarray(offset);
  if (palData.length < 768) return null;

  for (let i = 0; i < 256; i++) {
    palette.push([palData[i * 3], palData[i * 3 + 1], palData[i * 3 + 2]]);
  }
  return palette;
}

function createDefaultPalette() {
  const palette = [];
  for (let i = 0; i < 256; i++) {
    if (i === 0) palette.push([0, 0, 0]);
    else if (i < 32) { const v = Math.floor((i / 31) * 255); palette.push([v, v, v]); }
    else if (i < 64) { const v = (i - 32) / 31; palette.push([Math.floor(100 + v * 155), Math.floor(v * 80), Math.floor(v * 40)]); }
    else if (i < 96) { const v = (i - 64) / 31; palette.push([Math.floor(v * 60), Math.floor(80 + v * 175), Math.floor(v * 60)]); }
    else if (i < 128) { const v = (i - 96) / 31; palette.push([Math.floor(v * 60), Math.floor(v * 60), Math.floor(100 + v * 155)]); }
    else if (i < 160) { const v = (i - 128) / 31; palette.push([Math.floor(180 + v * 75), Math.floor(140 + v * 115), Math.floor(v * 60)]); }
    else if (i < 192) { const v = (i - 160) / 31; palette.push([Math.floor(80 + v * 120), Math.floor(v * 60), Math.floor(100 + v * 155)]); }
    else if (i < 224) { const v = (i - 192) / 31; palette.push([Math.floor(180 + v * 75), Math.floor(120 + v * 80), Math.floor(80 + v * 80)]); }
    else { const v = (i - 224) / 31; palette.push([Math.floor(200 + v * 55), Math.floor(200 + v * 55), Math.floor(200 + v * 55)]); }
  }
  return palette;
}

function pixelsToRGBA(pixels, width, height, palette) {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < Math.min(pixels.length, width * height); i++) {
    const paletteIdx = pixels[i];
    const color = palette[paletteIdx] || [0, 0, 0];
    rgba[i * 4] = color[0];
    rgba[i * 4 + 1] = color[1];
    rgba[i * 4 + 2] = color[2];
    rgba[i * 4 + 3] = paletteIdx === 0 ? 0 : 255;
  }
  return rgba;
}

// ============================================================================
// HTML Report Generator
// ============================================================================

function generateGallery(results) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>DiabloWeb AI - Extraction Results</title>
  <style>
    body { font-family: monospace; background: #1a1a2e; color: #eee; padding: 20px; }
    h1 { color: #d4af37; }
    h2 { color: #8b0000; border-bottom: 1px solid #8b0000; }
    .stats { background: #2a2a4e; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
    td, th { border: 1px solid #444; padding: 8px; text-align: left; }
    th { background: #333; }
    .success { color: #4caf50; }
    .error { color: #f44336; }
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

  ${['cel', 'cl2', 'pal', 'dun'].map(type => `
  <h2>${type.toUpperCase()} Files</h2>
  <table>
    <tr><th>File</th><th>Status</th><th>Details</th></tr>
    ${results[type].items.map(item => `
    <tr>
      <td>${item.name}</td>
      <td class="${item.success ? 'success' : 'error'}">${item.success ? 'OK' : 'FAIL'}</td>
      <td>${item.success ? item.details : item.error}</td>
    </tr>
    `).join('')}
  </table>
  `).join('')}
</body>
</html>`;

  fs.writeFileSync(path.join(RESULTS_DIR, 'index.html'), html);
}

// ============================================================================
// Main Test
// ============================================================================

async function runTests() {
  console.log('\n========================================');
  console.log('  Visual Extraction Test');
  console.log('========================================\n');

  ensureDir(RESULTS_DIR);
  ensureDir(RAW_DIR);

  const mpqPath = path.join(PUBLIC_DIR, 'spawn.mpq');
  if (!fs.existsSync(mpqPath)) {
    console.error('spawn.mpq not found at', mpqPath);
    process.exit(1);
  }

  console.log('Loading spawn.mpq...');
  const mpqBuffer = fs.readFileSync(mpqPath);
  const mpq = new MpqReader(mpqBuffer.buffer);
  console.log(`MPQ loaded: ${mpqBuffer.length} bytes`);
  console.log(`  Block size: ${mpq.blockSize} bytes\n`);

  // Get file list
  console.log('Reading file list...');
  const fileList = mpq.listFiles();
  console.log(`Found ${fileList.length} files in listfile\n`);

  // Find actual files to test
  const celFiles = fileList.filter(f => f.toLowerCase().endsWith('.cel')).slice(0, 15);
  const cl2Files = fileList.filter(f => f.toLowerCase().endsWith('.cl2')).slice(0, 15);
  const palFiles = fileList.filter(f => f.toLowerCase().endsWith('.pal')).slice(0, 8);
  const dunFiles = fileList.filter(f => f.toLowerCase().endsWith('.dun')).slice(0, 8);

  console.log(`Testing: ${celFiles.length} CEL, ${cl2Files.length} CL2, ${palFiles.length} PAL, ${dunFiles.length} DUN\n`);

  // Load palette
  let palette = createDefaultPalette();
  const palFile = palFiles.find(f => f.toLowerCase().includes('l1.pal'));
  if (palFile) {
    const palData = mpq.read(palFile);
    const parsed = parsePalette(palData);
    if (parsed) {
      palette = parsed;
      console.log('Loaded palette from', palFile);
    }
  }

  const results = {
    cel: { total: 0, success: 0, items: [] },
    cl2: { total: 0, success: 0, items: [] },
    pal: { total: 0, success: 0, items: [] },
    dun: { total: 0, success: 0, items: [] },
  };

  // Test CEL files
  console.log('\nProcessing CEL files...');
  for (const filename of celFiles) {
    results.cel.total++;
    const item = { name: filename, success: false };
    try {
      const data = mpq.read(filename);
      if (!data) { item.error = 'Read failed'; }
      else {
        const decoded = decodeCEL(data, filename);
        if (decoded) {
          const rgba = pixelsToRGBA(decoded.pixels, decoded.width, decoded.height, palette);
          const rawName = filename.replace(/[\\\/]/g, '_') + '.raw';
          fs.writeFileSync(path.join(RAW_DIR, rawName), Buffer.from(rgba));
          item.success = true;
          item.details = `${decoded.width}x${decoded.height} (${decoded.frameCount} frames, ${decoded.pixels.length} pixels)`;
          results.cel.success++;
          console.log(`  [OK] ${filename}`);
        } else { item.error = 'Decode failed'; }
      }
    } catch (e) { item.error = e.message; }
    if (!item.success) console.log(`  [FAIL] ${filename}: ${item.error}`);
    results.cel.items.push(item);
  }

  // Test CL2 files
  console.log('\nProcessing CL2 files...');
  for (const filename of cl2Files) {
    results.cl2.total++;
    const item = { name: filename, success: false };
    try {
      const data = mpq.read(filename);
      if (!data) { item.error = 'Read failed'; }
      else {
        const decoded = decodeCL2(data, filename);
        if (decoded) {
          const rgba = pixelsToRGBA(decoded.pixels, decoded.width, decoded.height, palette);
          const rawName = filename.replace(/[\\\/]/g, '_') + '.raw';
          fs.writeFileSync(path.join(RAW_DIR, rawName), Buffer.from(rgba));
          item.success = true;
          item.details = `${decoded.width}x${decoded.height} (${decoded.frameCount} frames, ${decoded.isMultiGroup ? '8-dir' : 'mono'})`;
          results.cl2.success++;
          console.log(`  [OK] ${filename}`);
        } else { item.error = 'Decode failed'; }
      }
    } catch (e) { item.error = e.message; }
    if (!item.success) console.log(`  [FAIL] ${filename}: ${item.error}`);
    results.cl2.items.push(item);
  }

  // Test PAL files
  console.log('\nProcessing PAL files...');
  for (const filename of palFiles) {
    results.pal.total++;
    const item = { name: filename, success: false };
    try {
      const data = mpq.read(filename);
      if (!data) { item.error = 'Read failed'; }
      else {
        const parsed = parsePalette(data);
        if (parsed) {
          item.success = true;
          item.details = `256 colors (${data.length} bytes)`;
          results.pal.success++;
          console.log(`  [OK] ${filename} (${data.length} bytes)`);
        } else { item.error = `Invalid size: ${data.length} bytes`; }
      }
    } catch (e) { item.error = e.message; }
    if (!item.success) console.log(`  [FAIL] ${filename}: ${item.error}`);
    results.pal.items.push(item);
  }

  // Test DUN files
  console.log('\nProcessing DUN files...');
  for (const filename of dunFiles) {
    results.dun.total++;
    const item = { name: filename, success: false };
    try {
      const data = mpq.read(filename);
      if (!data) { item.error = 'Read failed'; }
      else {
        const decoded = decodeDUN(data);
        if (decoded) {
          item.success = true;
          item.details = `${decoded.width}x${decoded.height} tiles`;
          results.dun.success++;
          console.log(`  [OK] ${filename}`);
        } else { item.error = 'Decode failed'; }
      }
    } catch (e) { item.error = e.message; }
    if (!item.success) console.log(`  [FAIL] ${filename}: ${item.error}`);
    results.dun.items.push(item);
  }

  // Generate report
  generateGallery(results);
  fs.writeFileSync(path.join(RESULTS_DIR, 'report.json'), JSON.stringify(results, null, 2));

  console.log('\n========================================');
  console.log('  Results Summary');
  console.log('========================================');
  console.log(`CEL: ${results.cel.success}/${results.cel.total} successful`);
  console.log(`CL2: ${results.cl2.success}/${results.cl2.total} successful`);
  console.log(`PAL: ${results.pal.success}/${results.pal.total} successful`);
  console.log(`DUN: ${results.dun.success}/${results.dun.total} successful`);
  console.log(`\nResults saved to: ${RESULTS_DIR}/index.html`);
  console.log('========================================\n');

  const totalSuccess = results.cel.success + results.cl2.success + results.pal.success + results.dun.success;
  const totalTests = results.cel.total + results.cl2.total + results.pal.total + results.dun.total;

  return totalSuccess === totalTests;
}

runTests()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error('Test failed:', err);
    process.exit(1);
  });
