/**
 * Asset Generation Pipeline
 *
 * Handles runtime conversion of AI-generated assets to game formats.
 * Converts modern image formats to Diablo's CL2/CEL palette format.
 * Includes browser-side image resizing for AI-generated images.
 */

import NeuralConfig from './config';
import neuralInterop from './NeuralInterop';
import { providerManager } from './providers';

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
 * Browser-side image resizer
 * Handles resizing AI-generated images to exact game requirements
 */
class ImageResizer {
  /**
   * Supported resampling algorithms
   */
  static ALGORITHMS = {
    NEAREST: 'nearest',      // Fastest, pixelated (good for pixel art)
    BILINEAR: 'bilinear',    // Smooth, slight blur
    LANCZOS: 'lanczos',      // Best quality, slower
  };

  /**
   * Resize an image to target dimensions
   * @param {ImageData|HTMLImageElement|HTMLCanvasElement|Blob|string} source - Input image
   * @param {number} targetWidth - Target width
   * @param {number} targetHeight - Target height
   * @param {Object} options - Resizing options
   * @returns {Promise<ImageData>}
   */
  static async resize(source, targetWidth, targetHeight, options = {}) {
    const {
      algorithm = ImageResizer.ALGORITHMS.LANCZOS,
      maintainAspect = false,
      background = { r: 0, g: 0, b: 0, a: 0 },
    } = options;

    // Convert source to ImageData
    const sourceData = await ImageResizer.toImageData(source);

    // Calculate output dimensions
    let outWidth = targetWidth;
    let outHeight = targetHeight;
    let offsetX = 0;
    let offsetY = 0;

    if (maintainAspect) {
      const sourceAspect = sourceData.width / sourceData.height;
      const targetAspect = targetWidth / targetHeight;

      if (sourceAspect > targetAspect) {
        // Source is wider
        outHeight = Math.round(targetWidth / sourceAspect);
        offsetY = Math.floor((targetHeight - outHeight) / 2);
      } else {
        // Source is taller
        outWidth = Math.round(targetHeight * sourceAspect);
        offsetX = Math.floor((targetWidth - outWidth) / 2);
      }
    }

    // Perform resize based on algorithm
    let resizedData;
    switch (algorithm) {
      case ImageResizer.ALGORITHMS.NEAREST:
        resizedData = ImageResizer.resizeNearest(sourceData, outWidth, outHeight);
        break;
      case ImageResizer.ALGORITHMS.BILINEAR:
        resizedData = ImageResizer.resizeBilinear(sourceData, outWidth, outHeight);
        break;
      case ImageResizer.ALGORITHMS.LANCZOS:
      default:
        resizedData = ImageResizer.resizeLanczos(sourceData, outWidth, outHeight);
        break;
    }

    // If maintaining aspect ratio, place on canvas with background
    if (maintainAspect && (offsetX > 0 || offsetY > 0)) {
      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      // Fill background
      ctx.fillStyle = `rgba(${background.r}, ${background.g}, ${background.b}, ${background.a / 255})`;
      ctx.fillRect(0, 0, targetWidth, targetHeight);

      // Place resized image
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = outWidth;
      tempCanvas.height = outHeight;
      tempCanvas.getContext('2d').putImageData(resizedData, 0, 0);

      ctx.drawImage(tempCanvas, offsetX, offsetY);
      return ctx.getImageData(0, 0, targetWidth, targetHeight);
    }

    return resizedData;
  }

  /**
   * Convert various sources to ImageData
   */
  static async toImageData(source) {
    // Already ImageData
    if (source instanceof ImageData) {
      return source;
    }

    // Canvas or Image element
    if (source instanceof HTMLCanvasElement || source instanceof HTMLImageElement) {
      const canvas = document.createElement('canvas');
      canvas.width = source.width;
      canvas.height = source.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(source, 0, 0);
      return ctx.getImageData(0, 0, source.width, source.height);
    }

    // Blob
    if (source instanceof Blob) {
      return ImageResizer.blobToImageData(source);
    }

    // Base64 string or URL
    if (typeof source === 'string') {
      return ImageResizer.urlToImageData(source);
    }

    throw new Error('Unsupported image source type');
  }

