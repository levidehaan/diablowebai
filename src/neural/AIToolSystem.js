/**
 * AI Tool System
 *
 * Provides a modular tool-calling interface for AI-driven generation.
 * Instead of single large prompts, breaks work into smaller composable tools
 * that can be called multiple times with partial result recovery.
 */

import { providerManager } from './providers';
import NeuralConfig from './config';

/**
 * Tool definitions - each tool has:
 * - name: Unique identifier
 * - description: What the tool does (for AI context)
 * - parameters: JSON schema of expected parameters
 * - execute: Function to run when tool is called
 * - validate: Optional validation function for results
 * - recover: Optional function to attempt recovery on failure
 */
export const TOOLS = {
  // ============================================
  // CAMPAIGN GENERATION TOOLS
  // ============================================

  /**
   * Generate campaign metadata (name, description, theme)
   */
  generate_campaign_metadata: {
    name: 'generate_campaign_metadata',
    description: 'Generate basic campaign info: name, description, and overall theme',
    parameters: {
      type: 'object',
      properties: {
        template: { type: 'string', enum: ['CLASSIC', 'SIEGE', 'CORRUPTION', 'QUEST'] },
        customTheme: { type: 'string', description: 'Optional custom theme hint' },
      },
      required: ['template'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        theme: { type: 'string' },
        mood: { type: 'string' },
      },
      required: ['name', 'description'],
    },
  },

  /**
   * Generate a single act structure
   */
  generate_act: {
    name: 'generate_act',
    description: 'Generate structure for one act of a campaign',
    parameters: {
      type: 'object',
      properties: {
        actNumber: { type: 'number', minimum: 1, maximum: 5 },
        campaignName: { type: 'string' },
        campaignTheme: { type: 'string' },
        previousActBoss: { type: 'string', description: 'Name of boss from previous act (for unlock condition)' },
        levelCount: { type: 'number', minimum: 1, maximum: 5 },
      },
      required: ['actNumber', 'campaignName', 'levelCount'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        number: { type: 'number' },
        name: { type: 'string' },
        theme: { type: 'string', enum: ['Cathedral', 'Catacombs', 'Caves', 'Hell'] },
        description: { type: 'string' },
        unlockCondition: { type: ['object', 'null'] },
      },
      required: ['id', 'number', 'name', 'theme'],
    },
  },

  /**
   * Generate levels for an act
   */
  generate_act_levels: {
    name: 'generate_act_levels',
    description: 'Generate level definitions for an act',
    parameters: {
      type: 'object',
      properties: {
        actId: { type: 'string' },
        actTheme: { type: 'string' },
        actNumber: { type: 'number' },
        levelCount: { type: 'number' },
        baseDifficulty: { type: 'number' },
      },
      required: ['actId', 'actTheme', 'levelCount'],
    },
    outputSchema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          difficulty: { type: 'number' },
          objectives: { type: 'array' },
          spawnAreas: { type: 'array' },
        },
        required: ['id', 'name', 'difficulty'],
      },
    },
  },

  /**
   * Generate a boss for an act
   */
  generate_boss: {
    name: 'generate_boss',
    description: 'Generate a boss enemy for an act with dialogue',
    parameters: {
      type: 'object',
      properties: {
        actId: { type: 'string' },
        actName: { type: 'string' },
        actTheme: { type: 'string' },
        difficulty: { type: 'number' },
        isFinalBoss: { type: 'boolean' },
      },
      required: ['actId', 'actTheme', 'difficulty'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        type: { type: 'string' },
        difficulty: { type: 'number' },
        dialogue: {
          type: 'object',
          properties: {
            intro: { type: 'string' },
            defeat: { type: 'string' },
          },
        },
      },
      required: ['name', 'type', 'dialogue'],
    },
  },

  /**
   * Generate quests for a campaign
   */
  generate_quests: {
    name: 'generate_quests',
    description: 'Generate main and side quests for a campaign',
    parameters: {
      type: 'object',
      properties: {
        campaignName: { type: 'string' },
        acts: { type: 'array', description: 'Array of act summaries' },
        questCount: { type: 'number' },
      },
      required: ['campaignName', 'acts'],
    },
    outputSchema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          type: { type: 'string', enum: ['main', 'side'] },
          description: { type: 'string' },
          actId: { type: 'string' },
        },
        required: ['id', 'name', 'type', 'description'],
      },
    },
  },

  // ============================================
  // LEVEL GENERATION TOOLS
  // ============================================

  /**
   * Generate room layout for a level
   */
  generate_room_layout: {
    name: 'generate_room_layout',
    description: 'Generate room positions and sizes for a dungeon level',
    parameters: {
      type: 'object',
      properties: {
        width: { type: 'number', default: 40 },
        height: { type: 'number', default: 40 },
        theme: { type: 'string' },
        roomCount: { type: 'number', minimum: 3, maximum: 8 },
        minRoomSize: { type: 'number', default: 4 },
        maxRoomSize: { type: 'number', default: 12 },
      },
      required: ['theme', 'roomCount'],
    },
    outputSchema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          width: { type: 'number' },
          height: { type: 'number' },
          type: { type: 'string', enum: ['normal', 'treasure', 'shrine', 'boss'] },
        },
        required: ['x', 'y', 'width', 'height'],
      },
    },
  },

  /**
   * Generate corridors between rooms
   */
  generate_corridors: {
    name: 'generate_corridors',
    description: 'Generate corridor connections between rooms',
    parameters: {
      type: 'object',
      properties: {
        rooms: { type: 'array', description: 'Array of room definitions' },
        style: { type: 'string', enum: ['straight', 'bent', 'organic'] },
      },
      required: ['rooms'],
    },
    outputSchema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'number', description: 'Room index' },
          to: { type: 'number', description: 'Room index' },
          path: { type: 'array', description: 'Array of {x, y} points' },
        },
        required: ['from', 'to', 'path'],
      },
    },
  },

  /**
   * Place special tiles (stairs, doors)
   */
  place_special_tiles: {
    name: 'place_special_tiles',
    description: 'Determine placement of stairs, doors, and special features',
    parameters: {
      type: 'object',
      properties: {
        rooms: { type: 'array' },
        corridors: { type: 'array' },
        needsStairsUp: { type: 'boolean', default: true },
        needsStairsDown: { type: 'boolean', default: true },
      },
      required: ['rooms'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        stairsUp: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } },
        stairsDown: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } } },
        doors: { type: 'array' },
      },
    },
  },

  // ============================================
  // ENEMY PLACEMENT TOOLS
  // ============================================

  /**
   * Generate spawn points for an area
   */
  generate_spawn_points: {
    name: 'generate_spawn_points',
    description: 'Generate enemy spawn point locations',
    parameters: {
      type: 'object',
      properties: {
        rooms: { type: 'array' },
        difficulty: { type: 'number' },
        density: { type: 'string', enum: ['sparse', 'normal', 'dense'] },
      },
      required: ['rooms', 'difficulty'],
    },
    outputSchema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          template: { type: 'string', enum: ['PATROL', 'AMBUSH', 'GUARD', 'HORDE'] },
          maxEnemies: { type: 'number' },
        },
        required: ['x', 'y', 'template'],
      },
    },
  },

  /**
   * Place enemies at a specific spawn point
   */
  place_enemies_at_spawn: {
    name: 'place_enemies_at_spawn',
    description: 'Generate specific enemy placements at a spawn point',
    parameters: {
      type: 'object',
      properties: {
        spawnPoint: { type: 'object' },
        difficulty: { type: 'number' },
        theme: { type: 'string' },
        grid: { type: 'array', description: 'Level grid for validation' },
      },
      required: ['spawnPoint', 'difficulty'],
    },
    outputSchema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          enemyType: { type: 'string' },
          difficulty: { type: 'number' },
          hidden: { type: 'boolean' },
        },
        required: ['x', 'y', 'enemyType'],
      },
    },
  },

  /**
   * Place a boss and minions
   */
  place_boss_encounter: {
    name: 'place_boss_encounter',
    description: 'Generate boss and minion placements',
    parameters: {
      type: 'object',
      properties: {
        bossType: { type: 'string' },
        centerX: { type: 'number' },
        centerY: { type: 'number' },
        roomSize: { type: 'number' },
        minionCount: { type: 'number' },
      },
      required: ['bossType', 'centerX', 'centerY'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        boss: {
          type: 'object',
          properties: {
            x: { type: 'number' },
            y: { type: 'number' },
            enemyType: { type: 'string' },
            isBoss: { type: 'boolean' },
          },
        },
        minions: { type: 'array' },
      },
      required: ['boss'],
    },
  },

  // ============================================
  // NARRATIVE TOOLS
  // ============================================

  /**
   * Generate NPC dialogue
   */
  generate_dialogue: {
    name: 'generate_dialogue',
    description: 'Generate contextual dialogue for an NPC',
    parameters: {
      type: 'object',
      properties: {
        npcId: { type: 'string', enum: ['CAIN', 'OGDEN', 'GRISWOLD', 'PEPIN', 'ADRIA', 'WIRT', 'FARNHAM', 'GILLIAN'] },
        context: {
          type: 'object',
          properties: {
            playerClass: { type: 'string' },
            playerLevel: { type: 'number' },
            recentBossKills: { type: 'array' },
            currentQuest: { type: 'string' },
            playerWounded: { type: 'boolean' },
          },
        },
        mood: { type: 'string', enum: ['greeting', 'warning', 'celebration', 'concern', 'cryptic'] },
      },
      required: ['npcId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        dialogue: { type: 'string' },
        options: { type: 'array', description: 'Optional player response choices' },
      },
      required: ['dialogue'],
    },
  },

  /**
   * Generate area description/lore
   */
  generate_area_lore: {
    name: 'generate_area_lore',
    description: 'Generate atmospheric description and lore for an area',
    parameters: {
      type: 'object',
      properties: {
        areaName: { type: 'string' },
        areaType: { type: 'string' },
        theme: { type: 'string' },
        difficulty: { type: 'number' },
        campaignContext: { type: 'string' },
      },
      required: ['areaName', 'theme'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        description: { type: 'string' },
        lore: { type: 'string' },
        secrets: { type: 'array' },
        ambientSounds: { type: 'array' },
      },
      required: ['description'],
    },
  },

  // ============================================
  // UTILITY TOOLS
  // ============================================

  /**
   * Validate and repair JSON
   */
  repair_json: {
    name: 'repair_json',
    description: 'Attempt to repair malformed JSON',
    parameters: {
      type: 'object',
      properties: {
        jsonString: { type: 'string' },
        expectedSchema: { type: 'object' },
      },
      required: ['jsonString'],
    },
    // This is a local tool, not AI-called
    isLocal: true,
  },

  /**
   * Validate grid connectivity
   */
  validate_grid: {
    name: 'validate_grid',
    description: 'Check if a level grid is valid and connected',
    parameters: {
      type: 'object',
      properties: {
        grid: { type: 'array' },
        requireStairs: { type: 'boolean', default: true },
      },
      required: ['grid'],
    },
    isLocal: true,
  },
};

