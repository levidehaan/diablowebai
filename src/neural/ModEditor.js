/**
 * Mod Editor UI Component
 *
 * Provides a visual interface for AI-driven MPQ modifications.
 * Shows real-time operation status, level previews, and modified files.
 */

import React, { Component } from 'react';
import './ModEditor.scss';
import './LevelPreview.scss';
import './CampaignBlueprintPanel.scss';
import { ModToolExecutor } from './ModTools';
import DUNParser from './DUNParser';
import { MPQWriter } from './MPQWriter';
import { MpqReader } from '../api/savefile';
import { LevelPreview, MiniMap } from './LevelPreview';
import { CampaignBlueprintPanel } from './CampaignBlueprintPanel';

// Operation status icons
const STATUS_ICONS = {
  pending: '○',
  running: '⟳',
  success: '✓',
  error: '✗',
};

/**
 * ModEditor - Main editing interface component
 */
export class ModEditor extends Component {
  constructor(props) {
    super(props);
    this.state = {
      // MPQ state
      mpqLoaded: false,
      mpqFileName: null,

      // Operations
      operations: [],
      currentOperation: null,

      // Preview
      previewPath: null,
      previewContent: null,
      previewStats: null,
      previewDunData: null,
      previewTheme: 'cathedral',
      previewMode: 'visual', // 'visual', 'ascii', 'both'
      showMonsters: true,
      showItems: true,

      // Modified files
      modifiedFiles: [],

      // Status
      status: 'idle', // idle, loading, working, ready, error
      error: null,
      progress: 0,

      // UI state
      showFileList: false,
      fileList: [],
      selectedFile: null,
    };

    this.executor = new ModToolExecutor();
    this.fileInputRef = React.createRef();
  }

  componentDidMount() {
    // Check if spawn.mpq is already loaded
    this.checkExistingMPQ();
  }

  /**
   * Handle close button
   */
  handleClose = () => {
    if (this.props.onClose) {
      this.props.onClose();
    }
  }

  /**
   * Start game with current modifications
   */
  handleStartModded = async () => {
    const modifiedFiles = this.executor.getModifiedFiles();

    if (modifiedFiles.length === 0) {
      alert('No modifications to play');
      return;
    }

    const opId = this.addOperation('startModded', { files: modifiedFiles.length }, 'running');
    this.setState({ status: 'working' });

    try {
      // Create MPQ writer with original buffer
      const writer = new MPQWriter(this.originalMpqBuffer);

      // Add all modified files
      for (const file of modifiedFiles) {
        writer.setFile(file.path, file.buffer);
      }

      // Build the modified MPQ
      const modifiedMpq = writer.build();

      this.updateOperation(opId, 'success');

      // Call parent callback to start modded game
      if (this.props.onStartModded) {
        await this.props.onStartModded(modifiedMpq);
      }
    } catch (error) {
      this.updateOperation(opId, 'error', error.message);
      this.setState({ status: 'ready', error: error.message });
      console.error('[ModEditor] Failed to start modded game:', error);
    }
  }

  /**
   * Check if spawn.mpq is already in the filesystem
   */
  async checkExistingMPQ() {
    try {
      const fs = this.props.filesystem;
      if (fs && fs.files) {
        const spawnMpq = fs.files.get('spawn.mpq');
        if (spawnMpq) {
          await this.loadMPQFromBuffer(spawnMpq.buffer || spawnMpq, 'spawn.mpq');
        }
      }
    } catch (error) {
      console.warn('[ModEditor] No existing spawn.mpq found');
    }
  }

  /**
   * Handle MPQ file upload
   */
  handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    this.setState({ status: 'loading', error: null });
    this.addOperation('loadMPQ', { file: file.name }, 'running');

