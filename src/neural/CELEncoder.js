/**
 * CEL Encoder
 *
 * Encodes pixel data into Diablo CEL/CL2 sprite format.
 * Supports RLE compression as used in the original game.
 *
 * CEL Format Overview:
 * - Header with frame count and offsets
 * - Each frame has rows encoded with RLE
 * - Palette indices (0-255) with 0 often transparent
 *
 * RLE Encoding:
 * - 0x00-0x7E: N opaque pixels follow
 * - 0x81-0xFF: (256 - N) transparent pixels
 * - 0x7F: 127 opaque pixels, line continues
 * - 0x80: 128 transparent pixels, line continues
 */

// Default Diablo palette (first 16 colors shown, full palette loaded from PAL file)
const DEFAULT_PALETTE = [
  [0, 0, 0],       // 0: Transparent/Black
  [8, 8, 8],       // 1: Near black
  [16, 16, 16],    // 2: Dark gray
  [24, 24, 24],    // 3
  [32, 32, 32],    // 4
  [40, 40, 40],    // 5
  [48, 48, 48],    // 6
  [56, 56, 56],    // 7
  [64, 64, 64],    // 8
  [72, 72, 72],    // 9
  [80, 80, 80],    // 10
  [88, 88, 88],    // 11
  [96, 96, 96],    // 12
  [104, 104, 104], // 13
  [112, 112, 112], // 14
  [120, 120, 120], // 15: Light gray
  // ... Full 256-color palette would be loaded from game files
];

/**
 * Parse a Diablo PAL file (256 RGB triplets)
 * @param {Uint8Array} buffer - PAL file data (768 bytes)
 * @returns {Array<[number, number, number]>} Palette array
 */
export function parsePalette(buffer) {
  const palette = [];
  const data = new Uint8Array(buffer);

  for (let i = 0; i < 256; i++) {
    palette.push([
      data[i * 3],
      data[i * 3 + 1],
      data[i * 3 + 2],
    ]);
  }

  return palette;
}

/**
 * Find closest palette color using Euclidean distance
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @param {number} a - Alpha (0-255)
 * @param {Array} palette - Color palette
 * @param {number} transparentIndex - Index to use for transparent pixels
 * @returns {number} Palette index
 */
function findClosestColor(r, g, b, a, palette, transparentIndex = 0) {
  // Transparent pixel
  if (a < 128) {
    return transparentIndex;
  }

  let bestIndex = 1; // Skip index 0 (transparent)
  let bestDistance = Infinity;

  for (let i = 1; i < palette.length; i++) {
    const [pr, pg, pb] = palette[i];
    const dr = r - pr;
    const dg = g - pg;
    const db = b - pb;
    const distance = dr * dr + dg * dg + db * db;

    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;

      // Early exit on exact match
      if (distance === 0) break;
    }
  }

  return bestIndex;
}

/**
 * Convert RGBA image data to palette indices
 * @param {Uint8Array|Uint8ClampedArray} imageData - RGBA pixel data
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {Array} palette - Color palette
 * @param {Object} options - Conversion options
 * @returns {Uint8Array} Palette indices (width * height)
 */
export function rgbaToIndices(imageData, width, height, palette, options = {}) {
  const { transparentIndex = 0, ditherEnabled = false } = options;
  const indices = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = (y * width + x) * 4;
      const dstIdx = y * width + x;

      const r = imageData[srcIdx];
      const g = imageData[srcIdx + 1];
      const b = imageData[srcIdx + 2];
      const a = imageData[srcIdx + 3];

      indices[dstIdx] = findClosestColor(r, g, b, a, palette, transparentIndex);
    }
  }

  return indices;
}

/**
 * Encode a single row using RLE
 * @param {Uint8Array} row - Row of palette indices
 * @param {number} transparentIndex - Transparent color index
 * @returns {Uint8Array} RLE encoded row
 */
function encodeRow(row, transparentIndex = 0) {
  const output = [];
  let i = 0;

  while (i < row.length) {
    // Count transparent pixels
    let transparentCount = 0;
    while (i + transparentCount < row.length &&
           row[i + transparentCount] === transparentIndex &&
           transparentCount < 127) {
      transparentCount++;
    }

    if (transparentCount > 0) {
      // Encode transparent run
      // 0x81-0xFF = (256 - N) transparent pixels
      output.push(256 - transparentCount);
      i += transparentCount;
      continue;
    }

    // Count opaque pixels
    let opaqueCount = 0;
    const opaqueStart = i;
    while (i + opaqueCount < row.length &&
           row[i + opaqueCount] !== transparentIndex &&
           opaqueCount < 127) {
      opaqueCount++;
    }

    if (opaqueCount > 0) {
      // Encode opaque run
      // 0x00-0x7E = N opaque pixels follow
      output.push(opaqueCount);
      for (let j = 0; j < opaqueCount; j++) {
        output.push(row[opaqueStart + j]);
      }
      i += opaqueCount;
    }
  }

  return new Uint8Array(output);
}

