/**
 * Level Preview Component
 *
 * Renders DUN level data as a visual canvas preview.
 * Shows tiles, stairs, monsters, and objects with theme-appropriate colors.
 */

import React, { Component, createRef } from 'react';
import { TILE_SETS, getThemeForLevel } from './TileMapper';
import { MONSTER_IDS } from './MonsterMapper';

// Color schemes by theme
export const THEME_COLORS = {
  cathedral: {
    floor: '#3a3020',
    wall: '#5a4030',
    stairsUp: '#20a020',
    stairsDown: '#2020a0',
    door: '#806020',
    pillar: '#705030',
    border: '#2a2015',
    monster: '#a02020',
    item: '#20a0a0',
  },
  catacombs: {
    floor: '#252530',
    wall: '#404050',
    stairsUp: '#20a020',
    stairsDown: '#2020a0',
    door: '#505060',
    pillar: '#353540',
    border: '#1a1a20',
    monster: '#a02020',
    item: '#20a0a0',
  },
  caves: {
    floor: '#302820',
    wall: '#504030',
    stairsUp: '#20a020',
    stairsDown: '#2020a0',
    door: '#605030',
    pillar: '#403020',
    border: '#201810',
    monster: '#a02020',
    item: '#20a0a0',
    lava: '#a04010',
  },
  hell: {
    floor: '#301010',
    wall: '#501010',
    stairsUp: '#20a020',
    stairsDown: '#2020a0',
    door: '#602010',
    pillar: '#401010',
    border: '#200808',
    monster: '#ff4040',
    item: '#40a0a0',
    pentagram: '#800000',
  },
};

/**
 * Determine tile type from tile ID
 */
function getTileType(tileId, tiles) {
  if (!tileId || tileId === 0) return 'floor';
  if (tiles.floors?.includes(tileId)) return 'floor';
  if (tileId === tiles.stairsUp) return 'stairsUp';
  if (tileId === tiles.stairsDown) return 'stairsDown';
  if (tileId === tiles.door || tileId === tiles.doorOpen) return 'door';
  if (tileId === tiles.pillar) return 'pillar';
  if (tileId === tiles.lava) return 'lava';
  if (tileId === tiles.pentagram) return 'pentagram';
  if (tiles.walls && Object.values(tiles.walls).includes(tileId)) return 'wall';
  return 'wall'; // Default to wall for unknown
}

/**
 * Level Preview Component
 */
export class LevelPreview extends Component {
  constructor(props) {
    super(props);
    this.canvasRef = createRef();
    this.state = {
      hoveredTile: null,
      zoom: 1,
    };
  }

  componentDidMount() {
    this.renderPreview();
    const canvas = this.canvasRef.current;
    if (canvas) {
      canvas.addEventListener('mousemove', this.handleMouseMove);
      canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    }
  }

  componentDidUpdate(prevProps) {
    if (prevProps.dunData !== this.props.dunData ||
        prevProps.theme !== this.props.theme ||
        prevProps.showMonsters !== this.props.showMonsters ||
        prevProps.showItems !== this.props.showItems) {
      this.renderPreview();
    }
  }

  componentWillUnmount() {
    const canvas = this.canvasRef.current;
    if (canvas) {
      canvas.removeEventListener('mousemove', this.handleMouseMove);
      canvas.removeEventListener('wheel', this.handleWheel);
    }
  }

  handleMouseMove = (e) => {
    const canvas = this.canvasRef.current;
    if (!canvas || !this.props.dunData) return;

    const rect = canvas.getBoundingClientRect();
    const { width, height } = this.props.dunData;
    const tileSize = this.getTileSize();

    const x = Math.floor((e.clientX - rect.left) / tileSize);
    const y = Math.floor((e.clientY - rect.top) / tileSize);

    if (x >= 0 && x < width && y >= 0 && y < height) {
      this.setState({ hoveredTile: { x, y } });
      if (this.props.onTileHover) {
        this.props.onTileHover(x, y, this.props.dunData.baseTiles[y]?.[x]);
      }
    }
  }

  handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    this.setState(state => ({
      zoom: Math.max(0.5, Math.min(3, state.zoom + delta)),
    }), () => this.renderPreview());
  }

  getTileSize() {
    const { dunData, maxWidth = 400, maxHeight = 400 } = this.props;
    if (!dunData) return 8;

    const { width, height } = dunData;
    const baseTileSize = Math.min(maxWidth / width, maxHeight / height);
    return Math.max(4, Math.floor(baseTileSize * this.state.zoom));
  }

  renderPreview() {
    const canvas = this.canvasRef.current;
    const { dunData, theme: themeName, showMonsters = true, showItems = true, dungeonLevel = 1 } = this.props;

    if (!canvas || !dunData || !dunData.baseTiles) return;

    const ctx = canvas.getContext('2d');
    const { width, height, baseTiles, monsters, objects } = dunData;
    const tileSize = this.getTileSize();

    // Resize canvas
    canvas.width = width * tileSize;
    canvas.height = height * tileSize;

    // Get theme
    const theme = themeName || getThemeForLevel(dungeonLevel);
    const colors = THEME_COLORS[theme] || THEME_COLORS.cathedral;
    const tiles = TILE_SETS[theme] || TILE_SETS.cathedral;

    // Draw border/background
    ctx.fillStyle = colors.border;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw tiles
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tileId = baseTiles[y]?.[x] || 0;
        const tileType = getTileType(tileId, tiles);
        const color = colors[tileType] || colors.floor;

        ctx.fillStyle = color;
        ctx.fillRect(x * tileSize, y * tileSize, tileSize - 1, tileSize - 1);

        // Special markers
        if (tileType === 'stairsUp') {
          this.drawStairs(ctx, x * tileSize, y * tileSize, tileSize, 'up');
        } else if (tileType === 'stairsDown') {
          this.drawStairs(ctx, x * tileSize, y * tileSize, tileSize, 'down');
        }
      }
    }

    // Draw monsters
    if (showMonsters && monsters) {
      ctx.fillStyle = colors.monster;
      for (let my = 0; my < monsters.length; my++) {
        for (let mx = 0; mx < monsters[my].length; mx++) {
          if (monsters[my][mx] > 0) {
            // Monsters at 2x resolution
            const tx = Math.floor(mx / 2);
            const ty = Math.floor(my / 2);
            ctx.beginPath();
            ctx.arc(
              tx * tileSize + tileSize / 2,
              ty * tileSize + tileSize / 2,
              tileSize / 4,
              0,
              Math.PI * 2
            );
            ctx.fill();
          }
        }
      }
    }

    // Draw objects/items
    if (showItems && objects) {
      ctx.fillStyle = colors.item;
      for (let oy = 0; oy < objects.length; oy++) {
        for (let ox = 0; ox < objects[oy].length; ox++) {
          if (objects[oy][ox] > 0) {
            const tx = Math.floor(ox / 2);
            const ty = Math.floor(oy / 2);
            ctx.fillRect(
              tx * tileSize + tileSize / 4,
              ty * tileSize + tileSize / 4,
              tileSize / 2,
              tileSize / 2
            );
          }
        }
      }
    }

    // Draw hover highlight
    const { hoveredTile } = this.state;
    if (hoveredTile) {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeRect(
        hoveredTile.x * tileSize,
        hoveredTile.y * tileSize,
        tileSize,
        tileSize
      );
    }
  }

  drawStairs(ctx, x, y, size, direction) {
    const cx = x + size / 2;
    const cy = y + size / 2;
    const s = size / 3;

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();

    if (direction === 'up') {
      // Draw up arrow
      ctx.moveTo(cx, cy - s);
      ctx.lineTo(cx - s, cy + s / 2);
      ctx.moveTo(cx, cy - s);
      ctx.lineTo(cx + s, cy + s / 2);
    } else {
      // Draw down arrow
      ctx.moveTo(cx, cy + s);
      ctx.lineTo(cx - s, cy - s / 2);
      ctx.moveTo(cx, cy + s);
      ctx.lineTo(cx + s, cy - s / 2);
    }

    ctx.stroke();
  }

  render() {
    const { dunData, className, style } = this.props;
    const { hoveredTile, zoom } = this.state;

    return (
      <div className={`level-preview ${className || ''}`} style={style}>
        <canvas
          ref={this.canvasRef}
          className="level-preview-canvas"
          onClick={() => this.props.onTileClick?.(hoveredTile?.x, hoveredTile?.y)}
        />
        <div className="level-preview-info">
          {dunData && (
            <span className="level-size">{dunData.width}x{dunData.height}</span>
          )}
          {hoveredTile && (
            <span className="hover-pos">({hoveredTile.x}, {hoveredTile.y})</span>
          )}
          <span className="zoom-level">{Math.round(zoom * 100)}%</span>
        </div>
      </div>
    );
  }
}

/**
 * ASCII Preview - Simple text-based visualization
 */
export function ASCIIPreview({ dunData, theme, className }) {
  if (!dunData || !dunData.baseTiles) return null;

  const tiles = TILE_SETS[theme] || TILE_SETS.cathedral;
  const { baseTiles } = dunData;

  const lines = baseTiles.map(row =>
    row.map(tileId => {
      const type = getTileType(tileId, tiles);
      switch (type) {
        case 'floor': return '.';
        case 'wall': return '#';
        case 'stairsUp': return '<';
        case 'stairsDown': return '>';
        case 'door': return '+';
        case 'pillar': return 'O';
        case 'lava': return '~';
        case 'pentagram': return '*';
        default: return '?';
      }
    }).join('')
  ).join('\n');

  return (
    <pre className={`ascii-preview ${className || ''}`}>
      {lines}
    </pre>
  );
}

/**
 * Mini Map - Smaller version for overview
 */
export function MiniMap({ dunData, theme, size = 100, className }) {
  const canvasRef = createRef();

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !dunData || !dunData.baseTiles) return;

    const ctx = canvas.getContext('2d');
    const { width, height, baseTiles } = dunData;
    const tiles = TILE_SETS[theme] || TILE_SETS.cathedral;
    const colors = THEME_COLORS[theme] || THEME_COLORS.cathedral;

    canvas.width = size;
    canvas.height = size;

    const scaleX = size / width;
    const scaleY = size / height;

    // Clear
    ctx.fillStyle = colors.border;
    ctx.fillRect(0, 0, size, size);

    // Draw scaled tiles
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tileId = baseTiles[y]?.[x] || 0;
        const type = getTileType(tileId, tiles);
        ctx.fillStyle = colors[type] || colors.floor;
        ctx.fillRect(
          Math.floor(x * scaleX),
          Math.floor(y * scaleY),
          Math.ceil(scaleX),
          Math.ceil(scaleY)
        );
      }
    }
  }, [dunData, theme, size]);

  return (
    <canvas
      ref={canvasRef}
      className={`mini-map ${className || ''}`}
      width={size}
      height={size}
    />
  );
}

// Default export
const LevelPreviewComponents = {
  LevelPreview,
  ASCIIPreview,
  MiniMap,
  THEME_COLORS,
};

export default LevelPreviewComponents;
