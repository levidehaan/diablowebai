/**
 * FileViewer Components
 *
 * Provides viewers for different Diablo file formats:
 * - HexViewer: Raw binary inspection
 * - PaletteViewer: PAL color palette display
 * - DUNViewer: Level layout with interactive editing
 * - TileDataViewer: MIN/TIL/SOL data display
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

// Monster data for placement palette
const COMMON_MONSTERS = [
  { id: 1, name: 'Zombie', color: '#4a4' },
  { id: 2, name: 'Ghoul', color: '#484' },
  { id: 17, name: 'Fallen One', color: '#a44' },
  { id: 33, name: 'Skeleton', color: '#aaa' },
  { id: 35, name: 'Burning Dead', color: '#fa0' },
  { id: 37, name: 'Skeleton Archer', color: '#888' },
  { id: 49, name: 'Scavenger', color: '#840' },
  { id: 65, name: 'Fiend', color: '#a0a' },
  { id: 81, name: 'Flesh Clan', color: '#a80' },
  { id: 97, name: 'Hidden', color: '#448' },
  { id: 101, name: 'Skeleton King', color: '#ff0' },
  { id: 102, name: 'Butcher', color: '#f00' },
];

// Object data for placement palette
const COMMON_OBJECTS = [
  { id: 1, name: 'Barrel', color: '#840' },
  { id: 2, name: 'Chest', color: '#a80' },
  { id: 3, name: 'Large Chest', color: '#fa0' },
  { id: 5, name: 'Bookcase', color: '#642' },
  { id: 6, name: 'Weapon Rack', color: '#666' },
  { id: 7, name: 'Armor Stand', color: '#888' },
  { id: 8, name: 'Skeleton', color: '#aaa' },
  { id: 11, name: 'Shrine', color: '#88f' },
  { id: 21, name: 'Torch', color: '#f80' },
  { id: 33, name: 'Candle', color: '#ff8' },
];

// File type detection
export const FILE_TYPES = {
  DUN: { ext: '.dun', name: 'Level Layout', icon: '🗺️', color: '#4a9' },
  PAL: { ext: '.pal', name: 'Palette', icon: '🎨', color: '#a4a' },
  MIN: { ext: '.min', name: 'Minimap', icon: '📍', color: '#49a' },
  TIL: { ext: '.til', name: 'Tile Defs', icon: '🧱', color: '#a94' },
  SOL: { ext: '.sol', name: 'Collision', icon: '🚧', color: '#944' },
  CEL: { ext: '.cel', name: 'Sprite', icon: '🖼️', color: '#94a' },
  CL2: { ext: '.cl2', name: 'Animation', icon: '🎬', color: '#4aa' },
  WAV: { ext: '.wav', name: 'Sound', icon: '🔊', color: '#aa4' },
  TXT: { ext: '.txt', name: 'Text', icon: '📄', color: '#888' },
  OTHER: { ext: '', name: 'Binary', icon: '📦', color: '#666' },
};

export function getFileType(filename) {
  const lower = filename.toLowerCase();
  for (const [key, type] of Object.entries(FILE_TYPES)) {
    if (type.ext && lower.endsWith(type.ext)) {
      return { key, ...type };
    }
  }
  return { key: 'OTHER', ...FILE_TYPES.OTHER };
}

export function getFileCategory(filename) {
  const lower = filename.toLowerCase();
  if (lower.includes('levels/')) return 'Levels';
  if (lower.includes('monsters/')) return 'Monsters';
  if (lower.includes('objects/')) return 'Objects';
  if (lower.includes('items/')) return 'Items';
  if (lower.includes('towners/')) return 'NPCs';
  if (lower.includes('sfx/')) return 'Sound';
  if (lower.includes('music/')) return 'Music';
  if (lower.includes('data/')) return 'Data';
  if (lower.includes('ui_art/')) return 'UI';
  if (lower.includes('gendata/')) return 'Generated';
  return 'Other';
}

/**
 * HexViewer - Display raw binary data
 */
