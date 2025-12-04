/**
 * Asset Generator Adapter
 *
 * Bridges the AssetPipeline to the CampaignBuilder for
 * generating custom sprites, tiles, and other assets.
 * Supports NanoBanana and other image generation endpoints.
 */

import assetPipeline from './AssetPipeline';
import { ASSET_CATEGORIES } from './CampaignBlueprint';

/**
 * Asset generation configuration for different asset types
 */
const ASSET_CONFIGS = {
  player_character: {
    width: 96,
    height: 96,
    frameWidth: 96,
    frameHeight: 96,
    animations: ['idle', 'walk', 'attack', 'hit', 'death'],
    style: 'pixel art sprite sheet, 8 directional, dark fantasy warrior',
  },
  npc: {
    width: 64,
    height: 64,
    frameWidth: 64,
    frameHeight: 64,
    animations: ['idle', 'talk'],
    style: 'pixel art NPC sprite, medieval fantasy townsperson',
  },
  enemy: {
    width: 64,
    height: 64,
    frameWidth: 64,
    frameHeight: 64,
    animations: ['idle', 'walk', 'attack', 'hit', 'death'],
    style: 'pixel art monster sprite, dark fantasy, demonic creature',
  },
  boss: {
    width: 128,
    height: 128,
    frameWidth: 128,
    frameHeight: 128,
    animations: ['idle', 'walk', 'attack', 'special', 'hit', 'death'],
    style: 'pixel art boss sprite, large dark fantasy demon, detailed',
  },
  tile_floor: {
    width: 64,
    height: 32,
    style: 'isometric dungeon floor tile, seamless, dark stone',
  },
  tile_wall: {
    width: 64,
    height: 128,
    style: 'isometric dungeon wall tile, seamless, dark stone',
  },
  item_weapon: {
    width: 28,
    height: 28,
    style: 'pixel art inventory icon, fantasy weapon, detailed',
  },
  item_armor: {
    width: 28,
    height: 28,
    style: 'pixel art inventory icon, fantasy armor piece, detailed',
  },
  item_potion: {
    width: 28,
    height: 28,
    style: 'pixel art inventory icon, magical potion bottle',
  },
  object_container: {
    width: 64,
    height: 64,
    style: 'pixel art dungeon chest or barrel, dark fantasy',
  },
  object_shrine: {
    width: 64,
    height: 96,
    style: 'pixel art magical shrine, glowing, dark fantasy',
  },
  object_decoration: {
    width: 32,
    height: 32,
    style: 'pixel art dungeon decoration, dark fantasy',
  },
  portrait: {
    width: 64,
    height: 64,
    style: 'pixel art character portrait, dark fantasy, detailed face',
  },
};

/**
 * AssetGeneratorAdapter class
 * Provides a unified interface for generating campaign assets
 */
export class AssetGeneratorAdapter {
  constructor(options = {}) {
    this.pipeline = assetPipeline;
    this.options = {
      useMock: options.useMock || false,
      endpoint: options.endpoint || null,
      style: options.style || 'pixel_art',
      ...options,
    };

    // Generation queue for batch processing
    this.queue = [];
    this.processing = false;
    this.generatedAssets = new Map();

    // Progress tracking
    this.onProgress = options.onProgress || null;
  }

  /**
   * Generate a single asset based on requirements
   */
  async generate(prompt, options = {}) {
    const category = options.category || 'enemy';
    const config = ASSET_CONFIGS[category] || ASSET_CONFIGS.enemy;

    const fullPrompt = this.buildPrompt(prompt, config, options);

    try {
      let result;

      if (config.animations) {
        // Animated sprite
        result = await this.pipeline.generateSprite(fullPrompt, {
          width: options.width || config.width,
          height: options.height || config.height,
          frameWidth: config.frameWidth,
          frameHeight: config.frameHeight,
          animations: config.animations,
        });
      } else {
        // Static sprite (item or tile)
        result = await this.pipeline.generateItemSprite(fullPrompt, {
          width: options.width || config.width,
          height: options.height || config.height,
        });
      }

      if (result) {
        const assetId = `asset_${category}_${Date.now()}`;
        this.generatedAssets.set(assetId, {
          id: assetId,
          prompt,
          category,
          result,
          generatedAt: Date.now(),
        });
        return { success: true, assetId, result };
      }

      return { success: false, error: 'Generation returned null' };
    } catch (error) {
      console.error('[AssetGeneratorAdapter] Generation failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Build full generation prompt
   */
  buildPrompt(basePrompt, config, options) {
    const parts = [basePrompt];

    if (config.style) {
      parts.push(config.style);
    }

    if (options.theme) {
      parts.push(`${options.theme} theme`);
    }

    if (options.additionalDetails) {
      parts.push(options.additionalDetails);
    }

    return parts.join(', ');
  }

  /**
   * Queue multiple assets for generation
   */
  queueAsset(requirement) {
    this.queue.push(requirement);
    return this.queue.length - 1;
  }

  /**
   * Process queued assets
   */
  async processQueue() {
    if (this.processing) {
      return { success: false, error: 'Already processing' };
    }

    this.processing = true;
    const results = [];
    const total = this.queue.length;

    try {
      for (let i = 0; i < this.queue.length; i++) {
        const requirement = this.queue[i];

        if (this.onProgress) {
          this.onProgress({
            current: i + 1,
            total,
            asset: requirement.id || requirement.prompt,
          });
        }

        const result = await this.generate(requirement.prompt, {
          category: requirement.category,
          width: requirement.width,
          height: requirement.height,
          theme: requirement.theme,
        });

        results.push({
          requirement,
          result,
        });

        // Small delay between generations to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      this.queue = [];
      return { success: true, results };
    } catch (error) {
      return { success: false, error: error.message, results };
    } finally {
      this.processing = false;
    }
  }

  /**
   * Generate assets for a campaign blueprint
   */
  async generateForBlueprint(blueprint) {
    if (!blueprint || !blueprint.assets) {
      return { success: false, error: 'Invalid blueprint' };
    }

    const requirements = blueprint.assets.requirements.filter(
      req => req.needsGeneration
    );

    if (requirements.length === 0) {
      return { success: true, message: 'No assets need generation' };
    }

    // Queue all requirements
    for (const req of requirements) {
      this.queueAsset({
        id: req.id,
        prompt: req.generationPrompt,
        category: req.category,
        width: req.width,
        height: req.height,
      });
    }

    // Process queue
    return await this.processQueue();
  }

  /**
   * Get generated asset by ID
   */
  getAsset(assetId) {
    return this.generatedAssets.get(assetId);
  }

  /**
   * Get all generated assets
   */
  getAllAssets() {
    return Array.from(this.generatedAssets.values());
  }

  /**
   * Clear generated assets cache
   */
  clearCache() {
    this.generatedAssets.clear();
  }

  /**
   * Get generation statistics
   */
  getStats() {
    const assets = this.getAllAssets();
    const byCategory = {};

    for (const asset of assets) {
      byCategory[asset.category] = (byCategory[asset.category] || 0) + 1;
    }

    return {
      total: assets.length,
      byCategory,
      queuedCount: this.queue.length,
      isProcessing: this.processing,
    };
  }
}

/**
 * Create a configured asset generator
 */
export function createAssetGenerator(options = {}) {
  return new AssetGeneratorAdapter(options);
}

/**
 * Default singleton instance
 */
export const assetGenerator = new AssetGeneratorAdapter();

export default AssetGeneratorAdapter;
