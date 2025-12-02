/**
 * Character Creator Component
 *
 * UI for creating custom AI-generated characters/monsters:
 * - Description input
 * - Size/type selection
 * - Preview generation
 * - Save to campaign
 */

import React, { useState, useRef, useEffect } from 'react';
import assetPipeline, { SPRITE_SPECS, ImageResizer } from './AssetPipeline';
import { AssetStorage } from './GameStorage';
import { providerManager } from './providers';
import './CharacterCreator.scss';

/**
 * Character type presets
 */
const CHARACTER_PRESETS = {
  DEMON: {
    name: 'Demon',
    description: 'Demonic creature with horns and claws, dark red skin, fiery eyes',
    style: 'menacing, evil, hellish',
  },
  UNDEAD: {
    name: 'Undead',
    description: 'Skeletal warrior or zombie, decayed flesh, hollow eyes',
    style: 'rotting, skeletal, haunting',
  },
  BEAST: {
    name: 'Beast',
    description: 'Monstrous animal hybrid, fangs and claws, feral appearance',
    style: 'savage, primal, dangerous',
  },
  CORRUPTED: {
    name: 'Corrupted',
    description: 'Once-human creature twisted by dark magic, glowing markings',
    style: 'twisted, magical, tragic',
  },
  ELEMENTAL: {
    name: 'Elemental',
    description: 'Being of pure elemental energy, fire, ice, or lightning',
    style: 'ethereal, powerful, mystical',
  },
  CUSTOM: {
    name: 'Custom',
    description: '',
    style: '',
  },
};

/**
 * Size options with descriptions
 */
const SIZE_OPTIONS = [
  { key: 'MONSTER_SMALL', label: 'Small', description: '32x32 pixels (imps, rats)' },
  { key: 'MONSTER_MEDIUM', label: 'Medium', description: '64x64 pixels (standard enemies)' },
  { key: 'MONSTER_LARGE', label: 'Large', description: '128x128 pixels (bosses, large demons)' },
];

/**
 * Preview component for generated sprites
 */
function SpritePreview({ imageData, frameWidth, frameHeight, animate }) {
  const canvasRef = useRef(null);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!imageData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Calculate frame position
    const cols = Math.floor(imageData.width / frameWidth);
    const col = frame % cols;
    const row = Math.floor(frame / cols);

    // Clear and draw frame
    ctx.clearRect(0, 0, frameWidth, frameHeight);

    // Create temp canvas with full image
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = imageData.width;
    tempCanvas.height = imageData.height;
    tempCanvas.getContext('2d').putImageData(imageData, 0, 0);

    // Draw single frame
    ctx.drawImage(
      tempCanvas,
      col * frameWidth, row * frameHeight,
      frameWidth, frameHeight,
      0, 0,
      frameWidth, frameHeight
    );
  }, [imageData, frame, frameWidth, frameHeight]);

  // Animation loop
  useEffect(() => {
    if (!animate || !imageData) return;

    const totalFrames = Math.floor((imageData.width / frameWidth) * (imageData.height / frameHeight));
    const interval = setInterval(() => {
      setFrame(f => (f + 1) % totalFrames);
    }, 200);

    return () => clearInterval(interval);
  }, [animate, imageData, frameWidth, frameHeight]);

  if (!imageData) {
    return (
      <div className="sprite-preview sprite-preview--empty">
        <span>No preview</span>
      </div>
    );
  }

  return (
    <div className="sprite-preview">
      <canvas
        ref={canvasRef}
        width={frameWidth}
        height={frameHeight}
        style={{ imageRendering: 'pixelated' }}
      />
      <div className="sprite-preview__info">
        Frame {frame + 1}
      </div>
    </div>
  );
}

/**
 * Main Character Creator component
 */
