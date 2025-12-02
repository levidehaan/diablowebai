/**
 * Asset Generation Pipeline
 *
 * Handles runtime conversion of AI-generated assets to game formats.
 * Converts modern image formats to Diablo's CL2/CEL palette format.
 */

import NeuralConfig from './config';
import neuralInterop from './NeuralInterop';

const { assets: config } = NeuralConfig;

/**
 * Diablo color palette (256 colors)
 * This is a simplified representation - full palette would be loaded from game files
 */
const DIABLO_PALETTE = generateApproximatePalette();

function generateApproximatePalette() {
  const palette = [];

  // Generate a dark fantasy color palette
  // First 16 colors: grays
  for (let i = 0; i < 16; i++) {
    const v = Math.floor((i / 15) * 255);
    palette.push({ r: v, g: v, b: v });
  }

  // Next: reds (blood, fire)
  for (let i = 0; i < 24; i++) {
    const intensity = i / 23;
    palette.push({
      r: Math.floor(100 + intensity * 155),
      g: Math.floor(intensity * 50),
      b: Math.floor(intensity * 30),
    });
  }

  // Browns (wood, leather, earth)
  for (let i = 0; i < 24; i++) {
    const intensity = i / 23;
    palette.push({
      r: Math.floor(60 + intensity * 100),
      g: Math.floor(40 + intensity * 60),
      b: Math.floor(20 + intensity * 30),
    });
  }

  // Greens (poison, nature)
  for (let i = 0; i < 24; i++) {
    const intensity = i / 23;
    palette.push({
      r: Math.floor(intensity * 80),
      g: Math.floor(50 + intensity * 150),
      b: Math.floor(intensity * 50),
    });
  }

  // Blues (magic, cold)
  for (let i = 0; i < 24; i++) {
    const intensity = i / 23;
    palette.push({
      r: Math.floor(intensity * 80),
      g: Math.floor(intensity * 100),
      b: Math.floor(100 + intensity * 155),
    });
  }

  // Yellows/Golds (holy, treasure)
  for (let i = 0; i < 24; i++) {
    const intensity = i / 23;
    palette.push({
      r: Math.floor(150 + intensity * 105),
      g: Math.floor(120 + intensity * 100),
      b: Math.floor(intensity * 50),
    });
  }

  // Purples (magic, demonic)
  for (let i = 0; i < 24; i++) {
    const intensity = i / 23;
    palette.push({
      r: Math.floor(80 + intensity * 100),
      g: Math.floor(intensity * 50),
      b: Math.floor(100 + intensity * 100),
    });
  }

  // Flesh tones
  for (let i = 0; i < 16; i++) {
    const intensity = i / 15;
    palette.push({
      r: Math.floor(180 + intensity * 60),
      g: Math.floor(130 + intensity * 50),
      b: Math.floor(100 + intensity * 40),
    });
  }

  // Fill remaining with mixed colors
  while (palette.length < 256) {
    const remaining = 256 - palette.length;
    const index = palette.length;
    palette.push({
      r: (index * 7) % 256,
      g: (index * 13) % 256,
      b: (index * 19) % 256,
    });
  }

  return palette;
}

/**
 * Color distance calculation (CIE76)
 */
function colorDistance(r1, g1, b1, r2, g2, b2) {
  // Simple Euclidean distance in RGB space
  return Math.sqrt(
    Math.pow(r2 - r1, 2) +
    Math.pow(g2 - g1, 2) +
    Math.pow(b2 - b1, 2)
  );
}

/**
 * Find nearest palette color
 */
function findNearestPaletteColor(r, g, b) {
  let bestIndex = 0;
  let bestDistance = Infinity;

  for (let i = 0; i < DIABLO_PALETTE.length; i++) {
    const c = DIABLO_PALETTE[i];
    const dist = colorDistance(r, g, b, c.r, c.g, c.b);

    if (dist < bestDistance) {
      bestDistance = dist;
      bestIndex = i;
    }
  }

  return bestIndex;
}

