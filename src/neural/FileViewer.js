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
export function DUNEditor({ data, filename, onModify, tileInfo }) {
  const canvasRef = useRef(null);
  const [dunData, setDunData] = useState(null);
  const [selectedTile, setSelectedTile] = useState(null);
  const [hoveredTile, setHoveredTile] = useState(null);
  const [tool, setTool] = useState('select'); // select, paint, monster, object
  const [paintTileId, setPaintTileId] = useState(13); // Default floor
  const [zoom, setZoom] = useState(8);
  const [showGrid, setShowGrid] = useState(true);
  const [layer, setLayer] = useState('base'); // base, monsters, objects, items

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
    } catch (err) {
      console.error('Failed to parse DUN:', err);
    }
  }, [data]);

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

  const handleCanvasClick = useCallback((e) => {
    if (!dunData || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / zoom);
    const y = Math.floor((e.clientY - rect.top) / zoom);

    if (x >= 0 && x < dunData.width && y >= 0 && y < dunData.height) {
      if (tool === 'select') {
        setSelectedTile({ x, y, tileId: dunData.baseLayer[y][x] });
      } else if (tool === 'paint' && onModify) {
        // Modify the tile
        const newBaseLayer = dunData.baseLayer.map((row, ry) =>
          row.map((tile, rx) => (rx === x && ry === y) ? paintTileId : tile)
        );
        const newDunData = { ...dunData, baseLayer: newBaseLayer };
        setDunData(newDunData);
        onModify(newDunData);
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
            🖌️ Paint
          </button>
        </div>

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

        {tool === 'paint' && (
          <div className="toolbar-group">
            <span className="toolbar-label">Tile ID:</span>
            <input
              type="number"
              min="0"
              max="500"
              value={paintTileId}
              onChange={(e) => setPaintTileId(Number(e.target.value))}
              style={{ width: 60 }}
            />
            <TilePalette onSelect={setPaintTileId} selected={paintTileId} />
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

export default { HexViewer, PaletteViewer, DUNEditor, FileInfo, getFileType, getFileCategory };