/**
 * Tool Registry - manages available tools
 */
class ToolRegistry {
  constructor() {
    this.tools = new Map();
    this.executors = new Map();

    // Register built-in tools
    Object.entries(TOOLS).forEach(([name, tool]) => {
      this.register(name, tool);
    });
  }

  /**
   * Register a tool
   */
  register(name, definition, executor = null) {
    this.tools.set(name, definition);
    if (executor) {
      this.executors.set(name, executor);
    }
  }

  /**
   * Get tool definition
   */
  get(name) {
    return this.tools.get(name);
  }

  /**
   * Get all tool definitions (for AI context)
   */
  getAll() {
    return Array.from(this.tools.entries()).map(([name, def]) => ({
      name,
      description: def.description,
      parameters: def.parameters,
    }));
  }

  /**
   * Get tools for a specific category
   */
  getByCategory(category) {
    const categories = {
      campaign: ['generate_campaign_metadata', 'generate_act', 'generate_act_levels', 'generate_boss', 'generate_quests'],
      level: ['generate_room_layout', 'generate_corridors', 'place_special_tiles'],
      enemy: ['generate_spawn_points', 'place_enemies_at_spawn', 'place_boss_encounter'],
      narrative: ['generate_dialogue', 'generate_area_lore'],
      utility: ['repair_json', 'validate_grid'],
    };

    const toolNames = categories[category] || [];
    return toolNames.map(name => this.get(name)).filter(Boolean);
  }
}