/**
 * Encode a single frame
 * @param {Uint8Array} indices - Palette indices (width * height)
 * @param {number} width - Frame width
 * @param {number} height - Frame height
 * @param {Object} options - Encoding options
 * @returns {Uint8Array} Encoded frame data
 */
function encodeFrame(indices, width, height, options = {}) {
  const { transparentIndex = 0, bottomUp = true } = options;
  const encodedRows = [];

  // Diablo CEL frames are stored bottom-up
  for (let y = 0; y < height; y++) {
    const rowY = bottomUp ? (height - 1 - y) : y;
    const rowStart = rowY * width;
    const row = indices.slice(rowStart, rowStart + width);
    encodedRows.push(encodeRow(row, transparentIndex));
  }

  // Calculate total size
  let totalSize = 0;
  for (const row of encodedRows) {
    totalSize += row.length;
  }

  // Combine rows
  const frameData = new Uint8Array(totalSize);
  let offset = 0;
  for (const row of encodedRows) {
    frameData.set(row, offset);
    offset += row.length;
  }

  return frameData;
}

/**
 * Create a CEL file from multiple frames
 * @param {Array<Object>} frames - Array of {indices, width, height}
 * @param {Object} options - CEL options
 * @returns {Uint8Array} CEL file data
 */
export function createCEL(frames, options = {}) {
  const { transparentIndex = 0 } = options;

  if (frames.length === 0) {
    throw new Error('CEL must have at least one frame');
  }

  // Encode all frames
  const encodedFrames = frames.map(frame =>
    encodeFrame(frame.indices, frame.width, frame.height, {
      transparentIndex,
      bottomUp: true,
    })
  );

  // Calculate header size (4 bytes for count + 4 bytes per frame offset + 4 for end offset)
  const headerSize = 4 + (frames.length + 1) * 4;

  // Calculate total file size
  let totalDataSize = 0;
  for (const frame of encodedFrames) {
    totalDataSize += frame.length;
  }
  const fileSize = headerSize + totalDataSize;

  // Create output buffer
  const output = new Uint8Array(fileSize);
  const view = new DataView(output.buffer);

  // Write frame count
  view.setUint32(0, frames.length, true);

  // Write frame offsets
  let dataOffset = headerSize;
  for (let i = 0; i < frames.length; i++) {
    view.setUint32(4 + i * 4, dataOffset, true);
    dataOffset += encodedFrames[i].length;
  }
  // Write end offset
  view.setUint32(4 + frames.length * 4, dataOffset, true);

  // Write frame data
  dataOffset = headerSize;
  for (const frame of encodedFrames) {
    output.set(frame, dataOffset);
    dataOffset += frame.length;
  }

  return output;
}

/**
 * Create a CEL from a single image (ImageData or canvas)
 * @param {ImageData|HTMLCanvasElement} source - Image source
 * @param {Array} palette - Color palette
 * @param {Object} options - Options
 * @returns {Uint8Array} CEL file data
 */
export function imageDataToCEL(source, palette, options = {}) {
  let imageData;
  let width, height;

  if (source instanceof ImageData) {
    imageData = source.data;
    width = source.width;
    height = source.height;
  } else if (source.getContext) {
    // Canvas element
    const ctx = source.getContext('2d');
    const data = ctx.getImageData(0, 0, source.width, source.height);
    imageData = data.data;
    width = source.width;
    height = source.height;
  } else {
    throw new Error('Source must be ImageData or canvas');
  }

  // Convert to palette indices
  const indices = rgbaToIndices(imageData, width, height, palette, options);

  // Create CEL with single frame
  return createCEL([{ indices, width, height }], options);
}

/**
 * Create a sprite sheet CEL (multiple frames from single image)
 * @param {ImageData|HTMLCanvasElement} source - Sprite sheet image
 * @param {number} frameWidth - Width of each frame
 * @param {number} frameHeight - Height of each frame
 * @param {Array} palette - Color palette
 * @param {Object} options - Options
 * @returns {Uint8Array} CEL file data
 */