  /**
   * Convert Blob to ImageData
   */
  static blobToImageData(blob) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();

      img.onload = () => {
        URL.revokeObjectURL(url);
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(ctx.getImageData(0, 0, img.width, img.height));
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image from blob'));
      };

      img.src = url;
    });
  }

  /**
   * Convert URL/Base64 to ImageData
   */
  static urlToImageData(url) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(ctx.getImageData(0, 0, img.width, img.height));
      };

      img.onerror = () => reject(new Error('Failed to load image from URL'));
      img.src = url;
    });
  }

  /**
   * Nearest neighbor resize (fast, pixelated)
   */
  static resizeNearest(source, targetWidth, targetHeight) {
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');

    // Disable smoothing for nearest neighbor
    ctx.imageSmoothingEnabled = false;

    // Create source canvas
    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = source.width;
    srcCanvas.height = source.height;
    srcCanvas.getContext('2d').putImageData(source, 0, 0);

    ctx.drawImage(srcCanvas, 0, 0, targetWidth, targetHeight);
    return ctx.getImageData(0, 0, targetWidth, targetHeight);
  }

  /**
   * Bilinear interpolation resize
   */
  static resizeBilinear(source, targetWidth, targetHeight) {
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = source.width;
    srcCanvas.height = source.height;
    srcCanvas.getContext('2d').putImageData(source, 0, 0);

    ctx.drawImage(srcCanvas, 0, 0, targetWidth, targetHeight);
    return ctx.getImageData(0, 0, targetWidth, targetHeight);
  }

  /**
   * Lanczos resize (high quality)
   */
  static resizeLanczos(source, targetWidth, targetHeight) {
    // For downscaling, use multi-step approach for better quality
    const scaleX = targetWidth / source.width;
    const scaleY = targetHeight / source.height;

    if (scaleX < 0.5 || scaleY < 0.5) {
      // Multi-step downscale
      return ImageResizer.multiStepResize(source, targetWidth, targetHeight);
    }

    // Use browser's high quality resampling
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    const srcCanvas = document.createElement('canvas');
    srcCanvas.width = source.width;
    srcCanvas.height = source.height;
    srcCanvas.getContext('2d').putImageData(source, 0, 0);

    ctx.drawImage(srcCanvas, 0, 0, targetWidth, targetHeight);
    return ctx.getImageData(0, 0, targetWidth, targetHeight);
  }

  /**
   * Multi-step resize for large downscaling
   */
  static multiStepResize(source, targetWidth, targetHeight) {
    let currentData = source;
    let currentWidth = source.width;
    let currentHeight = source.height;

    // Halve dimensions until close to target
    while (currentWidth / 2 > targetWidth && currentHeight / 2 > targetHeight) {
      const newWidth = Math.floor(currentWidth / 2);
      const newHeight = Math.floor(currentHeight / 2);

      const canvas = document.createElement('canvas');
      canvas.width = newWidth;
      canvas.height = newHeight;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      const srcCanvas = document.createElement('canvas');
      srcCanvas.width = currentWidth;
      srcCanvas.height = currentHeight;
      srcCanvas.getContext('2d').putImageData(currentData, 0, 0);

      ctx.drawImage(srcCanvas, 0, 0, newWidth, newHeight);
      currentData = ctx.getImageData(0, 0, newWidth, newHeight);
      currentWidth = newWidth;
      currentHeight = newHeight;
    }

    // Final resize to exact target
    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = targetWidth;
    finalCanvas.height = targetHeight;
    const finalCtx = finalCanvas.getContext('2d');
    finalCtx.imageSmoothingEnabled = true;
    finalCtx.imageSmoothingQuality = 'high';

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = currentWidth;
    tempCanvas.height = currentHeight;
    tempCanvas.getContext('2d').putImageData(currentData, 0, 0);

    finalCtx.drawImage(tempCanvas, 0, 0, targetWidth, targetHeight);
    return finalCtx.getImageData(0, 0, targetWidth, targetHeight);
  }

  /**
   * Create a sprite sheet from multiple frames
   */
  static async createSpriteSheet(frames, frameWidth, frameHeight, columns = 4) {
    const rows = Math.ceil(frames.length / columns);
    const canvas = document.createElement('canvas');
    canvas.width = frameWidth * columns;
    canvas.height = frameHeight * rows;
    const ctx = canvas.getContext('2d');

    for (let i = 0; i < frames.length; i++) {
      const col = i % columns;
      const row = Math.floor(i / columns);

      // Resize frame if needed
      let frameData = await ImageResizer.toImageData(frames[i]);
      if (frameData.width !== frameWidth || frameData.height !== frameHeight) {
        frameData = await ImageResizer.resize(frameData, frameWidth, frameHeight, {
          algorithm: ImageResizer.ALGORITHMS.NEAREST,
          maintainAspect: true,
        });
      }

      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = frameWidth;
      tempCanvas.height = frameHeight;
      tempCanvas.getContext('2d').putImageData(frameData, 0, 0);

      ctx.drawImage(tempCanvas, col * frameWidth, row * frameHeight);
    }

    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
}