/**
 * Singleton registry instance
 */
export const toolRegistry = new ToolRegistry();

/**
 * Result state for tracking partial completion
 */
class ToolResult {
  constructor(toolName, params) {
    this.toolName = toolName;
    this.params = params;
    this.status = 'pending'; // pending, success, failed, partial
    this.data = null;
    this.error = null;
    this.attempts = 0;
    this.timestamp = null;
  }

  succeed(data) {
    this.status = 'success';
    this.data = data;
    this.timestamp = Date.now();
    return this;
  }

  fail(error) {
    this.status = 'failed';
    this.error = error;
    this.attempts++;
    this.timestamp = Date.now();
    return this;
  }

  partial(data, missingFields) {
    this.status = 'partial';
    this.data = data;
    this.missingFields = missingFields;
    this.timestamp = Date.now();
    return this;
  }
}

/**
 * Tool Executor - handles running tools with recovery
 */
export class ToolExecutor {
  constructor(options = {}) {
    this.provider = options.provider || providerManager.getProvider();
    this.maxRetries = options.maxRetries || 3;
    this.retryDelay = options.retryDelay || 1000;
    this.results = new Map(); // Cache of results by key
    this.onProgress = options.onProgress || null;
  }

  /**
   * Generate a cache key for a tool call
   */
  getCacheKey(toolName, params) {
    return `${toolName}:${JSON.stringify(params)}`;
  }

