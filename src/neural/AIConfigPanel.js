/**
 * AI Configuration Panel
 *
 * UI component for configuring AI providers in Diablo Web.
 * Displays on first launch or when accessed via settings.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { providerManager, PROVIDERS, PROVIDER_CONFIGS } from './providers';

// Storage key for configuration
const STORAGE_KEY = 'diabloweb_ai_config';

/**
 * Load saved configuration from localStorage
 */
export function loadSavedConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (error) {
    console.warn('[AIConfig] Failed to load saved config:', error);
  }
  return null;
}

/**
 * Save configuration to localStorage
 */
export function saveConfig(config) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    return true;
  } catch (error) {
    console.error('[AIConfig] Failed to save config:', error);
    return false;
  }
}

/**
 * Check if configuration is needed
 */
export function needsConfiguration() {
  const config = loadSavedConfig();
  return !config || !config.provider;
}

/**
 * AI Configuration Panel Component
 */
export function AIConfigPanel({ onComplete, onSkip, initialConfig = null }) {
  const [provider, setProvider] = useState(initialConfig?.provider || '');
  const [apiKey, setApiKey] = useState(initialConfig?.apiKey || '');
  const [model, setModel] = useState(initialConfig?.model || '');
  const [imageModel, setImageModel] = useState(initialConfig?.imageModel || '');
  const [localEndpoint, setLocalEndpoint] = useState(initialConfig?.baseUrl || 'http://localhost:11434');
  const [models, setModels] = useState([]);
  const [imageModels, setImageModels] = useState([]);
  const [customImageModel, setCustomImageModel] = useState('');
  const [useCustomImageModel, setUseCustomImageModel] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingImageModels, setLoadingImageModels] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [error, setError] = useState(null);

  // Feature toggles
  const [features, setFeatures] = useState({
    levelGeneration: initialConfig?.features?.levelGeneration ?? true,
    narrative: initialConfig?.features?.narrative ?? true,
    commanderAI: initialConfig?.features?.commanderAI ?? true,
    assetGeneration: initialConfig?.features?.assetGeneration ?? false,
  });

  // Load models when provider changes
  const loadModels = useCallback(async () => {
    if (!provider) {
      setModels([]);
      setImageModels([]);
      return;
    }

    const config = PROVIDER_CONFIGS[provider];
    if (!config) return;

    // For providers with static model lists
    if (config.models) {
      setModels(config.models);
    }
    if (config.imageModels) {
      setImageModels(config.imageModels);
    }

    // For OpenRouter, fetch dynamic model list
    if (provider === PROVIDERS.OPENROUTER && apiKey) {
      setLoading(true);
      setLoadingImageModels(true);
      try {
        // Initialize provider if needed
        let tempProvider = providerManager.provider;
        if (!tempProvider || providerManager.getConfig()?.provider !== provider) {
          await providerManager.initialize({ provider, apiKey });
          tempProvider = providerManager.provider;
        }

        if (tempProvider) {
          // Fetch text models
          const fetchedModels = await tempProvider.getModels();
          setModels(fetchedModels);

          // Fetch image models using the dedicated method
          try {
            const fetchedImageModels = await tempProvider.getImageModels();
            if (fetchedImageModels && fetchedImageModels.length > 0) {
              setImageModels(fetchedImageModels);
            } else {
              // Fallback to known image models
              setImageModels(config.knownImageModels || []);
            }
          } catch (imgErr) {
            console.warn('[AIConfig] Failed to fetch image models, using fallback:', imgErr);
            setImageModels(config.knownImageModels || []);
          }
        }
      } catch (err) {
        console.error('[AIConfig] Failed to load models:', err);
        // Use fallback models on error
        setImageModels(config.knownImageModels || []);
      } finally {
        setLoading(false);
        setLoadingImageModels(false);
      }
    }

    // For local, try to fetch from Ollama
    if (provider === PROVIDERS.LOCAL) {
      setLoading(true);
      try {
        const response = await fetch(`${localEndpoint}/api/tags`);
        if (response.ok) {
          const data = await response.json();
          setModels(data.models?.map(m => ({ id: m.name, name: m.name })) || []);
        }
      } catch {
        setModels(config.models || []);
      } finally {
        setLoading(false);
      }
    }

    // Set default model if not set
    if (!model && config.defaultModel) {
      setModel(config.defaultModel);
    }
    if (!imageModel && config.defaultImageModel) {
      setImageModel(config.defaultImageModel);
    }
  }, [provider, apiKey, localEndpoint, model, imageModel]);

  useEffect(() => {
    loadModels();
  }, [provider, loadModels]);

  // Test connection
  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    setError(null);

    try {
      const config = {
        provider,
        apiKey: provider !== PROVIDERS.LOCAL ? apiKey : undefined,
        baseUrl: provider === PROVIDERS.LOCAL ? localEndpoint : undefined,
        model,
        imageModel,
      };

      const result = await providerManager.initialize(config);
      setTestResult(result);

      if (!result.success) {
        setError(result.error);
      }
    } catch (err) {
      setTestResult({ success: false });
      setError(err.message);
    } finally {
      setTesting(false);
    }
  };

  // Save and complete
  const handleSave = () => {
    // Use custom image model if specified, otherwise use selected
    const finalImageModel = useCustomImageModel && customImageModel
      ? customImageModel
      : imageModel;

    const config = {
      provider,
      apiKey: provider !== PROVIDERS.LOCAL ? apiKey : undefined,
      baseUrl: provider === PROVIDERS.LOCAL ? localEndpoint : undefined,
      model,
      imageModel: features.assetGeneration ? finalImageModel : undefined,
      features,
      savedAt: Date.now(),
    };

    saveConfig(config);

    if (onComplete) {
      onComplete(config);
    }
  };

  // Skip configuration
  const handleSkip = () => {
    const config = {
      provider: null,
      features: {
        levelGeneration: true,
        narrative: true,
        commanderAI: true,
        assetGeneration: false,
      },
      mockMode: true,
      savedAt: Date.now(),
    };

    saveConfig(config);

    if (onSkip) {
      onSkip();
    }
  };

  const providerConfig = PROVIDER_CONFIGS[provider];
  const canSave = provider && (provider === PROVIDERS.LOCAL || apiKey);

  return (
    <div className="ai-config-panel">
      <div className="ai-config-header">
        <h2>AI Configuration</h2>
        <p className="ai-config-subtitle">
          Configure AI features for enhanced gameplay. Everything runs locally in your browser -
          you just need an API key for AI-powered content generation.
        </p>
      </div>

      <div className="ai-config-section">
        <label className="ai-config-label">AI Provider</label>
        <div className="ai-config-providers">
          {Object.entries(PROVIDER_CONFIGS).map(([key, config]) => (
            <button
              key={key}
              className={`ai-provider-btn ${provider === key ? 'active' : ''}`}
              onClick={() => {
                setProvider(key);
                setApiKey('');
                setModel('');
                setImageModel('');
                setTestResult(null);
                setError(null);
              }}
            >
              <span className="provider-name">{config.name}</span>
              <span className="provider-desc">{config.description}</span>
            </button>
          ))}
        </div>
      </div>

      {provider && (
        <>
          {provider !== PROVIDERS.LOCAL ? (
            <div className="ai-config-section">
              <label className="ai-config-label">
                API Key
                {providerConfig?.keyPrefix && (
                  <span className="key-hint">Starts with: {providerConfig.keyPrefix}...</span>
                )}
              </label>
              <input
                type="password"
                className="ai-config-input"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={`Enter your ${providerConfig?.name} API key`}
              />
              {provider === PROVIDERS.OPENROUTER && (
                <p className="ai-config-hint">
                  Get your key at <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">openrouter.ai/keys</a>
                </p>
              )}
              {provider === PROVIDERS.OPENAI && (
                <p className="ai-config-hint">
                  Get your key at <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">platform.openai.com/api-keys</a>
                </p>
              )}
              {provider === PROVIDERS.GEMINI && (
                <p className="ai-config-hint">
                  Get your key at <a href="https://makersuite.google.com/app/apikey" target="_blank" rel="noopener noreferrer">makersuite.google.com</a>
                </p>
              )}
              {provider === PROVIDERS.ANTHROPIC && (
                <p className="ai-config-hint">
                  Get your key at <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer">console.anthropic.com</a>
                </p>
              )}
            </div>
          ) : (
            <div className="ai-config-section">
              <label className="ai-config-label">Local Server Endpoint</label>
              <input
                type="text"
                className="ai-config-input"
                value={localEndpoint}
                onChange={(e) => setLocalEndpoint(e.target.value)}
                placeholder="http://localhost:11434"
              />
              <p className="ai-config-hint">
                Make sure <a href="https://ollama.ai" target="_blank" rel="noopener noreferrer">Ollama</a> is running on your machine.
              </p>
            </div>
          )}

          <div className="ai-config-section">
            <label className="ai-config-label">Text Model</label>
            <select
              className="ai-config-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={loading}
            >
              <option value="">Select a model...</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.context ? `(${Math.round(m.context / 1000)}k context)` : ''}
                </option>
              ))}
            </select>
            {loading && <span className="loading-indicator">Loading models...</span>}
          </div>

          {providerConfig?.supportsImageGen && features.assetGeneration && (
            <div className="ai-config-section">
              <label className="ai-config-label">
                Image Model
                {loadingImageModels && <span className="loading-indicator"> Loading...</span>}
              </label>

              {!useCustomImageModel ? (
                <>
                  <select
                    className="ai-config-select"
                    value={imageModel}
                    onChange={(e) => setImageModel(e.target.value)}
                    disabled={loadingImageModels}
                  >
                    <option value="">Select an image model...</option>
                    {imageModels.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                  {imageModels.length === 0 && !loadingImageModels && (
                    <p className="ai-config-hint">
                      No image models found. Try entering the API key first or use custom input.
                    </p>
                  )}
                </>
              ) : (
                <input
                  type="text"
                  className="ai-config-input"
                  value={customImageModel}
                  onChange={(e) => setCustomImageModel(e.target.value)}
                  placeholder="e.g., google/gemini-2.5-flash-image-preview"
                />
              )}

              <label className="feature-toggle" style={{ marginTop: '8px' }}>
                <input
                  type="checkbox"
                  checked={useCustomImageModel}
                  onChange={(e) => setUseCustomImageModel(e.target.checked)}
                />
                <span>Enter custom model ID</span>
              </label>

              {provider === PROVIDERS.OPENROUTER && (
                <p className="ai-config-hint">
                  Popular image models: <code>google/gemini-2.5-flash-image-preview</code>,{' '}
                  <code>black-forest-labs/flux-1.1-pro</code>
                </p>
              )}
            </div>
          )}

          <div className="ai-config-section">
            <label className="ai-config-label">AI Features</label>
            <div className="ai-config-features">
              <label className="feature-toggle">
                <input
                  type="checkbox"
                  checked={features.levelGeneration}
                  onChange={(e) => setFeatures({ ...features, levelGeneration: e.target.checked })}
                />
                <span>AI Dungeon Generation</span>
                <span className="feature-desc">Unique procedural layouts</span>
              </label>
              <label className="feature-toggle">
                <input
                  type="checkbox"
                  checked={features.narrative}
                  onChange={(e) => setFeatures({ ...features, narrative: e.target.checked })}
                />
                <span>Dynamic Dialogue</span>
                <span className="feature-desc">Context-aware NPC conversations</span>
              </label>
              <label className="feature-toggle">
                <input
                  type="checkbox"
                  checked={features.commanderAI}
                  onChange={(e) => setFeatures({ ...features, commanderAI: e.target.checked })}
                />
                <span>Tactical Monster AI</span>
                <span className="feature-desc">Smart enemy coordination</span>
              </label>
              {providerConfig?.supportsImageGen && (
                <label className="feature-toggle">
                  <input
                    type="checkbox"
                    checked={features.assetGeneration}
                    onChange={(e) => setFeatures({ ...features, assetGeneration: e.target.checked })}
                  />
                  <span>AI Asset Generation</span>
                  <span className="feature-desc">Generate new monster sprites (experimental)</span>
                </label>
              )}
            </div>
          </div>

          <div className="ai-config-actions">
            <button
              className="btn-test"
              onClick={testConnection}
              disabled={!canSave || testing}
            >
              {testing ? 'Testing...' : 'Test Connection'}
            </button>

            {testResult && (
              <span className={`test-result ${testResult.success ? 'success' : 'error'}`}>
                {testResult.success ? 'Connection successful!' : 'Connection failed'}
              </span>
            )}
          </div>

          {error && (
            <div className="ai-config-error">
              {error}
            </div>
          )}
        </>
      )}

      <div className="ai-config-footer">
        <button
          className="btn-skip"
          onClick={handleSkip}
        >
          Skip - Use Mock Mode
        </button>
        <button
          className="btn-save"
          onClick={handleSave}
          disabled={!canSave}
        >
          Save Configuration
        </button>
      </div>

      <div className="ai-config-note">
        <p>
          <strong>Mock Mode:</strong> Without an API key, the game uses built-in procedural
          generation. AI features enhance the experience but aren't required to play.
        </p>
        <p>
          <strong>Privacy:</strong> All game logic runs in your browser. AI requests only
          send level/dialogue prompts - no personal data or gameplay is transmitted.
        </p>
      </div>
    </div>
  );
}

/**
 * Minimal settings button for in-game access
 */
export function AISettingsButton({ onClick }) {
  return (
    <button className="ai-settings-btn" onClick={onClick} title="AI Settings">
      AI
    </button>
  );
}

export default AIConfigPanel;
