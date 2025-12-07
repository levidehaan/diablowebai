/**
 * AI Provider System
 *
 * Unified interface for multiple AI providers including OpenRouter,
 * OpenAI, Google Gemini, Anthropic, and local models.
 */

import debugLogger, { LogCategory } from '../DebugLogger';

// Track API call statistics
let apiCallStats = {
  totalCalls: 0,
  textCalls: 0,
  imageCalls: 0,
  totalTokensIn: 0,
  totalTokensOut: 0,
  errors: 0,
  retries: 0,
  estimatedCost: 0,
};

// Configuration for retry and timeout behavior
const AI_CONFIG = {
  defaultTimeout: 120000,    // 2 minutes default (was 30s)
  maxRetries: 3,             // Retry up to 3 times
  retryDelayBase: 2000,      // Start with 2 second delay
  retryDelayMax: 30000,      // Max 30 second delay
  verboseLogging: true,      // Log full prompts/responses
};

// Expose stats and config globally for debugging
if (typeof window !== 'undefined') {
  window.getAIStats = () => ({ ...apiCallStats });
  window.setAIVerbose = (v) => { AI_CONFIG.verboseLogging = v; };
  window.AI_CONFIG = AI_CONFIG;
}

// Provider types
export const PROVIDERS = {
  OPENROUTER: 'openrouter',
  OPENAI: 'openai',
  GEMINI: 'gemini',
  ANTHROPIC: 'anthropic',
  LOCAL: 'local',
};