  /**
   * Execute a single tool with retry logic
   */
  async executeTool(toolName, params, options = {}) {
    const tool = toolRegistry.get(toolName);
    if (!tool) {
      throw new Error(`Unknown tool: ${toolName}`);
    }

    const cacheKey = this.getCacheKey(toolName, params);
    const existingResult = this.results.get(cacheKey);

    // Return cached success
    if (existingResult?.status === 'success' && !options.forceRefresh) {
      return existingResult.data;
    }

    const result = new ToolResult(toolName, params);

    // Handle local tools (no AI call needed)
    if (tool.isLocal) {
      return this.executeLocalTool(tool, params, result);
    }

    // Build prompt for AI
    const prompt = this.buildToolPrompt(tool, params);

    let lastError = null;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        if (this.onProgress) {
          this.onProgress({
            tool: toolName,
            attempt: attempt + 1,
            maxRetries: this.maxRetries,
            status: 'calling',
          });
        }

        const response = await this.provider.generateText(prompt, {
          temperature: 0.7,
          maxTokens: 2000,
        });

        const parsed = this.parseResponse(response, tool.outputSchema);

        if (parsed.valid) {
          result.succeed(parsed.data);
          this.results.set(cacheKey, result);
          return parsed.data;
        } else if (parsed.partial) {
          result.partial(parsed.data, parsed.missingFields);
          this.results.set(cacheKey, result);
          // Continue to try to get complete data
          lastError = new Error(`Partial result: missing ${parsed.missingFields.join(', ')}`);
        } else {
          lastError = new Error(parsed.error || 'Invalid response format');
        }
      } catch (error) {
        lastError = error;
        result.fail(error);
      }

