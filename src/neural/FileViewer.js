/**
 * FileViewer Components
 *
 * Provides viewers for different Diablo file formats:
 * - HexViewer: Raw binary inspection
 * - PaletteViewer: PAL color palette display
 * - DUNViewer: Level layout with interactive editing
 * - TileDataViewer: MIN/TIL/SOL data display
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

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
  PCX: { ext: '.pcx', name: 'Image', icon: '🖼️', color: '#a9a' },
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
  const [zoom, setZoom] = useState(16); // Larger default zoom
  const [showGrid, setShowGrid] = useState(true);
  const [layer, setLayer] = useState('base'); // base, monsters, objects, items
  const [showStats, setShowStats] = useState(true);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [isDragging, setIsDragging] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Compute level statistics
  const computeStats = useCallback((dunData) => {
    if (!dunData) return null;

    const { width, height, baseLayer, subLayers } = dunData;

    // Count tile types
    const tileStats = {};
    let floorCount = 0, wallCount = 0, doorCount = 0, stairsCount = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tileId = baseLayer[y][x];
        tileStats[tileId] = (tileStats[tileId] || 0) + 1;

        // Categorize
        if (tileId === 0) continue;
        if (tileId >= 13 && tileId <= 15) floorCount++;
        else if (tileId >= 1 && tileId <= 4) wallCount++;
        else if (tileId >= 25 && tileId <= 32) doorCount++;
        else if (tileId >= 36 && tileId <= 39) stairsCount++;
      }
    }

    // Count monsters by type
    const monsterStats = {};
    let totalMonsters = 0;
    const monsters = subLayers.monsters || [];
    for (let y = 0; y < monsters.length; y++) {
      for (let x = 0; x < (monsters[y] || []).length; x++) {
        const mId = monsters[y][x];
        if (mId > 0) {
          monsterStats[mId] = (monsterStats[mId] || 0) + 1;
          totalMonsters++;
        }
      }
    }

    // Count objects by type
    const objectStats = {};
    let totalObjects = 0;
    const objects = subLayers.objects || [];
    for (let y = 0; y < objects.length; y++) {
      for (let x = 0; x < (objects[y] || []).length; x++) {
        const oId = objects[y][x];
        if (oId > 0) {
          objectStats[oId] = (objectStats[oId] || 0) + 1;
          totalObjects++;
        }
      }
    }

    // Count items
    let totalItems = 0;
    const items = subLayers.items || [];
    for (let y = 0; y < items.length; y++) {
      for (let x = 0; x < (items[y] || []).length; x++) {
        if (items[y][x] > 0) totalItems++;
      }
    }

    // Estimate level theme based on tile distribution
    let theme = 'unknown';
    if (wallCount > width * height * 0.3) theme = 'cathedral';
    else if (floorCount > width * height * 0.6) theme = 'caves';
    else if (doorCount > 4) theme = 'catacombs';

    return {
      dimensions: `${width} × ${height}`,
      totalTiles: width * height,
      floorCount,
      wallCount,
      doorCount,
      stairsCount,
      totalMonsters,
      totalObjects,
      totalItems,
      monsterStats,
      objectStats,
      tileStats,
      theme,
    };
  }, []);

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

  // Compute stats when dunData changes
  const stats = useMemo(() => computeStats(dunData), [dunData, computeStats]);

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
        <button
          className="stats-toggle"
          onClick={() => setShowStats(!showStats)}
          title="Toggle level statistics"
        >
          {showStats ? '▼' : '▶'} Stats
        </button>
      </div>

      {/* Level Statistics Panel */}
      {showStats && stats && (
        <div className="dun-editor-stats">
          <div className="stats-grid">
            <div className="stat-item">
              <span className="stat-label">Dimensions:</span>
              <span className="stat-value">{stats.dimensions}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Total Tiles:</span>
              <span className="stat-value">{stats.totalTiles}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Floor Tiles:</span>
              <span className="stat-value">{stats.floorCount}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Wall Tiles:</span>
              <span className="stat-value">{stats.wallCount}</span>
            </div>
            <div className="stat-item highlight-red">
              <span className="stat-label">Monsters:</span>
              <span className="stat-value">{stats.totalMonsters}</span>
            </div>
            <div className="stat-item highlight-gold">
              <span className="stat-label">Objects:</span>
              <span className="stat-value">{stats.totalObjects}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Items:</span>
              <span className="stat-value">{stats.totalItems}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Doors:</span>
              <span className="stat-value">{stats.doorCount}</span>
            </div>
            <div className="stat-item highlight-green">
              <span className="stat-label">Stairs:</span>
              <span className="stat-value">{stats.stairsCount}</span>
            </div>
            <div className="stat-item">
              <span className="stat-label">Theme:</span>
              <span className="stat-value">{stats.theme}</span>
            </div>
          </div>

          {/* Monster breakdown */}
          {Object.keys(stats.monsterStats).length > 0 && (
            <div className="stats-breakdown">
              <span className="breakdown-label">Monsters:</span>
              <div className="breakdown-items">
                {Object.entries(stats.monsterStats).map(([id, count]) => {
                  const monster = COMMON_MONSTERS.find(m => m.id === parseInt(id));
                  return (
                    <span key={id} className="breakdown-item">
                      {monster?.name || `Type ${id}`}: {count}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Object breakdown */}
          {Object.keys(stats.objectStats).length > 0 && (
            <div className="stats-breakdown">
              <span className="breakdown-label">Objects:</span>
              <div className="breakdown-items">
                {Object.entries(stats.objectStats).map(([id, count]) => {
                  const obj = COMMON_OBJECTS.find(o => o.id === parseInt(id));
                  return (
                    <span key={id} className="breakdown-item">
                      {obj?.name || `Type ${id}`}: {count}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

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
 * TILViewer - Display tile definition data with graphical preview
 */
export function TILViewer({ data, filename }) {
  const [tilData, setTilData] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // grid, table
  const [tileSize, setTileSize] = useState(32);
  const [showLabels, setShowLabels] = useState(true);

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
      let maxFrame = 0;
      for (let i = 0; i < numEntries; i++) {
        const offset = i * entrySize;
        const entry = {
          index: i,
          frame0: view.getUint16(offset, true),
          frame1: view.getUint16(offset + 2, true),
          frame2: view.getUint16(offset + 4, true),
          frame3: view.getUint16(offset + 6, true),
        };
        entries.push(entry);
        maxFrame = Math.max(maxFrame, entry.frame0, entry.frame1, entry.frame2, entry.frame3);
      }

      setTilData({ entries, numEntries, bytes, maxFrame });
    } catch (err) {
      console.error('Failed to parse TIL:', err);
    }
  }, [data]);

  // Generate a color based on frame index for visualization
  const getFrameColor = useCallback((frameIndex) => {
    if (frameIndex === 0) return '#1a1a1a';
    // Generate a distinct color based on frame index
    const hue = (frameIndex * 137.5) % 360; // Golden angle for good color distribution
    const saturation = 50 + (frameIndex % 30);
    const lightness = 30 + (frameIndex % 25);
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }, []);

  // Render a single tile as a 2x2 grid of its frames
  const renderTilePreview = useCallback((entry, size, isSelected) => {
    const halfSize = size / 2;
    return (
      <div
        className={`til-preview-tile ${isSelected ? 'selected' : ''}`}
        onClick={() => setSelectedEntry(entry)}
        title={`Tile ${entry.index}: [${entry.frame0}, ${entry.frame1}, ${entry.frame2}, ${entry.frame3}]`}
        style={{
          width: size,
          height: size,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gridTemplateRows: '1fr 1fr',
          border: isSelected ? '2px solid #fff' : '1px solid #333',
          cursor: 'pointer',
        }}
      >
        <div
          className="frame-cell"
          style={{ backgroundColor: getFrameColor(entry.frame0), width: halfSize, height: halfSize }}
        >
          {showLabels && size >= 48 && <span className="frame-label">{entry.frame0}</span>}
        </div>
        <div
          className="frame-cell"
          style={{ backgroundColor: getFrameColor(entry.frame1), width: halfSize, height: halfSize }}
        >
          {showLabels && size >= 48 && <span className="frame-label">{entry.frame1}</span>}
        </div>
        <div
          className="frame-cell"
          style={{ backgroundColor: getFrameColor(entry.frame2), width: halfSize, height: halfSize }}
        >
          {showLabels && size >= 48 && <span className="frame-label">{entry.frame2}</span>}
        </div>
        <div
          className="frame-cell"
          style={{ backgroundColor: getFrameColor(entry.frame3), width: halfSize, height: halfSize }}
        >
          {showLabels && size >= 48 && <span className="frame-label">{entry.frame3}</span>}
        </div>
      </div>
    );
  }, [getFrameColor, showLabels]);

  if (!tilData) {
    return <div className="til-viewer-loading">Parsing tile data...</div>;
  }

  return (
    <div className="til-viewer">
      <div className="til-viewer-header">
        <span className="til-filename">{filename}</span>
        <span className="til-info">
          {tilData.numEntries} tiles | Max frame: {tilData.maxFrame}
        </span>
        <div className="til-controls">
          <button
            className={viewMode === 'grid' ? 'active' : ''}
            onClick={() => setViewMode('grid')}
            title="Grid view"
          >
            Grid
          </button>
          <button
            className={viewMode === 'table' ? 'active' : ''}
            onClick={() => setViewMode('table')}
            title="Table view"
          >
            Table
          </button>
          {viewMode === 'grid' && (
            <>
              <span className="control-divider">|</span>
              <span className="control-label">Size:</span>
              <input
                type="range"
                min="24"
                max="80"
                value={tileSize}
                onChange={(e) => setTileSize(Number(e.target.value))}
              />
              <span>{tileSize}px</span>
              <label className="control-checkbox">
                <input
                  type="checkbox"
                  checked={showLabels}
                  onChange={(e) => setShowLabels(e.target.checked)}
                />
                Labels
              </label>
            </>
          )}
        </div>
      </div>

      {/* Grid View - Visual tile preview */}
      {viewMode === 'grid' && (
        <div className="til-viewer-grid" style={{ maxHeight: '400px', overflow: 'auto' }}>
          <div className="til-grid" style={{
            display: 'grid',
            gridTemplateColumns: `repeat(auto-fill, minmax(${tileSize}px, ${tileSize}px))`,
            gap: '4px',
            padding: '8px',
          }}>
            {tilData.entries.map((entry) => (
              <div key={entry.index} className="til-grid-item">
                {renderTilePreview(entry, tileSize, selectedEntry?.index === entry.index)}
                {tileSize >= 32 && (
                  <div className="til-grid-label">{entry.index}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table View - Detailed data */}
      {viewMode === 'table' && (
        <div className="til-viewer-list" style={{ maxHeight: '400px', overflow: 'auto' }}>
          <table className="til-table">
            <thead>
              <tr>
                <th>Index</th>
                <th>Preview</th>
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
                  <td>
                    {renderTilePreview(entry, 32, false)}
                  </td>
                  <td style={{ backgroundColor: getFrameColor(entry.frame0) + '33' }}>
                    {entry.frame0}
                  </td>
                  <td style={{ backgroundColor: getFrameColor(entry.frame1) + '33' }}>
                    {entry.frame1}
                  </td>
                  <td style={{ backgroundColor: getFrameColor(entry.frame2) + '33' }}>
                    {entry.frame2}
                  </td>
                  <td style={{ backgroundColor: getFrameColor(entry.frame3) + '33' }}>
                    {entry.frame3}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Selected tile detail panel */}
      {selectedEntry && (
        <div className="til-selection">
          <div className="til-selection-preview">
            {renderTilePreview(selectedEntry, 80, false)}
          </div>
          <div className="til-selection-details">
            <div className="til-selection-title">Tile {selectedEntry.index}</div>
            <div className="til-selection-info">
              <div className="frame-info">
                <span className="frame-badge" style={{ backgroundColor: getFrameColor(selectedEntry.frame0) }}>
                  TL: {selectedEntry.frame0}
                </span>
                <span className="frame-badge" style={{ backgroundColor: getFrameColor(selectedEntry.frame1) }}>
                  TR: {selectedEntry.frame1}
                </span>
                <span className="frame-badge" style={{ backgroundColor: getFrameColor(selectedEntry.frame2) }}>
                  BL: {selectedEntry.frame2}
                </span>
                <span className="frame-badge" style={{ backgroundColor: getFrameColor(selectedEntry.frame3) }}>
                  BR: {selectedEntry.frame3}
                </span>
              </div>
              <div className="tile-layout">
                2×2 tile composed of 4 MIN frame references
              </div>
            </div>
          </div>
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

/**
 * CELViewer - Display CEL sprite files with animation
 */
export function CELViewer({ data, filename, palette: externalPalette }) {
  const canvasRef = useRef(null);
  const [celData, setCelData] = useState(null);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(2);
  const [fps, setFps] = useState(10);
  const [error, setError] = useState(null);
  const [showGrid, setShowGrid] = useState(false);
  const [decoderLoaded, setDecoderLoaded] = useState(false);
  const [customWidth, setCustomWidth] = useState(0); // 0 = auto-detect
  const [widthInput, setWidthInput] = useState('');
  const animationRef = useRef(null);

  // Common Diablo sprite widths for quick selection
  const COMMON_WIDTHS = [28, 32, 56, 64, 96, 128, 160];

  // Import decoder lazily
  const decoderRef = useRef(null);

  useEffect(() => {
    import('./CELEncoder').then(module => {
      decoderRef.current = module;
      setDecoderLoaded(true);
    });
  }, []);

  // Decode CEL data
  useEffect(() => {
    if (!data || !decoderRef.current || !decoderLoaded) return;

    try {
      const bytes = new Uint8Array(data);
      const decoded = decoderRef.current.decodeCELFull(bytes, {
        palette: externalPalette || decoderRef.current.DIABLO_FULL_PALETTE,
        filename: filename || '',
        frameWidth: customWidth,
      });
      setCelData(decoded);
      setCurrentFrame(0);
      setError(null);

      // Update width input to show detected/current width
      if (decoded.frames.length > 0 && !customWidth) {
        setWidthInput(String(decoded.frames[0].width));
      }
    } catch (err) {
      console.error('CEL decode error:', err);
      setError(err.message);
      setCelData(null);
    }
  }, [data, externalPalette, decoderLoaded, filename, customWidth]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || !celData || celData.frames.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentFrame(prev => (prev + 1) % celData.frames.length);
    }, 1000 / fps);

    animationRef.current = interval;
    return () => clearInterval(interval);
  }, [isPlaying, celData, fps]);

  // Render current frame
  useEffect(() => {
    if (!celData || !canvasRef.current || !decoderRef.current) return;

    const frame = celData.frames[currentFrame];
    if (!frame) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const width = frame.width * zoom;
    const height = frame.height * zoom;

    canvas.width = width;
    canvas.height = height;

    // Clear with transparency pattern
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    // Draw checkerboard for transparency
    const checkSize = 8;
    ctx.fillStyle = '#252540';
    for (let y = 0; y < height; y += checkSize * 2) {
      for (let x = 0; x < width; x += checkSize * 2) {
        ctx.fillRect(x, y, checkSize, checkSize);
        ctx.fillRect(x + checkSize, y + checkSize, checkSize, checkSize);
      }
    }

    // Render sprite
    const palette = externalPalette || decoderRef.current.DIABLO_FULL_PALETTE;
    const imageData = decoderRef.current.renderFrameToImageData(frame, palette, zoom);
    ctx.putImageData(imageData, 0, 0);

    // Draw grid if enabled
    if (showGrid && zoom >= 2) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      for (let x = 0; x <= frame.width; x++) {
        ctx.beginPath();
        ctx.moveTo(x * zoom, 0);
        ctx.lineTo(x * zoom, height);
        ctx.stroke();
      }
      for (let y = 0; y <= frame.height; y++) {
        ctx.beginPath();
        ctx.moveTo(0, y * zoom);
        ctx.lineTo(width, y * zoom);
        ctx.stroke();
      }
    }
  }, [celData, currentFrame, zoom, showGrid, externalPalette]);

  const handleWidthChange = (newWidth) => {
    const w = parseInt(newWidth, 10);
    if (w > 0 && w <= 512) {
      setCustomWidth(w);
      setWidthInput(String(w));
    }
  };

  const handleWidthInputSubmit = () => {
    const w = parseInt(widthInput, 10);
    if (w > 0 && w <= 512) {
      setCustomWidth(w);
    }
  };

  const resetToAutoDetect = () => {
    setCustomWidth(0);
    setWidthInput('');
  };

  if (error) {
    return (
      <div className="cel-viewer cel-viewer-error">
        <div className="error-icon">⚠️</div>
        <div className="error-message">Failed to decode CEL file</div>
        <div className="error-detail">{error}</div>
      </div>
    );
  }

  if (!celData) {
    return (
      <div className="cel-viewer cel-viewer-loading">
        <div className="loading-spinner">⏳</div>
        <div>Decoding sprite...</div>
      </div>
    );
  }

  const currentFrameData = celData.frames[currentFrame];

  return (
    <div className="cel-viewer">
      <div className="cel-viewer-header">
        <span className="cel-filename">{filename.split('/').pop()}</span>
        <span className="cel-info">
          {celData.frameCount} frame{celData.frameCount !== 1 ? 's' : ''} |
          {currentFrameData ? ` ${currentFrameData.width}×${currentFrameData.height}` : ''}
        </span>
      </div>

      <div className="cel-viewer-controls">
        <div className="control-group">
          <button
            className={`control-btn ${isPlaying ? 'active' : ''}`}
            onClick={() => setIsPlaying(!isPlaying)}
            disabled={celData.frames.length <= 1}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button
            className="control-btn"
            onClick={() => setCurrentFrame(prev => Math.max(0, prev - 1))}
            disabled={currentFrame === 0}
            title="Previous frame"
          >
            ◀
          </button>
          <span className="frame-counter">
            {currentFrame + 1} / {celData.frameCount}
          </span>
          <button
            className="control-btn"
            onClick={() => setCurrentFrame(prev => Math.min(celData.frames.length - 1, prev + 1))}
            disabled={currentFrame >= celData.frames.length - 1}
            title="Next frame"
          >
            ▶
          </button>
        </div>

        <div className="control-group">
          <label>FPS:</label>
          <input
            type="range"
            min="1"
            max="30"
            value={fps}
            onChange={(e) => setFps(Number(e.target.value))}
          />
          <span>{fps}</span>
        </div>

        <div className="control-group">
          <label>Zoom:</label>
          <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={3}>3x</option>
            <option value={4}>4x</option>
            <option value={6}>6x</option>
            <option value={8}>8x</option>
          </select>
        </div>

        <div className="control-group">
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

      {/* Dimension controls */}
      <div className="cel-dimension-controls">
        <label>Width:</label>
        <div className="width-presets">
          {COMMON_WIDTHS.map(w => (
            <button
              key={w}
              className={`preset-btn ${customWidth === w ? 'active' : ''}`}
              onClick={() => handleWidthChange(w)}
              title={`Set width to ${w}px`}
            >
              {w}
            </button>
          ))}
        </div>
        <div className="width-custom">
          <input
            type="number"
            min="1"
            max="512"
            value={widthInput}
            onChange={(e) => setWidthInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleWidthInputSubmit()}
            placeholder="Custom"
          />
          <button onClick={handleWidthInputSubmit} title="Apply custom width">✓</button>
          <button onClick={resetToAutoDetect} title="Reset to auto-detect">↺</button>
        </div>
      </div>

      <div className="cel-viewer-canvas-container">
        <canvas ref={canvasRef} className="cel-viewer-canvas" />
      </div>

      {celData.frames.length > 1 && (
        <div className="cel-frame-strip">
          {celData.frames.map((frame, idx) => (
            <div
              key={idx}
              className={`frame-thumb ${idx === currentFrame ? 'active' : ''}`}
              onClick={() => {
                setCurrentFrame(idx);
                setIsPlaying(false);
              }}
              title={`Frame ${idx + 1}`}
            >
              {idx + 1}
            </div>
          ))}
        </div>
      )}

      {currentFrameData && (
        <div className="cel-frame-info">
          <span>Frame {currentFrame + 1}:</span>
          <span>{currentFrameData.width}×{currentFrameData.height} px</span>
          <span>{currentFrameData.dataSize?.toLocaleString() || '?'} bytes</span>
          {customWidth > 0 && <span className="custom-width-indicator">(custom width)</span>}
        </div>
      )}
    </div>
  );
}

/**
 * CL2Viewer - Display CL2 animation files with 8 directions
 */
export function CL2Viewer({ data, filename, palette: externalPalette }) {
  const canvasRef = useRef(null);
  const [cl2Data, setCl2Data] = useState(null);
  const [currentDirection, setCurrentDirection] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(2);
  const [fps, setFps] = useState(10);
  const [error, setError] = useState(null);
  const [showAllDirections, setShowAllDirections] = useState(false);
  const [decoderLoaded, setDecoderLoaded] = useState(false);
  const animationRef = useRef(null);

  const decoderRef = useRef(null);

  const DIRECTION_NAMES = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'];
  const DIRECTION_ARROWS = ['↓', '↙', '←', '↖', '↑', '↗', '→', '↘'];

  useEffect(() => {
    import('./CELEncoder').then(module => {
      decoderRef.current = module;
      setDecoderLoaded(true);
    });
  }, []);

  // Decode CL2 data
  useEffect(() => {
    if (!data || !decoderRef.current || !decoderLoaded) return;

    try {
      const bytes = new Uint8Array(data);
      const decoded = decoderRef.current.decodeCL2(bytes, {
        palette: externalPalette || decoderRef.current.DIABLO_FULL_PALETTE,
        filename: filename || '',
      });

      if (decoded.type === 'cel') {
        // Fallback to CEL format
        setCl2Data({ ...decoded.data, isCEL: true });
      } else {
        setCl2Data(decoded);
      }
      setCurrentFrame(0);
      setCurrentDirection(0);
      setError(null);
    } catch (err) {
      console.error('CL2 decode error:', err);
      setError(err.message);
      setCl2Data(null);
    }
  }, [data, externalPalette, decoderLoaded, filename]);

  // Get current frames
  const getCurrentFrames = useCallback(() => {
    if (!cl2Data) return [];
    if (cl2Data.isCEL) return cl2Data.frames;
    const dir = cl2Data.directions[currentDirection];
    return dir?.frames || [];
  }, [cl2Data, currentDirection]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying || !cl2Data) return;

    const frames = getCurrentFrames();
    if (frames.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentFrame(prev => (prev + 1) % frames.length);
    }, 1000 / fps);

    animationRef.current = interval;
    return () => clearInterval(interval);
  }, [isPlaying, cl2Data, fps, getCurrentFrames]);

  // Render current frame(s)
  useEffect(() => {
    if (!cl2Data || !canvasRef.current || !decoderRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const palette = externalPalette || decoderRef.current.DIABLO_FULL_PALETTE;

    if (showAllDirections && !cl2Data.isCEL) {
      // Show all 8 directions in a grid
      const directions = cl2Data.directions.filter(d => d.frames.length > 0);
      if (directions.length === 0) return;

      const sampleFrame = directions[0].frames[0];
      const frameW = sampleFrame.width * zoom;
      const frameH = sampleFrame.height * zoom;

      // 3x3 grid layout for 8 directions + center
      canvas.width = frameW * 3 + 8;
      canvas.height = frameH * 3 + 8;

      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Direction positions in 3x3 grid: N, NE, E, SE, S, SW, W, NW
      const positions = [
        { dir: 4, x: 1, y: 0 },  // N
        { dir: 5, x: 2, y: 0 },  // NE
        { dir: 6, x: 2, y: 1 },  // E
        { dir: 7, x: 2, y: 2 },  // SE
        { dir: 0, x: 1, y: 2 },  // S
        { dir: 1, x: 0, y: 2 },  // SW
        { dir: 2, x: 0, y: 1 },  // W
        { dir: 3, x: 0, y: 0 },  // NW
      ];

      positions.forEach(({ dir, x, y }) => {
        const direction = cl2Data.directions[dir];
        if (!direction || direction.frames.length === 0) return;

        const frameIdx = Math.min(currentFrame, direction.frames.length - 1);
        const frame = direction.frames[frameIdx];
        if (!frame) return;

        const px = x * (frameW + 4);
        const py = y * (frameH + 4);

        // Draw border for current direction
        if (dir === currentDirection) {
          ctx.strokeStyle = '#4a9';
          ctx.lineWidth = 2;
          ctx.strokeRect(px - 1, py - 1, frameW + 2, frameH + 2);
        }

        const imageData = decoderRef.current.renderFrameToImageData(frame, palette, zoom);
        ctx.putImageData(imageData, px, py);
      });

    } else {
      // Show single direction
      const frames = getCurrentFrames();
      const frame = frames[currentFrame];
      if (!frame) return;

      const width = frame.width * zoom;
      const height = frame.height * zoom;

      canvas.width = width;
      canvas.height = height;

      // Transparency pattern
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, width, height);

      const checkSize = 8;
      ctx.fillStyle = '#252540';
      for (let y = 0; y < height; y += checkSize * 2) {
        for (let x = 0; x < width; x += checkSize * 2) {
          ctx.fillRect(x, y, checkSize, checkSize);
          ctx.fillRect(x + checkSize, y + checkSize, checkSize, checkSize);
        }
      }

      const imageData = decoderRef.current.renderFrameToImageData(frame, palette, zoom);
      ctx.putImageData(imageData, 0, 0);
    }
  }, [cl2Data, currentDirection, currentFrame, zoom, showAllDirections, externalPalette, getCurrentFrames]);

  if (error) {
    return (
      <div className="cl2-viewer cl2-viewer-error">
        <div className="error-icon">⚠️</div>
        <div className="error-message">Failed to decode CL2 file</div>
        <div className="error-detail">{error}</div>
      </div>
    );
  }

  if (!cl2Data) {
    return (
      <div className="cl2-viewer cl2-viewer-loading">
        <div className="loading-spinner">⏳</div>
        <div>Decoding animation...</div>
      </div>
    );
  }

  const currentFrames = getCurrentFrames();
  const currentFrameData = currentFrames[currentFrame];

  return (
    <div className="cl2-viewer">
      <div className="cl2-viewer-header">
        <span className="cl2-filename">{filename.split('/').pop()}</span>
        <span className="cl2-info">
          {cl2Data.isCEL ? (
            <>CEL: {cl2Data.frameCount} frames</>
          ) : (
            <>CL2: 8 directions, {currentFrames.length} frames</>
          )}
          {currentFrameData && ` | ${currentFrameData.width}×${currentFrameData.height}`}
        </span>
      </div>

      {!cl2Data.isCEL && (
        <div className="cl2-direction-selector">
          <span className="direction-label">Direction:</span>
          <div className="direction-grid">
            {DIRECTION_ARROWS.map((arrow, idx) => (
              <button
                key={idx}
                className={`direction-btn ${idx === currentDirection ? 'active' : ''}`}
                onClick={() => {
                  setCurrentDirection(idx);
                  setCurrentFrame(0);
                }}
                title={DIRECTION_NAMES[idx]}
              >
                {arrow}
              </button>
            ))}
          </div>
          <span className="direction-name">{DIRECTION_NAMES[currentDirection]}</span>

          <label className="show-all-toggle">
            <input
              type="checkbox"
              checked={showAllDirections}
              onChange={(e) => setShowAllDirections(e.target.checked)}
            />
            Show all
          </label>
        </div>
      )}

      <div className="cl2-viewer-controls">
        <div className="control-group">
          <button
            className={`control-btn ${isPlaying ? 'active' : ''}`}
            onClick={() => setIsPlaying(!isPlaying)}
            disabled={currentFrames.length <= 1}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? '⏸' : '▶'}
          </button>
          <button
            className="control-btn"
            onClick={() => setCurrentFrame(prev => Math.max(0, prev - 1))}
            disabled={currentFrame === 0}
          >
            ◀
          </button>
          <span className="frame-counter">
            {currentFrame + 1} / {currentFrames.length}
          </span>
          <button
            className="control-btn"
            onClick={() => setCurrentFrame(prev => Math.min(currentFrames.length - 1, prev + 1))}
            disabled={currentFrame >= currentFrames.length - 1}
          >
            ▶
          </button>
        </div>

        <div className="control-group">
          <label>FPS:</label>
          <input
            type="range"
            min="1"
            max="30"
            value={fps}
            onChange={(e) => setFps(Number(e.target.value))}
          />
          <span>{fps}</span>
        </div>

        <div className="control-group">
          <label>Zoom:</label>
          <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={3}>3x</option>
            <option value={4}>4x</option>
          </select>
        </div>
      </div>

      <div className="cl2-viewer-canvas-container">
        <canvas ref={canvasRef} className="cl2-viewer-canvas" />
      </div>

      {currentFrames.length > 1 && (
        <div className="cl2-frame-strip">
          {currentFrames.map((frame, idx) => (
            <div
              key={idx}
              className={`frame-thumb ${idx === currentFrame ? 'active' : ''}`}
              onClick={() => {
                setCurrentFrame(idx);
                setIsPlaying(false);
              }}
              title={`Frame ${idx + 1}`}
            >
              {idx + 1}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * PCXViewer - Display PCX image files (legacy format used in Diablo UI)
 */
export function PCXViewer({ data, filename }) {
  const canvasRef = useRef(null);
  const [pcxData, setPcxData] = useState(null);
  const [zoom, setZoom] = useState(2);
  const [error, setError] = useState(null);
  const [showInfo, setShowInfo] = useState(true);
  const [decoderLoaded, setDecoderLoaded] = useState(false);

  const decoderRef = useRef(null);

  useEffect(() => {
    import('./CELEncoder').then(module => {
      decoderRef.current = module;
      setDecoderLoaded(true);
    });
  }, []);

  // Decode PCX data
  useEffect(() => {
    if (!data || !decoderRef.current || !decoderLoaded) return;

    try {
      const bytes = new Uint8Array(data);
      const decoded = decoderRef.current.decodePCX(bytes);
      setPcxData(decoded);
      setError(null);
    } catch (err) {
      console.error('PCX decode error:', err);
      setError(err.message);
      setPcxData(null);
    }
  }, [data, decoderLoaded]);

  // Render image
  useEffect(() => {
    if (!pcxData || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    const width = pcxData.width * zoom;
    const height = pcxData.height * zoom;

    canvas.width = width;
    canvas.height = height;

    // Draw checkerboard background for transparency
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, width, height);

    const checkSize = 8;
    ctx.fillStyle = '#252540';
    for (let y = 0; y < height; y += checkSize * 2) {
      for (let x = 0; x < width; x += checkSize * 2) {
        ctx.fillRect(x, y, checkSize, checkSize);
        ctx.fillRect(x + checkSize, y + checkSize, checkSize, checkSize);
      }
    }

    // Create ImageData and scale
    const imageData = new ImageData(
      new Uint8ClampedArray(pcxData.rgba),
      pcxData.width,
      pcxData.height
    );

    // Use temporary canvas for scaling
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = pcxData.width;
    tempCanvas.height = pcxData.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.putImageData(imageData, 0, 0);

    // Draw scaled
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tempCanvas, 0, 0, width, height);
  }, [pcxData, zoom]);

  if (error) {
    return (
      <div className="pcx-viewer pcx-viewer-error">
        <div className="error-icon">⚠️</div>
        <div className="error-message">Failed to decode PCX file</div>
        <div className="error-detail">{error}</div>
      </div>
    );
  }

  if (!pcxData) {
    return (
      <div className="pcx-viewer pcx-viewer-loading">
        <div className="loading-spinner">⏳</div>
        <div>Decoding image...</div>
      </div>
    );
  }

  const colorMode = pcxData.bitsPerPixel === 8 && pcxData.numPlanes === 1
    ? (pcxData.is256Color ? '256-color' : '16-color')
    : pcxData.bitsPerPixel === 8 && pcxData.numPlanes === 3
    ? '24-bit RGB'
    : pcxData.bitsPerPixel === 1
    ? 'Monochrome'
    : `${pcxData.bitsPerPixel}bpp/${pcxData.numPlanes}p`;

  return (
    <div className="pcx-viewer">
      <div className="pcx-viewer-header">
        <span className="pcx-filename">{filename.split('/').pop()}</span>
        <span className="pcx-info">
          {pcxData.width}×{pcxData.height} | {colorMode}
        </span>
      </div>

      <div className="pcx-viewer-controls">
        <div className="control-group">
          <label>Zoom:</label>
          <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={3}>3x</option>
            <option value={4}>4x</option>
            <option value={6}>6x</option>
            <option value={8}>8x</option>
          </select>
        </div>

        <div className="control-group">
          <label>
            <input
              type="checkbox"
              checked={showInfo}
              onChange={(e) => setShowInfo(e.target.checked)}
            />
            Show details
          </label>
        </div>
      </div>

      <div className="pcx-viewer-canvas-container">
        <canvas ref={canvasRef} className="pcx-viewer-canvas" />
      </div>

      {showInfo && (
        <div className="pcx-info-panel">
          <div className="info-row">
            <span className="info-label">Dimensions:</span>
            <span>{pcxData.width} × {pcxData.height} pixels</span>
          </div>
          <div className="info-row">
            <span className="info-label">Color depth:</span>
            <span>{pcxData.bitsPerPixel} bits/pixel, {pcxData.numPlanes} plane(s)</span>
          </div>
          <div className="info-row">
            <span className="info-label">Palette:</span>
            <span>{pcxData.is256Color ? '256 colors (VGA)' : `${pcxData.palette.length} colors`}</span>
          </div>
          <div className="info-row">
            <span className="info-label">Resolution:</span>
            <span>{pcxData.hDpi} × {pcxData.vDpi} DPI</span>
          </div>
          <div className="info-row">
            <span className="info-label">PCX version:</span>
            <span>{pcxData.version}</span>
          </div>
        </div>
      )}
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
  CELViewer,
  CL2Viewer,
  PCXViewer,
  getFileType,
  getFileCategory
};