// Provider configurations
export const PROVIDER_CONFIGS = {
  [PROVIDERS.OPENROUTER]: {
    name: 'OpenRouter',
    description: 'Access 100+ models through one API',
    baseUrl: 'https://openrouter.ai/api/v1',
    modelsEndpoint: 'https://openrouter.ai/api/v1/models',
    requiresKey: true,
    supportsImageGen: true,
    keyPrefix: 'sk-or-',
    defaultModel: 'openai/gpt-4-turbo',
    defaultImageModel: 'google/gemini-2.5-flash-image-preview',
    // Known image models for fallback if API doesn't return them
    knownImageModels: [
      { id: 'google/gemini-2.5-flash-image-preview', name: 'Gemini 2.5 Flash Image (Nano Banana)' },
      { id: 'black-forest-labs/flux-1.1-pro', name: 'FLUX 1.1 Pro' },
      { id: 'black-forest-labs/flux-pro', name: 'FLUX Pro' },
      { id: 'black-forest-labs/flux-dev', name: 'FLUX Dev' },
      { id: 'black-forest-labs/flux-schnell', name: 'FLUX Schnell' },
    ],
  },
  [PROVIDERS.OPENAI]: {
    name: 'OpenAI',
    description: 'GPT-4, GPT-3.5, DALL-E',
    baseUrl: 'https://api.openai.com/v1',
    requiresKey: true,
    supportsImageGen: true,
    keyPrefix: 'sk-',
    defaultModel: 'gpt-4-turbo-preview',
    defaultImageModel: 'dall-e-3',
    models: [
      { id: 'gpt-4-turbo-preview', name: 'GPT-4 Turbo', context: 128000 },
      { id: 'gpt-4', name: 'GPT-4', context: 8192 },
      { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', context: 16385 },
    ],
    imageModels: [
      { id: 'dall-e-3', name: 'DALL-E 3' },
      { id: 'dall-e-2', name: 'DALL-E 2' },
    ],
  },
  [PROVIDERS.GEMINI]: {
    name: 'Google Gemini',
    description: 'Gemini Pro, Gemini Ultra',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    requiresKey: true,
    supportsImageGen: true,
    keyPrefix: 'AI',
    defaultModel: 'gemini-pro',
    defaultImageModel: 'imagen-2',
    models: [
      { id: 'gemini-pro', name: 'Gemini Pro', context: 32768 },
      { id: 'gemini-pro-vision', name: 'Gemini Pro Vision', context: 16384 },
      { id: 'gemini-ultra', name: 'Gemini Ultra', context: 32768 },
    ],
    imageModels: [
      { id: 'imagen-2', name: 'Imagen 2' },
    ],
  },
  [PROVIDERS.ANTHROPIC]: {
    name: 'Anthropic',
    description: 'Claude 3 Opus, Sonnet, Haiku',
    baseUrl: 'https://api.anthropic.com/v1',
    requiresKey: true,
    supportsImageGen: false,
    keyPrefix: 'sk-ant-',
    defaultModel: 'claude-3-sonnet-20240229',
    models: [
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', context: 200000 },
      { id: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet', context: 200000 },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', context: 200000 },
    ],
  },
  [PROVIDERS.LOCAL]: {
    name: 'Local (Ollama/LM Studio)',
    description: 'Run models on your own machine',
    baseUrl: 'http://localhost:11434/api',
    requiresKey: false,
    supportsImageGen: false,
    defaultModel: 'llama2',
    models: [
      { id: 'llama2', name: 'Llama 2' },
      { id: 'mistral', name: 'Mistral' },
      { id: 'codellama', name: 'Code Llama' },
      { id: 'neural-chat', name: 'Neural Chat' },
    ],
  },
};

/**
 * Base Provider class
 */
class BaseProvider {
  constructor(config) {
    this.apiKey = config.apiKey || '';
    this.baseUrl = config.baseUrl || PROVIDER_CONFIGS[config.provider]?.baseUrl;
    this.model = config.model || PROVIDER_CONFIGS[config.provider]?.defaultModel;
    this.imageModel = config.imageModel || PROVIDER_CONFIGS[config.provider]?.defaultImageModel;
    this.timeout = config.timeout || AI_CONFIG.defaultTimeout;
  }

  /**
   * Calculate dynamic timeout based on expected tokens
   */
  calculateTimeout(maxTokens = 2000) {
    // Base timeout + extra time for token generation
    // Claude generates ~50 tokens/sec, add buffer
    const tokenTime = Math.ceil(maxTokens / 30) * 1000; // ~30 tokens/sec with buffer
    return Math.max(this.timeout, 30000 + tokenTime);
  }

  /**
   * Sleep helper for retry delays
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Retry wrapper with exponential backoff
   */
  async withRetry(operation, operationName, maxRetries = AI_CONFIG.maxRetries) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        apiCallStats.errors++;

        const isRetryable = error.message.includes('timeout') ||
                           error.message.includes('429') ||
                           error.message.includes('503') ||
                           error.message.includes('502') ||
                           error.message.includes('Failed to fetch');

        if (!isRetryable || attempt === maxRetries) {
          debugLogger.error(LogCategory.AI_PROVIDER, `✗ ${operationName} failed after ${attempt} attempt(s)`, {
            error: error.message,
            attempt,
            maxRetries,
            willRetry: false,
          });
          throw error;
        }

        const delay = Math.min(
          AI_CONFIG.retryDelayBase * Math.pow(2, attempt - 1),
          AI_CONFIG.retryDelayMax
        );

        apiCallStats.retries++;
        debugLogger.warn(LogCategory.AI_PROVIDER, `⚠️ ${operationName} failed, retrying in ${delay}ms...`, {
          error: error.message,
          attempt,
          maxRetries,
          nextDelay: delay,
        });

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  /**
   * Generate text completion
   */
  async generateText(prompt, options = {}) {
    throw new Error('generateText must be implemented by subclass');
  }

  /**
   * Generate image
   */
  async generateImage(prompt, options = {}) {
    throw new Error('generateImage not supported by this provider');
  }

  /**
   * Get available models
   */
  async getModels() {
    throw new Error('getModels must be implemented by subclass');
  }

  /**
   * Test connection
   */
  async testConnection() {
    try {
      await this.generateText('Say "ok" and nothing else.', { maxTokens: 10 });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Make HTTP request with timeout
   */
  async request(url, options = {}) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    const startTime = Date.now();
    const requestId = `req_${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 5)}`;

    // Log the outgoing request
    debugLogger.info(LogCategory.AI_PROVIDER, `→ API Request [${requestId}]`, {
      url: url.replace(/key=[^&]+/, 'key=***').replace(/Bearer [^"]+/, 'Bearer ***'),
      method: options.method || 'GET',
      timeout: this.timeout,
    });

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      const elapsed = Date.now() - startTime;

      if (!response.ok) {
        const error = await response.text();
        apiCallStats.errors++;
        debugLogger.error(LogCategory.AI_PROVIDER, `✗ API Error [${requestId}] ${response.status}`, {
          elapsed,
          status: response.status,
          error: error.substring(0, 500),
        });
        throw new Error(`API error ${response.status}: ${error}`);
      }

      const data = await response.json();

      // Extract usage info if available
      const usage = data.usage || {};
      if (usage.prompt_tokens) {
        apiCallStats.totalTokensIn += usage.prompt_tokens;
      }
      if (usage.completion_tokens) {
        apiCallStats.totalTokensOut += usage.completion_tokens;
      }

      debugLogger.info(LogCategory.AI_PROVIDER, `✓ API Response [${requestId}]`, {
        elapsed,
        status: response.status,
        hasUsage: !!data.usage,
        tokensIn: usage.prompt_tokens || 'N/A',
        tokensOut: usage.completion_tokens || 'N/A',
      });

      return data;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      if (error.name === 'AbortError') {
        apiCallStats.errors++;
        debugLogger.error(LogCategory.AI_PROVIDER, `✗ API Timeout [${requestId}]`, {
          elapsed,
          timeout: this.timeout,
        });
        throw new Error(`Request timed out after ${this.timeout}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * OpenRouter Provider
 */
class OpenRouterProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.imageModelsCache = null;
  }

  async generateText(prompt, options = {}) {
    const model = options.model || this.model;
    const maxTokens = options.maxTokens ?? 2000;
    const dynamicTimeout = this.calculateTimeout(maxTokens);
    const startTime = Date.now();
    apiCallStats.totalCalls++;
    apiCallStats.textCalls++;

    // Log the text generation request with full prompt if verbose
    const logData = {
      provider: 'OpenRouter',
      model,
      promptLength: prompt.length,
      temperature: options.temperature ?? 0.7,
      maxTokens,
      timeout: dynamicTimeout,
      systemPromptLength: (options.systemPrompt || 'You are a helpful assistant.').length,
    };

    if (AI_CONFIG.verboseLogging) {
      logData.fullPrompt = prompt;
      logData.systemPrompt = options.systemPrompt || 'You are a helpful assistant.';
    } else {
      logData.promptPreview = prompt.substring(0, 500) + (prompt.length > 500 ? '...' : '');
    }

    debugLogger.info(LogCategory.AI_PROVIDER, `📝 Text Generation Request`, logData);

    // Store original timeout and use dynamic one
    const originalTimeout = this.timeout;
    this.timeout = dynamicTimeout;

    try {
      // Wrap request in retry logic
      const response = await this.withRetry(async () => {
        return await this.request(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'HTTP-Referer': window.location.href,
            'X-Title': 'Diablo Web AI',
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: options.systemPrompt || 'You are a helpful assistant.' },
              { role: 'user', content: prompt },
            ],
            temperature: options.temperature ?? 0.7,
            max_tokens: maxTokens,
          }),
        });
      }, `Text Generation (${model})`);

      const elapsed = Date.now() - startTime;
      const content = response.choices[0].message.content;

      // Log successful response with full content if verbose
      const responseLog = {
        provider: 'OpenRouter',
        model,
        elapsed,
        responseLength: content.length,
        usage: response.usage || 'N/A',
        finishReason: response.choices[0].finish_reason,
      };

      if (AI_CONFIG.verboseLogging) {
        responseLog.fullResponse = content;
      } else {
        responseLog.responsePreview = content.substring(0, 500) + (content.length > 500 ? '...' : '');
      }

      debugLogger.info(LogCategory.AI_PROVIDER, `✅ Text Generation Complete`, responseLog);

      // Validate response if it's expected to be JSON
      if (options.expectJSON !== false && (prompt.includes('JSON') || prompt.includes('json'))) {
        this.validateJSONResponse(content, options.schema);
      }

      return content;
    } finally {
      this.timeout = originalTimeout;
    }
  }

  /**
   * Validate JSON response and log issues
   */
  validateJSONResponse(content, schema = null) {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      debugLogger.warn(LogCategory.AI_PROVIDER, `⚠️ Response Validation: No JSON found in response`, {
        responseLength: content.length,
        responseStart: content.substring(0, 200),
      });
      return false;
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      debugLogger.info(LogCategory.AI_PROVIDER, `✓ Response Validation: Valid JSON`, {
        keys: Object.keys(parsed),
        hasActs: Array.isArray(parsed.acts),
        hasQuests: Array.isArray(parsed.quests),
        hasLevels: parsed.acts?.[0]?.levels?.length || 0,
      });
      return true;
    } catch (e) {
      debugLogger.warn(LogCategory.AI_PROVIDER, `⚠️ Response Validation: Invalid JSON`, {
        error: e.message,
        jsonStart: jsonMatch[0].substring(0, 300),
      });
      return false;
    }
  }

  async generateImage(prompt, options = {}) {
    // OpenRouter uses chat/completions with modalities for image generation
    const imageModel = options.model || this.imageModel;
    const startTime = Date.now();
    apiCallStats.totalCalls++;
    apiCallStats.imageCalls++;

    // Log the image generation request
    debugLogger.info(LogCategory.AI_PROVIDER, `🖼️ Image Generation Request`, {
      provider: 'OpenRouter',
      model: imageModel,
      promptLength: prompt.length,
      promptPreview: prompt.substring(0, 300) + (prompt.length > 300 ? '...' : ''),
      aspectRatio: options.aspectRatio || 'default',
    });

    const requestBody = {
      model: imageModel,
      messages: [
        { role: 'user', content: prompt },
      ],
      modalities: ['image', 'text'],
    };

    // Add image_config for aspect ratio if specified (Gemini models support this)
    if (options.aspectRatio) {
      requestBody.image_config = { aspect_ratio: options.aspectRatio };
    }

    const response = await this.request(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': window.location.href,
        'X-Title': 'Diablo Web AI',
      },
      body: JSON.stringify(requestBody),
    });

    const elapsed = Date.now() - startTime;

    // OpenRouter returns images in message.images array as base64 data URLs
    const message = response.choices[0].message;
    if (message.images && message.images.length > 0) {
      const imageUrl = message.images[0].image_url?.url || message.images[0];

      debugLogger.info(LogCategory.AI_PROVIDER, `✅ Image Generation Complete`, {
        provider: 'OpenRouter',
        model: imageModel,
        elapsed,
        hasImage: true,
        imageDataLength: typeof imageUrl === 'string' ? imageUrl.length : 0,
        usage: response.usage || 'N/A',
      });

      // Extract base64 from data URL if needed
      if (typeof imageUrl === 'string' && imageUrl.startsWith('data:')) {
        return imageUrl.split(',')[1]; // Return just the base64 part
      }
      return imageUrl;
    }

    debugLogger.error(LogCategory.AI_PROVIDER, `✗ Image Generation Failed - No image in response`, {
      provider: 'OpenRouter',
      model: imageModel,
      elapsed,
      response: JSON.stringify(response).substring(0, 500),
    });

    throw new Error('No image generated in response');
  }

  async getModels() {
    const response = await this.request(PROVIDER_CONFIGS.openrouter.modelsEndpoint, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    // Store full model data for image model detection
    this._allModelsData = response.data;

    return response.data
      .filter(m => m.context_length >= 4096)
      .map(m => ({
        id: m.id,
        name: m.name || m.id,
        context: m.context_length,
        pricing: m.pricing,
        description: m.description,
        outputModalities: m.architecture?.output_modalities || [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getImageModels() {
    if (this.imageModelsCache) {
      return this.imageModelsCache;
    }

    const response = await this.request(PROVIDER_CONFIGS.openrouter.modelsEndpoint, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    // Filter for models that have 'image' in output_modalities
    this.imageModelsCache = response.data
      .filter(m => {
        const outputModalities = m.architecture?.output_modalities || [];
        return outputModalities.includes('image');
      })
      .map(m => ({
        id: m.id,
        name: m.name || m.id,
        pricing: m.pricing,
        description: m.description,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return this.imageModelsCache;
  }
}

/**
 * OpenAI Provider
 */
class OpenAIProvider extends BaseProvider {
  async generateText(prompt, options = {}) {
    const response = await this.request(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model || this.model,
        messages: [
          { role: 'system', content: options.systemPrompt || 'You are a helpful assistant.' },
          { role: 'user', content: prompt },
        ],
        temperature: options.temperature ?? 0.7,
        max_tokens: options.maxTokens ?? 2000,
      }),
    });

    return response.choices[0].message.content;
  }

  async generateImage(prompt, options = {}) {
    const response = await this.request(`${this.baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model || this.imageModel,
        prompt,
        n: 1,
        size: options.size || '256x256',
        response_format: 'b64_json',
      }),
    });

    return response.data[0].b64_json;
  }

  async getModels() {
    return PROVIDER_CONFIGS.openai.models;
  }
}

/**
 * Gemini Provider
 */
class GeminiProvider extends BaseProvider {
  async generateText(prompt, options = {}) {
    const model = options.model || this.model;
    const url = `${this.baseUrl}/models/${model}:generateContent?key=${this.apiKey}`;

    const response = await this.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }],
        }],
        generationConfig: {
          temperature: options.temperature ?? 0.7,
          maxOutputTokens: options.maxTokens ?? 2000,
        },
      }),
    });

    return response.candidates[0].content.parts[0].text;
  }

  async generateImage(prompt, options = {}) {
    // Gemini's Imagen API
    const url = `${this.baseUrl}/models/${this.imageModel}:generateImage?key=${this.apiKey}`;

    const response = await this.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: { text: prompt },
        numberOfImages: 1,
        imageSize: options.size || '256x256',
      }),
    });

    return response.images[0].bytesBase64Encoded;
  }

  async getModels() {
    return PROVIDER_CONFIGS.gemini.models;
  }
}

