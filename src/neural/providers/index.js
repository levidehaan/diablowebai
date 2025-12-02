/**
 * AI Provider System
 *
 * Unified interface for multiple AI providers including OpenRouter,
 * OpenAI, Google Gemini, Anthropic, and local models.
 */

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
    defaultImageModel: 'openai/dall-e-3',
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
    this.timeout = config.timeout || 30000;
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

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API error ${response.status}: ${error}`);
      }

      return response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * OpenRouter Provider
 */
class OpenRouterProvider extends BaseProvider {
  async generateText(prompt, options = {}) {
    const response = await this.request(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'HTTP-Referer': window.location.href,
        'X-Title': 'Diablo Web AI',
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
    // OpenRouter routes to various image models
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
    const response = await this.request(PROVIDER_CONFIGS.openrouter.modelsEndpoint, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
      },
    });

    return response.data
      .filter(m => m.context_length >= 4096)
      .map(m => ({
        id: m.id,
        name: m.name || m.id,
        context: m.context_length,
        pricing: m.pricing,
        description: m.description,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
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
    this.config = config;
    this.provider = createProvider(config);
    this.cachedModels = null;

    // Test connection
    const result = await this.provider.testConnection();
    if (!result.success) {
      console.warn('[ProviderManager] Connection test failed:', result.error);
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