export function spriteSheetToCEL(source, frameWidth, frameHeight, palette, options = {}) {
  let imageData, width, height;

  if (source instanceof ImageData) {
    imageData = source.data;
    width = source.width;
    height = source.height;
  } else if (source.getContext) {
    const ctx = source.getContext('2d');
    const data = ctx.getImageData(0, 0, source.width, source.height);
    imageData = data.data;
    width = source.width;
    height = source.height;
  } else {
    throw new Error('Source must be ImageData or canvas');
  }

  const framesX = Math.floor(width / frameWidth);
  const framesY = Math.floor(height / frameHeight);
  const frames = [];

  for (let fy = 0; fy < framesY; fy++) {
    for (let fx = 0; fx < framesX; fx++) {
      // Extract frame
      const frameData = new Uint8Array(frameWidth * frameHeight * 4);

      for (let y = 0; y < frameHeight; y++) {
        for (let x = 0; x < frameWidth; x++) {
          const srcX = fx * frameWidth + x;
          const srcY = fy * frameHeight + y;
          const srcIdx = (srcY * width + srcX) * 4;
          const dstIdx = (y * frameWidth + x) * 4;

          frameData[dstIdx] = imageData[srcIdx];
          frameData[dstIdx + 1] = imageData[srcIdx + 1];
          frameData[dstIdx + 2] = imageData[srcIdx + 2];
          frameData[dstIdx + 3] = imageData[srcIdx + 3];
        }
      }

      // Convert to indices
      const indices = rgbaToIndices(frameData, frameWidth, frameHeight, palette, options);
      frames.push({ indices, width: frameWidth, height: frameHeight });
    }
  }

  return createCEL(frames, options);
}

/**
 * Generate a solid color sprite for testing
 * @param {number} width - Sprite width
 * @param {number} height - Sprite height
 * @param {number} colorIndex - Palette color index
 * @returns {Uint8Array} CEL file data
 */
export function createSolidColorCEL(width, height, colorIndex) {
  const indices = new Uint8Array(width * height);
  indices.fill(colorIndex);

  return createCEL([{ indices, width, height }]);
}

/**
 * Create a simple test pattern sprite
 * @param {number} width - Sprite width
 * @param {number} height - Sprite height
 * @returns {Uint8Array} CEL file data
 */
export function createTestPatternCEL(width, height) {
  const indices = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      // Create a gradient pattern
      indices[idx] = ((x + y) % 16) + 1;
    }
  }

  return createCEL([{ indices, width, height }]);
}

/**
 * Decode a CEL file to palette indices
 * @param {Uint8Array} celData - CEL file data
 * @param {number} frameIndex - Frame to decode (default 0)
 * @returns {Object} { indices, width, height }
 */
export function decodeCEL(celData, frameIndex = 0) {
  const view = new DataView(celData.buffer, celData.byteOffset, celData.byteLength);

  // Read frame count
  const frameCount = view.getUint32(0, true);

  if (frameIndex >= frameCount) {
    throw new Error(`Frame ${frameIndex} out of range (${frameCount} frames)`);
  }

  // Read frame offsets
  const frameStart = view.getUint32(4 + frameIndex * 4, true);
  const frameEnd = view.getUint32(4 + (frameIndex + 1) * 4, true);
  const frameSize = frameEnd - frameStart;

  // Decode RLE - this is a simplified decoder
  // Real CEL files have more complex structure
  const frameData = celData.slice(frameStart, frameEnd);
  const decoded = [];

  let i = 0;
  while (i < frameData.length) {
    const cmd = frameData[i++];

    if (cmd >= 0x81) {
      // Transparent run
      const count = 256 - cmd;
      for (let j = 0; j < count; j++) {
        decoded.push(0); // Transparent
      }
    } else if (cmd > 0 && cmd <= 0x7E) {
      // Opaque run
      for (let j = 0; j < cmd && i < frameData.length; j++) {
        decoded.push(frameData[i++]);
      }
    }
  }

  // Estimate dimensions (square assumption for simple cases)
  const totalPixels = decoded.length;
  const side = Math.sqrt(totalPixels);
  const width = Math.ceil(side);
  const height = Math.ceil(totalPixels / width);

  return {
    indices: new Uint8Array(decoded),
    width,
    height,
    estimatedDimensions: true,
  };
}

/**
 * Convert palette indices back to RGBA
 * @param {Uint8Array} indices - Palette indices
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @param {Array} palette - Color palette
 * @returns {Uint8Array} RGBA data
 */
