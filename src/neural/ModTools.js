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
import ObjectMapper from './ObjectMapper';
import LevelValidator, { validateLevel, checkPath, analyzeAreas } from './LevelValidator';
import CampaignConverter, { convertCampaign, convertLevel, getValidationReport } from './CampaignConverter';
import ProceduralGenerator, { generateBSP, generateCave, generateDrunkardWalk, generateArena, generateForTheme, visualizeDungeon } from './ProceduralGenerator';
import CELEncoder, { createCEL, createTestPatternCEL } from './CELEncoder';
import questTriggerManager, { TRIGGER_TYPES, ACTION_TYPES, TriggerBuilder, ActionBuilder } from './QuestTriggers';

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

  /**
   * Validate a level structure
   */
  validateLevel: {
    name: 'validateLevel',
    description: 'Validate a level structure for errors (missing stairs, blocked paths, invalid tiles)',
    parameters: {
      path: {
        type: 'string',
        description: 'Path to DUN file to validate',
        required: true,
      },
      theme: {
        type: 'string',
        description: 'Level theme (cathedral, catacombs, caves, hell)',
        required: false,
      },
    },
    execute: async (context, params) => {
      const { mpqReader, modifiedFiles } = context;
      const theme = params.theme || 'cathedral';

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

        const validation = validateLevel(dunData, theme);
        const report = getValidationReport(dunData, theme);

        return {
          success: true,
          path: params.path,
          valid: validation.valid,
          status: validation.status,
          errors: validation.errors,
          warnings: validation.warnings,
          fixes: validation.fixes,
          stats: validation.stats,
          report,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Check path between two points
   */
  checkPath: {
    name: 'checkPath',
    description: 'Check if a path exists between two points in a level',
    parameters: {
      path: {
        type: 'string',
        description: 'Path to DUN file',
        required: true,
      },
      from: {
        type: 'string',
        description: 'Start point: "stairs_up", "entry", or {x, y}',
        required: true,
      },
      to: {
        type: 'string',
        description: 'End point: "stairs_down", "exit", or {x, y}',
        required: true,
      },
      theme: {
        type: 'string',
        description: 'Level theme',
        required: false,
      },
    },
    execute: async (context, params) => {
      const { mpqReader, modifiedFiles } = context;
      const theme = params.theme || 'cathedral';

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

        const result = checkPath(dunData, params.from, params.to, theme);

        return {
          success: true,
          path: params.path,
          reachable: result.reachable,
          pathLength: result.length,
          from: result.from,
          to: result.to,
          error: result.error,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Analyze level areas for unreachable sections
   */
  analyzeAreas: {
    name: 'analyzeAreas',
    description: 'Find all connected areas in a level and identify unreachable sections',
    parameters: {
      path: {
        type: 'string',
        description: 'Path to DUN file',
        required: true,
      },
      theme: {
        type: 'string',
        description: 'Level theme',
        required: false,
      },
    },
    execute: async (context, params) => {
      const { mpqReader, modifiedFiles } = context;
      const theme = params.theme || 'cathedral';

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

        const areas = analyzeAreas(dunData, theme);

        return {
          success: true,
          path: params.path,
          totalAreas: areas.totalAreas,
          mainAreaIndex: areas.mainAreaIndex,
          unreachableCount: areas.unreachableCount,
          areas: areas.areas,
          hasIsolatedAreas: areas.totalAreas > 1,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Convert campaign JSON to DUN files
   */
  convertCampaign: {
    name: 'convertCampaign',
    description: 'Convert AI campaign JSON to playable DUN level files',
    parameters: {
      campaign: {
        type: 'object',
        description: 'Campaign JSON with acts and levels',
        required: true,
      },
      autoFix: {
        type: 'boolean',
        description: 'Automatically fix critical issues like missing stairs',
        required: false,
      },
    },
    execute: async (context, params) => {
      const { modifiedFiles } = context;

      try {
        const result = convertCampaign(params.campaign, {
          autoFix: params.autoFix !== false,
        });

        // Store all generated files
        for (const [path, buffer] of result.files) {
          // Parse buffer back to dunData for storage
          const dunData = DUNParser.parse(buffer);
          modifiedFiles.set(path, {
            type: 'dun',
            data: dunData,
            modified: Date.now(),
            isNew: true,
          });
        }

        return {
          success: result.success,
          campaign: result.campaign,
          levelsGenerated: result.levels.length,
          levels: result.levels,
          errors: result.errors,
          warnings: result.warnings,
          files: Array.from(result.files.keys()),
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Convert single level from campaign format
   */
  convertLevelFromGrid: {
    name: 'convertLevelFromGrid',
    description: 'Convert a binary grid (0=floor, 1=wall) to a DUN level file',
    parameters: {
      path: {
        type: 'string',
        description: 'Path where to save the DUN file',
        required: true,
      },
      grid: {
        type: 'array',
        description: '2D array of 0 (floor) and 1 (wall)',
        required: true,
      },
      spawns: {
        type: 'array',
        description: 'Array of {x, y, type} monster spawns',
        required: false,
      },
      stairsUp: {
        type: 'object',
        description: '{x, y} position for stairs up',
        required: false,
      },
      stairsDown: {
        type: 'object',
        description: '{x, y} position for stairs down',
        required: false,
      },
      theme: {
        type: 'string',
        description: 'Level theme',
        required: false,
      },
    },
    execute: async (context, params) => {
      const { modifiedFiles, dungeonLevel } = context;

      try {
        const level = {
          grid: params.grid,
          spawns: params.spawns || [],
          stairsUp: params.stairsUp,
          stairsDown: params.stairsDown,
        };

        const result = convertLevel(level, {
          theme: params.theme || 'cathedral',
          levelIndex: dungeonLevel || 1,
          path: params.path,
          autoFix: true,
        });

        // Store generated file
        modifiedFiles.set(result.path, {
          type: 'dun',
          data: result.dunData,
          modified: Date.now(),
          isNew: true,
        });

        return {
          success: true,
          path: result.path,
          valid: result.validation.valid,
          errors: result.validation.errors,
          warnings: result.validation.warnings,
          stats: result.validation.stats,
          preview: result.preview,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Get validation report for a level
   */
  getValidationReport: {
    name: 'getValidationReport',
    description: 'Get a human-readable validation report for a level',
    parameters: {
      path: {
        type: 'string',
        description: 'Path to DUN file',
        required: true,
      },
      theme: {
        type: 'string',
        description: 'Level theme',
        required: false,
      },
    },
    execute: async (context, params) => {
      const { mpqReader, modifiedFiles } = context;
      const theme = params.theme || 'cathedral';

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

        const report = getValidationReport(dunData, theme);

        return {
          success: true,
          path: params.path,
          report,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Build and export modified MPQ
   */
  buildMod: {
    name: 'buildMod',
    description: 'Build modified MPQ from all changes and prepare for export',
    parameters: {
      dryRun: {
        type: 'boolean',
        description: 'If true, only validate without building',
        required: false,
      },
    },
    execute: async (context, params) => {
      const { modifiedFiles } = context;

      try {
        if (modifiedFiles.size === 0) {
          return { success: false, error: 'No modifications to build' };
        }

        const files = [];
        const validations = [];

        for (const [path, info] of modifiedFiles.entries()) {
          let buffer;
          if (info.type === 'dun') {
            buffer = DUNParser.write(info.data);

            // Validate each level
            const validation = validateLevel(info.data);
            validations.push({
              path,
              valid: validation.valid,
              errors: validation.errors,
              warnings: validation.warnings,
            });
          } else {
            buffer = info.data;
          }

          files.push({
            path,
            size: buffer.length,
            isNew: info.isNew || false,
          });
        }

        const allValid = validations.every(v => v.valid);

        return {
          success: true,
          dryRun: params.dryRun || false,
          fileCount: files.length,
          files,
          validations,
          allValid,
          readyToExport: !params.dryRun && allValid,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  // ========== Procedural Generation Tools ==========

  /**
   * Generate a procedural dungeon using BSP algorithm
   */
  generateProceduralBSP: {
    name: 'generateProceduralBSP',
    description: 'Generate a dungeon using Binary Space Partitioning (classic room+corridor layout)',
    parameters: {
      path: {
        type: 'string',
        description: 'Path where to save the generated level',
        required: true,
      },
      width: {
        type: 'number',
        description: 'Level width (default 40)',
        required: false,
      },
      height: {
        type: 'number',
        description: 'Level height (default 40)',
        required: false,
      },
      seed: {
        type: 'number',
        description: 'Random seed for reproducible generation',
        required: false,
      },
      splitIterations: {
        type: 'number',
        description: 'Number of BSP split iterations (default 4)',
        required: false,
      },
    },
    execute: async (context, params) => {
      const { modifiedFiles, dungeonLevel } = context;

      try {
        const width = params.width || 40;
        const height = params.height || 40;

        const dungeon = generateBSP(width, height, {
          seed: params.seed,
          splitIterations: params.splitIterations,
        });

        // Convert to DUN format
        const theme = TileMapper.getThemeForLevel(dungeonLevel);
        const tileGrid = TileMapper.convertToTileGrid(dungeon.grid, theme);

        const dunData = {
          width,
          height,
          baseTiles: tileGrid,
        };

        // Validate
        const validation = validateLevel(dunData, theme);

        // Store
        modifiedFiles.set(params.path, {
          type: 'dun',
          data: dunData,
          modified: Date.now(),
          isNew: true,
        });

        return {
          success: true,
          path: params.path,
          width,
          height,
          rooms: dungeon.rooms.length,
          stairs: dungeon.stairs,
          algorithm: 'bsp',
          seed: dungeon.seed,
          valid: validation.valid,
          preview: visualizeDungeon(dungeon),
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Generate a cave dungeon using cellular automata
   */
  generateProceduralCave: {
    name: 'generateProceduralCave',
    description: 'Generate an organic cave-like dungeon using cellular automata',
    parameters: {
      path: {
        type: 'string',
        description: 'Path where to save the generated level',
        required: true,
      },
      width: {
        type: 'number',
        description: 'Level width (default 40)',
        required: false,
      },
      height: {
        type: 'number',
        description: 'Level height (default 40)',
        required: false,
      },
      seed: {
        type: 'number',
        description: 'Random seed',
        required: false,
      },
      fillProbability: {
        type: 'number',
        description: 'Initial fill probability 0-1 (default 0.45)',
        required: false,
      },
    },
    execute: async (context, params) => {
      const { modifiedFiles, dungeonLevel } = context;

      try {
        const width = params.width || 40;
        const height = params.height || 40;

        const dungeon = generateCave(width, height, {
          seed: params.seed,
          fillProbability: params.fillProbability,
        });

        const theme = TileMapper.getThemeForLevel(dungeonLevel);
        const tileGrid = TileMapper.convertToTileGrid(dungeon.grid, theme);

        const dunData = {
          width,
          height,
          baseTiles: tileGrid,
        };

        const validation = validateLevel(dunData, theme);

        modifiedFiles.set(params.path, {
          type: 'dun',
          data: dunData,
          modified: Date.now(),
          isNew: true,
        });

        return {
          success: true,
          path: params.path,
          width,
          height,
          stairs: dungeon.stairs,
          algorithm: 'cellular_automata',
          seed: dungeon.seed,
          valid: validation.valid,
          preview: visualizeDungeon(dungeon),
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Generate a dungeon using drunkard's walk algorithm
   */
  generateProceduralWalk: {
    name: 'generateProceduralWalk',
    description: 'Generate a winding dungeon using drunkard\'s walk algorithm',
    parameters: {
      path: {
        type: 'string',
        description: 'Path where to save the generated level',
        required: true,
      },
      width: {
        type: 'number',
        description: 'Level width (default 40)',
        required: false,
      },
      height: {
        type: 'number',
        description: 'Level height (default 40)',
        required: false,
      },
      seed: {
        type: 'number',
        description: 'Random seed',
        required: false,
      },
      floorPercent: {
        type: 'number',
        description: 'Target floor percentage 0-1 (default 0.35)',
        required: false,
      },
    },
    execute: async (context, params) => {
      const { modifiedFiles, dungeonLevel } = context;

      try {
        const width = params.width || 40;
        const height = params.height || 40;

        const dungeon = generateDrunkardWalk(width, height, {
          seed: params.seed,
          floorPercent: params.floorPercent,
        });

        const theme = TileMapper.getThemeForLevel(dungeonLevel);
        const tileGrid = TileMapper.convertToTileGrid(dungeon.grid, theme);

        const dunData = {
          width,
          height,
          baseTiles: tileGrid,
        };

        const validation = validateLevel(dunData, theme);

        modifiedFiles.set(params.path, {
          type: 'dun',
          data: dunData,
          modified: Date.now(),
          isNew: true,
        });

        return {
          success: true,
          path: params.path,
          width,
          height,
          rooms: dungeon.rooms.length,
          stairs: dungeon.stairs,
          algorithm: 'drunkard_walk',
          seed: dungeon.seed,
          valid: validation.valid,
          preview: visualizeDungeon(dungeon),
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Generate an arena-style dungeon
   */
  generateProceduralArena: {
    name: 'generateProceduralArena',
    description: 'Generate an arena dungeon with central combat area and surrounding rooms',
    parameters: {
      path: {
        type: 'string',
        description: 'Path where to save the generated level',
        required: true,
      },
      width: {
        type: 'number',
        description: 'Level width (default 40)',
        required: false,
      },
      height: {
        type: 'number',
        description: 'Level height (default 40)',
        required: false,
      },
      seed: {
        type: 'number',
        description: 'Random seed',
        required: false,
      },
      arenaSize: {
        type: 'number',
        description: 'Arena size as portion of map 0-1 (default 0.4)',
        required: false,
      },
    },
    execute: async (context, params) => {
      const { modifiedFiles, dungeonLevel } = context;

      try {
        const width = params.width || 40;
        const height = params.height || 40;

        const dungeon = generateArena(width, height, {
          seed: params.seed,
          arenaSize: params.arenaSize,
        });

        const theme = TileMapper.getThemeForLevel(dungeonLevel);
        const tileGrid = TileMapper.convertToTileGrid(dungeon.grid, theme);

        const dunData = {
          width,
          height,
          baseTiles: tileGrid,
        };

        const validation = validateLevel(dunData, theme);

        modifiedFiles.set(params.path, {
          type: 'dun',
          data: dunData,
          modified: Date.now(),
          isNew: true,
        });

        return {
          success: true,
          path: params.path,
          width,
          height,
          rooms: dungeon.rooms.length,
          stairs: dungeon.stairs,
          algorithm: 'arena',
          seed: dungeon.seed,
          valid: validation.valid,
          preview: visualizeDungeon(dungeon),
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Auto-generate dungeon based on dungeon level theme
   */
  generateProceduralAuto: {
    name: 'generateProceduralAuto',
    description: 'Automatically generate dungeon using algorithm suited for current dungeon level theme',
    parameters: {
      path: {
        type: 'string',
        description: 'Path where to save the generated level',
        required: true,
      },
      dungeonLevel: {
        type: 'number',
        description: 'Dungeon level 1-16 (determines theme and algorithm)',
        required: true,
      },
      width: {
        type: 'number',
        description: 'Level width (default 40)',
        required: false,
      },
      height: {
        type: 'number',
        description: 'Level height (default 40)',
        required: false,
      },
      seed: {
        type: 'number',
        description: 'Random seed',
        required: false,
      },
    },
    execute: async (context, params) => {
      const { modifiedFiles } = context;

      try {
        const width = params.width || 40;
        const height = params.height || 40;
        const level = params.dungeonLevel || 1;

        const dungeon = generateForTheme(width, height, level, {
          seed: params.seed,
        });

        const theme = TileMapper.getThemeForLevel(level);
        const tileGrid = TileMapper.convertToTileGrid(dungeon.grid, theme);

        const dunData = {
          width,
          height,
          baseTiles: tileGrid,
        };

        const validation = validateLevel(dunData, theme);

        modifiedFiles.set(params.path, {
          type: 'dun',
          data: dunData,
          modified: Date.now(),
          isNew: true,
        });

        return {
          success: true,
          path: params.path,
          dungeonLevel: level,
          theme,
          width,
          height,
          rooms: dungeon.rooms?.length || 0,
          stairs: dungeon.stairs,
          algorithm: dungeon.algorithm,
          seed: dungeon.seed,
          valid: validation.valid,
          preview: visualizeDungeon(dungeon),
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  // ========== CEL/Sprite Tools ==========

  /**
   * Create a test pattern sprite
   */
  createTestSprite: {
    name: 'createTestSprite',
    description: 'Create a test pattern CEL sprite for debugging',
    parameters: {
      path: {
        type: 'string',
        description: 'Path where to save the CEL file in MPQ',
        required: true,
      },
      width: {
        type: 'number',
        description: 'Sprite width (default 64)',
        required: false,
      },
      height: {
        type: 'number',
        description: 'Sprite height (default 64)',
        required: false,
      },
    },
    execute: async (context, params) => {
      const { modifiedFiles } = context;

      try {
        const width = params.width || 64;
        const height = params.height || 64;

        const celData = createTestPatternCEL(width, height);

        modifiedFiles.set(params.path, {
          type: 'cel',
          data: celData,
          modified: Date.now(),
          isNew: true,
        });

        return {
          success: true,
          path: params.path,
          width,
          height,
          size: celData.length,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Create a solid color sprite
   */
  createSolidSprite: {
    name: 'createSolidSprite',
    description: 'Create a solid color CEL sprite',
    parameters: {
      path: {
        type: 'string',
        description: 'Path where to save the CEL file',
        required: true,
      },
      width: {
        type: 'number',
        description: 'Sprite width',
        required: true,
      },
      height: {
        type: 'number',
        description: 'Sprite height',
        required: true,
      },
      colorIndex: {
        type: 'number',
        description: 'Palette color index (1-255)',
        required: true,
      },
    },
    execute: async (context, params) => {
      const { modifiedFiles } = context;

      try {
        const celData = CELEncoder.createSolidColorCEL(
          params.width,
          params.height,
          params.colorIndex
        );

        modifiedFiles.set(params.path, {
          type: 'cel',
          data: celData,
          modified: Date.now(),
          isNew: true,
        });

        return {
          success: true,
          path: params.path,
          width: params.width,
          height: params.height,
          colorIndex: params.colorIndex,
          size: celData.length,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  // =====================================================
  // ITEM AND OBJECT PLACEMENT TOOLS
  // =====================================================

  /**
   * Place objects in a level
   */
  placeObjects: {
    name: 'placeObjects',
    description: 'Place objects (treasure, shrines, barrels, etc.) in a level',
    parameters: {
      path: {
        type: 'string',
        description: 'Path to DUN file',
        required: true,
      },
      placements: {
        type: 'array',
        description: 'Array of {x, y, type} placements. Types: barrel, chest, chest_large, shrine_*, torch, etc.',
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

        // Create objects layer if it doesn't exist
        if (!dunData.objects) {
          dunData.objects = DUNParser.createEmptySubLayer(dunData.width, dunData.height);
          dunData.hasObjects = true;
        }

        // Convert and place objects
        const converted = ObjectMapper.convertPlacements(params.placements);
        let placed = 0;

        for (const obj of converted) {
          // Convert to sub-tile coordinates (2x resolution)
          const sx = obj.x * 2;
          const sy = obj.y * 2;

          if (sy >= 0 && sy < dunData.objects.length &&
              sx >= 0 && sx < dunData.objects[0].length) {
            dunData.objects[sy][sx] = obj.objectId;
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
          objectsPlaced: placed,
          totalPlacements: params.placements.length,
          preview,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Place items (dropped loot) in a level
   */
  placeItems: {
    name: 'placeItems',
    description: 'Place items (gold, potions, weapons) on the ground in a level',
    parameters: {
      path: {
        type: 'string',
        description: 'Path to DUN file',
        required: true,
      },
      items: {
        type: 'array',
        description: 'Array of {x, y, itemId} items. ItemId is the game item identifier.',
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

        // Create items layer if it doesn't exist
        if (!dunData.items) {
          dunData.items = DUNParser.createEmptySubLayer(dunData.width, dunData.height);
          dunData.hasItems = true;
        }

        // Place items
        let placed = 0;
        for (const item of params.items) {
          const { x, y, itemId } = item;
          // Convert to sub-tile coordinates (2x resolution)
          const sx = x * 2;
          const sy = y * 2;

          if (sy >= 0 && sy < dunData.items.length &&
              sx >= 0 && sx < dunData.items[0].length) {
            dunData.items[sy][sx] = itemId;
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
          itemsPlaced: placed,
          totalItems: params.items.length,
          preview,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Get available object types
   */
  getObjectTypes: {
    name: 'getObjectTypes',
    description: 'Get list of available object types for placement',
    parameters: {
      theme: {
        type: 'string',
        description: 'Optional theme to filter objects (cathedral, catacombs, caves, hell)',
        required: false,
      },
      category: {
        type: 'string',
        description: 'Optional category to filter (containers, shrines, fountains, quest, decoration)',
        required: false,
      },
    },
    execute: async (context, params) => {
      const summary = ObjectMapper.getObjectSummary();

      let objects = [];
      if (params.theme) {
        objects = ObjectMapper.getObjectsForTheme(params.theme);
      } else if (params.category) {
        objects = summary[params.category] || [];
      } else {
        // Return all organized by category
        return {
          success: true,
          categories: summary,
          allObjects: Object.keys(ObjectMapper.OBJECT_IDS),
        };
      }

      return {
        success: true,
        theme: params.theme,
        category: params.category,
        objects,
        count: objects.length,
      };
    },
  },

  /**
   * Auto-generate treasure placements
   */
  generateTreasure: {
    name: 'generateTreasure',
    description: 'Automatically generate treasure and object placements based on room layout',
    parameters: {
      path: {
        type: 'string',
        description: 'Path to DUN file',
        required: true,
      },
      theme: {
        type: 'string',
        description: 'Level theme for appropriate objects',
        required: false,
      },
      density: {
        type: 'number',
        description: 'Object density (0.0-1.0, default 0.3)',
        required: false,
      },
      seed: {
        type: 'number',
        description: 'Random seed for reproducible generation',
        required: false,
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

        // Find rooms (floor areas) in the level
        const rooms = findRooms(dunData);

        // Determine theme from path if not provided
        let theme = params.theme;
        if (!theme) {
          if (params.path.includes('l1data')) theme = 'cathedral';
          else if (params.path.includes('l2data')) theme = 'catacombs';
          else if (params.path.includes('l3data')) theme = 'caves';
          else if (params.path.includes('l4data')) theme = 'hell';
          else theme = 'cathedral';
        }

        // Generate placements
        const placements = ObjectMapper.generateTreasurePlacements(rooms, theme, {
          density: params.density || 0.3,
          seed: params.seed,
        });

        // Create objects layer if it doesn't exist
        if (!dunData.objects) {
          dunData.objects = DUNParser.createEmptySubLayer(dunData.width, dunData.height);
          dunData.hasObjects = true;
        }

        // Place objects
        const converted = ObjectMapper.convertPlacements(placements, theme);
        let placed = 0;

        for (const obj of converted) {
          const sx = obj.x * 2;
          const sy = obj.y * 2;

          if (sy >= 0 && sy < dunData.objects.length &&
              sx >= 0 && sx < dunData.objects[0].length) {
            // Only place if cell is empty
            if (dunData.objects[sy][sx] === 0) {
              dunData.objects[sy][sx] = obj.objectId;
              placed++;
            }
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
          theme,
          roomsFound: rooms.length,
          objectsGenerated: placements.length,
          objectsPlaced: placed,
          preview,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Clear all objects from a level
   */
  clearObjects: {
    name: 'clearObjects',
    description: 'Remove all objects from a level',
    parameters: {
      path: {
        type: 'string',
        description: 'Path to DUN file',
        required: true,
      },
      clearItems: {
        type: 'boolean',
        description: 'Also clear items layer (default false)',
        required: false,
      },
      clearMonsters: {
        type: 'boolean',
        description: 'Also clear monsters layer (default false)',
        required: false,
      },
    },
    execute: async (context, params) => {
      const { mpqReader, modifiedFiles } = context;
      if (!mpqReader) {
        return { success: false, error: 'No MPQ loaded' };
      }

      try {
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

        const cleared = { objects: 0, items: 0, monsters: 0 };

        // Clear objects
        if (dunData.objects) {
          for (let y = 0; y < dunData.objects.length; y++) {
            for (let x = 0; x < dunData.objects[y].length; x++) {
              if (dunData.objects[y][x] !== 0) {
                cleared.objects++;
                dunData.objects[y][x] = 0;
              }
            }
          }
        }

        // Optionally clear items
        if (params.clearItems && dunData.items) {
          for (let y = 0; y < dunData.items.length; y++) {
            for (let x = 0; x < dunData.items[y].length; x++) {
              if (dunData.items[y][x] !== 0) {
                cleared.items++;
                dunData.items[y][x] = 0;
              }
            }
          }
        }

        // Optionally clear monsters
        if (params.clearMonsters && dunData.monsters) {
          for (let y = 0; y < dunData.monsters.length; y++) {
            for (let x = 0; x < dunData.monsters[y].length; x++) {
              if (dunData.monsters[y][x] !== 0) {
                cleared.monsters++;
                dunData.monsters[y][x] = 0;
              }
            }
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
          cleared,
          preview,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Place a shrine at a location
   */
  placeShrine: {
    name: 'placeShrine',
    description: 'Place a specific shrine type at a location',
    parameters: {
      path: {
        type: 'string',
        description: 'Path to DUN file',
        required: true,
      },
      x: {
        type: 'number',
        description: 'X coordinate',
        required: true,
      },
      y: {
        type: 'number',
        description: 'Y coordinate',
        required: true,
      },
      shrineType: {
        type: 'string',
        description: 'Shrine type (e.g., mysterious, hidden, magical, enchanted, divine, etc.)',
        required: false,
      },
    },
    execute: async (context, params) => {
      const { mpqReader, modifiedFiles } = context;
      if (!mpqReader) {
        return { success: false, error: 'No MPQ loaded' };
      }

      try {
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

        // Create objects layer if it doesn't exist
        if (!dunData.objects) {
          dunData.objects = DUNParser.createEmptySubLayer(dunData.width, dunData.height);
          dunData.hasObjects = true;
        }

        // Determine shrine type
        let shrineName = 'shrine_mysterious';
        if (params.shrineType) {
          const typeName = params.shrineType.toLowerCase();
          if (typeName.startsWith('shrine_')) {
            shrineName = typeName;
          } else {
            shrineName = `shrine_${typeName}`;
          }
        }

        const objectId = ObjectMapper.getObjectId(shrineName);
        if (!objectId) {
          return {
            success: false,
            error: `Unknown shrine type: ${shrineName}`,
            availableShrines: Object.keys(ObjectMapper.OBJECT_IDS).filter(k => k.startsWith('shrine_')),
          };
        }

        // Place shrine (2x resolution)
        const sx = params.x * 2;
        const sy = params.y * 2;

        if (sy >= 0 && sy < dunData.objects.length &&
            sx >= 0 && sx < dunData.objects[0].length) {
          dunData.objects[sy][sx] = objectId;
        } else {
          return { success: false, error: 'Coordinates out of bounds' };
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
          shrine: shrineName,
          position: { x: params.x, y: params.y },
          objectId,
          preview,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  // =====================================================
  // QUEST AND TRIGGER TOOLS
  // =====================================================

  /**
   * Create a quest trigger
   */
  createTrigger: {
    name: 'createTrigger',
    description: 'Create a quest trigger that responds to game events',
    parameters: {
      id: {
        type: 'string',
        description: 'Unique trigger ID',
        required: true,
      },
      type: {
        type: 'string',
        description: 'Trigger type (enter_area, monster_killed, boss_killed, object_activated, level_entered, etc.)',
        required: true,
      },
      conditions: {
        type: 'object',
        description: 'Conditions that must match for trigger to fire',
        required: false,
      },
      actions: {
        type: 'array',
        description: 'Array of actions to execute when trigger fires',
        required: true,
      },
      oneShot: {
        type: 'boolean',
        description: 'Whether trigger fires only once (default true)',
        required: false,
      },
      enabled: {
        type: 'boolean',
        description: 'Whether trigger is initially enabled (default true)',
        required: false,
      },
    },
    execute: async (context, params) => {
      try {
        const trigger = questTriggerManager.registerTrigger({
          id: params.id,
          type: TRIGGER_TYPES[params.type.toUpperCase()] || params.type,
          conditions: params.conditions || {},
          actions: params.actions,
          oneShot: params.oneShot !== false,
          enabled: params.enabled !== false,
          description: params.description,
        });

        return {
          success: true,
          triggerId: trigger.id,
          type: trigger.type,
          message: `Trigger "${trigger.id}" created`,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Create a quest start trigger
   */
  createQuestTrigger: {
    name: 'createQuestTrigger',
    description: 'Create a trigger that starts a quest when conditions are met',
    parameters: {
      triggerId: {
        type: 'string',
        description: 'Unique trigger ID',
        required: true,
      },
      triggerType: {
        type: 'string',
        description: 'When to start quest (level_entered, enter_area, object_activated)',
        required: true,
      },
      conditions: {
        type: 'object',
        description: 'Additional conditions',
        required: false,
      },
      questId: {
        type: 'string',
        description: 'Quest ID to start',
        required: true,
      },
      questName: {
        type: 'string',
        description: 'Quest display name',
        required: true,
      },
      questDescription: {
        type: 'string',
        description: 'Quest description',
        required: true,
      },
      objectives: {
        type: 'array',
        description: 'Quest objectives [{id, description, target}]',
        required: false,
      },
      introDialogue: {
        type: 'object',
        description: 'Optional dialogue to show {speaker, text}',
        required: false,
      },
    },
    execute: async (context, params) => {
      try {
        const actions = [];

        // Add intro dialogue if provided
        if (params.introDialogue) {
          actions.push(ActionBuilder.dialogue(
            params.introDialogue.speaker,
            params.introDialogue.text
          ));
        }

        // Add quest start action
        actions.push(ActionBuilder.startQuest(
          params.questId,
          params.questName,
          params.questDescription,
          params.objectives || []
        ));

        const trigger = questTriggerManager.registerTrigger({
          id: params.triggerId,
          type: TRIGGER_TYPES[params.triggerType.toUpperCase()] || params.triggerType,
          conditions: params.conditions || {},
          actions,
          oneShot: true,
        });

        return {
          success: true,
          triggerId: trigger.id,
          questId: params.questId,
          message: `Quest trigger "${trigger.id}" created for quest "${params.questName}"`,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Create a kill count trigger
   */
  createKillTrigger: {
    name: 'createKillTrigger',
    description: 'Create a trigger that fires after killing a specific number of monsters',
    parameters: {
      triggerId: {
        type: 'string',
        description: 'Unique trigger ID',
        required: true,
      },
      monsterType: {
        type: 'string',
        description: 'Type of monster to count',
        required: true,
      },
      count: {
        type: 'number',
        description: 'Number of kills required',
        required: true,
      },
      actions: {
        type: 'array',
        description: 'Actions to execute',
        required: true,
      },
      questId: {
        type: 'string',
        description: 'Optional quest to update objective',
        required: false,
      },
      objectiveId: {
        type: 'string',
        description: 'Objective to mark complete',
        required: false,
      },
    },
    execute: async (context, params) => {
      try {
        const actions = [...params.actions];

        // Add objective completion if quest provided
        if (params.questId && params.objectiveId) {
          actions.push(ActionBuilder.updateObjective(
            params.questId,
            params.objectiveId,
            params.count,
            true
          ));
        }

        const trigger = TriggerBuilder.onKillCount(
          params.monsterType,
          params.count,
          actions,
          { id: params.triggerId }
        );

        questTriggerManager.registerTrigger(trigger);

        return {
          success: true,
          triggerId: trigger.id,
          monsterType: params.monsterType,
          killsRequired: params.count,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Create a boss encounter trigger
   */
  createBossEncounter: {
    name: 'createBossEncounter',
    description: 'Create a boss encounter with spawn trigger and defeat rewards',
    parameters: {
      encounterId: {
        type: 'string',
        description: 'Unique encounter ID',
        required: true,
      },
      bossType: {
        type: 'string',
        description: 'Type of boss to spawn',
        required: true,
      },
      bossName: {
        type: 'string',
        description: 'Display name for boss',
        required: true,
      },
      spawnLocation: {
        type: 'object',
        description: '{x, y} spawn coordinates',
        required: true,
      },
      spawnTrigger: {
        type: 'object',
        description: '{type, conditions} for when to spawn boss',
        required: true,
      },
      introDialogue: {
        type: 'object',
        description: 'Dialogue when boss spawns {speaker, text}',
        required: false,
      },
      defeatDialogue: {
        type: 'object',
        description: 'Dialogue when boss is defeated',
        required: false,
      },
      rewards: {
        type: 'object',
        description: '{experience, gold, item} rewards',
        required: false,
      },
      questId: {
        type: 'string',
        description: 'Quest to complete on defeat',
        required: false,
      },
    },
    execute: async (context, params) => {
      try {
        const spawnTriggerId = `${params.encounterId}_spawn`;
        const defeatTriggerId = `${params.encounterId}_defeat`;

        // Create spawn trigger
        const spawnActions = [];

        if (params.introDialogue) {
          spawnActions.push(ActionBuilder.dialogue(
            params.introDialogue.speaker || params.bossName,
            params.introDialogue.text
          ));
        }

        spawnActions.push(ActionBuilder.spawnBoss(
          params.bossType,
          params.spawnLocation.x,
          params.spawnLocation.y,
          params.bossName
        ));

        spawnActions.push(ActionBuilder.enableTrigger(defeatTriggerId));

        questTriggerManager.registerTrigger({
          id: spawnTriggerId,
          type: TRIGGER_TYPES[params.spawnTrigger.type.toUpperCase()] || params.spawnTrigger.type,
          conditions: params.spawnTrigger.conditions || {},
          actions: spawnActions,
          oneShot: true,
        });

        // Create defeat trigger
        const defeatActions = [];

        if (params.defeatDialogue) {
          defeatActions.push(ActionBuilder.notification(params.defeatDialogue.text || `${params.bossName} has been defeated!`));
        }

        if (params.rewards) {
          if (params.rewards.experience) {
            defeatActions.push(ActionBuilder.grantXP(params.rewards.experience));
          }
          if (params.rewards.gold) {
            defeatActions.push(ActionBuilder.grantGold(params.rewards.gold));
          }
        }

        if (params.questId) {
          defeatActions.push(ActionBuilder.completeQuest(params.questId));
        }

        questTriggerManager.registerTrigger({
          id: defeatTriggerId,
          type: TRIGGER_TYPES.BOSS_KILLED,
          conditions: { bossId: params.encounterId },
          actions: defeatActions,
          oneShot: true,
          enabled: false, // Enabled when boss spawns
        });

        return {
          success: true,
          encounterId: params.encounterId,
          spawnTriggerId,
          defeatTriggerId,
          bossName: params.bossName,
          message: `Boss encounter "${params.bossName}" created`,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * List all triggers
   */
  listTriggers: {
    name: 'listTriggers',
    description: 'List all registered quest triggers',
    parameters: {
      tag: {
        type: 'string',
        description: 'Optional tag to filter triggers',
        required: false,
      },
    },
    execute: async (context, params) => {
      let triggers;

      if (params.tag) {
        triggers = questTriggerManager.getTriggersByTag(params.tag);
      } else {
        triggers = Array.from(questTriggerManager.triggers.values());
      }

      return {
        success: true,
        triggers: triggers.map(t => ({
          id: t.id,
          type: t.type,
          enabled: t.enabled,
          fired: t.fired,
          oneShot: t.oneShot,
          description: t.description,
        })),
        count: triggers.length,
      };
    },
  },

  /**
   * Get trigger and action type reference
   */
  getTriggerTypes: {
    name: 'getTriggerTypes',
    description: 'Get list of available trigger types and action types',
    parameters: {},
    execute: async (context, params) => {
      return {
        success: true,
        triggerTypes: Object.keys(TRIGGER_TYPES),
        actionTypes: Object.keys(ACTION_TYPES),
        helpers: {
          TriggerBuilder: ['onEnterArea', 'onMonsterKilled', 'onAreaCleared', 'onBossKilled', 'onObjectActivated', 'onLevelEnter', 'onKillCount'],
          ActionBuilder: ['dialogue', 'notification', 'startQuest', 'completeQuest', 'updateObjective', 'spawnMonster', 'spawnBoss', 'grantXP', 'grantGold', 'enableTrigger', 'disableTrigger', 'delay', 'chain'],
        },
      };
    },
  },

  /**
   * Fire a game event to test triggers
   */
  fireEvent: {
    name: 'fireEvent',
    description: 'Fire a game event to test triggers',
    parameters: {
      eventType: {
        type: 'string',
        description: 'Event type to fire',
        required: true,
      },
      eventData: {
        type: 'object',
        description: 'Event data',
        required: false,
      },
    },
    execute: async (context, params) => {
      const triggersFirered = questTriggerManager.processEvent(
        params.eventType,
        params.eventData || {}
      );

      return {
        success: true,
        eventType: params.eventType,
        triggersFirered,
      };
    },
  },

  /**
   * Get active quests
   */
  getActiveQuests: {
    name: 'getActiveQuests',
    description: 'Get list of active quests and their progress',
    parameters: {},
    execute: async (context, params) => {
      const quests = questTriggerManager.getActiveQuests();

      return {
        success: true,
        quests: quests.map(q => ({
          id: q.id,
          name: q.name,
          description: q.description,
          status: q.status,
          objectives: q.objectives,
        })),
        count: quests.length,
      };
    },
  },
};

/**
 * Find rooms (connected floor areas) in a DUN level
 * @param {Object} dunData - Parsed DUN data
 * @returns {Array} Array of room objects {x, y, width, height}
 */
function findRooms(dunData) {
  const { width, height, baseTiles } = dunData;
  const visited = Array(height).fill(null).map(() => Array(width).fill(false));
  const rooms = [];

  // Simple flood-fill to find connected floor areas
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      if (visited[y][x]) continue;

      const tile = baseTiles[y][x];
      // Check if floor tile (0 or low value typically floor)
      if (tile === 0 || (tile > 0 && tile < 20)) {
        const room = floodFillRoom(baseTiles, visited, x, y, width, height);
        if (room.area >= 4) { // Minimum room size
          rooms.push(room);
        }
      }
    }
  }

  return rooms;
}

/**
 * Flood fill to find room bounds
 */
function floodFillRoom(tiles, visited, startX, startY, maxWidth, maxHeight) {
  const queue = [{ x: startX, y: startY }];
  let minX = startX, maxX = startX;
  let minY = startY, maxY = startY;
  let area = 0;

  while (queue.length > 0) {
    const { x, y } = queue.shift();

    if (x < 0 || x >= maxWidth || y < 0 || y >= maxHeight) continue;
    if (visited[y][x]) continue;

    const tile = tiles[y][x];
    // Check if floor tile
    if (tile !== 0 && (tile < 0 || tile >= 20)) continue;

    visited[y][x] = true;
    area++;

    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);

    // Add neighbors
    queue.push({ x: x + 1, y });
    queue.push({ x: x - 1, y });
    queue.push({ x, y: y + 1 });
    queue.push({ x, y: y - 1 });
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    area,
  };
}

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