/**
 * Anthropic Provider
 */
class AnthropicProvider extends BaseProvider {
  async generateText(prompt, options = {}) {
    const response = await this.request(`${this.baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: options.model || this.model,
        max_tokens: options.maxTokens ?? 2000,
        messages: [
          { role: 'user', content: prompt },
        ],
        system: options.systemPrompt || 'You are a helpful assistant.',
      }),
    });

    return response.content[0].text;
  }

  async getModels() {
    return PROVIDER_CONFIGS.anthropic.models;
  }
}

/**
 * Local Provider (Ollama/LM Studio)
 */
class LocalProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.baseUrl = config.baseUrl || 'http://localhost:11434/api';
  }

  async generateText(prompt, options = {}) {
    // Ollama API format
    const response = await this.request(`${this.baseUrl}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: options.model || this.model,
        prompt: `${options.systemPrompt || ''}\n\n${prompt}`,
        stream: false,
        options: {
          temperature: options.temperature ?? 0.7,
          num_predict: options.maxTokens ?? 2000,
        },
      }),
    });

    return response.response;
  }

  async getModels() {
    try {
      const response = await this.request(`${this.baseUrl}/tags`);
      return response.models.map(m => ({
        id: m.name,
        name: m.name,
        size: m.size,
      }));
    } catch {
      return PROVIDER_CONFIGS.local.models;
    }
  }

  async testConnection() {
    try {
      const models = await this.getModels();
      return { success: true, models };
    } catch (error) {
      return { success: false, error: 'Cannot connect to local server. Is Ollama running?' };
    }
  }
}