/**
 * Character/Monster sprite specification
 */
const SPRITE_SPECS = {
  MONSTER_SMALL: { width: 96, height: 96, frameWidth: 32, frameHeight: 32 },
  MONSTER_MEDIUM: { width: 128, height: 128, frameWidth: 64, frameHeight: 64 },
  MONSTER_LARGE: { width: 256, height: 256, frameWidth: 128, frameHeight: 128 },
  ITEM_INV: { width: 28, height: 28, frameWidth: 28, frameHeight: 28 },
  ITEM_CURSOR: { width: 56, height: 56, frameWidth: 56, frameHeight: 56 },
  TILE: { width: 64, height: 32, frameWidth: 64, frameHeight: 32 },
};

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

    // Draw a simple monster silhouette based on description keywords
    const isMonster = description.toLowerCase().includes('monster') ||
                      description.toLowerCase().includes('demon') ||
                      description.toLowerCase().includes('skeleton');
    const isItem = description.toLowerCase().includes('item') ||
                   description.toLowerCase().includes('sword') ||
                   description.toLowerCase().includes('armor');

    if (isMonster) {
      // Monster placeholder
      ctx.fillStyle = '#660000';
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, Math.min(width, height) / 3, 0, Math.PI * 2);
      ctx.fill();

      // Eyes
      ctx.fillStyle = '#ff0000';
      const eyeOffset = width / 10;
      ctx.beginPath();
      ctx.arc(width / 2 - eyeOffset, height / 2 - eyeOffset, 3, 0, Math.PI * 2);
      ctx.arc(width / 2 + eyeOffset, height / 2 - eyeOffset, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (isItem) {
      // Item placeholder
      ctx.fillStyle = '#8B4513';
      ctx.fillRect(width * 0.3, height * 0.1, width * 0.4, height * 0.8);

      ctx.fillStyle = '#C0C0C0';
      ctx.beginPath();
      ctx.moveTo(width * 0.5, height * 0.1);
      ctx.lineTo(width * 0.3, height * 0.3);
      ctx.lineTo(width * 0.7, height * 0.3);
      ctx.closePath();
      ctx.fill();
    } else {
      // Generic placeholder
      ctx.fillStyle = '#444444';
      ctx.fillRect(width * 0.2, height * 0.2, width * 0.6, height * 0.6);
    }

    return ctx.getImageData(0, 0, width, height);
  }

  static generateAnimatedSprite(description, spec, frameCount = 4) {
    const { width, height, frameWidth, frameHeight } = spec;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    const cols = Math.floor(width / frameWidth);
    const rows = Math.floor(height / frameHeight);

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const frameNum = row * cols + col;
        if (frameNum >= frameCount) continue;

        // Generate slightly different frame for each
        const frame = MockAssetGenerator.generateSprite(
          description,
          frameWidth,
          frameHeight
        );

        // Add frame to sheet
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = frameWidth;
        tempCanvas.height = frameHeight;
        tempCanvas.getContext('2d').putImageData(frame, 0, 0);

        ctx.drawImage(tempCanvas, col * frameWidth, row * frameHeight);
      }
    }

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
   * Call image generation API using the provider system
   */
  async callImageGenAPI(prompt, width, height) {
    const provider = providerManager.getProvider();

    if (!provider || !provider.generateImage) {
      throw new Error('No image generation provider configured');
    }

    const fullPrompt = `${prompt}, ${config.imageGen.style}`;

    // Get image from provider (may not be exact size)
    const imageResult = await provider.generateImage(fullPrompt, {
      width,
      height,
    });

    // Convert result to ImageData and resize if needed
    let imageData;

    if (typeof imageResult === 'string') {
      // Base64 or URL
      imageData = await ImageResizer.urlToImageData(
        imageResult.startsWith('data:') ? imageResult : `data:image/png;base64,${imageResult}`
      );
    } else if (imageResult instanceof Blob) {
      imageData = await ImageResizer.blobToImageData(imageResult);
    } else {
      throw new Error('Unsupported image result format');
    }

    // Resize to exact dimensions if needed
    if (imageData.width !== width || imageData.height !== height) {
      console.log(`[AssetPipeline] Resizing image from ${imageData.width}x${imageData.height} to ${width}x${height}`);
      imageData = await ImageResizer.resize(imageData, width, height, {
        algorithm: ImageResizer.ALGORITHMS.LANCZOS,
        maintainAspect: true,
        background: { r: 0, g: 0, b: 0, a: 0 },
      });
    }

    return imageData;
  }

  /**
   * Generate a custom character sprite with AI
   */
  async generateCharacterSprite(characterSpec) {
    const {
      name,
      description,
      size = 'MONSTER_MEDIUM',
      background = 'transparent dark fantasy',
      style = 'pixel art sprite sheet',
      animations = ['idle', 'walk', 'attack', 'death'],
    } = characterSpec;

    const spec = SPRITE_SPECS[size] || SPRITE_SPECS.MONSTER_MEDIUM;
    const cacheKey = `character_${name}_${size}`;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Build detailed prompt
    const prompt = `${description}, ${style}, ${background}, game character sprite, ${spec.frameWidth}x${spec.frameHeight} pixels per frame, dark gothic fantasy style, 256 color palette`;

    try {
      let imageData;

      if (NeuralConfig.debug.mockAPIResponses || !providerManager.getProvider()?.generateImage) {
        imageData = MockAssetGenerator.generateAnimatedSprite(description, spec, animations.length * 4);
      } else {
        // Generate with AI
        imageData = await this.callImageGenAPI(prompt, spec.width, spec.height);
      }

      // Convert to game format
      const frames = encodeCL2(imageData, spec.frameWidth, spec.frameHeight);

      const asset = {
        name,
        description,
        characterSpec,
        width: spec.width,
        height: spec.height,
        frameWidth: spec.frameWidth,
        frameHeight: spec.frameHeight,
        animations,
        frames,
        format: 'CL2',
        generatedAt: new Date().toISOString(),
      };

      this.cache.set(cacheKey, asset);
      neuralInterop.emit('characterGenerated', asset);

      return asset;
    } catch (error) {
      console.error('[AssetPipeline] Character generation failed:', error);
      return null;
    }
  }

  /**
   * Decode base64 image to ImageData (legacy support)
   */
  decodeBase64Image(base64, width, height) {
    return ImageResizer.urlToImageData(`data:image/png;base64,${base64}`)
      .then(imageData => {
        if (imageData.width !== width || imageData.height !== height) {
          return ImageResizer.resize(imageData, width, height);
        }
        return imageData;
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
  ImageResizer,
  DIABLO_PALETTE,
  SPRITE_SPECS,
  quantizeToPalette,
  encodeCL2,
  findNearestPaletteColor,
};

export default assetPipeline;