    try {
      const buffer = await file.arrayBuffer();
      await this.loadMPQFromBuffer(buffer, file.name);
      this.updateOperation('loadMPQ', 'success');
    } catch (error) {
      this.updateOperation('loadMPQ', 'error', error.message);
      this.setState({ status: 'error', error: error.message });
    }
  };

  /**
   * Load MPQ from buffer
   */
  async loadMPQFromBuffer(buffer, fileName) {
    // Store original buffer for MPQ writing
    this.originalMpqBuffer = buffer;

    const mpqReader = new MpqReader(buffer);
    this.executor.setMPQ(mpqReader);

    // Get file list
    const fileList = mpqReader.listFiles();

    this.setState({
      mpqLoaded: true,
      mpqFileName: fileName,
      fileList,
      status: 'ready',
    });

    console.log(`[ModEditor] Loaded ${fileName} with ${fileList.length} files`);
  }

  /**
   * Add an operation to the log
   */
  addOperation(name, params, status = 'pending') {
    const operation = {
      id: Date.now(),
      name,
      params,
      status,
      startTime: Date.now(),
      endTime: null,
      error: null,
    };

    this.setState(state => ({
      operations: [...state.operations, operation],
      currentOperation: status === 'running' ? operation.id : state.currentOperation,
    }));

    return operation.id;
  }

  /**
   * Update an operation's status
   */
  updateOperation(id, status, error = null) {
    this.setState(state => ({
      operations: state.operations.map(op =>
        (op.id === id || op.name === id)
          ? { ...op, status, error, endTime: Date.now() }
          : op
      ),
      currentOperation: status === 'running' ? id :
        (state.currentOperation === id ? null : state.currentOperation),
    }));
  }

  /**
   * Execute a mod tool
   */
  executeModTool = async (toolName, params = {}) => {
    const opId = this.addOperation(toolName, params, 'running');
    this.setState({ status: 'working' });

    try {
      const result = await this.executor.executeTool(toolName, params);

      if (result.success) {
        this.updateOperation(opId, 'success');

        // Update modified files list
        const modifiedFiles = this.executor.getModifiedFiles();
        this.setState({
          modifiedFiles,
          status: 'ready',
        });

        // If there's a preview, show it
        if (result.preview) {
          this.setState({
            previewPath: params.path,
            previewContent: result.preview,
            previewStats: result.stats,
          });
        }

        return result;
      } else {
        this.updateOperation(opId, 'error', result.error);
        this.setState({ status: 'ready' });
        return result;
      }
    } catch (error) {
      this.updateOperation(opId, 'error', error.message);
      this.setState({ status: 'ready' });
      return { success: false, error: error.message };
    }
  };

  /**
   * Read and preview a level file
   */
  previewLevel = async (path) => {
    const result = await this.executeModTool('readLevel', { path });
    if (result.success) {
      // Determine theme from path
      let theme = 'cathedral';
      if (path.includes('l1data')) theme = 'cathedral';
      else if (path.includes('l2data')) theme = 'catacombs';
      else if (path.includes('l3data')) theme = 'caves';
      else if (path.includes('l4data')) theme = 'hell';

      // Parse DUN data for visual preview
      let dunData = null;
      try {
        // Check if we have the raw DUN data in executor
        const modifiedFile = this.executor.getModifiedFiles().find(f => f.path === path);
        if (modifiedFile) {
          dunData = DUNParser.parse(modifiedFile.buffer);
        } else if (this.executor.mpqReader) {
          const buffer = this.executor.mpqReader.readFile(path);
          if (buffer) {
            dunData = DUNParser.parse(buffer);
          }
        }
      } catch (e) {
        console.warn('[ModEditor] Could not parse DUN for visual preview:', e);
      }

      this.setState({
        previewPath: path,
        previewContent: result.preview,
        previewStats: result.stats,
        previewDunData: dunData,
        previewTheme: theme,
        selectedFile: path,
      });
    }
  };

  /**
   * Generate a new test level
   */
  generateTestLevel = async () => {
    const path = 'levels/l1data/ai_test.dun';
    const result = await this.executeModTool('generateLevel', {
      path,
      width: 16,
      height: 16,
      theme: 'cathedral',
    });

    if (result.success) {
      // Add some test monsters
      await this.executeModTool('placeMonsters', {
        path,
        spawns: [
          { x: 5, y: 5, type: 'skeleton' },
          { x: 10, y: 5, type: 'zombie' },
          { x: 5, y: 10, type: 'fallen' },
          { x: 10, y: 10, type: 'scavenger' },
        ],
      });
    }
  };

  /**
   * Export modified MPQ
   */
  exportMod = async () => {
    const modifiedFiles = this.executor.getModifiedFiles();

    if (modifiedFiles.length === 0) {
      alert('No modifications to export');
      return;
    }

    const opId = this.addOperation('export', { files: modifiedFiles.length }, 'running');
    this.setState({ status: 'working' });

    try {
      // Create MPQ writer with original buffer
      const writer = new MPQWriter(this.originalMpqBuffer);

      // Add all modified files
      for (const file of modifiedFiles) {
        writer.setFile(file.path, file.buffer);
      }

      // Build and download
      const timestamp = Date.now();
      const filename = `spawn_modded_${timestamp}.mpq`;
      writer.exportAsDownload(filename);

      this.updateOperation(opId, 'success');
      this.setState({ status: 'ready' });

      console.log(`[ModEditor] Exported ${modifiedFiles.length} modified files to ${filename}`);
    } catch (error) {
      this.updateOperation(opId, 'error', error.message);
      this.setState({ status: 'ready', error: error.message });
      console.error('[ModEditor] Export failed:', error);
    }
  };

  /**
   * Clear all modifications
   */
  clearModifications = () => {
    this.executor = new ModToolExecutor(this.executor.mpqReader);
    this.setState({
      modifiedFiles: [],
      operations: [],
      previewPath: null,
      previewContent: null,
      previewStats: null,
    });
  };

  /**
   * Toggle file list visibility
   */
  toggleFileList = () => {
    this.setState(state => ({ showFileList: !state.showFileList }));
  };

  render() {
    const {
      mpqLoaded,
      mpqFileName,
      operations,
      previewPath,
      previewContent,
      previewStats,
      previewDunData,
      previewTheme,
      previewMode,
      showMonsters,
      showItems,
      modifiedFiles,
      status,
      error,
      showFileList,
      fileList,
      selectedFile,
    } = this.state;

    return (
      <div className="mod-editor">
        <div className="mod-editor-header">
          <h2>AI Mod Editor</h2>
          <div className="mod-editor-status">
            <span className={`status-indicator ${status}`}>{status}</span>
            {mpqLoaded && <span className="mpq-name">{mpqFileName}</span>}
          </div>
          <div className="mod-editor-actions">
            <input
              ref={this.fileInputRef}
              type="file"
              accept=".mpq"
              onChange={this.handleFileUpload}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => this.fileInputRef.current.click()}
              className="btn btn-secondary"
            >
              Load MPQ
            </button>
            <button
              onClick={this.generateTestLevel}
              disabled={!mpqLoaded}
              className="btn btn-primary"
            >
              Generate Test Level
            </button>
            <button
              onClick={this.handleStartModded}
              disabled={modifiedFiles.length === 0}
              className="btn btn-play"
            >
              Play Modded ({modifiedFiles.length})
            </button>
            <button
              onClick={this.exportMod}
              disabled={modifiedFiles.length === 0}
              className="btn btn-success"
            >
              Export
            </button>
            <button
              onClick={this.handleClose}
              className="btn btn-close"
            >
              Close
            </button>
          </div>
        </div>

        {error && (
          <div className="mod-editor-error">
            {error}
          </div>
        )}

        <div className="mod-editor-content">
          {/* Operations Log */}
          <div className="mod-editor-panel operations-panel">
            <h3>Operations</h3>
            <div className="operations-list">
              {operations.length === 0 ? (
                <div className="empty-message">No operations yet</div>
              ) : (
                operations.map(op => (
                  <div key={op.id} className={`operation ${op.status}`}>
                    <span className="op-icon">{STATUS_ICONS[op.status]}</span>
                    <span className="op-name">{op.name}</span>
                    {op.params.path && (
                      <span className="op-path">{op.params.path}</span>
                    )}
                    {op.error && (
                      <span className="op-error">{op.error}</span>
                    )}
                    {op.endTime && (
                      <span className="op-time">
                        {op.endTime - op.startTime}ms
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
            {operations.length > 0 && (
              <button
                onClick={this.clearModifications}
                className="btn btn-small btn-danger"
              >
                Clear All
              </button>
            )}
          </div>

          {/* File Browser */}
          <div className="mod-editor-panel files-panel">
            <h3 onClick={this.toggleFileList} style={{ cursor: 'pointer' }}>
              Files {showFileList ? '▼' : '▶'} ({fileList.length})
            </h3>
            {showFileList && (
              <div className="files-list">
                {fileList.filter(f => f.endsWith('.dun')).map(file => (
                  <div
                    key={file}
                    className={`file-item ${selectedFile === file ? 'selected' : ''} ${
                      modifiedFiles.some(m => m.path === file) ? 'modified' : ''
                    }`}
                    onClick={() => this.previewLevel(file)}
                  >
                    {file}
                    {modifiedFiles.some(m => m.path === file) && (
                      <span className="modified-badge">*</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Modified Files */}
            {modifiedFiles.length > 0 && (
              <>
                <h4>Modified Files</h4>
                <div className="modified-list">
                  {modifiedFiles.map(file => (
                    <div
                      key={file.path}
                      className="modified-item"
                      onClick={() => this.previewLevel(file.path)}
                    >
                      <span className="file-path">{file.path}</span>
                      <span className="file-size">
                        {file.buffer.length} bytes
                      </span>
                      {file.isNew && <span className="new-badge">NEW</span>}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Level Preview */}
          <div className="mod-editor-panel preview-panel">
            <div className="preview-header">
              <h3>Preview {previewPath && `- ${previewPath}`}</h3>
              {previewDunData && (
                <div className="preview-controls">
                  <button
                    className={`btn btn-small ${previewMode === 'visual' ? 'active' : ''}`}
                    onClick={() => this.setState({ previewMode: 'visual' })}
                  >
                    Visual
                  </button>
                  <button
                    className={`btn btn-small ${previewMode === 'ascii' ? 'active' : ''}`}
                    onClick={() => this.setState({ previewMode: 'ascii' })}
                  >
                    ASCII
                  </button>
                  <button
                    className={`btn btn-small ${previewMode === 'both' ? 'active' : ''}`}
                    onClick={() => this.setState({ previewMode: 'both' })}
                  >
                    Both
                  </button>
                  <label className="preview-toggle">
                    <input
                      type="checkbox"
                      checked={showMonsters}
                      onChange={(e) => this.setState({ showMonsters: e.target.checked })}
                    />
                    Monsters
                  </label>
                  <label className="preview-toggle">
                    <input
                      type="checkbox"
                      checked={showItems}
                      onChange={(e) => this.setState({ showItems: e.target.checked })}
                    />
                    Items
                  </label>
                </div>
              )}
            </div>
            {previewContent || previewDunData ? (
              <div className="preview-content">
                {/* Visual Preview */}
                {(previewMode === 'visual' || previewMode === 'both') && previewDunData && (
                  <div className="level-preview-container">
                    <LevelPreview
                      dunData={previewDunData}
                      theme={previewTheme}
                      showMonsters={showMonsters}
                      showItems={showItems}
                      maxWidth={350}
                      maxHeight={350}
                      onTileHover={(x, y, tileId) => {
                        // Could show tile info in status bar
                      }}
                    />
                    <div className="level-details">
                      <h4>Level Details</h4>
                      <div className="stat-row">
                        <span className="stat-label">Theme</span>
                        <span className="stat-value">{previewTheme}</span>
                      </div>
                      {previewStats && (
                        <>
                          <div className="stat-row">
                            <span className="stat-label">Dimensions</span>
                            <span className="stat-value">{previewStats.width}×{previewStats.height}</span>
                          </div>
                          <div className="stat-row">
                            <span className="stat-label">Floors</span>
                            <span className="stat-value">{previewStats.floorCount}</span>
                          </div>
                          <div className="stat-row">
                            <span className="stat-label">Walls</span>
                            <span className="stat-value">{previewStats.wallCount}</span>
                          </div>
                          {previewStats.monsterCount > 0 && (
                            <div className="stat-row">
                              <span className="stat-label">Monsters</span>
                              <span className="stat-value">{previewStats.monsterCount}</span>
                            </div>
                          )}
                          <div className="stat-row">
                            <span className="stat-label">Stairs Up</span>
                            <span className={`stat-value ${previewStats.stairsUp > 0 ? 'valid' : 'invalid'}`}>
                              {previewStats.stairsUp > 0 ? '✓' : '✗'}
                            </span>
                          </div>
                          <div className="stat-row">
                            <span className="stat-label">Stairs Down</span>
                            <span className={`stat-value ${previewStats.stairsDown > 0 ? 'valid' : 'invalid'}`}>
                              {previewStats.stairsDown > 0 ? '✓' : '✗'}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                )}
                {/* ASCII Preview */}
                {(previewMode === 'ascii' || previewMode === 'both') && previewContent && (
                  <pre className="ascii-level-preview">{previewContent}</pre>
                )}
                {/* Mini map for 'both' mode */}
                {previewMode === 'both' && previewDunData && (
                  <div className="mini-map-container">
                    <span className="mini-map-label">Mini Map</span>
                    <MiniMap dunData={previewDunData} theme={previewTheme} size={80} />
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-message">
                Select a level file to preview
              </div>
            )}
          </div>
        </div>

        {/* Campaign Blueprint Panel (collapsible) */}
        <details className="campaign-blueprint-section">
          <summary>Campaign Blueprint Editor</summary>
          <CampaignBlueprintPanel
            executor={this.executor}
            onBlueprintChange={(blueprint) => {
              console.log('[ModEditor] Blueprint changed:', blueprint?.id);
            }}
          />
        </details>

        {/* Tool Reference (collapsible) */}
        <details className="tool-reference">
          <summary>Available AI Tools</summary>
          <div className="tools-grid">
            {ModToolExecutor.getToolList().map(tool => (
              <div key={tool.name} className="tool-card">
                <h4>{tool.name}</h4>
                <p>{tool.description}</p>
              </div>
            ))}
          </div>
        </details>
      </div>
    );
  }
}

/**
 * ModEditorButton - Toggle button for the editor
 */
export function ModEditorButton({ onClick, hasModifications }) {
  return (
    <button
      className={`mod-editor-button ${hasModifications ? 'has-modifications' : ''}`}
      onClick={onClick}
      title="Open Mod Editor"
    >
      🔧 Mod Editor
      {hasModifications && <span className="badge">!</span>}
    </button>
  );
}

export default ModEditor;