export function indicesToRGBA(indices, width, height, palette) {
  const rgba = new Uint8Array(width * height * 4);

  for (let i = 0; i < indices.length; i++) {
    const colorIdx = indices[i];
    const [r, g, b] = palette[colorIdx] || [0, 0, 0];

    rgba[i * 4] = r;
    rgba[i * 4 + 1] = g;
    rgba[i * 4 + 2] = b;
    rgba[i * 4 + 3] = colorIdx === 0 ? 0 : 255; // Index 0 = transparent
  }

  return rgba;
}

// CL2 format support (animated sprites with directional frames)

/**
 * Create a CL2 file (animated sprite with directions)
 * @param {Array<Array<Object>>} directions - Array of 8 directions, each containing frames
 * @param {Object} options - CL2 options
 * @returns {Uint8Array} CL2 file data
 */
export function createCL2(directions, options = {}) {
  if (directions.length !== 8) {
    throw new Error('CL2 requires exactly 8 directions');
  }

  // CL2 has a header with offsets to each direction's frames
  // Each direction has its own frame table

  const encodedDirections = directions.map(frames =>
    frames.map(frame =>
      encodeFrame(frame.indices, frame.width, frame.height, {
        transparentIndex: options.transparentIndex || 0,
        bottomUp: true,
      })
    )
  );

  // Calculate sizes
  const dirHeaderSize = 8 * 4; // 8 direction offsets
  let totalSize = dirHeaderSize;

  const directionOffsets = [];
  const directionData = [];

  for (let d = 0; d < 8; d++) {
    const frames = encodedDirections[d];
    const frameHeaderSize = 4 + (frames.length + 1) * 4;

    directionOffsets.push(totalSize);

    let dirDataSize = frameHeaderSize;
    for (const frame of frames) {
      dirDataSize += frame.length;
    }

    // Build direction data
    const dirData = new Uint8Array(dirDataSize);
    const dirView = new DataView(dirData.buffer);

    // Frame count
    dirView.setUint32(0, frames.length, true);

    // Frame offsets within direction
    let frameOffset = frameHeaderSize;
    for (let f = 0; f < frames.length; f++) {
      dirView.setUint32(4 + f * 4, frameOffset, true);
      frameOffset += frames[f].length;
    }
    dirView.setUint32(4 + frames.length * 4, frameOffset, true);

    // Frame data
    frameOffset = frameHeaderSize;
    for (const frame of frames) {
      dirData.set(frame, frameOffset);
      frameOffset += frame.length;
    }

    directionData.push(dirData);
    totalSize += dirDataSize;
  }

  // Build final file
  const output = new Uint8Array(totalSize);
  const view = new DataView(output.buffer);

  // Write direction offsets
  for (let d = 0; d < 8; d++) {
    view.setUint32(d * 4, directionOffsets[d], true);
  }

  // Write direction data
  for (let d = 0; d < 8; d++) {
    output.set(directionData[d], directionOffsets[d]);
  }

  return output;
}

/**
 * Full Diablo 1 color palette (256 colors)
 * Based on the game's default palette for dungeon sprites
 */
export const DIABLO_FULL_PALETTE = generateDiabloPalette();

function generateDiabloPalette() {
  const palette = [];

  // Index 0: Transparent (black in palette)
  palette.push([0, 0, 0]);

  // Grays (1-31) - dungeon stone and shadows
  for (let i = 1; i <= 31; i++) {
    const v = Math.floor((i / 31) * 200);
    palette.push([v, v, v]);
  }

  // Dark reds/browns (32-63) - blood, leather
  for (let i = 0; i < 32; i++) {
    const t = i / 31;
    palette.push([
      Math.floor(40 + t * 140),
      Math.floor(10 + t * 50),
      Math.floor(5 + t * 30)
    ]);
  }

  // Oranges/flames (64-95) - fire, torches
  for (let i = 0; i < 32; i++) {
    const t = i / 31;
    palette.push([
      Math.floor(150 + t * 105),
      Math.floor(50 + t * 150),
      Math.floor(t * 80)
    ]);
  }

  // Yellows/golds (96-127) - treasure, holy
  for (let i = 0; i < 32; i++) {
    const t = i / 31;
    palette.push([
      Math.floor(150 + t * 105),
      Math.floor(120 + t * 135),
      Math.floor(20 + t * 60)
    ]);
  }

  // Greens (128-159) - poison, nature
  for (let i = 0; i < 32; i++) {
    const t = i / 31;
    palette.push([
      Math.floor(t * 100),
      Math.floor(50 + t * 180),
      Math.floor(t * 80)
    ]);
  }

  // Blues/cyans (160-191) - magic, cold, water
  for (let i = 0; i < 32; i++) {
    const t = i / 31;
    palette.push([
      Math.floor(t * 100),
      Math.floor(50 + t * 150),
      Math.floor(120 + t * 135)
    ]);
  }

  // Purples/magentas (192-223) - arcane, demonic
  for (let i = 0; i < 32; i++) {
    const t = i / 31;
    palette.push([
      Math.floor(80 + t * 140),
      Math.floor(t * 80),
      Math.floor(100 + t * 130)
    ]);
  }

  // Flesh/skin tones (224-255) - characters
  for (let i = 0; i < 32; i++) {
    const t = i / 31;
    palette.push([
      Math.floor(140 + t * 100),
      Math.floor(90 + t * 80),
      Math.floor(60 + t * 60)
    ]);
  }

  return palette;
}

