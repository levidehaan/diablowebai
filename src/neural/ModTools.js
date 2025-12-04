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
import { validateLevel, checkPath, analyzeAreas } from './LevelValidator';
import { convertCampaign, convertLevel, getValidationReport, getGameLevelPath, GAME_LEVEL_PATHS } from './CampaignConverter';
import { generateBSP, generateCave, generateDrunkardWalk, generateArena, generateForTheme, visualizeDungeon } from './ProceduralGenerator';
import CELEncoder, { createCEL, createTestPatternCEL } from './CELEncoder';
import questTriggerManager, { TRIGGER_TYPES, ACTION_TYPES, TriggerBuilder, ActionBuilder } from './QuestTriggers';
import {
  CampaignBlueprint,
  StoryStructure,
  Act,
  Chapter,
  Scene,
  WorldDefinition,
  Location,
  CharacterRoster,
  Character,
  Quest,
  QuestObjective,
  STORY_TEMPLATES,
  DUNGEON_THEMES,
  ASSET_CATEGORIES,
  CHARACTER_ROLES,
} from './CampaignBlueprint';
import {
  MONSTER_REGISTRY,
  NPC_REGISTRY,
  ITEM_REGISTRY,
  OBJECT_REGISTRY,
  TILE_REGISTRY,
  AssetSearch,
} from './AssetRegistry';
import { CampaignBuilder, QuickCampaign } from './CampaignBuilder';

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
   * Get available game level paths that can be replaced
   * IMPORTANT: Main dungeon levels (floors 1-16) are procedurally generated at runtime.
   * Only quest areas, special set pieces, and room templates can be replaced via DUN files.
   */
  getGameLevelPaths: {
    name: 'getGameLevelPaths',
    description: 'Get actual game level paths that can be replaced with AI-generated content. Returns paths organized by theme (cathedral, catacombs, caves, hell, town).',
    parameters: {
      theme: {
        type: 'string',
        description: 'Filter by theme (cathedral, catacombs, caves, hell, town) or "all" for all themes',
        required: false,
      },
    },
    execute: async (context, params = {}) => {
      try {
        const theme = params.theme?.toLowerCase();

        if (theme && theme !== 'all' && GAME_LEVEL_PATHS[theme]) {
          return {
            success: true,
            theme,
            paths: GAME_LEVEL_PATHS[theme],
            note: 'These are actual game files that can be replaced. Main dungeon floors are procedurally generated and cannot be directly replaced.',
          };
        }

        return {
          success: true,
          allPaths: GAME_LEVEL_PATHS,
          themes: Object.keys(GAME_LEVEL_PATHS),
          note: 'These are actual game files that can be replaced. Main dungeon floors are procedurally generated and cannot be directly replaced.',
          examples: {
            cathedral: 'levels\\l1data\\sklkng.dun - Skeleton King lair',
            catacombs: 'levels\\l2data\\blind1.dun - Halls of the Blind',
            caves: 'levels\\l3data\\anvil.dun - Anvil of Fury quest',
            hell: 'levels\\l4data\\diab1.dun - Diablo\'s chamber',
            town: 'levels\\towndata\\sector1s.dun - Town sector',
          },
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Get the suggested game path for a generated level
   */
  getSuggestedLevelPath: {
    name: 'getSuggestedLevelPath',
    description: 'Get a suggested game file path for AI-generated level based on theme and index',
    parameters: {
      theme: {
        type: 'string',
        description: 'Level theme: cathedral, catacombs, caves, hell, or town',
        required: true,
      },
      levelIndex: {
        type: 'number',
        description: 'Level index (1-based) - determines which quest area to replace',
        required: false,
      },
    },
    execute: async (context, params) => {
      try {
        const theme = params.theme?.toLowerCase() || 'cathedral';
        const levelIndex = params.levelIndex || 1;

        const path = getGameLevelPath(theme, levelIndex, 'quest');

        return {
          success: true,
          suggestedPath: path,
          theme,
          levelIndex,
          note: 'This path points to an actual game file that will be replaced with your AI content.',
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

  // =====================================================
  // CAMPAIGN BLUEPRINT TOOLS
  // =====================================================

  /**
   * Create a new campaign blueprint
   */
  createCampaignBlueprint: {
    name: 'createCampaignBlueprint',
    description: 'Create a new campaign blueprint with story structure, world, characters, and quests',
    parameters: {
      title: {
        type: 'string',
        description: 'Campaign title',
        required: true,
      },
      description: {
        type: 'string',
        description: 'Campaign description',
        required: false,
      },
      template: {
        type: 'string',
        description: 'Story template to use (classic_diablo, revenge, corruption, redemption, mystery, custom)',
        required: false,
      },
      acts: {
        type: 'number',
        description: 'Number of acts (default 4)',
        required: false,
      },
      difficulty: {
        type: 'string',
        description: 'Difficulty (normal, nightmare, hell)',
        required: false,
      },
    },
    execute: async (context, params) => {
      try {
        const template = params.template ? STORY_TEMPLATES[params.template.toUpperCase()] : null;

        const blueprint = new CampaignBlueprint({
          id: `campaign_${Date.now()}`,
          story: {
            title: params.title,
            description: params.description || template?.description || 'A dark adventure awaits...',
            template: params.template || 'custom',
            acts: [],
          },
          world: {
            locations: [],
          },
          characters: {
            player: null,
            npcs: [],
            enemies: [],
            bosses: [],
          },
          quests: {
            main: [],
            side: [],
          },
        });

        // Initialize acts based on template or count
        const actCount = params.acts || (template?.acts?.length) || 4;
        const themes = ['cathedral', 'catacombs', 'caves', 'hell'];

        for (let i = 0; i < actCount; i++) {
          const templateAct = template?.acts?.[i];
          blueprint.story.addAct(new Act({
            id: `act_${i + 1}`,
            number: i + 1,
            title: templateAct?.title || `Act ${i + 1}`,
            description: templateAct?.description || '',
            theme: themes[i] || themes[themes.length - 1],
            levelRange: [(i * 4) + 1, (i + 1) * 4],
            chapters: [],
          }));
        }

        // Store in context
        context.campaignBlueprint = blueprint;

        return {
          success: true,
          campaignId: blueprint.id,
          title: params.title,
          template: params.template || 'custom',
          acts: blueprint.story.acts.map(a => ({
            id: a.id,
            number: a.number,
            title: a.title,
            theme: a.theme,
          })),
          message: `Campaign blueprint "${params.title}" created with ${actCount} acts`,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Get available story templates
   */
  getStoryTemplates: {
    name: 'getStoryTemplates',
    description: 'Get available story templates for campaign creation',
    parameters: {},
    execute: async () => {
      return {
        success: true,
        templates: Object.entries(STORY_TEMPLATES).map(([key, template]) => ({
          id: key.toLowerCase(),
          name: template.name,
          description: template.description,
          themes: template.themes,
          actCount: template.acts?.length || 4,
          hooks: template.hooks,
        })),
        dungeonThemes: Object.keys(DUNGEON_THEMES),
        assetCategories: Object.keys(ASSET_CATEGORIES),
        characterRoles: Object.keys(CHARACTER_ROLES),
      };
    },
  },

  /**
   * Search game assets
   */
  searchAssets: {
    name: 'searchAssets',
    description: 'Search game assets (monsters, NPCs, items, objects, tiles) for placement',
    parameters: {
      type: {
        type: 'string',
        description: 'Asset type: monsters, npcs, items, objects, tiles',
        required: true,
      },
      criteria: {
        type: 'object',
        description: 'Search criteria (varies by type)',
        required: false,
      },
    },
    execute: async (context, params) => {
      try {
        let results = [];
        const criteria = params.criteria || {};

        switch (params.type.toLowerCase()) {
          case 'monsters':
            results = AssetSearch.searchMonsters(criteria);
            break;
          case 'npcs':
            results = AssetSearch.searchNPCs(criteria);
            break;
          case 'items':
            results = AssetSearch.searchItems(criteria);
            break;
          case 'objects':
            results = AssetSearch.searchObjects(criteria);
            break;
          case 'tiles':
            results = AssetSearch.searchTiles(criteria.theme, criteria.category);
            break;
          default:
            return { success: false, error: `Unknown asset type: ${params.type}` };
        }

        return {
          success: true,
          type: params.type,
          criteria,
          results,
          count: results.length,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Get monsters for a dungeon level
   */
  getMonstersForDungeonLevel: {
    name: 'getMonstersForDungeonLevel',
    description: 'Get appropriate monsters for a specific dungeon level and theme',
    parameters: {
      level: {
        type: 'number',
        description: 'Dungeon level (1-16)',
        required: true,
      },
      theme: {
        type: 'string',
        description: 'Optional theme filter (cathedral, catacombs, caves, hell)',
        required: false,
      },
    },
    execute: async (context, params) => {
      const monsters = AssetSearch.getMonstersForLevel(params.level, params.theme);
      const boss = AssetSearch.getBossForAct(Math.ceil(params.level / 4));

      return {
        success: true,
        level: params.level,
        theme: params.theme,
        monsters: monsters.map(m => ({
          key: m.key,
          name: m.name,
          difficulty: m.difficulty,
          behavior: m.behavior,
          tags: m.tags,
        })),
        recommendedBoss: boss ? {
          key: boss.key,
          name: boss.name,
          title: boss.bossData?.title,
        } : null,
        count: monsters.length,
      };
    },
  },

  /**
   * Get asset registry summary
   */
  getAssetSummary: {
    name: 'getAssetSummary',
    description: 'Get a summary of all available game assets',
    parameters: {},
    execute: async () => {
      const summary = AssetSearch.getRegistrySummary();

      return {
        success: true,
        summary,
        tags: {
          monsters: AssetSearch.getAvailableTags('monsters'),
          items: AssetSearch.getAvailableTags('items'),
          objects: AssetSearch.getAvailableTags('objects'),
        },
      };
    },
  },

  /**
   * Add a chapter to an act
   */
  addChapterToAct: {
    name: 'addChapterToAct',
    description: 'Add a story chapter to an act in the campaign blueprint',
    parameters: {
      actNumber: {
        type: 'number',
        description: 'Act number (1-4)',
        required: true,
      },
      title: {
        type: 'string',
        description: 'Chapter title',
        required: true,
      },
      description: {
        type: 'string',
        description: 'Chapter description/story',
        required: true,
      },
      dungeonLevels: {
        type: 'array',
        description: 'Array of dungeon levels in this chapter',
        required: false,
      },
      scenes: {
        type: 'array',
        description: 'Array of {type, description, characters, triggers}',
        required: false,
      },
    },
    execute: async (context, params) => {
      try {
        const blueprint = context.campaignBlueprint;
        if (!blueprint) {
          return { success: false, error: 'No campaign blueprint. Use createCampaignBlueprint first.' };
        }

        const act = blueprint.story.acts.find(a => a.number === params.actNumber);
        if (!act) {
          return { success: false, error: `Act ${params.actNumber} not found` };
        }

        const chapter = new Chapter({
          id: `act${params.actNumber}_ch${act.chapters.length + 1}`,
          number: act.chapters.length + 1,
          title: params.title,
          description: params.description,
          dungeonLevels: params.dungeonLevels || [],
          scenes: (params.scenes || []).map((s, i) => new Scene({
            id: `scene_${i}`,
            type: s.type || 'exploration',
            description: s.description,
            characters: s.characters || [],
            triggers: s.triggers || [],
          })),
        });

        act.addChapter(chapter);

        return {
          success: true,
          actNumber: params.actNumber,
          chapterId: chapter.id,
          title: chapter.title,
          message: `Chapter "${chapter.title}" added to Act ${params.actNumber}`,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Add a location to the world
   */
  addLocation: {
    name: 'addLocation',
    description: 'Add a location to the campaign world',
    parameters: {
      id: {
        type: 'string',
        description: 'Unique location ID',
        required: true,
      },
      name: {
        type: 'string',
        description: 'Location name',
        required: true,
      },
      type: {
        type: 'string',
        description: 'Location type (town, dungeon, wilderness, boss_arena)',
        required: true,
      },
      theme: {
        type: 'string',
        description: 'Visual theme (cathedral, catacombs, caves, hell)',
        required: false,
      },
      description: {
        type: 'string',
        description: 'Location description',
        required: false,
      },
      connections: {
        type: 'array',
        description: 'Array of connected location IDs',
        required: false,
      },
      dungeonConfig: {
        type: 'object',
        description: 'Dungeon config {levels, algorithm, monsterDensity, treasureDensity}',
        required: false,
      },
    },
    execute: async (context, params) => {
      try {
        const blueprint = context.campaignBlueprint;
        if (!blueprint) {
          return { success: false, error: 'No campaign blueprint. Use createCampaignBlueprint first.' };
        }

        const location = new Location({
          id: params.id,
          name: params.name,
          type: params.type,
          theme: params.theme || 'cathedral',
          description: params.description || '',
          connections: params.connections || [],
          dungeonConfig: params.dungeonConfig,
        });

        blueprint.world.addLocation(location);

        return {
          success: true,
          locationId: location.id,
          name: location.name,
          type: location.type,
          theme: location.theme,
          message: `Location "${location.name}" added to world`,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Add a character to the roster
   */
  addCharacter: {
    name: 'addCharacter',
    description: 'Add an NPC, enemy, or boss to the campaign',
    parameters: {
      id: {
        type: 'string',
        description: 'Unique character ID',
        required: true,
      },
      name: {
        type: 'string',
        description: 'Character name',
        required: true,
      },
      role: {
        type: 'string',
        description: 'Role (mentor, merchant, quest_giver, villain, boss, minion)',
        required: true,
      },
      baseAsset: {
        type: 'string',
        description: 'Base asset from registry (e.g., "cain", "diablo")',
        required: false,
      },
      dialogue: {
        type: 'object',
        description: 'Dialogue lines {greeting, farewell, quest, combat}',
        required: false,
      },
      location: {
        type: 'string',
        description: 'Location ID where character appears',
        required: false,
      },
      customSprite: {
        type: 'boolean',
        description: 'Whether to generate custom sprite',
        required: false,
      },
      description: {
        type: 'string',
        description: 'Character description for sprite generation',
        required: false,
      },
    },
    execute: async (context, params) => {
      try {
        const blueprint = context.campaignBlueprint;
        if (!blueprint) {
          return { success: false, error: 'No campaign blueprint. Use createCampaignBlueprint first.' };
        }

        // Look up base asset if provided
        let baseData = null;
        if (params.baseAsset) {
          baseData = NPC_REGISTRY[params.baseAsset] || MONSTER_REGISTRY[params.baseAsset];
        }

        const character = new Character({
          id: params.id,
          name: params.name,
          role: params.role,
          baseAsset: params.baseAsset,
          baseData,
          dialogue: params.dialogue || {},
          location: params.location,
          customSprite: params.customSprite || false,
          spriteDescription: params.description,
        });

        blueprint.characters.addCharacter(character);

        return {
          success: true,
          characterId: character.id,
          name: character.name,
          role: character.role,
          baseAsset: params.baseAsset,
          hasBaseData: !!baseData,
          message: `Character "${character.name}" added to roster`,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Add a quest to the campaign
   */
  addQuest: {
    name: 'addQuest',
    description: 'Add a quest to the campaign blueprint',
    parameters: {
      id: {
        type: 'string',
        description: 'Unique quest ID',
        required: true,
      },
      name: {
        type: 'string',
        description: 'Quest name',
        required: true,
      },
      description: {
        type: 'string',
        description: 'Quest description',
        required: true,
      },
      type: {
        type: 'string',
        description: 'Quest type (main, side)',
        required: false,
      },
      act: {
        type: 'number',
        description: 'Act number this quest belongs to',
        required: false,
      },
      giver: {
        type: 'string',
        description: 'NPC ID who gives the quest',
        required: false,
      },
      objectives: {
        type: 'array',
        description: 'Array of {id, description, type, target, count}',
        required: true,
      },
      rewards: {
        type: 'object',
        description: '{experience, gold, items}',
        required: false,
      },
      prerequisites: {
        type: 'array',
        description: 'Quest IDs that must be completed first',
        required: false,
      },
      dialogue: {
        type: 'object',
        description: '{start, progress, complete} dialogue',
        required: false,
      },
    },
    execute: async (context, params) => {
      try {
        const blueprint = context.campaignBlueprint;
        if (!blueprint) {
          return { success: false, error: 'No campaign blueprint. Use createCampaignBlueprint first.' };
        }

        const quest = new Quest({
          id: params.id,
          name: params.name,
          description: params.description,
          type: params.type || 'main',
          act: params.act,
          giver: params.giver,
          objectives: params.objectives.map(o => new QuestObjective({
            id: o.id,
            description: o.description,
            type: o.type || 'kill',
            target: o.target,
            count: o.count || 1,
          })),
          rewards: params.rewards || {},
          prerequisites: params.prerequisites || [],
          dialogue: params.dialogue || {},
        });

        blueprint.quests.addQuest(quest);

        return {
          success: true,
          questId: quest.id,
          name: quest.name,
          type: quest.type,
          objectives: quest.objectives.length,
          message: `Quest "${quest.name}" added to campaign`,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Set completion criteria
   */
  setCompletionCriteria: {
    name: 'setCompletionCriteria',
    description: 'Set the campaign completion criteria and ending',
    parameters: {
      finalBoss: {
        type: 'string',
        description: 'Character ID of final boss',
        required: true,
      },
      requiredQuests: {
        type: 'array',
        description: 'Array of quest IDs required for completion',
        required: false,
      },
      endings: {
        type: 'array',
        description: 'Array of {id, name, conditions, dialogue, cinematicDescription}',
        required: false,
      },
      epilogueTemplate: {
        type: 'string',
        description: 'Epilogue text template',
        required: false,
      },
    },
    execute: async (context, params) => {
      try {
        const blueprint = context.campaignBlueprint;
        if (!blueprint) {
          return { success: false, error: 'No campaign blueprint. Use createCampaignBlueprint first.' };
        }

        blueprint.completion.setFinalBoss(params.finalBoss);

        if (params.requiredQuests) {
          params.requiredQuests.forEach(q => blueprint.completion.addRequiredQuest(q));
        }

        if (params.endings) {
          params.endings.forEach(e => blueprint.completion.addEnding(e));
        }

        if (params.epilogueTemplate) {
          blueprint.completion.setEpilogue(params.epilogueTemplate);
        }

        return {
          success: true,
          finalBoss: params.finalBoss,
          requiredQuests: blueprint.completion.requiredQuests,
          endingsCount: blueprint.completion.endings.length,
          message: 'Completion criteria set',
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Generate a quick campaign
   */
  generateQuickCampaign: {
    name: 'generateQuickCampaign',
    description: 'Generate a complete campaign using QuickCampaign templates',
    parameters: {
      type: {
        type: 'string',
        description: 'Campaign type: horror, epic, mystery, classic',
        required: true,
      },
      title: {
        type: 'string',
        description: 'Custom title (optional)',
        required: false,
      },
      difficulty: {
        type: 'string',
        description: 'Difficulty level',
        required: false,
      },
    },
    execute: async (context, params) => {
      try {
        let blueprint;

        switch (params.type.toLowerCase()) {
          case 'horror':
            blueprint = QuickCampaign.horror(params.title);
            break;
          case 'epic':
            blueprint = QuickCampaign.epic(params.title);
            break;
          case 'mystery':
            blueprint = QuickCampaign.mystery(params.title);
            break;
          case 'classic':
          default:
            blueprint = QuickCampaign.classic(params.title);
        }

        context.campaignBlueprint = blueprint;

        return {
          success: true,
          campaignId: blueprint.id,
          title: blueprint.story.title,
          type: params.type,
          acts: blueprint.story.acts.length,
          locations: blueprint.world.locations.length,
          characters: blueprint.characters.getAllCharacters().length,
          quests: blueprint.quests.getAllQuests().length,
          message: `Quick campaign "${blueprint.story.title}" generated`,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Build campaign from blueprint
   */
  buildCampaignFromBlueprint: {
    name: 'buildCampaignFromBlueprint',
    description: 'Build all campaign assets from the current blueprint',
    parameters: {
      generateLevels: {
        type: 'boolean',
        description: 'Whether to generate dungeon levels (default true)',
        required: false,
      },
      generateAssets: {
        type: 'boolean',
        description: 'Whether to generate custom assets (default false)',
        required: false,
      },
      validateOnly: {
        type: 'boolean',
        description: 'Only validate, don\'t build (default false)',
        required: false,
      },
    },
    execute: async (context, params) => {
      try {
        const blueprint = context.campaignBlueprint;
        if (!blueprint) {
          return { success: false, error: 'No campaign blueprint. Use createCampaignBlueprint first.' };
        }

        const builder = new CampaignBuilder({
          generateLevels: params.generateLevels !== false,
          generateAssets: params.generateAssets || false,
          validateOnly: params.validateOnly || false,
        });

        const result = await builder.build(blueprint);

        // Store generated levels in modified files
        if (result.levels && !params.validateOnly) {
          for (const level of result.levels) {
            if (level.dunData) {
              context.modifiedFiles.set(level.path, {
                type: 'dun',
                data: level.dunData,
                modified: Date.now(),
                isNew: true,
              });
            }
          }
        }

        return {
          success: result.success,
          campaignId: blueprint.id,
          title: blueprint.story.title,
          validation: result.validation,
          levels: result.levels?.length || 0,
          triggers: result.triggers?.length || 0,
          assets: result.assets,
          errors: result.errors,
          warnings: result.warnings,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Export campaign blueprint
   */
  exportCampaignBlueprint: {
    name: 'exportCampaignBlueprint',
    description: 'Export the current campaign blueprint as JSON',
    parameters: {},
    execute: async (context) => {
      try {
        const blueprint = context.campaignBlueprint;
        if (!blueprint) {
          return { success: false, error: 'No campaign blueprint. Use createCampaignBlueprint first.' };
        }

        const exported = blueprint.export();

        return {
          success: true,
          campaignId: blueprint.id,
          title: blueprint.story.title,
          data: exported,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Import campaign blueprint
   */
  importCampaignBlueprint: {
    name: 'importCampaignBlueprint',
    description: 'Import a campaign blueprint from JSON',
    parameters: {
      data: {
        type: 'object',
        description: 'Campaign blueprint JSON data',
        required: true,
      },
    },
    execute: async (context, params) => {
      try {
        const blueprint = CampaignBlueprint.import(params.data);
        context.campaignBlueprint = blueprint;

        return {
          success: true,
          campaignId: blueprint.id,
          title: blueprint.story.title,
          acts: blueprint.story.acts.length,
          locations: blueprint.world.locations.length,
          characters: blueprint.characters.getAllCharacters().length,
          quests: blueprint.quests.getAllQuests().length,
          message: `Campaign "${blueprint.story.title}" imported`,
        };
      } catch (error) {
        return { success: false, error: error.message };
      }
    },
  },

  /**
   * Get current blueprint status
   */
  getBlueprintStatus: {
    name: 'getBlueprintStatus',
    description: 'Get the current campaign blueprint status and summary',
    parameters: {},
    execute: async (context) => {
      const blueprint = context.campaignBlueprint;
      if (!blueprint) {
        return {
          success: true,
          hasBlueprint: false,
          message: 'No campaign blueprint loaded. Use createCampaignBlueprint or importCampaignBlueprint.',
        };
      }

      const validation = blueprint.validate();

      return {
        success: true,
        hasBlueprint: true,
        campaignId: blueprint.id,
        title: blueprint.story.title,
        template: blueprint.story.template,
        story: {
          acts: blueprint.story.acts.length,
          totalChapters: blueprint.story.acts.reduce((sum, a) => sum + a.chapters.length, 0),
        },
        world: {
          locations: blueprint.world.locations.length,
          dungeons: blueprint.world.locations.filter(l => l.type === 'dungeon').length,
        },
        characters: {
          total: blueprint.characters.getAllCharacters().length,
          npcs: blueprint.characters.npcs.length,
          bosses: blueprint.characters.bosses.length,
        },
        quests: {
          main: blueprint.quests.main.length,
          side: blueprint.quests.side.length,
        },
        completion: {
          finalBoss: blueprint.completion.finalBoss,
          requiredQuests: blueprint.completion.requiredQuests.length,
          endings: blueprint.completion.endings.length,
        },
        assets: {
          required: blueprint.assets.requirements.length,
          needsGeneration: blueprint.assets.requirements.filter(a => a.needsGeneration).length,
        },
        validation,
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
    this.campaignBlueprint = null;
    this.assetGenerator = null; // NanoBanana integration
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
   * Set campaign blueprint
   */
  setCampaignBlueprint(blueprint) {
    this.campaignBlueprint = blueprint;
  }

  /**
   * Set asset generator (NanoBanana integration)
   */
  setAssetGenerator(generator) {
    this.assetGenerator = generator;
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
      campaignBlueprint: this.campaignBlueprint,
      assetGenerator: this.assetGenerator,
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