      // Exponential backoff
      if (attempt < this.maxRetries - 1) {
        await this.delay(this.retryDelay * Math.pow(2, attempt));
      }
    }

    // Return partial data if we have it, otherwise throw
    const finalResult = this.results.get(cacheKey);
    if (finalResult?.status === 'partial' && finalResult.data) {
      console.warn(`Returning partial result for ${toolName}:`, finalResult.missingFields);
      return finalResult.data;
    }

    throw lastError || new Error(`Failed to execute tool: ${toolName}`);
  }

  /**
   * Execute multiple tools in parallel with dependency resolution
   */
  async executeToolBatch(toolCalls, options = {}) {
    const { parallel = true, stopOnError = false } = options;
    const results = {};
    const errors = [];

    if (parallel) {
      // Execute all in parallel
      const promises = toolCalls.map(async ({ name, params, key }) => {
        const resultKey = key || name;
        try {
          results[resultKey] = await this.executeTool(name, params);
        } catch (error) {
          errors.push({ tool: name, error });
          if (stopOnError) throw error;
        }
      });

      await Promise.all(promises);
    } else {
      // Execute sequentially
      for (const { name, params, key } of toolCalls) {
        const resultKey = key || name;
        try {
          results[resultKey] = await this.executeTool(name, params);
        } catch (error) {
          errors.push({ tool: name, error });
          if (stopOnError) throw error;
        }
      }
    }

    return { results, errors, hasErrors: errors.length > 0 };
  }

  /**
   * Execute a pipeline of dependent tool calls
   */
  async executePipeline(pipeline) {
    const context = {};

    for (const step of pipeline) {
      const { name, params: paramsFn, key, optional = false } = step;

      // Resolve params - can be a function that receives context
      const params = typeof paramsFn === 'function' ? paramsFn(context) : paramsFn;

      try {
        const result = await this.executeTool(name, params);
        context[key || name] = result;

        if (this.onProgress) {
          this.onProgress({
            pipeline: true,
            step: key || name,
            status: 'complete',
            context: Object.keys(context),
          });
        }
      } catch (error) {
        if (!optional) {
          throw error;
        }
        console.warn(`Optional step ${name} failed:`, error.message);
        context[key || name] = null;
      }
    }

    return context;
  }

  /**
   * Build a prompt for an AI tool call
   */
  buildToolPrompt(tool, params) {
    const schemaStr = JSON.stringify(tool.outputSchema, null, 2);
    const paramsStr = JSON.stringify(params, null, 2);

    return `You are a game content generator. Execute the following tool and return ONLY valid JSON.

TOOL: ${tool.name}
DESCRIPTION: ${tool.description}

INPUT PARAMETERS:
${paramsStr}

REQUIRED OUTPUT SCHEMA:
${schemaStr}

Respond with ONLY the JSON output, no markdown, no explanation. The response must be valid JSON matching the schema above.`;
  }

  /**
   * Parse and validate AI response
   */
  parseResponse(response, schema) {
    // Try to extract JSON from response
    let jsonStr = response.trim();

    // Remove markdown code blocks if present
    if (jsonStr.startsWith('```')) {
      jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    // Try to repair common JSON errors
    jsonStr = this.repairJSON(jsonStr);

    try {
      const data = JSON.parse(jsonStr);
      const validation = this.validateAgainstSchema(data, schema);

      if (validation.valid) {
        return { valid: true, data };
      } else if (validation.partial) {
        return { partial: true, data, missingFields: validation.missingFields };
      } else {
        return { valid: false, error: validation.error };
      }
    } catch (e) {
      return { valid: false, error: `JSON parse error: ${e.message}` };
    }
  }

  /**
   * Repair common JSON errors from AI responses
   */
  repairJSON(jsonStr) {
    let repaired = jsonStr;

    // Remove trailing commas before ] or }
    repaired = repaired.replace(/,(\s*[\]}])/g, '$1');

    // Remove text after final closing brace/bracket
    const lastBrace = Math.max(repaired.lastIndexOf('}'), repaired.lastIndexOf(']'));
    if (lastBrace !== -1 && lastBrace < repaired.length - 1) {
      repaired = repaired.substring(0, lastBrace + 1);
    }

    // Find first opening brace/bracket
    const firstBrace = Math.min(
      repaired.indexOf('{') === -1 ? Infinity : repaired.indexOf('{'),
      repaired.indexOf('[') === -1 ? Infinity : repaired.indexOf('[')
    );
    if (firstBrace > 0 && firstBrace !== Infinity) {
      repaired = repaired.substring(firstBrace);
    }

    // Handle "null or {}" pattern
    repaired = repaired.replace(/:\s*null\s+or\s+\{[^}]*\}/g, ': null');

    // Remove control characters
    repaired = repaired.replace(/[\x00-\x1F\x7F]/g, '');

    return repaired;
  }

  /**
   * Validate data against a JSON schema (simplified)
   */
  validateAgainstSchema(data, schema) {
    if (!schema) return { valid: true };

    const missingFields = [];

    // Check required fields
    if (schema.required && schema.type === 'object') {
      for (const field of schema.required) {
        if (data[field] === undefined) {
          missingFields.push(field);
        }
      }
    }

    // Check array items
    if (schema.type === 'array' && schema.items?.required) {
      if (Array.isArray(data)) {
        data.forEach((item, index) => {
          for (const field of schema.items.required) {
            if (item[field] === undefined) {
              missingFields.push(`[${index}].${field}`);
            }
          }
        });
      }
    }

    if (missingFields.length === 0) {
      return { valid: true };
    } else if (missingFields.length < (schema.required?.length || 0) / 2) {
      // More than half the required fields are present - partial success
      return { partial: true, missingFields };
    } else {
      return { valid: false, error: `Missing required fields: ${missingFields.join(', ')}` };
    }
  }

  /**
   * Execute a local tool (no AI call)
   */
  executeLocalTool(tool, params, result) {
    switch (tool.name) {
      case 'repair_json':
        return this.repairJSON(params.jsonString);

      case 'validate_grid':
        return this.validateGrid(params.grid, params.requireStairs);

      default:
        throw new Error(`No local executor for tool: ${tool.name}`);
    }
  }

  /**
   * Validate a level grid
   */
  validateGrid(grid, requireStairs = true) {
    if (!Array.isArray(grid) || grid.length === 0) {
      return { valid: false, error: 'Grid must be a non-empty array' };
    }

    const height = grid.length;
    const width = grid[0]?.length || 0;

    let hasStairsUp = false;
    let hasStairsDown = false;
    let walkableTiles = 0;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const tile = grid[y][x];
        if (tile === 0) walkableTiles++;
        if (tile === 3) hasStairsUp = true;
        if (tile === 4) hasStairsDown = true;
      }
    }

    const issues = [];
    if (walkableTiles < 10) issues.push('Too few walkable tiles');
    if (requireStairs && !hasStairsUp) issues.push('Missing stairs up');
    if (requireStairs && !hasStairsDown) issues.push('Missing stairs down');

    return {
      valid: issues.length === 0,
      issues,
      stats: { width, height, walkableTiles, hasStairsUp, hasStairsDown },
    };
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get cached results
   */
  getCachedResults() {
    const cached = {};
    this.results.forEach((result, key) => {
      cached[key] = {
        status: result.status,
        data: result.data,
        timestamp: result.timestamp,
      };
    });
    return cached;
  }

  /**
   * Clear cache
   */
  clearCache() {
    this.results.clear();
  }

  /**
   * Recover partial results from a failed generation
   */
  recoverPartialResults(targetStructure) {
    const recovered = {};

    for (const [key, result] of this.results) {
      if (result.status === 'success' || result.status === 'partial') {
        // Extract tool name from cache key
        const toolName = key.split(':')[0];
        recovered[toolName] = result.data;
      }
    }

    return recovered;
  }
}