/**
 * Common sprite dimensions in Diablo 1
 * Used for heuristic dimension detection
 */
const COMMON_SPRITE_SIZES = [
  { w: 28, h: 28 },   // Small items
  { w: 32, h: 32 },   // Items, UI elements
  { w: 56, h: 56 },   // Medium sprites
  { w: 64, h: 64 },   // Common monsters
  { w: 96, h: 96 },   // Large sprites
  { w: 128, h: 128 }, // Very large
  { w: 160, h: 160 }, // Boss sprites
  { w: 96, h: 128 },  // Tall sprites
  { w: 128, h: 96 },  // Wide sprites
  { w: 48, h: 48 },   // Medium items
  { w: 80, h: 80 },   // Medium monsters
  { w: 36, h: 36 },   // Small monsters
  { w: 40, h: 40 },   // Small items
];

/**
 * Detect likely sprite dimensions from pixel count
 * @param {number} pixelCount - Total decoded pixels
 * @returns {{width: number, height: number}} Estimated dimensions
 */
function detectSpriteDimensions(pixelCount) {
  // Check common sizes first
  for (const size of COMMON_SPRITE_SIZES) {
    if (size.w * size.h === pixelCount) {
      return { width: size.w, height: size.h };
    }
  }

  // Try to find integer factors close to square
  const sqrt = Math.sqrt(pixelCount);
  const nearestSqrt = Math.round(sqrt);

  if (nearestSqrt * nearestSqrt === pixelCount) {
    return { width: nearestSqrt, height: nearestSqrt };
  }

  // Find factors
  for (let w = Math.ceil(sqrt); w <= pixelCount; w++) {
    if (pixelCount % w === 0) {
      const h = pixelCount / w;
      // Prefer roughly square aspect ratios
      if (w <= h * 2 && h <= w * 2) {
        return { width: w, height: h };
      }
    }
  }

  // Fallback: just make it work
  return { width: Math.ceil(sqrt), height: Math.ceil(pixelCount / Math.ceil(sqrt)) };
}

/**
 * Decode a single CEL frame from RLE data
 * @param {Uint8Array} frameData - RLE encoded frame data
 * @param {number} expectedWidth - Expected width (0 for auto-detect)
 * @returns {{indices: Uint8Array, width: number, height: number, rows: number[][]}}
 */
function decodeRLEFrame(frameData, expectedWidth = 0) {
  const rows = [];
  let currentRow = [];
  let i = 0;

  while (i < frameData.length) {
    const cmd = frameData[i++];

    if (cmd === 0) {
      // End of row marker (some CEL variants)
      if (currentRow.length > 0) {
        rows.push(currentRow);
        currentRow = [];
      }
      continue;
    }

    if (cmd >= 0x81) {
      // Transparent pixels: (256 - cmd) transparent pixels
      const count = 256 - cmd;
      for (let j = 0; j < count; j++) {
        currentRow.push(0);
      }
    } else if (cmd === 0x80) {
      // 128 transparent pixels (line continues)
      for (let j = 0; j < 128; j++) {
        currentRow.push(0);
      }
    } else if (cmd === 0x7F) {
      // 127 opaque pixels (line continues)
      for (let j = 0; j < 127 && i < frameData.length; j++) {
        currentRow.push(frameData[i++]);
      }
    } else if (cmd > 0 && cmd <= 0x7E) {
      // Opaque pixels: cmd pixels follow
      for (let j = 0; j < cmd && i < frameData.length; j++) {
        currentRow.push(frameData[i++]);
      }
    }
  }

  // Add last row if not empty
  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  // Determine width
  let width = expectedWidth;
  if (width === 0) {
    // Find max row length
    width = Math.max(...rows.map(r => r.length), 1);
  }

  // Normalize rows to same width and create flat indices array
  const height = rows.length;
  const indices = new Uint8Array(width * height);

  // CEL frames are bottom-up, so reverse the rows
  for (let y = 0; y < height; y++) {
    const srcRow = rows[height - 1 - y] || [];
    for (let x = 0; x < width; x++) {
      indices[y * width + x] = srcRow[x] || 0;
    }
  }

  return { indices, width, height, rows };
}