export function CharacterCreator({ onSave, onClose, campaignId = null }) {
  const [preset, setPreset] = useState('DEMON');
  const [name, setName] = useState('');
  const [description, setDescription] = useState(CHARACTER_PRESETS.DEMON.description);
  const [style, setStyle] = useState(CHARACTER_PRESETS.DEMON.style);
  const [size, setSize] = useState('MONSTER_MEDIUM');
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [animate, setAnimate] = useState(true);
  const [savedCharacters, setSavedCharacters] = useState([]);

  // Load saved characters on mount
  useEffect(() => {
    loadSavedCharacters();
  }, []);

  const loadSavedCharacters = async () => {
    try {
      const assets = await AssetStorage.loadByType('character');
      setSavedCharacters(assets || []);
    } catch (err) {
      console.error('Failed to load saved characters:', err);
    }
  };

  const handlePresetChange = (presetKey) => {
    setPreset(presetKey);
    const p = CHARACTER_PRESETS[presetKey];
    if (p && presetKey !== 'CUSTOM') {
      setDescription(p.description);
      setStyle(p.style);
    }
  };

  const handleGenerate = async () => {
    if (!description.trim()) {
      setError('Please enter a character description');
      return;
    }

    setGenerating(true);
    setError(null);
    setProgress('Preparing generation...');

    try {
      const spec = SPRITE_SPECS[size];
      const characterName = name.trim() || `${preset} Character`;

      // Check if we have an AI provider for image generation
      const provider = providerManager.getProvider();
      const hasImageGen = provider?.generateImage;

      if (!hasImageGen) {
        setProgress('Generating placeholder sprite (no image AI configured)...');
      } else {
        setProgress('Generating sprite with AI...');
      }

      // Generate the character sprite
      const result = await assetPipeline.generateCharacterSprite({
        name: characterName,
        description: `${description}, ${style}`,
        size,
        background: 'transparent dark fantasy dungeon',
        style: 'pixel art sprite sheet, dark gothic',
      });

      if (result) {
        // Convert frames back to displayable ImageData
        // For preview, we'll use the mock generator to create a visible preview
        const { MockAssetGenerator } = await import('./AssetPipeline');
        const previewData = MockAssetGenerator.generateAnimatedSprite(
          description,
          spec,
          4
        );

        setPreview({
          imageData: previewData,
          frameWidth: spec.frameWidth,
          frameHeight: spec.frameHeight,
          asset: result,
        });

        setProgress('Generation complete!');
      } else {
        throw new Error('Generation returned no result');
      }
    } catch (err) {
      console.error('Character generation failed:', err);
      setError(`Generation failed: ${err.message}`);
      setProgress('');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!preview?.asset) {
      setError('Generate a character first');
      return;
    }

    try {
      const characterData = {
        ...preview.asset,
        type: 'character',
        preset,
        userDescription: description,
        userStyle: style,
      };

      await AssetStorage.save(characterData, campaignId);
      await loadSavedCharacters();

      if (onSave) {
        onSave(characterData);
      }

      // Reset form
      setPreview(null);
      setName('');
      setProgress('Character saved!');
      setTimeout(() => setProgress(''), 2000);
    } catch (err) {
      console.error('Failed to save character:', err);
      setError(`Failed to save: ${err.message}`);
    }
  };

  const handleDeleteCharacter = async (characterId) => {
    try {
      await AssetStorage.delete(characterId);
      await loadSavedCharacters();
    } catch (err) {
      console.error('Failed to delete character:', err);
    }
  };

  return (
    <div className="character-creator">
      <div className="character-creator__header">
        <h2>Character Creator</h2>
        {onClose && (
          <button className="btn btn--close" onClick={onClose}>&times;</button>
        )}
      </div>

      {error && (
        <div className="character-creator__error">
          {error}
          <button onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      <div className="character-creator__content">
        <div className="character-creator__form">
          {/* Preset Selection */}
          <div className="form-section">
            <h3>Character Type</h3>
            <div className="preset-grid">
              {Object.entries(CHARACTER_PRESETS).map(([key, p]) => (
                <button
                  key={key}
                  className={`preset-btn ${preset === key ? 'preset-btn--active' : ''}`}
                  onClick={() => handlePresetChange(key)}
                >
                  {p.name}
                </button>
              ))}
            </div>
          </div>

          {/* Name Input */}
          <div className="form-section">
            <label htmlFor="charName">Name (optional)</label>
            <input
              id="charName"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Shadow Fiend"
            />
          </div>

          {/* Description Input */}
          <div className="form-section">
            <label htmlFor="charDesc">Description</label>
            <textarea
              id="charDesc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the character's appearance..."
              rows={3}
            />
          </div>

          {/* Style Input */}
          <div className="form-section">
            <label htmlFor="charStyle">Style Keywords</label>
            <input
              id="charStyle"
              type="text"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="e.g., menacing, glowing, armored"
            />
          </div>

          {/* Size Selection */}
          <div className="form-section">
            <h3>Size</h3>
            <div className="size-options">
              {SIZE_OPTIONS.map((opt) => (
                <label key={opt.key} className="size-option">
                  <input
                    type="radio"
                    name="size"
                    value={opt.key}
                    checked={size === opt.key}
                    onChange={() => setSize(opt.key)}
                  />
                  <span className="size-option__label">{opt.label}</span>
                  <span className="size-option__desc">{opt.description}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Generate Button */}
          <div className="form-section">
            <button
              className="btn btn--primary btn--large"
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? 'Generating...' : 'Generate Character'}
            </button>
            {progress && <div className="progress-text">{progress}</div>}
          </div>
        </div>

        {/* Preview Panel */}
        <div className="character-creator__preview">
          <h3>Preview</h3>
          <SpritePreview
            imageData={preview?.imageData}
            frameWidth={preview?.frameWidth || 64}
            frameHeight={preview?.frameHeight || 64}
            animate={animate}
          />
          {preview && (
            <div className="preview-controls">
              <label>
                <input
                  type="checkbox"
                  checked={animate}
                  onChange={(e) => setAnimate(e.target.checked)}
                />
                Animate
              </label>
              <button className="btn btn--primary" onClick={handleSave}>
                Save Character
              </button>
            </div>
          )}

          {/* Saved Characters */}
          {savedCharacters.length > 0 && (
            <div className="saved-characters">
              <h4>Saved Characters ({savedCharacters.length})</h4>
              <div className="saved-characters__list">
                {savedCharacters.map((char) => (
                  <div key={char.id} className="saved-character">
                    <span className="saved-character__name">{char.name}</span>
                    <button
                      className="btn btn--small btn--danger"
                      onClick={() => handleDeleteCharacter(char.id)}
                    >
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CharacterCreator;