/**
 * Create provider instance
 */
export function createProvider(config) {
  switch (config.provider) {
    case PROVIDERS.OPENROUTER:
      return new OpenRouterProvider(config);
    case PROVIDERS.OPENAI:
      return new OpenAIProvider(config);
    case PROVIDERS.GEMINI:
      return new GeminiProvider(config);
    case PROVIDERS.ANTHROPIC:
      return new AnthropicProvider(config);
    case PROVIDERS.LOCAL:
      return new LocalProvider(config);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

/**
 * Provider Manager - singleton for managing the active provider
 */
class ProviderManager {
  constructor() {
    this.provider = null;
    this.config = null;
    this.cachedModels = null;
  }

  /**
   * Initialize with configuration
   */
  async initialize(config) {
    debugLogger.info(LogCategory.AI_PROVIDER, '🔧 Initializing AI Provider', {
      provider: config.provider,
      model: config.model,
      imageModel: config.imageModel,
      baseUrl: config.baseUrl,
      hasApiKey: !!config.apiKey,
    });

    this.config = config;
    this.provider = createProvider(config);
    this.cachedModels = null;

    // Test connection
    const result = await this.provider.testConnection();
    if (!result.success) {
      debugLogger.error(LogCategory.AI_PROVIDER, '✗ Provider connection test failed', {
        provider: config.provider,
        error: result.error,
      });
    } else {
      debugLogger.info(LogCategory.AI_PROVIDER, '✓ Provider connection test passed', {
        provider: config.provider,
      });
    }

    return result;
  }

  /**
   * Generate text
   */
  async generateText(prompt, options = {}) {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }
    return this.provider.generateText(prompt, options);
  }

  /**
   * Generate image
   */
  async generateImage(prompt, options = {}) {
    if (!this.provider) {
      throw new Error('Provider not initialized');
    }
    return this.provider.generateImage(prompt, options);
  }

  /**
   * Get available models
   */
  async getModels(forceRefresh = false) {
    if (!this.provider) {
      return [];
    }

    if (!forceRefresh && this.cachedModels) {
      return this.cachedModels;
    }

    try {
      this.cachedModels = await this.provider.getModels();
      return this.cachedModels;
    } catch (error) {
      console.error('[ProviderManager] Failed to get models:', error);
      return PROVIDER_CONFIGS[this.config.provider]?.models || [];
    }
  }

  /**
   * Get the current provider instance
   */
  getProvider() {
    return this.provider;
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return this.config;
  }

  /**
   * Check if initialized
   */
  isInitialized() {
    return this.provider !== null;
  }

  /**
   * Check if image generation is supported
   */
  supportsImageGen() {
    if (!this.config) return false;
    return PROVIDER_CONFIGS[this.config.provider]?.supportsImageGen || false;
  }
}

// Singleton instance
export const providerManager = new ProviderManager();

export default providerManager;
