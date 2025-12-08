/**
 * Campaign Manager UI Component
 *
 * React component for managing AI-generated campaigns:
 * - Create new campaigns
 * - Load saved campaigns
 * - Export campaigns to file
 * - Import campaigns from file
 * - Save current progress
 */

import React, { useState, useEffect, useRef } from 'react';
import campaignGenerator, { CAMPAIGN_TEMPLATES } from './CampaignGenerator';
import worldBuilder from './WorldBuilder';
import GameStorage from './GameStorage';
import { CampaignPackageBuilder, CampaignPackageLoader, downloadCampaignPackage } from './CampaignPackage';
import './CampaignManager.scss';

/**
 * Campaign Card component
 */
function CampaignCard({ campaign, onLoad, onExport, onDelete }) {
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  const handleDelete = () => {
    if (showConfirmDelete) {
      onDelete(campaign.id);
      setShowConfirmDelete(false);
    } else {
      setShowConfirmDelete(true);
      setTimeout(() => setShowConfirmDelete(false), 3000);
    }
  };

  return (
    <div className="campaign-card">
      <div className="campaign-card__header">
        <h3 className="campaign-card__title">{campaign.name}</h3>
        <span className="campaign-card__template">{campaign.template}</span>
      </div>
      <p className="campaign-card__description">{campaign.description}</p>
      <div className="campaign-card__meta">
        <span>Acts: {campaign.acts?.length || 0}</span>
        <span>Created: {formatDate(campaign.createdAt)}</span>
        {campaign.savedAt && <span>Saved: {formatDate(campaign.savedAt)}</span>}
      </div>
      <div className="campaign-card__actions">
        <button className="btn btn--primary" onClick={() => onLoad(campaign.id)}>
          Load
        </button>
        <button className="btn btn--secondary" onClick={() => onExport(campaign.id)}>
          Export
        </button>
        <button
          className={`btn btn--danger ${showConfirmDelete ? 'btn--confirm' : ''}`}
          onClick={handleDelete}
        >
          {showConfirmDelete ? 'Confirm?' : 'Delete'}
        </button>
      </div>
    </div>
  );
}

/**
 * Template Selection component
 */