/**
 * Quantize an RGBA image to palette indices
 */
function quantizeToPalette(imageData) {
  const indices = new Uint8Array(imageData.width * imageData.height);
  const data = imageData.data;

  for (let i = 0; i < indices.length; i++) {
    const pixelOffset = i * 4;
    const r = data[pixelOffset];
    const g = data[pixelOffset + 1];
    const b = data[pixelOffset + 2];
    const a = data[pixelOffset + 3];

    // Transparent pixels get index 0
    if (a < 128) {
      indices[i] = 0;
    } else {
      indices[i] = findNearestPaletteColor(r, g, b);
    }
  }

  return indices;
}

/**
 * Run-length encode a row of pixels (CEL/CL2 format)
 */
function rleEncodeRow(indices, width) {
  const encoded = [];
  let i = 0;

  while (i < width) {
    // Check for transparent run
    if (indices[i] === 0) {
      let runLength = 0;
      while (i < width && indices[i] === 0 && runLength < 127) {
        runLength++;
        i++;
      }
      // Negative values indicate transparent pixels
      encoded.push(-runLength);
    } else {
      // Collect opaque pixels
      const start = i;
      let runLength = 0;
      while (i < width && indices[i] !== 0 && runLength < 127) {
        runLength++;
        i++;
      }

      // Positive value followed by pixel data
      encoded.push(runLength);
      for (let j = start; j < start + runLength; j++) {
        encoded.push(indices[j]);
      }
    }
  }

  return encoded;
}

/**
 * Encode an image in CL2 format
 */
function encodeCL2(imageData, frameWidth, frameHeight) {
  const indices = quantizeToPalette(imageData);
  const frames = [];

  const framesWide = Math.floor(imageData.width / frameWidth);
  const framesTall = Math.floor(imageData.height / frameHeight);

  for (let fy = 0; fy < framesTall; fy++) {
    for (let fx = 0; fx < framesWide; fx++) {
      const frameData = [];

      for (let row = 0; row < frameHeight; row++) {
        const rowIndices = [];
        for (let col = 0; col < frameWidth; col++) {
          const sourceX = fx * frameWidth + col;
          const sourceY = fy * frameHeight + row;
          const sourceIndex = sourceY * imageData.width + sourceX;
          rowIndices.push(indices[sourceIndex]);
        }

        const encodedRow = rleEncodeRow(rowIndices, frameWidth);
        frameData.push(...encodedRow);
      }

      frames.push(new Uint8Array(frameData));
    }
  }

  return frames;
}

/**
 * Asset cache
 */
class AssetCache {
  constructor(maxSize = 50) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Move to end (LRU)
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.data;
  }

  set(key, data) {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
    });
  }

  clear() {
    this.cache.clear();
  }
}

/**
 * Mock asset generator
 */
class MockAssetGenerator {
  static generateSprite(description, width, height) {
    // Create a simple placeholder sprite
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Fill with dark background
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, height);

    // Draw a simple monster silhouette
    ctx.fillStyle = '#660000';
    ctx.beginPath();
    ctx.arc(width / 2, height / 2, Math.min(width, height) / 3, 0, Math.PI * 2);
    ctx.fill();

    // Add some details
    ctx.fillStyle = '#ff0000';
    ctx.beginPath();
    ctx.arc(width / 2 - 5, height / 2 - 5, 3, 0, Math.PI * 2);
    ctx.arc(width / 2 + 5, height / 2 - 5, 3, 0, Math.PI * 2);
    ctx.fill();

    return ctx.getImageData(0, 0, width, height);
  }
}

/**
 * Main Asset Pipeline
 */
class AssetPipeline {
  constructor() {
    this.cache = new AssetCache();
    this.generating = new Set();
  }

  /**
   * Initialize the pipeline
   */
  initialize() {
    if (!config.enabled) {
      console.log('[AssetPipeline] Disabled - using original assets');
      return;
    }

    console.log('[AssetPipeline] Initialized');
  }