/**
 * Enhanced CEL decoder with proper frame parsing
 * @param {Uint8Array} celData - CEL file data
 * @param {Object} options - Decoding options
 * @returns {Object} Decoded CEL with all frames
 */
export function decodeCELFull(celData, options = {}) {
  const { frameWidth = 0, palette = DIABLO_FULL_PALETTE } = options;
  const view = new DataView(celData.buffer, celData.byteOffset, celData.byteLength);

  // Read frame count
  const frameCount = view.getUint32(0, true);

  // Validate frame count
  if (frameCount === 0 || frameCount > 10000) {
    throw new Error(`Invalid CEL frame count: ${frameCount}`);
  }

  // Read frame offsets
  const frameOffsets = [];
  for (let i = 0; i <= frameCount; i++) {
    frameOffsets.push(view.getUint32(4 + i * 4, true));
  }

  // Decode each frame
  const frames = [];
  let detectedWidth = frameWidth;

  for (let i = 0; i < frameCount; i++) {
    const frameStart = frameOffsets[i];
    const frameEnd = frameOffsets[i + 1];
    const frameSize = frameEnd - frameStart;

    if (frameStart >= celData.length || frameEnd > celData.length) {
      console.warn(`Frame ${i} out of bounds`);
      continue;
    }

    const frameData = celData.slice(frameStart, frameEnd);
    const decoded = decodeRLEFrame(frameData, detectedWidth);

    // Use first frame to set width for consistency
    if (i === 0 && detectedWidth === 0) {
      detectedWidth = decoded.width;
    }

    frames.push({
      index: i,
      ...decoded,
      dataOffset: frameStart,
      dataSize: frameSize,
    });
  }

  return {
    frameCount,
    frames,
    totalWidth: detectedWidth,
    palette,
  };
}

/**
 * Decode CL2 file (8 directions, each with multiple frames)
 * @param {Uint8Array} cl2Data - CL2 file data
 * @param {Object} options - Decoding options
 * @returns {Object} Decoded CL2 with all directions and frames
 */
export function decodeCL2(cl2Data, options = {}) {
  const { frameWidth = 0, palette = DIABLO_FULL_PALETTE } = options;
  const view = new DataView(cl2Data.buffer, cl2Data.byteOffset, cl2Data.byteLength);

  // CL2 header: 8 direction offsets
  const directionOffsets = [];
  for (let d = 0; d < 8; d++) {
    directionOffsets.push(view.getUint32(d * 4, true));
  }

  // Validate first offset
  if (directionOffsets[0] < 32 || directionOffsets[0] >= cl2Data.length) {
    // This might be a regular CEL file, not CL2
    console.warn('CL2 format detection failed, attempting CEL decode');
    return { type: 'cel', data: decodeCELFull(cl2Data, options) };
  }

  const directions = [];
  let detectedWidth = frameWidth;

  for (let d = 0; d < 8; d++) {
    const dirOffset = directionOffsets[d];
    const nextDirOffset = d < 7 ? directionOffsets[d + 1] : cl2Data.length;

    if (dirOffset >= cl2Data.length) {
      directions.push({ frames: [], frameCount: 0 });
      continue;
    }

    // Read direction's frame count and offsets
    const dirView = new DataView(cl2Data.buffer, cl2Data.byteOffset + dirOffset, nextDirOffset - dirOffset);
    const frameCount = dirView.getUint32(0, true);

    if (frameCount === 0 || frameCount > 1000) {
      directions.push({ frames: [], frameCount: 0 });
      continue;
    }

    const frameOffsets = [];
    for (let f = 0; f <= frameCount; f++) {
      frameOffsets.push(dirView.getUint32(4 + f * 4, true));
    }

    // Decode frames for this direction
    const frames = [];
    for (let f = 0; f < frameCount; f++) {
      const frameStart = dirOffset + frameOffsets[f];
      const frameEnd = dirOffset + frameOffsets[f + 1];

      if (frameStart >= cl2Data.length || frameEnd > cl2Data.length) {
        continue;
      }

      const frameData = cl2Data.slice(frameStart, frameEnd);
      const decoded = decodeRLEFrame(frameData, detectedWidth);

      if (f === 0 && d === 0 && detectedWidth === 0) {
        detectedWidth = decoded.width;
      }

      frames.push({
        index: f,
        ...decoded,
      });
    }

    directions.push({
      directionIndex: d,
      frameCount,
      frames,
    });
  }

  return {
    type: 'cl2',
    directionCount: 8,
    directions,
    totalWidth: detectedWidth,
    palette,
    directionNames: ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'],
  };
}