export function HexViewer({ data, filename, onByteClick }) {
  const [offset, setOffset] = useState(0);
  const [bytesPerRow] = useState(16);
  const [selectedByte, setSelectedByte] = useState(null);
  const rowsPerPage = 32;

  if (!data) {
    return <div className="hex-viewer-empty">No data to display</div>;
  }

  const bytes = new Uint8Array(data);
  const totalRows = Math.ceil(bytes.length / bytesPerRow);
  const startRow = Math.floor(offset / bytesPerRow);
  const endRow = Math.min(startRow + rowsPerPage, totalRows);

  const formatHex = (byte) => byte.toString(16).padStart(2, '0').toUpperCase();
  const formatAscii = (byte) => (byte >= 32 && byte < 127) ? String.fromCharCode(byte) : '.';

  const handleByteClick = (index) => {
    setSelectedByte(index);
    if (onByteClick) onByteClick(index, bytes[index]);
  };

  return (
    <div className="hex-viewer">
      <div className="hex-viewer-header">
        <span className="hex-filename">{filename}</span>
        <span className="hex-size">{bytes.length.toLocaleString()} bytes</span>
        <div className="hex-nav">
          <button
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - rowsPerPage * bytesPerRow))}
          >
            ◀ Prev
          </button>
          <span className="hex-position">
            {offset.toString(16).toUpperCase().padStart(8, '0')} - {Math.min(offset + rowsPerPage * bytesPerRow, bytes.length).toString(16).toUpperCase().padStart(8, '0')}
          </span>
          <button
            disabled={endRow >= totalRows}
            onClick={() => setOffset(Math.min(offset + rowsPerPage * bytesPerRow, (totalRows - rowsPerPage) * bytesPerRow))}
          >
            Next ▶
          </button>
        </div>
      </div>
      <div className="hex-viewer-content">
        <div className="hex-header-row">
          <span className="hex-offset-header">Offset</span>
          {Array.from({ length: bytesPerRow }, (_, i) => (
            <span key={i} className="hex-col-header">{formatHex(i)}</span>
          ))}
          <span className="hex-ascii-header">ASCII</span>
        </div>
        {Array.from({ length: endRow - startRow }, (_, rowIdx) => {
          const rowStart = (startRow + rowIdx) * bytesPerRow;
          const rowBytes = bytes.slice(rowStart, Math.min(rowStart + bytesPerRow, bytes.length));

          return (
            <div key={rowIdx} className="hex-row">
              <span className="hex-offset">{rowStart.toString(16).toUpperCase().padStart(8, '0')}</span>
              <span className="hex-bytes">
                {Array.from(rowBytes).map((byte, i) => (
                  <span
                    key={i}
                    className={`hex-byte ${selectedByte === rowStart + i ? 'selected' : ''}`}
                    onClick={() => handleByteClick(rowStart + i)}
                    title={`Offset: 0x${(rowStart + i).toString(16).toUpperCase()}, Value: ${byte} (0x${formatHex(byte)})`}
                  >
                    {formatHex(byte)}
                  </span>
                ))}
                {/* Pad if last row is incomplete */}
                {rowBytes.length < bytesPerRow && Array.from({ length: bytesPerRow - rowBytes.length }, (_, i) => (
                  <span key={`pad-${i}`} className="hex-byte pad">  </span>
                ))}
              </span>
              <span className="hex-ascii">
                {Array.from(rowBytes).map((byte, i) => (
                  <span
                    key={i}
                    className={`ascii-char ${selectedByte === rowStart + i ? 'selected' : ''}`}
                    onClick={() => handleByteClick(rowStart + i)}
                  >
                    {formatAscii(byte)}
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </div>
      {selectedByte !== null && (
        <div className="hex-selection-info">
          <strong>Selected:</strong> Offset 0x{selectedByte.toString(16).toUpperCase()} =
          {' '}{bytes[selectedByte]} (0x{formatHex(bytes[selectedByte])})
          {' '}| As signed: {bytes[selectedByte] > 127 ? bytes[selectedByte] - 256 : bytes[selectedByte]}
          {selectedByte < bytes.length - 1 && (
            <span> | WORD LE: {bytes[selectedByte] | (bytes[selectedByte + 1] << 8)}</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * PaletteViewer - Display PAL color palette
 */
export function PaletteViewer({ data, filename }) {
  const [selectedColor, setSelectedColor] = useState(null);
  const [hoverColor, setHoverColor] = useState(null);

  if (!data || data.length < 768) {
    return <div className="palette-viewer-empty">Invalid palette data (need 768 bytes)</div>;
  }

  const bytes = new Uint8Array(data);
  const colors = [];

  for (let i = 0; i < 256; i++) {
    const r = bytes[i * 3];
    const g = bytes[i * 3 + 1];
    const b = bytes[i * 3 + 2];
    colors.push({ r, g, b, index: i });
  }

  const activeColor = hoverColor || selectedColor;

  return (
    <div className="palette-viewer">
      <div className="palette-header">
        <span className="palette-filename">{filename}</span>
        <span className="palette-info">256 colors</span>
      </div>
      <div className="palette-grid">
        {colors.map((color, i) => (
          <div
            key={i}
            className={`palette-cell ${selectedColor?.index === i ? 'selected' : ''}`}
            style={{ backgroundColor: `rgb(${color.r}, ${color.g}, ${color.b})` }}
            onClick={() => setSelectedColor(color)}
            onMouseEnter={() => setHoverColor(color)}
            onMouseLeave={() => setHoverColor(null)}
            title={`#${i}: RGB(${color.r}, ${color.g}, ${color.b})`}
          />
        ))}
      </div>
      {activeColor && (
        <div className="palette-selection">
          <div
            className="palette-preview"
            style={{ backgroundColor: `rgb(${activeColor.r}, ${activeColor.g}, ${activeColor.b})` }}
          />
          <div className="palette-details">
            <div><strong>Index:</strong> {activeColor.index} (0x{activeColor.index.toString(16).toUpperCase().padStart(2, '0')})</div>
            <div><strong>RGB:</strong> {activeColor.r}, {activeColor.g}, {activeColor.b}</div>
            <div><strong>Hex:</strong> #{activeColor.r.toString(16).padStart(2, '0')}{activeColor.g.toString(16).padStart(2, '0')}{activeColor.b.toString(16).padStart(2, '0')}</div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * DUNEditor - Interactive level editor
 */
export function DUNEditor({ data, filename, onModify, onSave }) {
  const canvasRef = useRef(null);
  const [dunData, setDunData] = useState(null);
  const [selectedTile, setSelectedTile] = useState(null);
  const [hoveredTile, setHoveredTile] = useState(null);
  const [tool, setTool] = useState('select'); // select, paint, monster, object, eraser
  const [paintTileId, setPaintTileId] = useState(13); // Default floor
  const [paintMonsterId, setPaintMonsterId] = useState(33); // Default skeleton
  const [paintObjectId, setPaintObjectId] = useState(1); // Default barrel
  const [zoom, setZoom] = useState(10);
  const [showGrid, setShowGrid] = useState(true);
  const [layer, setLayer] = useState('base'); // base, monsters, objects, items
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isDragging, setIsDragging] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Parse DUN data
  useEffect(() => {
    if (!data) return;

    try {
      const bytes = new Uint8Array(data);
      const view = new DataView(data.buffer || data);

      const width = view.getUint16(0, true);
      const height = view.getUint16(2, true);

      // Read base layer
      const baseLayer = [];
      let offset = 4;
      for (let y = 0; y < height; y++) {
        const row = [];
        for (let x = 0; x < width; x++) {
          if (offset + 1 < bytes.length) {
            row.push(view.getUint16(offset, true));
            offset += 2;
          } else {
            row.push(0);
          }
        }
        baseLayer.push(row);
      }

      // Read sub-layers (at 2x resolution)
      const subWidth = width * 2;
      const subHeight = height * 2;
      const subLayers = { monsters: [], objects: [], items: [] };

      const layerNames = ['items', 'monsters', 'objects'];
      for (const layerName of layerNames) {
        const layer = [];
        for (let y = 0; y < subHeight; y++) {
          const row = [];
          for (let x = 0; x < subWidth; x++) {
            if (offset + 1 < bytes.length) {
              row.push(view.getUint16(offset, true));
              offset += 2;
            } else {
              row.push(0);
            }
          }
          layer.push(row);
        }
        subLayers[layerName] = layer;
      }

      setDunData({ width, height, baseLayer, subLayers });
      // Initialize history with first state
      setHistory([{ width, height, baseLayer, subLayers }]);
      setHistoryIndex(0);
    } catch (err) {
      console.error('Failed to parse DUN:', err);
    }
  }, [data]);

  // Push state to history
  const pushHistory = useCallback((newState) => {
    setHistory(prev => {
      // Remove any future states if we're not at the end
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(JSON.parse(JSON.stringify(newState)));
      // Limit history to 50 states
      if (newHistory.length > 50) newHistory.shift();
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
    setHasChanges(true);
  }, [historyIndex]);

  // Undo
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(prev => prev - 1);
      setDunData(JSON.parse(JSON.stringify(history[historyIndex - 1])));
    }
  }, [historyIndex, history]);

  // Redo
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(prev => prev + 1);
      setDunData(JSON.parse(JSON.stringify(history[historyIndex + 1])));
    }
  }, [historyIndex, history]);

  // Export DUN to binary
  const exportDUN = useCallback(() => {
    if (!dunData) return null;

    const { width, height, baseLayer, subLayers } = dunData;
    const subWidth = width * 2;
    const subHeight = height * 2;

    // Calculate total size
    const baseSize = 4 + (width * height * 2);
    const subLayerSize = subWidth * subHeight * 2;
    const totalSize = baseSize + (subLayerSize * 3);

    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    const u16 = new Uint16Array(buffer);

    // Write header
    view.setUint16(0, width, true);
    view.setUint16(2, height, true);

    // Write base layer
    let offset = 2; // In 16-bit words
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        u16[offset++] = baseLayer[y][x];
      }
    }

    // Write sub-layers
    const layerOrder = ['items', 'monsters', 'objects'];
    for (const layerName of layerOrder) {
      const layer = subLayers[layerName] || [];
      for (let y = 0; y < subHeight; y++) {
        for (let x = 0; x < subWidth; x++) {
          u16[offset++] = (layer[y] && layer[y][x]) || 0;
        }
      }
    }

    return new Uint8Array(buffer);
  }, [dunData]);

  // Handle save
  const handleSave = useCallback(() => {
    const dunBytes = exportDUN();
    if (dunBytes && onSave) {
      onSave(dunBytes, filename);
      setHasChanges(false);
    }
  }, [exportDUN, onSave, filename]);

  // Render canvas
  useEffect(() => {
    if (!dunData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const { width, height, baseLayer, subLayers } = dunData;

    canvas.width = width * zoom;
    canvas.height = height * zoom;

    // Clear
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw tiles
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tileId = baseLayer[y][x];
        const px = x * zoom;
        const py = y * zoom;

        // Color based on tile type
        ctx.fillStyle = getTileColor(tileId);
        ctx.fillRect(px, py, zoom, zoom);

        // Grid lines
        if (showGrid && zoom >= 4) {
          ctx.strokeStyle = 'rgba(255,255,255,0.1)';
          ctx.strokeRect(px, py, zoom, zoom);
        }

        // Tile ID text for larger zoom
        if (zoom >= 16 && tileId > 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.7)';
          ctx.font = `${Math.max(8, zoom / 3)}px monospace`;
          ctx.textAlign = 'center';
          ctx.fillText(tileId.toString(), px + zoom / 2, py + zoom / 2 + 3);
        }
      }
    }

    // Draw monsters layer
    if (layer === 'monsters' || layer === 'base') {
      const monsters = subLayers.monsters;
      if (monsters && monsters.length > 0) {
        for (let y = 0; y < monsters.length; y++) {
          for (let x = 0; x < monsters[y].length; x++) {
            const monsterId = monsters[y][x];
            if (monsterId > 0) {
              const px = (x / 2) * zoom + (x % 2) * zoom / 2;
              const py = (y / 2) * zoom + (y % 2) * zoom / 2;
              ctx.fillStyle = 'rgba(255, 0, 0, 0.7)';
              ctx.beginPath();
              ctx.arc(px + zoom / 4, py + zoom / 4, zoom / 4, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
    }

    // Draw objects layer
    if (layer === 'objects' || layer === 'base') {
      const objects = subLayers.objects;
      if (objects && objects.length > 0) {
        for (let y = 0; y < objects.length; y++) {
          for (let x = 0; x < objects[y].length; x++) {
            const objId = objects[y][x];
            if (objId > 0) {
              const px = (x / 2) * zoom + (x % 2) * zoom / 2;
              const py = (y / 2) * zoom + (y % 2) * zoom / 2;
              ctx.fillStyle = 'rgba(255, 215, 0, 0.7)';
              ctx.fillRect(px, py, zoom / 2, zoom / 2);
            }
          }
        }
      }
    }

    // Highlight selected tile
    if (selectedTile) {
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 2;
      ctx.strokeRect(selectedTile.x * zoom, selectedTile.y * zoom, zoom, zoom);
    }

    // Highlight hovered tile
    if (hoveredTile && hoveredTile !== selectedTile) {
      ctx.strokeStyle = '#ffff00';
      ctx.lineWidth = 1;
      ctx.strokeRect(hoveredTile.x * zoom, hoveredTile.y * zoom, zoom, zoom);
    }

  }, [dunData, zoom, showGrid, selectedTile, hoveredTile, layer]);

  // Apply modification at position
  const applyModification = useCallback((x, y, saveHistory = true) => {
    if (!dunData) return;

    let newDunData = JSON.parse(JSON.stringify(dunData));

    if (tool === 'paint') {
      // Paint base tile
      if (y >= 0 && y < dunData.height && x >= 0 && x < dunData.width) {
        newDunData.baseLayer[y][x] = paintTileId;
      }
    } else if (tool === 'monster') {
      // Place monster (at 2x resolution)
      const subX = x * 2;
      const subY = y * 2;
      if (subY >= 0 && subY < dunData.height * 2 && subX >= 0 && subX < dunData.width * 2) {
        if (!newDunData.subLayers.monsters[subY]) {
          newDunData.subLayers.monsters[subY] = new Array(dunData.width * 2).fill(0);
        }
        newDunData.subLayers.monsters[subY][subX] = paintMonsterId;
      }
    } else if (tool === 'object') {
      // Place object (at 2x resolution)
      const subX = x * 2;
      const subY = y * 2;
      if (subY >= 0 && subY < dunData.height * 2 && subX >= 0 && subX < dunData.width * 2) {
        if (!newDunData.subLayers.objects[subY]) {
          newDunData.subLayers.objects[subY] = new Array(dunData.width * 2).fill(0);
        }
        newDunData.subLayers.objects[subY][subX] = paintObjectId;
      }
    } else if (tool === 'eraser') {
      // Erase based on current layer
      if (layer === 'base') {
        newDunData.baseLayer[y][x] = 0;
      } else if (layer === 'monsters') {
        const subX = x * 2;
        const subY = y * 2;
        if (newDunData.subLayers.monsters[subY]) {
          newDunData.subLayers.monsters[subY][subX] = 0;
        }
      } else if (layer === 'objects') {
        const subX = x * 2;
        const subY = y * 2;
        if (newDunData.subLayers.objects[subY]) {
          newDunData.subLayers.objects[subY][subX] = 0;
        }
      }
    }

    setDunData(newDunData);
    if (saveHistory) {
      pushHistory(newDunData);
    }
    if (onModify) {
      onModify(newDunData);
    }
  }, [dunData, tool, paintTileId, paintMonsterId, paintObjectId, layer, pushHistory, onModify]);

  const handleCanvasClick = useCallback((e) => {
    if (!dunData || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / zoom);
    const y = Math.floor((e.clientY - rect.top) / zoom);

    if (x >= 0 && x < dunData.width && y >= 0 && y < dunData.height) {
      if (tool === 'select') {
        setSelectedTile({ x, y, tileId: dunData.baseLayer[y][x] });
      } else {
        applyModification(x, y);
      }
    }
  }, [dunData, zoom, tool, paintTileId, onModify]);

  const handleCanvasMove = useCallback((e) => {
    if (!dunData || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / zoom);
    const y = Math.floor((e.clientY - rect.top) / zoom);

    if (x >= 0 && x < dunData.width && y >= 0 && y < dunData.height) {
      setHoveredTile({ x, y, tileId: dunData.baseLayer[y][x] });
    } else {
      setHoveredTile(null);
    }
  }, [dunData, zoom]);

  if (!dunData) {
    return <div className="dun-editor-loading">Parsing level data...</div>;
  }

  return (
    <div className="dun-editor">
      <div className="dun-editor-toolbar">
        {/* Undo/Redo/Save */}
        <div className="toolbar-group">
          <button
            className="tool-btn"
            onClick={undo}
            disabled={historyIndex <= 0}
            title="Undo (Ctrl+Z)"
          >
            ↩ Undo
          </button>
          <button
            className="tool-btn"
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
            title="Redo (Ctrl+Y)"
          >
            ↪ Redo
          </button>
          <button
            className={`tool-btn ${hasChanges ? 'highlight' : ''}`}
            onClick={handleSave}
            disabled={!hasChanges}
            title="Save changes"
          >
            💾 Save
          </button>
        </div>

        <div className="toolbar-divider" />

        {/* Tools */}
        <div className="toolbar-group">
          <span className="toolbar-label">Tool:</span>
          <button
            className={`tool-btn ${tool === 'select' ? 'active' : ''}`}
            onClick={() => setTool('select')}
            title="Select tile"
          >
            ◎ Select
          </button>
          <button
            className={`tool-btn ${tool === 'paint' ? 'active' : ''}`}
            onClick={() => setTool('paint')}
            title="Paint tiles"
          >
            🖌 Paint
          </button>
          <button
            className={`tool-btn ${tool === 'monster' ? 'active' : ''}`}
            onClick={() => setTool('monster')}
            title="Place monsters"
          >
            👹 Monster
          </button>
          <button
            className={`tool-btn ${tool === 'object' ? 'active' : ''}`}
            onClick={() => setTool('object')}
            title="Place objects"
          >
            📦 Object
          </button>
          <button
            className={`tool-btn ${tool === 'eraser' ? 'active' : ''}`}
            onClick={() => setTool('eraser')}
            title="Erase"
          >
            🧹 Erase
          </button>
        </div>

        <div className="toolbar-divider" />

        <div className="toolbar-group">
          <span className="toolbar-label">Layer:</span>
          <select value={layer} onChange={(e) => setLayer(e.target.value)}>
            <option value="base">Base Tiles</option>
            <option value="monsters">Monsters</option>
            <option value="objects">Objects</option>
            <option value="items">Items</option>
          </select>
        </div>

        <div className="toolbar-group">
          <span className="toolbar-label">Zoom:</span>
          <input
            type="range"
            min="4"
            max="32"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
          <span>{zoom}px</span>
        </div>

        <div className="toolbar-group">
          <label>
            <input
              type="checkbox"
              checked={showGrid}
              onChange={(e) => setShowGrid(e.target.checked)}
            />
            Grid
          </label>
        </div>
      </div>

      {/* Palette panels */}
      <div className="dun-editor-palettes">
        {tool === 'paint' && (
          <div className="palette-panel">
            <span className="palette-label">Tile:</span>
            <input
              type="number"
              min="0"
              max="500"
              value={paintTileId}
              onChange={(e) => setPaintTileId(Number(e.target.value))}
              style={{ width: 50 }}
            />
            <TilePalette onSelect={setPaintTileId} selected={paintTileId} />
          </div>
        )}

        {tool === 'monster' && (
          <div className="palette-panel">
            <span className="palette-label">Monster:</span>
            <select
              value={paintMonsterId}
              onChange={(e) => setPaintMonsterId(Number(e.target.value))}
            >
              {COMMON_MONSTERS.map(m => (
                <option key={m.id} value={m.id}>{m.name} ({m.id})</option>
              ))}
            </select>
            <div className="mini-palette">
              {COMMON_MONSTERS.slice(0, 6).map(m => (
                <div
                  key={m.id}
                  className={`palette-item ${paintMonsterId === m.id ? 'selected' : ''}`}
                  style={{ backgroundColor: m.color }}
                  onClick={() => setPaintMonsterId(m.id)}
                  title={m.name}
                />
              ))}
            </div>
          </div>
        )}

        {tool === 'object' && (
          <div className="palette-panel">
            <span className="palette-label">Object:</span>
            <select
              value={paintObjectId}
              onChange={(e) => setPaintObjectId(Number(e.target.value))}
            >
              {COMMON_OBJECTS.map(o => (
                <option key={o.id} value={o.id}>{o.name} ({o.id})</option>
              ))}
            </select>
            <div className="mini-palette">
              {COMMON_OBJECTS.slice(0, 6).map(o => (
                <div
                  key={o.id}
                  className={`palette-item ${paintObjectId === o.id ? 'selected' : ''}`}
                  style={{ backgroundColor: o.color }}
                  onClick={() => setPaintObjectId(o.id)}
                  title={o.name}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="dun-editor-info">
        <span>Size: {dunData.width}×{dunData.height}</span>
        {hoveredTile && (
          <span>Pos: ({hoveredTile.x}, {hoveredTile.y}) Tile: {hoveredTile.tileId}</span>
        )}
        {selectedTile && (
          <span className="selected-info">
            Selected: ({selectedTile.x}, {selectedTile.y}) = {selectedTile.tileId}
          </span>
        )}
      </div>

      <div className="dun-editor-canvas-container">
        <canvas
          ref={canvasRef}
          onClick={handleCanvasClick}
          onMouseMove={handleCanvasMove}
          onMouseLeave={() => setHoveredTile(null)}
          className="dun-editor-canvas"
        />
      </div>
    </div>
  );
}

/**
 * TilePalette - Quick tile selection
 */
function TilePalette({ onSelect, selected }) {
  const [expanded, setExpanded] = useState(false);

  const commonTiles = [
    { id: 0, name: 'Empty', color: '#111' },
    { id: 13, name: 'Floor 1', color: '#4a3020' },
    { id: 14, name: 'Floor 2', color: '#3a2515' },
    { id: 15, name: 'Floor 3', color: '#2a1a10' },
    { id: 1, name: 'Wall V', color: '#666' },
    { id: 2, name: 'Wall H', color: '#666' },
    { id: 25, name: 'Door V', color: '#840' },
    { id: 26, name: 'Door H', color: '#840' },
    { id: 36, name: 'Stairs Up', color: '#4a4' },
    { id: 37, name: 'Stairs Down', color: '#a44' },
    { id: 42, name: 'Pillar', color: '#555' },
  ];

  return (
    <div className="tile-palette">
      <button
        className="palette-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? '▼' : '▶'} Tiles
      </button>
      {expanded && (
        <div className="palette-tiles">
          {commonTiles.map(tile => (
            <div
              key={tile.id}
              className={`palette-tile ${selected === tile.id ? 'selected' : ''}`}
              style={{ backgroundColor: tile.color }}
              onClick={() => onSelect(tile.id)}
              title={`${tile.name} (${tile.id})`}
            >
              {tile.id}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Get tile color for rendering
 */
function getTileColor(tileId) {
  if (tileId === 0) return '#111';

  // Floors
  if (tileId >= 13 && tileId <= 15) return '#4a3020';
  if (tileId >= 130 && tileId <= 135) return '#3a2a4a';
  if (tileId >= 200 && tileId <= 205) return '#4a4030';
  if (tileId >= 300 && tileId <= 305) return '#4a2020';

  // Walls
  if (tileId >= 1 && tileId <= 12) return '#666';
  if (tileId >= 100 && tileId <= 120) return '#556';
  if (tileId >= 180 && tileId <= 199) return '#665';
  if (tileId >= 280 && tileId <= 299) return '#644';

  // Doors
  if (tileId === 25 || tileId === 26) return '#840';
  if (tileId === 140 || tileId === 141) return '#748';

  // Stairs
  if (tileId === 36 || tileId === 142 || tileId === 210 || tileId === 310) return '#4a4';
  if (tileId === 37 || tileId === 143 || tileId === 211 || tileId === 311) return '#a44';

  // Pillars
  if (tileId === 42) return '#555';

  // Special
  if (tileId === 220) return '#f60'; // Lava
  if (tileId === 320) return '#808'; // Pentagram

  return '#333';
}

/**
 * SOLViewer - Display collision/solid data
 */
export function SOLViewer({ data, filename }) {
  const [solData, setSolData] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null);
  const [zoom, setZoom] = useState(8);

  // Collision flags
  const SOL_FLAGS = {
    SOLID: 0x01,
    BLOCK_LIGHT: 0x02,
    BLOCK_MISSILE: 0x04,
    TRANSPARENT: 0x08,
    TRAP: 0x10,
    DOOR: 0x20,
    STAIRS: 0x40,
    UNUSED: 0x80,
  };

  useEffect(() => {
    if (!data) return;

    try {
      const bytes = new Uint8Array(data);

      // SOL files are typically headerless - try to determine dimensions
      // Common sizes: Cathedral/Catacombs/Caves/Hell use different dimensions
      const totalBytes = bytes.length;

      // Try to find a reasonable width/height
      // Typical SOL sizes: 40x40, 112x112 (based on level types)
      let width = 40;
      let height = 40;

      // Calculate based on file size
      const sqrtSize = Math.floor(Math.sqrt(totalBytes));
      if (sqrtSize * sqrtSize === totalBytes) {
        width = sqrtSize;
        height = sqrtSize;
      } else {
        // Try common dimensions
        const commonSizes = [40, 80, 112, 96, 120];
        for (const size of commonSizes) {
          if (totalBytes === size * size) {
            width = size;
            height = size;
            break;
          }
        }
        // Fallback to linear
        if (width * height !== totalBytes) {
          width = Math.min(totalBytes, 256);
          height = Math.ceil(totalBytes / width);
        }
      }

      // Parse grid
      const grid = [];
      for (let y = 0; y < height; y++) {
        const row = [];
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          row.push(idx < bytes.length ? bytes[idx] : 0);
        }
        grid.push(row);
      }

      setSolData({ width, height, grid, bytes });
    } catch (err) {
      console.error('Failed to parse SOL:', err);
    }
  }, [data]);

  const getCellClass = (value) => {
    if (value === 0) return 'walkable';
    if (value & SOL_FLAGS.SOLID) return 'solid';
    if (value & SOL_FLAGS.DOOR) return 'door';
    if (value & SOL_FLAGS.STAIRS) return 'stairs';
    if (value & SOL_FLAGS.TRAP) return 'trap';
    return 'special';
  };

  const getCellColor = (value) => {
    if (value === 0) return '#2a4a2a'; // Walkable - green
    if (value & SOL_FLAGS.SOLID) return '#4a2a2a'; // Solid - red
    if (value & SOL_FLAGS.DOOR) return '#4a4a2a'; // Door - yellow
    if (value & SOL_FLAGS.STAIRS) return '#2a2a4a'; // Stairs - blue
    if (value & SOL_FLAGS.TRAP) return '#4a2a4a'; // Trap - purple
    return '#3a3a3a'; // Special - gray
  };

  const getFlagList = (value) => {
    const flags = [];
    if (value === 0) flags.push('Walkable');
    if (value & SOL_FLAGS.SOLID) flags.push('Solid');
    if (value & SOL_FLAGS.BLOCK_LIGHT) flags.push('Blocks Light');
    if (value & SOL_FLAGS.BLOCK_MISSILE) flags.push('Blocks Missiles');
    if (value & SOL_FLAGS.TRANSPARENT) flags.push('Transparent');
    if (value & SOL_FLAGS.TRAP) flags.push('Trap');
    if (value & SOL_FLAGS.DOOR) flags.push('Door');
    if (value & SOL_FLAGS.STAIRS) flags.push('Stairs');
    return flags.join(', ') || 'None';
  };

  if (!solData) {
    return <div className="sol-viewer-loading">Parsing collision data...</div>;
  }

  return (
    <div className="sol-viewer">
      <div className="sol-viewer-header">
        <span className="sol-filename">{filename}</span>
        <span className="sol-info">
          {solData.width}×{solData.height} = {solData.bytes.length.toLocaleString()} bytes
        </span>
        <div className="sol-controls">
          <span>Zoom:</span>
          <input
            type="range"
            min="2"
            max="16"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
          <span>{zoom}px</span>
        </div>
      </div>

      <div className="sol-viewer-canvas" style={{ maxHeight: '400px', overflow: 'auto' }}>
        <div
          className="sol-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${solData.width}, ${zoom}px)`,
            gap: '0',
            width: 'fit-content',
          }}
        >
          {solData.grid.flatMap((row, y) =>
            row.map((value, x) => (
              <div
                key={`${x}-${y}`}
                className={`sol-cell ${getCellClass(value)}`}
                style={{
                  width: zoom,
                  height: zoom,
                  backgroundColor: getCellColor(value),
                  border: selectedCell?.x === x && selectedCell?.y === y
                    ? '1px solid #fff'
                    : 'none',
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedCell({ x, y, value })}
                title={`(${x},${y}): ${value} (0x${value.toString(16).toUpperCase()})`}
              />
            ))
          )}
        </div>
      </div>

      {selectedCell && (
        <div className="sol-selection">
          <strong>Position:</strong> ({selectedCell.x}, {selectedCell.y}) |{' '}
          <strong>Value:</strong> {selectedCell.value} (0x{selectedCell.value.toString(16).toUpperCase()}) |{' '}
          <strong>Flags:</strong> {getFlagList(selectedCell.value)}
        </div>
      )}

      <div className="sol-viewer-legend">
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#2a4a2a' }} />
          <span>Walkable</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#4a2a2a' }} />
          <span>Solid</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#4a4a2a' }} />
          <span>Door</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#2a2a4a' }} />
          <span>Stairs</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ backgroundColor: '#4a2a4a' }} />
          <span>Trap</span>
        </div>
      </div>
    </div>
  );
}

/**
 * MINViewer - Display minimap tile data
 */
export function MINViewer({ data, filename }) {
  const [minData, setMinData] = useState(null);
  const [selectedTile, setSelectedTile] = useState(null);
  const [zoom, setZoom] = useState(2);

  useEffect(() => {
    if (!data) return;

    try {
      const bytes = new Uint8Array(data);
      const view = new DataView(data.buffer || data);

      // MIN files contain tile frame references
      // Each entry is typically 2 bytes (uint16)
      // The layout varies by dungeon type:
      // - Cathedral: 10x10 blocks, 2x2 tiles each = 400 entries
      // - Catacombs/Caves/Hell: Similar structure

      const entrySize = 2; // 16-bit entries
      const numEntries = Math.floor(bytes.length / entrySize);

      // Try to determine grid dimensions
      let width = 16;
      let height = Math.ceil(numEntries / width);

      // Common MIN file patterns
      const sqrtEntries = Math.floor(Math.sqrt(numEntries));
      if (sqrtEntries * sqrtEntries === numEntries) {
        width = sqrtEntries;
        height = sqrtEntries;
      } else {
        // Try power of 2 widths
        for (const w of [32, 16, 20, 10]) {
          if (numEntries % w === 0) {
            width = w;
            height = numEntries / w;
            break;
          }
        }
      }

      // Parse entries
      const entries = [];
      const grid = [];

      for (let i = 0; i < numEntries; i++) {
        const value = view.getUint16(i * 2, true);
        entries.push(value);
      }

      for (let y = 0; y < height; y++) {
        const row = [];
        for (let x = 0; x < width; x++) {
          const idx = y * width + x;
          row.push(idx < entries.length ? entries[idx] : 0);
        }
        grid.push(row);
      }

      // Collect unique values for analysis
      const uniqueValues = new Set(entries);
      const maxValue = Math.max(...entries);
      const minValue = Math.min(...entries.filter(v => v > 0));

      setMinData({
        width,
        height,
        grid,
        entries,
        uniqueValues: uniqueValues.size,
        maxValue,
        minValue,
        bytes,
      });
    } catch (err) {
      console.error('Failed to parse MIN:', err);
    }
  }, [data]);

  const getTileColor = (value) => {
    if (value === 0) return '#111';
    // Create a color based on value
    const hue = (value * 37) % 360;
    const lightness = 30 + (value % 20);
    return `hsl(${hue}, 60%, ${lightness}%)`;
  };

  if (!minData) {
    return <div className="min-viewer-loading">Parsing minimap data...</div>;
  }

  return (
    <div className="min-viewer">
      <div className="min-viewer-header">
        <span className="min-filename">{filename}</span>
        <span className="min-info">
          {minData.width}×{minData.height} | {minData.entries.length} entries | {minData.uniqueValues} unique
        </span>
        <div className="min-controls">
          <span>Zoom:</span>
          <input
            type="range"
            min="1"
            max="8"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
          <span>{zoom}x</span>
        </div>
      </div>

      <div className="min-viewer-canvas" style={{ maxHeight: '400px', overflow: 'auto' }}>
        <div
          className="min-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${minData.width}, ${8 * zoom}px)`,
            gap: '0',
            width: 'fit-content',
          }}
        >
          {minData.grid.flatMap((row, y) =>
            row.map((value, x) => (
              <div
                key={`${x}-${y}`}
                className="min-cell"
                style={{
                  width: 8 * zoom,
                  height: 8 * zoom,
                  backgroundColor: getTileColor(value),
                  border: selectedTile?.x === x && selectedTile?.y === y
                    ? '1px solid #fff'
                    : '1px solid rgba(255,255,255,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: zoom > 2 ? 10 : 8,
                  color: 'rgba(255,255,255,0.6)',
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedTile({ x, y, value })}
                title={`(${x},${y}): ${value} (0x${value.toString(16).toUpperCase()})`}
              >
                {zoom >= 3 && value > 0 ? value : ''}
              </div>
            ))
          )}
        </div>
      </div>

      {selectedTile && (
        <div className="min-selection">
          <strong>Position:</strong> ({selectedTile.x}, {selectedTile.y}) |{' '}
          <strong>Tile Index:</strong> {selectedTile.value} (0x{selectedTile.value.toString(16).toUpperCase().padStart(4, '0')})
        </div>
      )}

      <div className="min-viewer-stats">
        <span><strong>Range:</strong> {minData.minValue || 0} - {minData.maxValue}</span>
        <span><strong>Total:</strong> {minData.bytes.length.toLocaleString()} bytes</span>
      </div>
    </div>
  );
}

/**
 * TILViewer - Display tile definition data
 */
export function TILViewer({ data, filename }) {
  const [tilData, setTilData] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);

  useEffect(() => {
    if (!data) return;

    try {
      const bytes = new Uint8Array(data);
      const view = new DataView(data.buffer || data);

      // TIL files contain tile definitions
      // Each tile entry is typically 8 bytes (4 x 16-bit frame references)
      const entrySize = 8;
      const numEntries = Math.floor(bytes.length / entrySize);

      const entries = [];
      for (let i = 0; i < numEntries; i++) {
        const offset = i * entrySize;
        entries.push({
          index: i,
          frame0: view.getUint16(offset, true),
          frame1: view.getUint16(offset + 2, true),
          frame2: view.getUint16(offset + 4, true),
          frame3: view.getUint16(offset + 6, true),
        });
      }

      setTilData({ entries, numEntries, bytes });
    } catch (err) {
      console.error('Failed to parse TIL:', err);
    }
  }, [data]);

  if (!tilData) {
    return <div className="til-viewer-loading">Parsing tile data...</div>;
  }

  return (
    <div className="til-viewer">
      <div className="til-viewer-header">
        <span className="til-filename">{filename}</span>
        <span className="til-info">{tilData.numEntries} tile definitions</span>
      </div>

      <div className="til-viewer-list" style={{ maxHeight: '400px', overflow: 'auto' }}>
        <table className="til-table">
          <thead>
            <tr>
              <th>Index</th>
              <th>Frame 0</th>
              <th>Frame 1</th>
              <th>Frame 2</th>
              <th>Frame 3</th>
            </tr>
          </thead>
          <tbody>
            {tilData.entries.map((entry) => (
              <tr
                key={entry.index}
                className={selectedEntry?.index === entry.index ? 'selected' : ''}
                onClick={() => setSelectedEntry(entry)}
              >
                <td>{entry.index}</td>
                <td>{entry.frame0}</td>
                <td>{entry.frame1}</td>
                <td>{entry.frame2}</td>
                <td>{entry.frame3}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedEntry && (
        <div className="til-selection">
          <strong>Tile {selectedEntry.index}:</strong>{' '}
          Frames [{selectedEntry.frame0}, {selectedEntry.frame1}, {selectedEntry.frame2}, {selectedEntry.frame3}]
        </div>
      )}
    </div>
  );
}

/**
 * FileInfo - Display file metadata
 */
export function FileInfo({ data, filename }) {
  const bytes = data ? new Uint8Array(data) : null;
  const fileType = getFileType(filename);

  return (
    <div className="file-info">
      <div className="file-info-icon" style={{ color: fileType.color }}>
        {fileType.icon}
      </div>
      <div className="file-info-details">
        <div className="file-info-name">{filename}</div>
        <div className="file-info-type">{fileType.name}</div>
        {bytes && (
          <div className="file-info-size">{bytes.length.toLocaleString()} bytes</div>
        )}
      </div>
    </div>
  );
}

export default {
  HexViewer,
  PaletteViewer,
  DUNEditor,
  SOLViewer,
  MINViewer,
  TILViewer,
  FileInfo,
  getFileType,
  getFileCategory
};
