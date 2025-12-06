/**
 * Mod Editor UI Component
 *
 * Provides a visual interface for AI-driven MPQ modifications.
 * Shows real-time operation status, level previews, and modified files.
 */

import React, { Component } from 'react';
import axios from 'axios';
import './ModEditor.scss';
import './LevelPreview.scss';
import './CampaignBlueprintPanel.scss';
import './CampaignBuildProgress.scss';
import './FileViewer.scss';
import { ModToolExecutor } from './ModTools';
import DUNParser from './DUNParser';
import { MPQWriter } from './MPQWriter';
import { MpqReader } from '../api/savefile';
import { LevelPreview, MiniMap } from './LevelPreview';
import { CampaignBlueprintPanel } from './CampaignBlueprintPanel';
import { HexViewer, PaletteViewer, DUNEditor, FileInfo, getFileType, getFileCategory } from './FileViewer';

// Spawn.mpq valid sizes
const SpawnSizes = [50274091, 25830791];

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
      loadingMessage: null,

      // UI state
      showFileList: false,
      fileList: [],
      selectedFile: null,
      selectedFileData: null,
      selectedFileType: null,

      // View mode
      viewMode: 'preview', // 'preview', 'hex', 'editor'
      fileCategory: 'all', // 'all', 'Levels', 'Monsters', etc.
      fileSearch: '',

      // Download notice
      showDownloadNotice: false,
      downloadedFilename: null,
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

      // Auto-download the modified MPQ so user has a copy
      // This ensures they can reload it later without rebuilding
      const timestamp = Date.now();
      const filename = `spawn_modded_${timestamp}.mpq`;
      const blob = new Blob([modifiedMpq], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      console.log(`[ModEditor] Auto-downloaded modified MPQ: ${filename}`);

      this.updateOperation(opId, 'success');

      // Show notification that download happened
      this.setState({
        downloadedFilename: filename,
        showDownloadNotice: true,
      });

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
   * Play the currently loaded MPQ directly (for pre-modded MPQs loaded from disk)
   */
  handlePlayLoaded = async () => {
    if (!this.originalMpqBuffer) {
      alert('No MPQ loaded');
      return;
    }

    const opId = this.addOperation('playLoaded', { file: this.state.mpqFileName }, 'running');
    this.setState({ status: 'working' });

    try {
      // Convert buffer to Uint8Array if needed
      const mpqData = new Uint8Array(this.originalMpqBuffer);

      this.updateOperation(opId, 'success');

      // Call parent callback to start game with loaded MPQ
      if (this.props.onStartModded) {
        await this.props.onStartModded(mpqData);
      }
    } catch (error) {
      this.updateOperation(opId, 'error', error.message);
      this.setState({ status: 'ready', error: error.message });
      console.error('[ModEditor] Failed to play loaded MPQ:', error);
    }
  }

  /**
   * Check if spawn.mpq is already in the filesystem, or fetch from server
   */
  async checkExistingMPQ() {
    this.setState({ status: 'loading', loadingMessage: 'Looking for spawn.mpq...' });

    try {
      // Check if we have a modifiedMpq prop (re-opening editor during modded game)
      if (this.props.modifiedMpq) {
        console.log('[ModEditor] Using modifiedMpq from props');
        const buffer = this.props.modifiedMpq.buffer || this.props.modifiedMpq;
        await this.loadMPQFromBuffer(buffer, 'spawn.mpq (modified)');
        return;
      }

      // First, try to get from filesystem prop
      // Note: filesystem prop may be a Promise, so we need to await it
      let fs = this.props.filesystem;
      if (fs && typeof fs.then === 'function') {
        // It's a Promise, await it
        fs = await fs;
        this.resolvedFilesystem = fs; // Store for later use
      }

      if (fs && fs.files) {
        const spawnMpq = fs.files.get('spawn.mpq');
        if (spawnMpq) {
          // spawnMpq is a Uint8Array, get its underlying ArrayBuffer
          const buffer = spawnMpq.buffer || spawnMpq;
          console.log(`[ModEditor] Found spawn.mpq in filesystem (${spawnMpq.byteLength} bytes)`);
          await this.loadMPQFromBuffer(buffer, 'spawn.mpq');
          return;
        }
      }

      // If not in filesystem, fetch from server
      console.log('[ModEditor] spawn.mpq not found in filesystem, fetching from server...');
      await this.fetchSpawnMPQ();
    } catch (error) {
      console.warn('[ModEditor] Could not auto-load spawn.mpq:', error);
      this.setState({
        status: 'idle',
        loadingMessage: null,
        error: 'Click "Load MPQ" to load spawn.mpq manually',
      });
    }
  }

  /**
   * Fetch spawn.mpq from the server
   */
  async fetchSpawnMPQ() {
    this.setState({ loadingMessage: 'Downloading spawn.mpq...' });

    try {
      const response = await axios.request({
        url: process.env.PUBLIC_URL + '/spawn.mpq',
        responseType: 'arraybuffer',
        onDownloadProgress: (e) => {
          const total = e.total || SpawnSizes[1];
          const percent = Math.round((e.loaded / total) * 100);
          this.setState({
            loadingMessage: `Downloading spawn.mpq... ${percent}%`,
            progress: percent,
          });
        },
        headers: {
          'Cache-Control': 'max-age=31536000',
        },
      });

      // Validate size
      if (!SpawnSizes.includes(response.data.byteLength)) {
        throw new Error('Invalid spawn.mpq size - file may be corrupted');
      }

      console.log('[ModEditor] Successfully downloaded spawn.mpq');
      await this.loadMPQFromBuffer(response.data, 'spawn.mpq');

      // Also store in filesystem for future use
      // Use the resolved filesystem if available
      let fs = this.resolvedFilesystem || this.props.filesystem;
      if (fs && typeof fs.then === 'function') {
        fs = await fs;
      }
      if (fs && fs.files) {
        const data = new Uint8Array(response.data);
        fs.files.set('spawn.mpq', data);
        if (fs.update) {
          fs.update('spawn.mpq', data.slice());
        }
      }
    } catch (error) {
      throw new Error(`Failed to download spawn.mpq: ${error.message}`);
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
    this.mpqReader = mpqReader; // Store for later file reading
    this.executor.setMPQ(mpqReader);

    // Get file list
    const fileList = mpqReader.listFiles();

    this.setState({
      mpqLoaded: true,
      mpqFileName: fileName,
      fileList,
      status: 'ready',
      loadingMessage: null,
      progress: 0,
      error: null,
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

  /**
   * Load any file from the MPQ
   */
  loadFile = async (path) => {
    if (!this.mpqReader) {
      console.error('[ModEditor] No MPQ loaded');
      return;
    }

    try {
      const fileType = getFileType(path);
      const data = this.mpqReader.read(path);

      if (!data) {
        console.warn(`[ModEditor] Could not read file: ${path}`);
        this.setState({
          selectedFile: path,
          selectedFileData: null,
          selectedFileType: fileType,
          error: `Could not read file: ${path}`,
        });
        return;
      }

      console.log(`[ModEditor] Loaded file: ${path} (${data.length} bytes)`);

      // For DUN files, also parse and load preview
      if (fileType.key === 'DUN') {
        this.previewLevel(path);
      }

      this.setState({
        selectedFile: path,
        selectedFileData: data.buffer || data,
        selectedFileType: fileType,
        error: null,
      });
    } catch (err) {
      console.error(`[ModEditor] Failed to load file: ${path}`, err);
      this.setState({
        selectedFile: path,
        selectedFileData: null,
        selectedFileType: null,
        error: `Failed to load file: ${err.message}`,
      });
    }
  };

  /**
   * Get grouped file list by category
   */
  getGroupedFiles = () => {
    const { fileList, fileCategory, fileSearch } = this.state;

    // Filter by search
    let filtered = fileList;
    if (fileSearch) {
      const search = fileSearch.toLowerCase();
      filtered = fileList.filter(f => f.toLowerCase().includes(search));
    }

    // Group by category
    const groups = {};
    for (const file of filtered) {
      const category = getFileCategory(file);
      if (fileCategory === 'all' || fileCategory === category) {
        if (!groups[category]) groups[category] = [];
        groups[category].push(file);
      }
    }

    return groups;
  };

  /**
   * Get category counts
   */
  getCategoryCounts = () => {
    const { fileList } = this.state;
    const counts = { all: fileList.length };

    for (const file of fileList) {
      const category = getFileCategory(file);
      counts[category] = (counts[category] || 0) + 1;
    }

    return counts;
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
      loadingMessage,
      progress,
      showFileList,
      fileList,
      selectedFile,
      selectedFileData,
      selectedFileType,
      viewMode,
      fileCategory,
      fileSearch,
      showDownloadNotice,
      downloadedFilename,
    } = this.state;

    const categoryCounts = this.getCategoryCounts();
    const categories = ['all', ...Object.keys(categoryCounts).filter(k => k !== 'all')].sort();

    // Show loading screen while fetching spawn.mpq
    if (status === 'loading' && loadingMessage) {
      return (
        <div className="mod-editor">
          <div className="mod-editor-header">
            <h2>AI Mod Editor</h2>
            <button onClick={this.handleClose} className="btn btn-close">Close</button>
          </div>
          <div className="mod-editor-loading">
            <div className="loading-spinner">⟳</div>
            <div className="loading-message">{loadingMessage}</div>
            {progress > 0 && (
              <div className="loading-progress">
                <div className="progress-bar" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        </div>
      );
    }

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
              className="btn btn-load"
              title="Load a spawn.mpq or previously downloaded modded game"
            >
              Load MPQ from Disk
            </button>
            <button
              onClick={this.generateTestLevel}
              disabled={!mpqLoaded}
              className="btn btn-primary"
            >
              Generate Test Level
            </button>
            <button
              onClick={this.handlePlayLoaded}
              disabled={!mpqLoaded}
              className="btn btn-play"
              title="Play the loaded MPQ file directly"
            >
              Play Loaded
            </button>
            <button
              onClick={this.handleStartModded}
              disabled={modifiedFiles.length === 0}
              className="btn btn-play"
              title="Build and play with current modifications"
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

        {showDownloadNotice && (
          <div className="mod-editor-notice">
            <span className="notice-icon">✓</span>
            <span className="notice-text">
              Your modified game was downloaded as <strong>{downloadedFilename}</strong>.
              To play again later, use "Load MPQ" to load this file.
            </span>
            <button
              className="notice-dismiss"
              onClick={() => this.setState({ showDownloadNotice: false })}
            >
              ×
            </button>
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

          {/* Enhanced File Browser */}
          <div className="mod-editor-panel files-panel">
            <h3 onClick={this.toggleFileList} style={{ cursor: 'pointer' }}>
              Files {showFileList ? '▼' : '▶'} ({fileList.length})
            </h3>

            {showFileList && (
              <>
                {/* Category Filter */}
                <div className="file-browser-categories">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      className={`category-btn ${fileCategory === cat ? 'active' : ''}`}
                      onClick={() => this.setState({ fileCategory: cat })}
                    >
                      {cat === 'all' ? 'All' : cat}
                      <span className="count">({categoryCounts[cat] || 0})</span>
                    </button>
                  ))}
                </div>

                {/* Search */}
                <div className="file-browser-search">
                  <input
                    type="text"
                    placeholder="Search files..."
                    value={fileSearch}
                    onChange={(e) => this.setState({ fileSearch: e.target.value })}
                  />
                </div>

                {/* File List */}
                <div className="file-browser-list">
                  {Object.entries(this.getGroupedFiles()).map(([category, files]) => (
                    <div key={category} className="file-group">
                      <div className="file-group-header">{category} ({files.length})</div>
                      {files.slice(0, 50).map(file => {
                        const fileType = getFileType(file);
                        const isModified = modifiedFiles.some(m => m.path === file);
                        return (
                          <div
                            key={file}
                            className={`file-item ${selectedFile === file ? 'selected' : ''}`}
                            onClick={() => this.loadFile(file)}
                          >
                            <span className="file-icon" style={{ color: fileType.color }}>
                              {fileType.icon}
                            </span>
                            <span className="file-name">{file.split('/').pop()}</span>
                            <div className="file-badges">
                              {isModified && <span className="badge modified">MOD</span>}
                            </div>
                          </div>
                        );
                      })}
                      {files.length > 50 && (
                        <div className="file-item-more">...and {files.length - 50} more</div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Modified Files */}
            {modifiedFiles.length > 0 && (
              <>
                <h4>Modified Files ({modifiedFiles.length})</h4>
                <div className="modified-list">
                  {modifiedFiles.map(file => {
                    const fileType = getFileType(file.path);
                    return (
                      <div
                        key={file.path}
                        className="modified-item"
                        onClick={() => this.loadFile(file.path)}
                      >
                        <span className="file-icon" style={{ color: fileType.color }}>
                          {fileType.icon}
                        </span>
                        <span className="file-path">{file.path}</span>
                        <span className="file-size">
                          {file.buffer.length.toLocaleString()} bytes
                        </span>
                        {file.isNew && <span className="new-badge">NEW</span>}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* File Viewer Panel */}
          <div className="mod-editor-panel preview-panel">
            <div className="preview-header">
              <h3>
                {selectedFile ? (
                  <>
                    <span className="file-type-icon" style={{ color: selectedFileType?.color }}>
                      {selectedFileType?.icon}
                    </span>
                    {selectedFile.split('/').pop()}
                  </>
                ) : 'File Viewer'}
              </h3>
              {selectedFile && (
                <div className="view-mode-tabs">
                  <button
                    className={`btn btn-small ${viewMode === 'preview' ? 'active' : ''}`}
                    onClick={() => this.setState({ viewMode: 'preview' })}
                  >
                    Preview
                  </button>
                  <button
                    className={`btn btn-small ${viewMode === 'hex' ? 'active' : ''}`}
                    onClick={() => this.setState({ viewMode: 'hex' })}
                  >
                    Hex
                  </button>
                  {selectedFileType?.key === 'DUN' && (
                    <button
                      className={`btn btn-small ${viewMode === 'editor' ? 'active' : ''}`}
                      onClick={() => this.setState({ viewMode: 'editor' })}
                    >
                      Editor
                    </button>
                  )}
                </div>
              )}
            </div>

            {selectedFile ? (
              <div className="preview-content">
                {/* File Info */}
                <FileInfo data={selectedFileData} filename={selectedFile} />

                {/* Hex View */}
                {viewMode === 'hex' && selectedFileData && (
                  <HexViewer
                    data={selectedFileData}
                    filename={selectedFile}
                  />
                )}

                {/* Palette View */}
                {viewMode === 'preview' && selectedFileType?.key === 'PAL' && selectedFileData && (
                  <PaletteViewer
                    data={selectedFileData}
                    filename={selectedFile}
                  />
                )}

                {/* DUN Preview */}
                {viewMode === 'preview' && selectedFileType?.key === 'DUN' && previewDunData && (
                  <div className="level-preview-container">
                    <div className="dun-preview-controls">
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

                    {previewMode === 'visual' && (
                      <LevelPreview
                        dunData={previewDunData}
                        theme={previewTheme}
                        showMonsters={showMonsters}
                        showItems={showItems}
                        maxWidth={400}
                        maxHeight={400}
                      />
                    )}

                    {previewMode === 'ascii' && previewContent && (
                      <pre className="ascii-level-preview">{previewContent}</pre>
                    )}

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

                {/* DUN Editor */}
                {viewMode === 'editor' && selectedFileType?.key === 'DUN' && selectedFileData && (
                  <DUNEditor
                    data={selectedFileData}
                    filename={selectedFile}
                    onModify={(newData) => {
                      console.log('[ModEditor] DUN modified');
                      // TODO: Update modified files list
                    }}
                  />
                )}

                {/* Generic file preview (not yet supported) */}
                {viewMode === 'preview' && selectedFileType?.key !== 'DUN' && selectedFileType?.key !== 'PAL' && (
                  <div className="generic-file-info">
                    <p>File type: <strong>{selectedFileType?.name}</strong></p>
                    <p>Size: <strong>{selectedFileData ? selectedFileData.byteLength?.toLocaleString() || 'N/A' : 'Loading...'} bytes</strong></p>
                    <p className="hint">Switch to Hex view to inspect raw data</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-message">
                <div className="empty-icon">📂</div>
                <p>Select a file from the browser to view</p>
                <p className="hint">Use the category filters and search to find files</p>
              </div>
            )}
          </div>
        </div>

        {/* Campaign Blueprint Panel (collapsible) */}
        <details className="campaign-blueprint-section" open>
          <summary>Campaign Blueprint Editor</summary>
          <CampaignBlueprintPanel
            executor={this.executor}
            onBlueprintChange={(blueprint) => {
              console.log('[ModEditor] Blueprint changed:', blueprint?.id);
            }}
            onBuildComplete={(result) => {
              console.log('[ModEditor] Build complete:', result);
              // Update modified files list
              if (result.levels) {
                const newModifiedFiles = [];
                for (const [path, data] of result.levels) {
                  newModifiedFiles.push({ path, type: 'dun', isNew: true });
                }
                this.setState(state => ({
                  modifiedFiles: [...state.modifiedFiles, ...newModifiedFiles],
                }));
              }
            }}
            onPlayMod={(result) => {
              console.log('[ModEditor] Play mod requested');
              this.handleStartModded();
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
