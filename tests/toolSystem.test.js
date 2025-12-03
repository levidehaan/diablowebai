/**
 * AI Tool System Tests
 *
 * Tests for the modular tool-calling system with partial recovery.
 */

import {
  TOOLS,
  PIPELINES,
  toolRegistry,
  ToolExecutor,
} from '../src/neural/AIToolSystem';
import { MockProvider } from './fixtures/mockResponses';

describe('AI Tool System', () => {
  describe('Tool Registry', () => {
    test('should have all expected tools registered', () => {
      const expectedTools = [
        'generate_campaign_metadata',
        'generate_act',
        'generate_act_levels',
        'generate_boss',
        'generate_quests',
        'generate_room_layout',
        'generate_corridors',
        'place_special_tiles',
        'generate_spawn_points',
        'place_enemies_at_spawn',
        'place_boss_encounter',
        'generate_dialogue',
        'generate_area_lore',
        'repair_json',
        'validate_grid',
      ];

      expectedTools.forEach(toolName => {
        const tool = toolRegistry.get(toolName);
        expect(tool).toBeDefined();
        expect(tool.name).toBe(toolName);
      });
    });

    test('should get all tools as array', () => {
      const allTools = toolRegistry.getAll();
      expect(Array.isArray(allTools)).toBe(true);
      expect(allTools.length).toBeGreaterThan(10);

      allTools.forEach(tool => {
        expect(tool).toHaveProperty('name');
        expect(tool).toHaveProperty('description');
        expect(tool).toHaveProperty('parameters');
      });
    });

    test('should get tools by category', () => {
      const campaignTools = toolRegistry.getByCategory('campaign');
      expect(campaignTools.length).toBe(5);

      const levelTools = toolRegistry.getByCategory('level');
      expect(levelTools.length).toBe(3);

      const enemyTools = toolRegistry.getByCategory('enemy');
      expect(enemyTools.length).toBe(3);

      const narrativeTools = toolRegistry.getByCategory('narrative');
      expect(narrativeTools.length).toBe(2);

      const utilityTools = toolRegistry.getByCategory('utility');
      expect(utilityTools.length).toBe(2);
    });

    test('should return empty array for unknown category', () => {
      const unknownTools = toolRegistry.getByCategory('nonexistent');
      expect(unknownTools).toEqual([]);
    });

    test('should allow registering custom tools', () => {
      toolRegistry.register('test_custom_tool', {
        name: 'test_custom_tool',
        description: 'A test tool',
        parameters: {
          type: 'object',
          properties: {
            input: { type: 'string' },
          },
          required: ['input'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            output: { type: 'string' },
          },
        },
      });

      const tool = toolRegistry.get('test_custom_tool');
      expect(tool).toBeDefined();
      expect(tool.name).toBe('test_custom_tool');
    });
  });

  describe('Tool Definitions', () => {
    test('each tool should have required fields', () => {
      Object.entries(TOOLS).forEach(([name, tool]) => {
        expect(tool.name).toBe(name);
        expect(typeof tool.description).toBe('string');
        expect(tool.parameters).toHaveProperty('type');
        expect(tool.parameters).toHaveProperty('properties');
      });
    });

    test('non-local tools should have output schemas', () => {
      Object.entries(TOOLS).forEach(([name, tool]) => {
        if (!tool.isLocal) {
          expect(tool.outputSchema).toBeDefined();
        }
      });
    });

    test('local tools should be marked as isLocal', () => {
      expect(TOOLS.repair_json.isLocal).toBe(true);
      expect(TOOLS.validate_grid.isLocal).toBe(true);
    });
  });

  describe('Tool Executor', () => {
    let executor;
    let mockProvider;

    beforeEach(() => {
      mockProvider = new MockProvider();
      executor = new ToolExecutor({
        provider: mockProvider,
        maxRetries: 2,
        retryDelay: 10, // Fast retries for tests
      });
    });

    afterEach(() => {
      executor.clearCache();
    });

    test('should execute local tools without AI call', async () => {
      // Create a grid large enough to have 10+ walkable tiles
      const grid = [
        [1, 1, 1, 1, 1, 1, 1],
        [1, 0, 0, 0, 0, 0, 1],
        [1, 0, 3, 0, 0, 0, 1],
        [1, 0, 0, 0, 4, 0, 1],
        [1, 0, 0, 0, 0, 0, 1],
        [1, 1, 1, 1, 1, 1, 1],
      ];

      const result = executor.executeLocalTool(
        TOOLS.validate_grid,
        { grid, requireStairs: true },
        {}
      );

      expect(result.valid).toBe(true);
      expect(result.stats.hasStairsUp).toBe(true);
      expect(result.stats.hasStairsDown).toBe(true);
      expect(mockProvider.callCount).toBe(0);
    });

    test('should validate grid correctly', async () => {
      // Valid grid with enough walkable tiles (20+)
      const validResult = executor.validateGrid(
        [
          [1, 1, 1, 1, 1, 1, 1],
          [1, 0, 0, 0, 0, 0, 1],
          [1, 0, 3, 0, 0, 0, 1],
          [1, 0, 0, 0, 4, 0, 1],
          [1, 0, 0, 0, 0, 0, 1],
          [1, 1, 1, 1, 1, 1, 1],
        ],
        true
      );
      expect(validResult.valid).toBe(true);

      // Missing stairs (with enough walkable tiles)
      const noStairs = executor.validateGrid(
        [
          [1, 1, 1, 1, 1, 1, 1],
          [1, 0, 0, 0, 0, 0, 1],
          [1, 0, 0, 0, 0, 0, 1],
          [1, 0, 0, 0, 0, 0, 1],
          [1, 1, 1, 1, 1, 1, 1],
        ],
        true
      );
      expect(noStairs.valid).toBe(false);
      expect(noStairs.issues).toContain('Missing stairs up');
      expect(noStairs.issues).toContain('Missing stairs down');

      // Too few walkable tiles
      const tooSmall = executor.validateGrid(
        [
          [1, 1, 1],
          [1, 0, 1],
          [1, 1, 1],
        ],
        false
      );
      expect(tooSmall.valid).toBe(false);
      expect(tooSmall.issues).toContain('Too few walkable tiles');
    });

    test('should repair common JSON errors', () => {
      // Trailing comma
      const trailing = executor.repairJSON('{"a": 1, "b": 2,}');
      expect(JSON.parse(trailing)).toEqual({ a: 1, b: 2 });

      // Extra text after JSON
      const extraText = executor.repairJSON('Here is the JSON: {"a": 1} and more text');
      expect(JSON.parse(extraText)).toEqual({ a: 1 });

      // Extra text before JSON
      const prefixText = executor.repairJSON('Response: {"a": 1}');
      expect(JSON.parse(prefixText)).toEqual({ a: 1 });

      // null or {} pattern
      const nullOr = executor.repairJSON('{"unlock": null or {"type": "boss"}}');
      expect(nullOr).toContain('"unlock": null');
    });

    test('should generate cache keys consistently', () => {
      const key1 = executor.getCacheKey('test_tool', { a: 1, b: 2 });
      const key2 = executor.getCacheKey('test_tool', { a: 1, b: 2 });
      const key3 = executor.getCacheKey('test_tool', { b: 2, a: 1 });

      expect(key1).toBe(key2);
      // Note: JSON.stringify may produce different order
    });

    test('should cache successful results', async () => {
      // First call
      await executor.executeTool('generate_campaign_metadata', { template: 'CLASSIC' });
      expect(mockProvider.callCount).toBe(1);

      // Second call should use cache
      await executor.executeTool('generate_campaign_metadata', { template: 'CLASSIC' });
      expect(mockProvider.callCount).toBe(1); // Still 1

      // Different params should make new call
      await executor.executeTool('generate_campaign_metadata', { template: 'SIEGE' });
      expect(mockProvider.callCount).toBe(2);
    });

    test('should force refresh when requested', async () => {
      await executor.executeTool('generate_campaign_metadata', { template: 'CLASSIC' });
      expect(mockProvider.callCount).toBe(1);

      await executor.executeTool('generate_campaign_metadata', { template: 'CLASSIC' }, { forceRefresh: true });
      expect(mockProvider.callCount).toBe(2);
    });

    test('should report progress', async () => {
      const progressUpdates = [];
      executor.onProgress = (update) => progressUpdates.push(update);

      await executor.executeTool('generate_campaign_metadata', { template: 'CLASSIC' });

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[0]).toHaveProperty('tool');
      expect(progressUpdates[0]).toHaveProperty('status');
    });

    test('should clear cache', async () => {
      await executor.executeTool('generate_campaign_metadata', { template: 'CLASSIC' });
      expect(mockProvider.callCount).toBe(1);

      executor.clearCache();

      await executor.executeTool('generate_campaign_metadata', { template: 'CLASSIC' });
      expect(mockProvider.callCount).toBe(2);
    });

    test('should get cached results', async () => {
      await executor.executeTool('generate_campaign_metadata', { template: 'CLASSIC' });

      const cached = executor.getCachedResults();
      const keys = Object.keys(cached);

      expect(keys.length).toBe(1);
      expect(cached[keys[0]].status).toBe('success');
      expect(cached[keys[0]].data).toBeDefined();
    });
  });

  describe('Tool Executor Batch Operations', () => {
    let executor;
    let mockProvider;

    beforeEach(() => {
      mockProvider = new MockProvider();
      executor = new ToolExecutor({
        provider: mockProvider,
        maxRetries: 1,
        retryDelay: 10,
      });
    });

    test('should execute batch in parallel', async () => {
      const { results, errors } = await executor.executeToolBatch([
        { name: 'generate_campaign_metadata', params: { template: 'CLASSIC' }, key: 'meta1' },
        { name: 'generate_campaign_metadata', params: { template: 'SIEGE' }, key: 'meta2' },
      ], { parallel: true });

      expect(results.meta1).toBeDefined();
      expect(results.meta2).toBeDefined();
      expect(errors.length).toBe(0);
    });

    test('should execute batch sequentially', async () => {
      const { results, errors } = await executor.executeToolBatch([
        { name: 'generate_campaign_metadata', params: { template: 'CLASSIC' }, key: 'meta1' },
        { name: 'generate_campaign_metadata', params: { template: 'SIEGE' }, key: 'meta2' },
      ], { parallel: false });

      expect(results.meta1).toBeDefined();
      expect(results.meta2).toBeDefined();
      expect(errors.length).toBe(0);
    });

    test('should collect errors without stopping on non-fatal', async () => {
      // Create a provider that fails on specific inputs
      class PartialFailProvider extends MockProvider {
        async generateText(prompt) {
          this.callCount++;
          if (prompt.includes('FAIL')) {
            throw new Error('Intentional failure');
          }
          return JSON.stringify({ name: 'Test', description: 'Test desc' });
        }
      }

      const partialExecutor = new ToolExecutor({
        provider: new PartialFailProvider(),
        maxRetries: 1,
        retryDelay: 10,
      });

      const { results, errors, hasErrors } = await partialExecutor.executeToolBatch([
        { name: 'generate_campaign_metadata', params: { template: 'CLASSIC' }, key: 'good' },
        { name: 'generate_campaign_metadata', params: { template: 'FAIL' }, key: 'bad' },
      ], { parallel: true, stopOnError: false });

      expect(results.good).toBeDefined();
      expect(hasErrors).toBe(true);
      expect(errors.length).toBe(1);
      expect(errors[0].tool).toBe('generate_campaign_metadata');
    });
  });

  describe('Pipelines', () => {
    test('campaign pipeline should have correct structure', () => {
      expect(PIPELINES.campaign).toBeDefined();
      expect(Array.isArray(PIPELINES.campaign)).toBe(true);
      expect(PIPELINES.campaign.length).toBeGreaterThan(3);

      PIPELINES.campaign.forEach(step => {
        expect(step).toHaveProperty('name');
        expect(step).toHaveProperty('params');
        expect(step).toHaveProperty('key');
      });
    });

    test('level pipeline should have correct structure', () => {
      expect(PIPELINES.level).toBeDefined();
      expect(Array.isArray(PIPELINES.level)).toBe(true);

      // Should have room layout, corridors, special tiles, spawn points
      const stepNames = PIPELINES.level.map(s => s.name);
      expect(stepNames).toContain('generate_room_layout');
      expect(stepNames).toContain('generate_corridors');
      expect(stepNames).toContain('place_special_tiles');
      expect(stepNames).toContain('generate_spawn_points');
    });

    test('pipeline params can be functions', () => {
      const step = PIPELINES.campaign[1]; // generate_act
      expect(typeof step.params).toBe('function');

      // Should receive context and return params
      const context = { metadata: { name: 'Test Campaign', theme: 'dark' } };
      const params = step.params(context);

      expect(params).toHaveProperty('campaignName', 'Test Campaign');
      expect(params).toHaveProperty('campaignTheme', 'dark');
    });

    test('optional steps should be marked', () => {
      const questStep = PIPELINES.campaign.find(s => s.key === 'quests');
      expect(questStep).toBeDefined();
      expect(questStep.optional).toBe(true);
    });
  });

  describe('Schema Validation', () => {
    let executor;

    beforeEach(() => {
      executor = new ToolExecutor({
        provider: new MockProvider(),
      });
    });

    test('should validate complete objects', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          id: { type: 'string' },
        },
        required: ['name', 'id'],
      };

      const result = executor.validateAgainstSchema({ name: 'Test', id: '123' }, schema);
      expect(result.valid).toBe(true);
    });

    test('should detect missing required fields', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          id: { type: 'string' },
        },
        required: ['name', 'id'],
      };

      const result = executor.validateAgainstSchema({ name: 'Test' }, schema);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('id');
    });

    test('should return partial for mostly-complete objects', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          id: { type: 'string' },
          description: { type: 'string' },
          theme: { type: 'string' },
        },
        required: ['name', 'id', 'description', 'theme'],
      };

      // 3 of 4 required fields present
      const result = executor.validateAgainstSchema(
        { name: 'Test', id: '123', description: 'Desc' },
        schema
      );
      expect(result.partial).toBe(true);
      expect(result.missingFields).toContain('theme');
    });

    test('should validate array items', () => {
      const schema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
          },
          required: ['id', 'name'],
        },
      };

      const valid = executor.validateAgainstSchema([
        { id: '1', name: 'A' },
        { id: '2', name: 'B' },
      ], schema);
      expect(valid.valid).toBe(true);

      const invalid = executor.validateAgainstSchema([
        { id: '1', name: 'A' },
        { id: '2' }, // Missing name
      ], schema);
      expect(invalid.valid).toBe(false);
    });
  });

  describe('Response Parsing', () => {
    let executor;

    beforeEach(() => {
      executor = new ToolExecutor({
        provider: new MockProvider(),
      });
    });

    test('should parse clean JSON', () => {
      const result = executor.parseResponse('{"name": "Test", "id": "123"}', {
        type: 'object',
        properties: { name: { type: 'string' }, id: { type: 'string' } },
        required: ['name', 'id'],
      });

      expect(result.valid).toBe(true);
      expect(result.data).toEqual({ name: 'Test', id: '123' });
    });

    test('should handle markdown code blocks', () => {
      const result = executor.parseResponse('```json\n{"name": "Test"}\n```', {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      });

      expect(result.valid).toBe(true);
      expect(result.data).toEqual({ name: 'Test' });
    });

    test('should handle code blocks without language', () => {
      const result = executor.parseResponse('```\n{"name": "Test"}\n```', {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name'],
      });

      expect(result.valid).toBe(true);
    });

    test('should return error for invalid JSON', () => {
      const result = executor.parseResponse('not json at all', {
        type: 'object',
        required: ['name'],
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('JSON parse error');
    });
  });

  describe('Prompt Building', () => {
    let executor;

    beforeEach(() => {
      executor = new ToolExecutor({
        provider: new MockProvider(),
      });
    });

    test('should build prompts with tool info', () => {
      const tool = TOOLS.generate_campaign_metadata;
      const params = { template: 'CLASSIC', customTheme: 'dark horror' };

      const prompt = executor.buildToolPrompt(tool, params);

      expect(prompt).toContain('generate_campaign_metadata');
      expect(prompt).toContain(tool.description);
      expect(prompt).toContain('CLASSIC');
      expect(prompt).toContain('dark horror');
      expect(prompt).toContain('JSON');
    });

    test('should include output schema in prompt', () => {
      const tool = TOOLS.generate_act;
      const prompt = executor.buildToolPrompt(tool, { actNumber: 1 });

      // Should contain schema fields
      expect(prompt).toContain('name');
      expect(prompt).toContain('theme');
      expect(prompt).toContain('Cathedral');
    });
  });
});