/**
 * Pre-built pipelines for common generation tasks
 */
export const PIPELINES = {
  /**
   * Generate a complete campaign
   */
  campaign: [
    {
      name: 'generate_campaign_metadata',
      params: (ctx) => ({ template: ctx.template || 'CLASSIC', customTheme: ctx.customTheme }),
      key: 'metadata',
    },
    {
      name: 'generate_act',
      params: (ctx) => ({
        actNumber: 1,
        campaignName: ctx.metadata?.name || 'Campaign',
        campaignTheme: ctx.metadata?.theme,
        levelCount: 2,
      }),
      key: 'act1',
    },
    {
      name: 'generate_act_levels',
      params: (ctx) => ({
        actId: ctx.act1?.id || 'act_1',
        actTheme: ctx.act1?.theme || 'Cathedral',
        actNumber: 1,
        levelCount: 2,
        baseDifficulty: 1,
      }),
      key: 'act1_levels',
    },
    {
      name: 'generate_boss',
      params: (ctx) => ({
        actId: ctx.act1?.id || 'act_1',
        actName: ctx.act1?.name,
        actTheme: ctx.act1?.theme || 'Cathedral',
        difficulty: 3,
        isFinalBoss: false,
      }),
      key: 'act1_boss',
    },
    {
      name: 'generate_quests',
      params: (ctx) => ({
        campaignName: ctx.metadata?.name || 'Campaign',
        acts: [{ id: ctx.act1?.id, name: ctx.act1?.name, theme: ctx.act1?.theme }],
        questCount: 3,
      }),
      key: 'quests',
      optional: true,
    },
  ],

  /**
   * Generate a single level with enemies
   */
  level: [
    {
      name: 'generate_room_layout',
      params: (ctx) => ({
        width: ctx.width || 40,
        height: ctx.height || 40,
        theme: ctx.theme || 'Cathedral',
        roomCount: ctx.roomCount || 5,
      }),
      key: 'rooms',
    },
    {
      name: 'generate_corridors',
      params: (ctx) => ({
        rooms: ctx.rooms,
        style: ctx.corridorStyle || 'bent',
      }),
      key: 'corridors',
    },
    {
      name: 'place_special_tiles',
      params: (ctx) => ({
        rooms: ctx.rooms,
        corridors: ctx.corridors,
        needsStairsUp: ctx.needsStairsUp ?? true,
        needsStairsDown: ctx.needsStairsDown ?? true,
      }),
      key: 'specialTiles',
    },
    {
      name: 'generate_spawn_points',
      params: (ctx) => ({
        rooms: ctx.rooms,
        difficulty: ctx.difficulty || 1,
        density: ctx.density || 'normal',
      }),
      key: 'spawnPoints',
    },
  ],
};

/**
 * Singleton executor instance
 */
export const toolExecutor = new ToolExecutor();

export default {
  TOOLS,
  PIPELINES,
  toolRegistry,
  toolExecutor,
  ToolExecutor,
  ToolResult,
};