  /**
   * Generate a monster sprite
   */
  async generateMonsterSprite(description, options = {}) {
    const {
      width = 128,
      height = 128,
      frameWidth = 32,
      frameHeight = 32,
      animations = ['stand', 'walk', 'attack', 'death'],
    } = options;

    const cacheKey = `monster_${description}_${width}x${height}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Prevent duplicate generation
    if (this.generating.has(cacheKey)) {
      return null;
    }

    this.generating.add(cacheKey);

    try {
      let imageData;

      if (NeuralConfig.debug.mockAPIResponses || !config.imageGen.endpoint) {
        imageData = MockAssetGenerator.generateSprite(description, width, height);
      } else {
        imageData = await this.callImageGenAPI(description, width, height);
      }

      // Convert to CL2 format
      const frames = encodeCL2(imageData, frameWidth, frameHeight);

      const asset = {
        description,
        width,
        height,
        frameWidth,
        frameHeight,
        animations,
        frames,
        format: 'CL2',
      };

      this.cache.set(cacheKey, asset);
      neuralInterop.emit('assetGenerated', asset);

      return asset;
    } catch (error) {
      console.error('[AssetPipeline] Generation failed:', error);
      return null;
    } finally {
      this.generating.delete(cacheKey);
    }
  }

  /**
   * Generate an item sprite
   */
  async generateItemSprite(description, options = {}) {
    const {
      width = 28,
      height = 28,
    } = options;

    const cacheKey = `item_${description}_${width}x${height}`;

    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      let imageData;

      if (NeuralConfig.debug.mockAPIResponses || !config.imageGen.endpoint) {
        imageData = MockAssetGenerator.generateSprite(description, width, height);
      } else {
        imageData = await this.callImageGenAPI(
          `${description}, item icon, inventory sprite, ${config.imageGen.style}`,
          width,
          height
        );
      }

      // For items, we just need the palette indices
      const indices = quantizeToPalette(imageData);

      const asset = {
        description,
        width,
        height,
        indices,
        format: 'CEL',
      };

      this.cache.set(cacheKey, asset);
      return asset;
    } catch (error) {
      console.error('[AssetPipeline] Item generation failed:', error);
      return null;
    }
  }

  /**
   * Call image generation API
   */
  async callImageGenAPI(prompt, width, height) {
    const fullPrompt = `${prompt}, ${config.imageGen.style}, ${width}x${height} pixels`;

    const response = await fetch(config.imageGen.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NeuralConfig.provider.apiKey}`,
      },
      body: JSON.stringify({
        prompt: fullPrompt,
        n: 1,
        size: `${width}x${height}`,
        response_format: 'b64_json',
      }),
    });

    if (!response.ok) {
      throw new Error(`Image API error: ${response.status}`);
    }

    const data = await response.json();
    const base64 = data.data[0].b64_json;

    // Decode base64 to image data
    return this.decodeBase64Image(base64, width, height);
  }

  /**
   * Decode base64 image to ImageData
   */
  decodeBase64Image(base64, width, height) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(ctx.getImageData(0, 0, width, height));
      };
      img.onerror = reject;
      img.src = `data:image/png;base64,${base64}`;
    });
  }

  /**
   * Inject a generated asset into the game
   */
  injectAsset(assetId, asset) {
    if (!neuralInterop.initialized) {
      console.warn('[AssetPipeline] Cannot inject - interop not initialized');
      return false;
    }

    // This would write the asset data to WASM memory
    // and update the game's asset table
    neuralInterop.emit('assetInjected', { assetId, asset });

    return true;
  }

  /**
   * Get the palette
   */
  getPalette() {
    return DIABLO_PALETTE;
  }

  /**
   * Clear the asset cache
   */
  clearCache() {
    this.cache.clear();
  }
}

// Singleton instance
const assetPipeline = new AssetPipeline();

export {
  AssetPipeline,
  AssetCache,
  MockAssetGenerator,
  DIABLO_PALETTE,
  quantizeToPalette,
  encodeCL2,
  findNearestPaletteColor,
};

export default assetPipeline;