/**
 * Render a decoded frame to RGBA ImageData
 * @param {Object} frame - Decoded frame with indices
 * @param {Array} palette - Color palette
 * @param {number} scale - Render scale
 * @returns {ImageData} Rendered frame
 */
export function renderFrameToImageData(frame, palette = DIABLO_FULL_PALETTE, scale = 1) {
  const { indices, width, height } = frame;
  const outWidth = width * scale;
  const outHeight = height * scale;
  const rgba = new Uint8ClampedArray(outWidth * outHeight * 4);

  for (let y = 0; y < outHeight; y++) {
    for (let x = 0; x < outWidth; x++) {
      const srcX = Math.floor(x / scale);
      const srcY = Math.floor(y / scale);
      const srcIdx = srcY * width + srcX;
      const dstIdx = (y * outWidth + x) * 4;

      const colorIdx = indices[srcIdx] || 0;
      const [r, g, b] = palette[colorIdx] || [0, 0, 0];

      rgba[dstIdx] = r;
      rgba[dstIdx + 1] = g;
      rgba[dstIdx + 2] = b;
      rgba[dstIdx + 3] = colorIdx === 0 ? 0 : 255;
    }
  }

  return new ImageData(rgba, outWidth, outHeight);
}

/**
 * Render frame to canvas
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {Object} frame - Decoded frame
 * @param {Array} palette - Color palette
 * @param {number} x - X position
 * @param {number} y - Y position
 * @param {number} scale - Render scale
 */
export function renderFrameToCanvas(ctx, frame, palette = DIABLO_FULL_PALETTE, x = 0, y = 0, scale = 1) {
  const imageData = renderFrameToImageData(frame, palette, scale);
  ctx.putImageData(imageData, x, y);
}

/**
 * Decode a PCX image file
 * PCX is a legacy image format used in Diablo's UI artwork
 * @param {Uint8Array} pcxData - PCX file data
 * @returns {Object} Decoded image with width, height, and RGBA data
 */
