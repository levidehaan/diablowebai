/**
 * AI Mod Tools
 *
 * Provides a tool-based interface for AI to modify Diablo game files.
 * Works with MPQ archives to create real, exportable game mods.
 *
 * Each tool has:
 * - name: Tool identifier
 * - description: What the tool does (for AI understanding)
 * - parameters: Expected input parameters
 * - execute: Function that performs the operation
 */

import DUNParser from './DUNParser';
import TileMapper from './TileMapper';
import MonsterMapper from './MonsterMapper';

// Tool definitions for AI
export const MOD_TOOLS = {
  /**
   * List files in the MPQ archive
   */
  listFiles: {
    name: 'listFiles',
    description: 'List all files in the MPQ archive, optionally filtered by path pattern',
    parameters: {
      pattern: {
        type: 'string',
        description: 'Optional glob pattern to filter files (e.g., "levels/l1data/*.dun")',
        required: false,
      },
    },
    execute: async (context, params = {}) => {
      const { mpqReader } = context;
      if (!mpqReader) {
        return { success: false, error: 'No MPQ loaded' };
      }

      try {
        const files = mpqReader.listFiles();
        let filtered = files;

        if (params.pattern) {
          const regex = globToRegex(params.pattern);
          filtered = files.filter(f => regex.test(f));
        }

        return {
          success: true,
          files: filtered,
          count: filtered.length,
          totalFiles: files.length,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Read and parse a DUN level file
   */
  readLevel: {
    name: 'readLevel',
    description: 'Read and parse a DUN level file from the MPQ',
    parameters: {
      path: {
        type: 'string',
        description: 'Path to DUN file (e.g., "levels/l1data/skngdo.dun")',
        required: true,
      },
    },
    execute: async (context, params) => {
      const { mpqReader } = context;
      if (!mpqReader) {
        return { success: false, error: 'No MPQ loaded' };
      }

      try {
        const buffer = mpqReader.read(params.path);
        if (!buffer) {
          return { success: false, error: `File not found: ${params.path}` };
        }

        const dunData = DUNParser.parse(buffer);
        const stats = DUNParser.getStats(dunData);
        const preview = DUNParser.visualize(dunData);

        return {
          success: true,
          path: params.path,
          data: dunData,
          stats,
          preview,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Modify tiles in a level
   */
  modifyTiles: {
    name: 'modifyTiles',
    description: 'Modify specific tiles in a level DUN file',
    parameters: {
      path: {
        type: 'string',
        description: 'Path to DUN file',
        required: true,
      },
      changes: {
        type: 'array',
        description: 'Array of {x, y, tile} changes',
        required: true,
      },
    },
    execute: async (context, params) => {
      const { mpqReader, modifiedFiles } = context;
      if (!mpqReader) {
        return { success: false, error: 'No MPQ loaded' };
      }

      try {
        // Get existing or modified version
        let dunData;
        if (modifiedFiles.has(params.path)) {
          dunData = modifiedFiles.get(params.path).data;
        } else {
          const buffer = mpqReader.read(params.path);
          if (!buffer) {
            return { success: false, error: `File not found: ${params.path}` };
          }
          dunData = DUNParser.parse(buffer);
        }

        // Apply changes
        let changesApplied = 0;
        for (const change of params.changes) {
          const { x, y, tile } = change;
          if (y >= 0 && y < dunData.height && x >= 0 && x < dunData.width) {
            dunData.baseTiles[y][x] = tile;
            changesApplied++;
          }
        }

        // Store modified version
        modifiedFiles.set(params.path, {
          type: 'dun',
          data: dunData,
          modified: Date.now(),
        });

        const preview = DUNParser.visualize(dunData);

        return {
          success: true,
          path: params.path,
          changesApplied,
          totalChanges: params.changes.length,
          preview,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Place monsters in a level
   */
  placeMonsters: {
    name: 'placeMonsters',
    description: 'Add monster spawns to a level',
    parameters: {
      path: {
        type: 'string',
        description: 'Path to DUN file',
        required: true,
      },
      spawns: {
        type: 'array',
        description: 'Array of {x, y, type, difficulty} spawns',
        required: true,
      },
    },
    execute: async (context, params) => {
      const { mpqReader, modifiedFiles } = context;
      if (!mpqReader) {
        return { success: false, error: 'No MPQ loaded' };
      }

      try {
        // Get existing or modified version
        let dunData;
        if (modifiedFiles.has(params.path)) {
          dunData = modifiedFiles.get(params.path).data;
        } else {
          const buffer = mpqReader.read(params.path);
          if (!buffer) {
            return { success: false, error: `File not found: ${params.path}` };
          }
          dunData = DUNParser.parse(buffer);
        }

        // Create monster layer if it doesn't exist
        if (!dunData.monsters) {
          dunData.monsters = DUNParser.createEmptySubLayer(dunData.width, dunData.height);
          dunData.hasMonsters = true;
        }

        // Convert and place monsters
        const converted = MonsterMapper.convertPlacements(params.spawns, context.dungeonLevel || 1);
        let placed = 0;

        for (const spawn of converted) {
          // Convert to sub-tile coordinates (2x resolution)
          const sx = spawn.x * 2;
          const sy = spawn.y * 2;

          if (sy >= 0 && sy < dunData.monsters.length &&
              sx >= 0 && sx < dunData.monsters[0].length) {
            dunData.monsters[sy][sx] = spawn.monsterId;
            placed++;
          }
        }

        // Store modified version
        modifiedFiles.set(params.path, {
          type: 'dun',
          data: dunData,
          modified: Date.now(),
        });

        const preview = DUNParser.visualize(dunData);

        return {
          success: true,
          path: params.path,
          monstersPlaced: placed,
          totalSpawns: params.spawns.length,
          preview,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Generate a new level from AI description
   */
  generateLevel: {
    name: 'generateLevel',
    description: 'Generate a new level layout from a description',
    parameters: {
      path: {
        type: 'string',
        description: 'Path where to save the new DUN file',
        required: true,
      },
      width: {
        type: 'number',
        description: 'Level width (default 16)',
        required: false,
      },
      height: {
        type: 'number',
        description: 'Level height (default 16)',
        required: false,
      },
      theme: {
        type: 'string',
        description: 'Level theme: cathedral, catacombs, caves, or hell',
        required: false,
      },
      layout: {
        type: 'array',
        description: 'Optional 2D array of 0 (floor) and 1 (wall)',
        required: false,
      },
    },
    execute: async (context, params) => {
      const { modifiedFiles, levelGenerator } = context;

      try {
        const width = params.width || 16;
        const height = params.height || 16;
        const theme = params.theme || 'cathedral';

        let dunData;

        if (params.layout) {
          // Use provided layout
          dunData = DUNParser.binaryGridToDUN(params.layout, {
            wallTile: TileMapper.TILE_SETS[theme]?.walls.vertical || 1,
          });
        } else if (levelGenerator) {
          // Generate using AI level generator
          const binaryGrid = await levelGenerator.generate({
            width,
            height,
            theme,
          });
          dunData = DUNParser.binaryGridToDUN(binaryGrid, {
            wallTile: TileMapper.TILE_SETS[theme]?.walls.vertical || 1,
          });
        } else {
          // Create simple level
          dunData = DUNParser.createEmpty(width, height, 0);

          // Add border walls
          for (let x = 0; x < width; x++) {
            dunData.baseTiles[0][x] = 1;
            dunData.baseTiles[height - 1][x] = 1;
          }
          for (let y = 0; y < height; y++) {
            dunData.baseTiles[y][0] = 1;
            dunData.baseTiles[y][width - 1] = 1;
          }

          // Add stairs
          dunData.baseTiles[2][2] = 36;  // Stairs up
          dunData.baseTiles[height - 3][width - 3] = 37;  // Stairs down
        }

        // Store in modified files
        modifiedFiles.set(params.path, {
          type: 'dun',
          data: dunData,
          modified: Date.now(),
          isNew: true,
        });

        const stats = DUNParser.getStats(dunData);
        const preview = DUNParser.visualize(dunData);

        return {
          success: true,
          path: params.path,
          width: dunData.width,
          height: dunData.height,
          stats,
          preview,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Preview a level as ASCII
   */
  previewLevel: {
    name: 'previewLevel',
    description: 'Get an ASCII preview of a level',
    parameters: {
      path: {
        type: 'string',
        description: 'Path to DUN file',
        required: true,
      },
    },
    execute: async (context, params) => {
      const { mpqReader, modifiedFiles } = context;

      try {
        let dunData;

        if (modifiedFiles.has(params.path)) {
          dunData = modifiedFiles.get(params.path).data;
        } else if (mpqReader) {
          const buffer = mpqReader.read(params.path);
          if (!buffer) {
            return { success: false, error: `File not found: ${params.path}` };
          }
          dunData = DUNParser.parse(buffer);
        } else {
          return { success: false, error: 'No MPQ loaded or file not modified' };
        }

        const stats = DUNParser.getStats(dunData);
        const preview = DUNParser.visualize(dunData);

        return {
          success: true,
          path: params.path,
          stats,
          preview,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * List all modifications made
   */
  listModifications: {
    name: 'listModifications',
    description: 'List all files that have been modified',
    parameters: {},
    execute: async (context) => {
      const { modifiedFiles } = context;

      const modifications = [];
      for (const [path, info] of modifiedFiles.entries()) {
        modifications.push({
          path,
          type: info.type,
          isNew: info.isNew || false,
          modified: info.modified,
        });
      }

      return {
        success: true,
        modifications,
        count: modifications.length,
      };
    },
  },

  /**
   * Discard modifications to a file
   */
  discardChanges: {
    name: 'discardChanges',
    description: 'Discard all modifications to a specific file',
    parameters: {
      path: {
        type: 'string',
        description: 'Path to file to discard changes for',
        required: true,
      },
    },
    execute: async (context, params) => {
      const { modifiedFiles } = context;

      if (modifiedFiles.has(params.path)) {
        modifiedFiles.delete(params.path);
        return { success: true, message: `Discarded changes to ${params.path}` };
      } else {
        return { success: false, error: `No modifications found for ${params.path}` };
      }
    },
  },

  /**
   * Get available monster types for a level
   */
  getMonsterTypes: {
    name: 'getMonsterTypes',
    description: 'Get list of available monster types for a dungeon level',
    parameters: {
      dungeonLevel: {
        type: 'number',
        description: 'Dungeon level (1-16)',
        required: true,
      },
    },
    execute: async (context, params) => {
      const monsters = MonsterMapper.getAvailableMonsters(params.dungeonLevel);
      const boss = MonsterMapper.getBossForLevel(params.dungeonLevel);

      return {
        success: true,
        dungeonLevel: params.dungeonLevel,
        availableMonsters: monsters,
        boss: boss,
      };
    },
  },

  /**
   * Get tile types for a theme
   */
  getTileTypes: {
    name: 'getTileTypes',
    description: 'Get available tile types for a dungeon theme',
    parameters: {
      theme: {
        type: 'string',
        description: 'Theme: cathedral, catacombs, caves, or hell',
        required: true,
      },
    },
    execute: async (context, params) => {
      const tiles = TileMapper.TILE_SETS[params.theme];

      if (!tiles) {
        return {
          success: false,
          error: `Unknown theme: ${params.theme}`,
          availableThemes: Object.keys(TileMapper.TILE_SETS),
        };
      }

      return {
        success: true,
        theme: params.theme,
        tiles: tiles,
      };
    },
  },
};

/**
 * Convert glob pattern to regex
 */
function globToRegex(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i');
}

/**
 * ModToolExecutor - Manages tool execution context
 */
export class ModToolExecutor {
  constructor(mpqReader = null) {
    this.mpqReader = mpqReader;
    this.modifiedFiles = new Map();
    this.operationLog = [];
    this.dungeonLevel = 1;
    this.levelGenerator = null;
  }

  /**
   * Set the MPQ reader
   */
  setMPQ(mpqReader) {
    this.mpqReader = mpqReader;
    this.modifiedFiles.clear();
    this.operationLog = [];
  }

  /**
   * Set level generator reference
   */
  setLevelGenerator(generator) {
    this.levelGenerator = generator;
  }

  /**
   * Set current dungeon level (for monster selection)
   */
  setDungeonLevel(level) {
    this.dungeonLevel = level;
  }

  /**
   * Get execution context
   */
  getContext() {
    return {
      mpqReader: this.mpqReader,
      modifiedFiles: this.modifiedFiles,
      dungeonLevel: this.dungeonLevel,
      levelGenerator: this.levelGenerator,
    };
  }

  /**
   * Execute a tool by name
   */
  async executeTool(toolName, params = {}) {
    const tool = MOD_TOOLS[toolName];
    if (!tool) {
      return { success: false, error: `Unknown tool: ${toolName}` };
    }

    const startTime = Date.now();
    const context = this.getContext();

    try {
      const result = await tool.execute(context, params);

      // Log operation
      this.operationLog.push({
        tool: toolName,
        params,
        result: result.success ? 'success' : 'error',
        error: result.error,
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      this.operationLog.push({
        tool: toolName,
        params,
        result: 'error',
        error: error.message,
        duration: Date.now() - startTime,
        timestamp: Date.now(),
      });

      return { success: false, error: error.message };
    }
  }

  /**
   * Get operation log
   */
  getLog() {
    return [...this.operationLog];
  }

  /**
   * Get all modified files for building MPQ
   */
  getModifiedFiles() {
    const files = [];
    for (const [path, info] of this.modifiedFiles.entries()) {
      let buffer;
      if (info.type === 'dun') {
        buffer = DUNParser.write(info.data);
      } else {
        buffer = info.data;
      }

      files.push({
        path,
        buffer,
        type: info.type,
        isNew: info.isNew || false,
      });
    }
    return files;
  }

  /**
   * Get list of available tools
   */
  static getToolList() {
    return Object.entries(MOD_TOOLS).map(([name, tool]) => ({
      name,
      description: tool.description,
      parameters: tool.parameters,
    }));
  }
}

export default { MOD_TOOLS, ModToolExecutor };
