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
  indicesToRGBA,
  createCL2,
  DEFAULT_PALETTE,
};

export default CELEncoder;