function TemplateSelector({ onSelect, selectedTemplate }) {
  return (
    <div className="template-selector">
      <h3 className="template-selector__title">Choose Campaign Template</h3>
      <div className="template-selector__grid">
        {Object.entries(CAMPAIGN_TEMPLATES).map(([key, template]) => (
          <div
            key={key}
            className={`template-card ${selectedTemplate === key ? 'template-card--selected' : ''}`}
            onClick={() => onSelect(key)}
          >
            <h4 className="template-card__name">{template.name}</h4>
            <p className="template-card__description">{template.description}</p>
            <div className="template-card__stats">
              <span>{template.acts} Acts</span>
              <span>{template.levelsPerAct} Levels/Act</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Generation Progress component - Enhanced with detailed status
 */
function GenerationProgress({ stage, progress, details }) {
  const stages = [
    { name: 'Generating Campaign', description: 'AI is creating the story, acts, and quests' },
    { name: 'Building World', description: 'Creating dungeon layouts and locations' },
    { name: 'Creating Levels', description: 'Generating spawn areas and objectives' },
    { name: 'Finalizing', description: 'Saving campaign data' },
  ];
  const currentIndex = stages.findIndex(s => s.name === stage);

  // Format elapsed time
  const formatTime = (ms) => {
    if (!ms) return '0s';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

  return (
    <div className="generation-progress generation-progress--detailed">
      {/* Main status */}
      <div className="generation-progress__header">
        <div className="generation-progress__spinner"></div>
        <div className="generation-progress__title">
          <h3 className="generation-progress__stage">{stage}</h3>
          <p className="generation-progress__description">
            {stages[currentIndex]?.description || 'Processing...'}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="generation-progress__bar-container">
        <div className="generation-progress__bar">
          <div
            className="generation-progress__fill"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
        <span className="generation-progress__percent">{progress}%</span>
      </div>

      {/* Detailed status info */}
      {details && (
        <div className="generation-progress__details">
          {details.currentTask && (
            <div className="detail-row">
              <span className="detail-label">Current Task:</span>
              <span className="detail-value">{details.currentTask}</span>
            </div>
          )}
          {details.aiStatus && (
            <div className="detail-row detail-row--ai">
              <span className="detail-label">AI Status:</span>
              <span className={`detail-value ai-status--${details.aiStatus.status || 'idle'}`}>
                {details.aiStatus.status === 'calling' && '⏳ Calling AI...'}
                {details.aiStatus.status === 'streaming' && '📡 Receiving response...'}
                {details.aiStatus.status === 'complete' && '✅ Response received'}
                {details.aiStatus.status === 'retrying' && `🔄 Retrying (attempt ${details.aiStatus.attempt || 1})...`}
                {details.aiStatus.status === 'error' && `❌ Error: ${details.aiStatus.error || 'Unknown'}`}
                {!details.aiStatus.status && 'Ready'}
              </span>
            </div>
          )}
          {details.elapsed !== undefined && (
            <div className="detail-row">
              <span className="detail-label">Elapsed:</span>
              <span className="detail-value">{formatTime(details.elapsed)}</span>
            </div>
          )}
          {details.tokensUsed !== undefined && (
            <div className="detail-row">
              <span className="detail-label">Tokens Used:</span>
              <span className="detail-value">{details.tokensUsed.toLocaleString()}</span>
            </div>
          )}
          {details.message && (
            <div className="detail-row detail-row--message">
              <span className="detail-value">{details.message}</span>
            </div>
          )}
        </div>
      )}

      {/* Steps */}
      <div className="generation-progress__steps">
        {stages.map((s, i) => (
          <div
            key={s.name}
            className={`step ${i < currentIndex ? 'step--done' : ''} ${i === currentIndex ? 'step--active' : ''}`}
          >
            <span className="step__icon">
              {i < currentIndex ? '✓' : i === currentIndex ? '●' : '○'}
            </span>
            <span className="step__name">{s.name}</span>
          </div>
        ))}
      </div>

      {/* Recent log entries */}
      {details?.logs && details.logs.length > 0 && (
        <div className="generation-progress__logs">
          <h4>Build Log</h4>
          <div className="logs-scroll">
            {details.logs.slice(-8).map((log, i) => (
              <div key={i} className={`log-entry log-entry--${log.level || 'info'}`}>
                <span className="log-time">{formatTime(log.elapsed || 0)}</span>
                <span className="log-message">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Main Campaign Manager component
 */
export function CampaignManager({ onCampaignReady, onClose, filesystem }) {
  const [view, setView] = useState('list'); // 'list', 'create', 'generating'
  const [savedCampaigns, setSavedCampaigns] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState('CLASSIC');
  const [customOptions, setCustomOptions] = useState(() => ({
    name: '',
    customTheme: '',
  }));
  const [generationProgress, setGenerationProgress] = useState({ stage: '', progress: 0 });
  const [error, setError] = useState(null);
  const [storageStats, setStorageStats] = useState(null);
  const [mpqStatus, setMpqStatus] = useState({ loading: true, files: [] });
  const fileInputRef = useRef(null);

  // Version identifier for debugging
  const UI_VERSION = 'v2.1.0-dec2024';

  // Load saved campaigns on mount
  useEffect(() => {
    loadSavedCampaigns();
    loadStorageStats();
    detectMPQFiles();
  }, []);

  // Detect available MPQ files
  const detectMPQFiles = async () => {
    try {
      const files = [];

      // Check filesystem if available
      if (filesystem) {
        const fs = await filesystem;
        if (fs && fs.files) {
          for (const [name, data] of fs.files) {
            if (name.toLowerCase().endsWith('.mpq')) {
              files.push({
                name,
                size: data?.length || data?.byteLength || 0,
                type: name.toLowerCase() === 'spawn.mpq' ? 'base' : 'custom'
              });
            }
          }
        }
      }

      // Always show spawn.mpq as expected
      if (!files.find(f => f.name.toLowerCase() === 'spawn.mpq')) {
        files.unshift({
          name: 'spawn.mpq',
          size: 0,
          type: 'base',
          status: 'not-loaded'
        });
      }

      setMpqStatus({ loading: false, files });
      console.log('[CampaignManager] Detected MPQ files:', files);
    } catch (err) {
      console.error('[CampaignManager] MPQ detection error:', err);
      setMpqStatus({ loading: false, files: [], error: err.message });
    }
  };

  const loadSavedCampaigns = async () => {
    try {
      await GameStorage.init();
      const campaigns = await GameStorage.getSavedCampaigns();
      setSavedCampaigns(campaigns);
    } catch (err) {
      console.error('Failed to load campaigns:', err);
      setError('Failed to load saved campaigns');
    }
  };

  const loadStorageStats = async () => {
    try {
      const stats = await GameStorage.getStats();
      setStorageStats(stats);
    } catch (err) {
      console.error('Failed to load stats:', err);
    }
  };

  const handleCreateCampaign = async () => {
    setView('generating');
    setError(null);

    const startTime = Date.now();
    const logs = [];

    // Helper to add log and update progress
    const updateProgress = (stage, progress, details = {}) => {
      const elapsed = Date.now() - startTime;
      if (details.message) {
        logs.push({ level: details.level || 'info', message: details.message, elapsed });
      }
      setGenerationProgress({
        stage,
        progress,
        details: {
          ...details,
          elapsed,
          logs: [...logs],
        },
      });
    };

    try {
      // Stage 1: Generate campaign with AI
      updateProgress('Generating Campaign', 5, {
        message: 'Starting campaign generation...',
        currentTask: 'Initializing AI provider',
        aiStatus: { status: 'calling' },
      });

      const options = {
        seed: Date.now(),
        customTheme: customOptions.customTheme || undefined,
      };

      updateProgress('Generating Campaign', 10, {
        message: `Using template: ${selectedTemplate}`,
        currentTask: 'Requesting campaign structure from AI',
        aiStatus: { status: 'calling' },
      });

      // This is where the AI call happens
      const campaign = await campaignGenerator.generateCampaign(selectedTemplate, options);

      if (customOptions.name) {
        campaign.name = customOptions.name;
      }

      updateProgress('Generating Campaign', 35, {
        message: `Campaign "${campaign.name}" generated with ${campaign.acts?.length || 0} acts`,
        currentTask: 'Campaign structure complete',
        aiStatus: { status: 'complete' },
        level: 'success',
      });

      // Stage 2: Build world
      updateProgress('Building World', 40, {
        message: 'Building world from campaign data...',
        currentTask: 'Creating dungeon layouts',
      });

      const world = await worldBuilder.buildWorld(campaign);

      updateProgress('Building World', 60, {
        message: `World built with ${Object.keys(world?.levels || {}).length} levels`,
        currentTask: 'World generation complete',
        level: 'success',
      });

      // Stage 3: Create campaign package with DUN files
      updateProgress('Creating Levels', 70, {
        message: 'Generating DUN files for all levels...',
        currentTask: 'Building campaign package',
      });

      // Build the campaign package with proper DUN files
      const packageBuilder = new CampaignPackageBuilder();
      const packageBlob = await packageBuilder.build(campaign, world);
      const packageResults = packageBuilder.getResults();

      updateProgress('Creating Levels', 85, {
        message: `Package created with ${packageResults.dunCount} DUN files`,
        currentTask: packageResults.errors.length > 0 ?
          `Completed with ${packageResults.errors.length} errors` : 'Package complete',
        level: packageResults.errors.length > 0 ? 'warning' : 'success',
      });

      // Log any warnings
      if (packageResults.warnings.length > 0) {
        console.warn('[CampaignManager] Package warnings:', packageResults.warnings);
      }

      // Stage 4: Save to storage
      updateProgress('Finalizing', 90, {
        message: 'Saving campaign to storage...',
        currentTask: 'Writing to IndexedDB',
      });

      await GameStorage.saveGameState(campaign, world.export(), campaignGenerator.getProgress());

      // Also download the campaign package for the user
      updateProgress('Finalizing', 95, {
        message: 'Downloading campaign package...',
        currentTask: 'Creating .dcpk file',
      });

      // Trigger package download
      const safeName = (campaign?.name || 'campaign').replace(/[^a-zA-Z0-9]/g, '_');
      const filename = `${safeName}-${Date.now()}.dcpk`;
      const url = URL.createObjectURL(packageBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      updateProgress('Finalizing', 100, {
        message: `Campaign saved! Package: ${filename}`,
        currentTask: 'Complete',
        level: 'success',
      });

      // Notify parent after brief delay to show 100%
      setTimeout(() => {
        onCampaignReady({
          campaign,
          world,
          progress: campaignGenerator.getProgress(),
        });
      }, 500);

    } catch (err) {
      console.error('Campaign generation failed:', err);
      updateProgress(generationProgress.stage, generationProgress.progress, {
        message: `Error: ${err.message}`,
        aiStatus: { status: 'error', error: err.message },
        level: 'error',
      });
      setError(`Failed to generate campaign: ${err.message}`);
      setTimeout(() => setView('create'), 2000);
    }
  };

  const handleLoadCampaign = async (campaignId) => {
    setError(null);

    try {
      const gameState = await GameStorage.loadGameState(campaignId);

      if (!gameState) {
        throw new Error('Campaign not found');
      }

      // Restore campaign generator state
      campaignGenerator.import({
        campaign: gameState.campaign,
        progress: gameState.progress,
        version: 1,
      });

      // Restore world builder state
      if (gameState.world) {
        worldBuilder.import(gameState.world);
      }

      onCampaignReady({
        campaign: gameState.campaign,
        world: worldBuilder.getWorld(),
        progress: gameState.progress,
      });

    } catch (err) {
      console.error('Failed to load campaign:', err);
      setError(`Failed to load campaign: ${err.message}`);
    }
  };

  const handleExportCampaign = async (campaignId) => {
    try {
      // Load the campaign and world data
      const gameState = await GameStorage.loadGameState(campaignId);
      if (!gameState) {
        throw new Error('Campaign not found');
      }

      // Restore world builder state to get proper world object
      if (gameState.world) {
        worldBuilder.import(gameState.world);
      }

      // Build and download campaign package
      const results = await downloadCampaignPackage(
        gameState.campaign,
        worldBuilder.getWorld()
      );

      console.log('[CampaignManager] Export complete:', results);
    } catch (err) {
      console.error('Export failed:', err);
      setError(`Export failed: ${err.message}`);
    }
  };

  const handleDeleteCampaign = async (campaignId) => {
    try {
      await GameStorage.campaigns.delete(campaignId);
      await loadSavedCampaigns();
      await loadStorageStats();
    } catch (err) {
      console.error('Delete failed:', err);
      setError(`Delete failed: ${err.message}`);
    }
  };

  const handleImportClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setError(null);

      // Check if it's a .dcpk file
      if (file.name.endsWith('.dcpk')) {
        // Load campaign package
        const loader = new CampaignPackageLoader();
        const packageData = await loader.load(file);

        // Save to GameStorage
        const campaign = packageData.campaign;
        if (!campaign) {
          throw new Error('Invalid campaign package: missing campaign data');
        }

        // Import world data if available
        if (packageData.world) {
          worldBuilder.import(packageData.world);
        }

        // Save to storage
        await GameStorage.saveGameState(
          campaign,
          packageData.world,
          { completed: true }
        );

        await loadSavedCampaigns();
        await loadStorageStats();

        // Reset file input
        event.target.value = '';

        // Show success message with DUN file count
        const dunCount = packageData.dunFiles?.size || 0;
        alert(`Campaign "${campaign.name}" imported successfully!\nIncludes ${dunCount} DUN level files.`);
      } else {
        // Legacy JSON import
        const campaign = await GameStorage.importer.importFromFile(file);
        await loadSavedCampaigns();
        await loadStorageStats();

        // Reset file input
        event.target.value = '';

        // Show success message
        alert(`Campaign "${campaign.name}" imported successfully!`);
      }
    } catch (err) {
      console.error('Import failed:', err);
      setError(`Import failed: ${err.message}`);
    }
  };

  // Format file size
  const formatSize = (bytes) => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="campaign-manager">
      <div className="campaign-manager__header">
        <h2>Campaign Manager</h2>
        <span className="campaign-manager__version">{UI_VERSION}</span>
        {onClose && (
          <button className="btn btn--close" onClick={onClose}>
            &times;
          </button>
        )}
      </div>

      {/* MPQ Status Section - NEW */}
      <div className="campaign-manager__mpq-status">
        <h4>MPQ Files Status</h4>
        {mpqStatus.loading ? (
          <span className="mpq-loading">Detecting MPQ files...</span>
        ) : mpqStatus.error ? (
          <span className="mpq-error">Error: {mpqStatus.error}</span>
        ) : (
          <div className="mpq-files-list">
            {mpqStatus.files.map((file, i) => (
              <div key={i} className={`mpq-file mpq-file--${file.type} ${file.status === 'not-loaded' ? 'mpq-file--missing' : ''}`}>
                <span className="mpq-file__icon">{file.type === 'base' ? '📦' : '🎮'}</span>
                <span className="mpq-file__name">{file.name}</span>
                <span className="mpq-file__size">{formatSize(file.size)}</span>
                <span className={`mpq-file__status ${file.size > 0 ? 'status--ready' : 'status--waiting'}`}>
                  {file.size > 0 ? '✓ Ready' : '⏳ Waiting'}
                </span>
              </div>
            ))}
            {mpqStatus.files.length === 0 && (
              <span className="mpq-none">No MPQ files detected</span>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="campaign-manager__error">
          {error}
          <button onClick={() => setError(null)}>&times;</button>
        </div>
      )}

      {view === 'generating' ? (
        <GenerationProgress
          stage={generationProgress.stage}
          progress={generationProgress.progress}
          details={generationProgress.details}
        />
      ) : (
        <>
          <div className="campaign-manager__tabs">
            <button
              className={`tab ${view === 'list' ? 'tab--active' : ''}`}
              onClick={() => setView('list')}
            >
              Saved Campaigns ({savedCampaigns.length})
            </button>
            <button
              className={`tab ${view === 'create' ? 'tab--active' : ''}`}
              onClick={() => setView('create')}
            >
              Create New
            </button>
          </div>

          {view === 'list' && (
            <div className="campaign-manager__list">
              <div className="campaign-manager__actions">
                <button className="btn btn--secondary" onClick={handleImportClick}>
                  Import Campaign
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,.json.gz,.dcpk"
                  style={{ display: 'none' }}
                  onChange={handleFileImport}
                />
              </div>

              {savedCampaigns.length === 0 ? (
                <div className="campaign-manager__empty">
                  <p>No saved campaigns yet.</p>
                  <p>Create a new campaign or import one to get started!</p>
                </div>
              ) : (
                <div className="campaign-manager__grid">
                  {savedCampaigns.map(campaign => (
                    <CampaignCard
                      key={campaign.id}
                      campaign={campaign}
                      onLoad={handleLoadCampaign}
                      onExport={handleExportCampaign}
                      onDelete={handleDeleteCampaign}
                    />
                  ))}
                </div>
              )}

              {storageStats && (
                <div className="campaign-manager__stats">
                  <span>{storageStats.campaignCount} campaigns</span>
                  <span>{storageStats.assetCount} assets</span>
                  <span>~{storageStats.estimatedSizeMB} MB used</span>
                </div>
              )}
            </div>
          )}

          {view === 'create' && (
            <div className="campaign-manager__create">
              <TemplateSelector
                onSelect={setSelectedTemplate}
                selectedTemplate={selectedTemplate}
              />

              <div className="campaign-manager__options">
                <h3>Campaign Options</h3>

                <div className="form-group">
                  <label htmlFor="campaignName">Campaign Name (optional)</label>
                  <input
                    id="campaignName"
                    type="text"
                    placeholder="Leave blank for auto-generated name"
                    value={customOptions?.name || ''}
                    onChange={(e) => {
                      const value = e?.target?.value ?? '';
                      setCustomOptions(prev => ({ ...(prev || {}), name: value }));
                    }}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="customTheme">Custom Theme (optional)</label>
                  <input
                    id="customTheme"
                    type="text"
                    placeholder="e.g., 'Ancient Egyptian tombs' or 'Frozen nordic dungeons'"
                    value={customOptions?.customTheme || ''}
                    onChange={(e) => {
                      const value = e?.target?.value ?? '';
                      setCustomOptions(prev => ({ ...(prev || {}), customTheme: value }));
                    }}
                  />
                  <small>Add a custom theme to influence the AI generation</small>
                </div>
              </div>

              <div className="campaign-manager__create-actions">
                <button
                  className="btn btn--primary btn--large"
                  onClick={handleCreateCampaign}
                >
                  Generate Campaign
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Save Game Button component
 */
export function SaveGameButton({ campaign, world, progress, disabled }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const handleSave = async () => {
    if (saving || !campaign) return;

    setSaving(true);
    try {
      await GameStorage.saveGameState(
        campaign,
        world?.export?.() || world,
        progress
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Save failed:', err);
      alert('Failed to save game: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      className={`save-game-btn ${saving ? 'saving' : ''} ${saved ? 'saved' : ''}`}
      onClick={handleSave}
      disabled={disabled || saving || !campaign}
    >
      {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Game'}
    </button>
  );
}

/**
 * Quick Export Button component
 */
export function QuickExportButton({ campaignId, disabled }) {
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (exporting || !campaignId) return;

    setExporting(true);
    try {
      await GameStorage.exporter.exportToFile(campaignId);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Failed to export: ' + err.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <button
      className={`export-btn ${exporting ? 'exporting' : ''}`}
      onClick={handleExport}
      disabled={disabled || exporting || !campaignId}
    >
      {exporting ? 'Exporting...' : 'Export'}
    </button>
  );
}

export default CampaignManager;