export function decodePCX(pcxData) {
  const view = new DataView(pcxData.buffer, pcxData.byteOffset, pcxData.byteLength);

  // PCX Header (128 bytes)
  const manufacturer = pcxData[0]; // Should be 0x0A
  const version = pcxData[1];
  const encoding = pcxData[2]; // 1 = RLE
  const bitsPerPixel = pcxData[3];

  const xMin = view.getUint16(4, true);
  const yMin = view.getUint16(6, true);
  const xMax = view.getUint16(8, true);
  const yMax = view.getUint16(10, true);

  const width = xMax - xMin + 1;
  const height = yMax - yMin + 1;

  const hDpi = view.getUint16(12, true);
  const vDpi = view.getUint16(14, true);

  // EGA palette at offset 16 (48 bytes, 16 RGB triplets)
  const egaPalette = [];
  for (let i = 0; i < 16; i++) {
    egaPalette.push([
      pcxData[16 + i * 3],
      pcxData[16 + i * 3 + 1],
      pcxData[16 + i * 3 + 2],
    ]);
  }

  const reserved = pcxData[64];
  const numPlanes = pcxData[65];
  const bytesPerLine = view.getUint16(66, true);
  const paletteType = view.getUint16(68, true); // 1 = color, 2 = grayscale

  // Validate PCX header
  if (manufacturer !== 0x0A) {
    throw new Error(`Invalid PCX file: manufacturer byte is ${manufacturer}, expected 10`);
  }

  // Decode image data (starts at offset 128)
  const totalBytes = bytesPerLine * numPlanes;
  const scanlines = [];
  let offset = 128;

  for (let y = 0; y < height; y++) {
    const scanline = new Uint8Array(totalBytes);
    let x = 0;

    while (x < totalBytes && offset < pcxData.length) {
      const byte = pcxData[offset++];

      if ((byte & 0xC0) === 0xC0) {
        // RLE run
        const runLength = byte & 0x3F;
        const value = pcxData[offset++];
        for (let i = 0; i < runLength && x < totalBytes; i++) {
          scanline[x++] = value;
        }
      } else {
        // Literal byte
        scanline[x++] = byte;
      }
    }

    scanlines.push(scanline);
  }

  // Check for VGA palette (256 colors) at end of file
  let palette = egaPalette;
  let is256Color = false;

  if (bitsPerPixel === 8 && numPlanes === 1) {
    // Look for VGA palette marker (0x0C) 769 bytes from end
    const paletteOffset = pcxData.length - 769;
    if (paletteOffset > 0 && pcxData[paletteOffset] === 0x0C) {
      palette = [];
      for (let i = 0; i < 256; i++) {
        palette.push([
          pcxData[paletteOffset + 1 + i * 3],
          pcxData[paletteOffset + 1 + i * 3 + 1],
          pcxData[paletteOffset + 1 + i * 3 + 2],
        ]);
      }
      is256Color = true;
    }
  }

  // Convert to RGBA
  const rgba = new Uint8ClampedArray(width * height * 4);

  if (bitsPerPixel === 8 && numPlanes === 1) {
    // 8-bit indexed color
    for (let y = 0; y < height; y++) {
      const scanline = scanlines[y];
      for (let x = 0; x < width; x++) {
        const colorIndex = scanline[x];
        const [r, g, b] = palette[colorIndex] || [0, 0, 0];
        const idx = (y * width + x) * 4;
        rgba[idx] = r;
        rgba[idx + 1] = g;
        rgba[idx + 2] = b;
        rgba[idx + 3] = 255;
      }
    }
  } else if (bitsPerPixel === 8 && numPlanes === 3) {
    // 24-bit RGB (3 planes)
    for (let y = 0; y < height; y++) {
      const scanline = scanlines[y];
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        rgba[idx] = scanline[x]; // R plane
        rgba[idx + 1] = scanline[bytesPerLine + x]; // G plane
        rgba[idx + 2] = scanline[bytesPerLine * 2 + x]; // B plane
        rgba[idx + 3] = 255;
      }
    }
  } else if (bitsPerPixel === 1 && numPlanes === 4) {
    // 4-bit planar (16 colors)
    for (let y = 0; y < height; y++) {
      const scanline = scanlines[y];
      for (let x = 0; x < width; x++) {
        const byteIndex = Math.floor(x / 8);
        const bitIndex = 7 - (x % 8);

        let colorIndex = 0;
        for (let plane = 0; plane < 4; plane++) {
          const planeByte = scanline[plane * bytesPerLine + byteIndex];
          if (planeByte & (1 << bitIndex)) {
            colorIndex |= (1 << plane);
          }
        }

        const [r, g, b] = palette[colorIndex] || [0, 0, 0];
        const idx = (y * width + x) * 4;
        rgba[idx] = r;
        rgba[idx + 1] = g;
        rgba[idx + 2] = b;
        rgba[idx + 3] = 255;
      }
    }
  } else if (bitsPerPixel === 1 && numPlanes === 1) {
    // 1-bit monochrome
    for (let y = 0; y < height; y++) {
      const scanline = scanlines[y];
      for (let x = 0; x < width; x++) {
        const byteIndex = Math.floor(x / 8);
        const bitIndex = 7 - (x % 8);
        const pixel = (scanline[byteIndex] & (1 << bitIndex)) ? 255 : 0;

        const idx = (y * width + x) * 4;
        rgba[idx] = pixel;
        rgba[idx + 1] = pixel;
        rgba[idx + 2] = pixel;
        rgba[idx + 3] = 255;
      }
    }
  } else {
    throw new Error(`Unsupported PCX format: ${bitsPerPixel} bits/pixel, ${numPlanes} planes`);
  }

  return {
    width,
    height,
    rgba,
    bitsPerPixel,
    numPlanes,
    palette,
    is256Color,
    version,
    hDpi,
    vDpi,
  };
}

// Default export
const CELEncoder = {
  parsePalette,
  rgbaToIndices,
  createCEL,
  imageDataToCEL,
  spriteSheetToCEL,
  createSolidColorCEL,
  createTestPatternCEL,
  decodeCEL,
  decodeCELFull,
  decodeCL2,
  decodePCX,
  renderFrameToImageData,
  renderFrameToCanvas,
  indicesToRGBA,
  createCL2,
  DEFAULT_PALETTE,
  DIABLO_FULL_PALETTE,
};

export default CELEncoder;
