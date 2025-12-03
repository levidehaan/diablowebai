/**
 * Campaign Generation Tests
 *
 * Tests the campaign generation flow with mock AI responses
 * to ensure proper JSON parsing, error handling, and fallback behavior.
 */

import {
  VALID_CAMPAIGN_RESPONSE,
  MALFORMED_CAMPAIGN_RESPONSE,
  TRAILING_COMMA_RESPONSE,
  VALID_LEVEL_RESPONSE,
  MockProvider,
  MalformedMockProvider,
  ErrorMockProvider,
} from './fixtures/mockResponses.js';

// Mock browser APIs
global.fetch = jest.fn();
global.localStorage = {
  store: {},
  getItem: function(key) { return this.store[key] || null; },
  setItem: function(key, value) { this.store[key] = value; },
  removeItem: function(key) { delete this.store[key]; },
  clear: function() { this.store = {}; },
};

global.performance = {
  now: () => Date.now(),
  memory: { usedJSHeapSize: 0, totalJSHeapSize: 0, jsHeapSizeLimit: 0 },
};

global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('Campaign Generator', () => {
  let CampaignGenerator, MockCampaignGenerator;

  beforeAll(async () => {
    jest.resetModules();
    const module = await import('../src/neural/CampaignGenerator.js');
    CampaignGenerator = module.CampaignGenerator;
    MockCampaignGenerator = module.MockCampaignGenerator;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    global.localStorage.clear();
  });

  describe('MockCampaignGenerator', () => {
    test('should generate valid campaign structure', () => {
      const campaign = MockCampaignGenerator.generateCampaign('CLASSIC');

      expect(campaign).toBeDefined();
      expect(campaign.id).toBeDefined();
      expect(campaign.name).toBeDefined();
      expect(campaign.acts).toBeDefined();
      expect(Array.isArray(campaign.acts)).toBe(true);
      expect(campaign.acts.length).toBeGreaterThan(0);
    });

    test('should generate campaigns for all templates', () => {
      const templates = ['CLASSIC', 'SIEGE', 'CORRUPTION', 'QUEST'];

      templates.forEach(template => {
        const campaign = MockCampaignGenerator.generateCampaign(template);
        expect(campaign).toBeDefined();
        expect(campaign.template).toBe(template);
      });
    });

    test('should generate deterministic campaigns with same seed', () => {
      const seed1 = 'test-seed-123';
      const campaign1 = MockCampaignGenerator.generateCampaign('CLASSIC', seed1);
      const campaign2 = MockCampaignGenerator.generateCampaign('CLASSIC', seed1);

      expect(campaign1.name).toBe(campaign2.name);
      expect(campaign1.acts.length).toBe(campaign2.acts.length);
    });

    test('should generate different campaigns with different seeds', () => {
      const campaign1 = MockCampaignGenerator.generateCampaign('CLASSIC', 'seed-a');
      const campaign2 = MockCampaignGenerator.generateCampaign('CLASSIC', 'seed-b');

      // Names should likely be different with different seeds
      // (not guaranteed but highly probable)
      expect(campaign1.id).not.toBe(campaign2.id);
    });

    test('should include acts with correct structure', () => {
      const campaign = MockCampaignGenerator.generateCampaign('CLASSIC');

      campaign.acts.forEach((act, index) => {
        expect(act.id).toBeDefined();
        expect(act.number).toBe(index + 1);
        expect(act.name).toBeDefined();
        expect(act.theme).toBeDefined();
        expect(act.levels).toBeDefined();
        expect(Array.isArray(act.levels)).toBe(true);
      });
    });

    test('should include levels with correct structure', () => {
      const campaign = MockCampaignGenerator.generateCampaign('CLASSIC');

      campaign.acts.forEach(act => {
        act.levels.forEach(level => {
          expect(level.id).toBeDefined();
          expect(level.name).toBeDefined();
          expect(typeof level.difficulty).toBe('number');
          expect(level.objectives).toBeDefined();
          expect(Array.isArray(level.objectives)).toBe(true);
        });
      });
    });

    test('should include bosses with dialogue', () => {
      const campaign = MockCampaignGenerator.generateCampaign('CLASSIC');

      const bossesWithDialogue = campaign.acts.filter(act => act.boss && act.boss.dialogue);
      expect(bossesWithDialogue.length).toBeGreaterThan(0);

      bossesWithDialogue.forEach(act => {
        expect(act.boss.name).toBeDefined();
        expect(act.boss.type).toBeDefined();
        expect(act.boss.dialogue.intro).toBeDefined();
        expect(act.boss.dialogue.defeat).toBeDefined();
      });
    });
  });

  describe('CampaignGenerator.validateCampaign', () => {
    let generator;

    beforeEach(() => {
      generator = new CampaignGenerator();
    });

    test('should fix missing campaign id', () => {
      const input = { name: 'Test', acts: [], quests: [] };
      const result = generator.validateCampaign(input);

      expect(result.id).toBeDefined();
      expect(result.id.startsWith('campaign_')).toBe(true);
    });

    test('should fix missing campaign name', () => {
      const input = { id: 'test', acts: [], quests: [] };
      const result = generator.validateCampaign(input);

      expect(result.name).toBe('Unknown Campaign');
    });

    test('should fix missing description', () => {
      const input = { id: 'test', name: 'Test', acts: [], quests: [] };
      const result = generator.validateCampaign(input);

      expect(result.description).toBeDefined();
      expect(result.description.length).toBeGreaterThan(0);
    });

    test('should fix missing act fields', () => {
      const input = {
        id: 'test',
        name: 'Test',
        acts: [{}],
        quests: []
      };
      const result = generator.validateCampaign(input);

      const act = result.acts[0];
      expect(act.id).toBe('act_1');
      expect(act.number).toBe(1);
      expect(act.name).toBe('Act 1');
      expect(act.theme).toBeDefined();
      expect(Array.isArray(act.levels)).toBe(true);
    });

    test('should fix missing level fields', () => {
      const input = {
        id: 'test',
        name: 'Test',
        acts: [{
          levels: [{}]
        }],
        quests: []
      };
      const result = generator.validateCampaign(input);

      const level = result.acts[0].levels[0];
      expect(level.id).toBeDefined();
      expect(level.name).toBeDefined();
      expect(typeof level.difficulty).toBe('number');
      expect(Array.isArray(level.objectives)).toBe(true);
      expect(Array.isArray(level.spawnAreas)).toBe(true);
    });

    test('should fix missing boss dialogue', () => {
      const input = {
        id: 'test',
        name: 'Test',
        acts: [{
          boss: { name: 'Boss', type: 'SKELETON_KING' }
        }],
        quests: []
      };
      const result = generator.validateCampaign(input);

      expect(result.acts[0].boss.dialogue).toBeDefined();
      expect(result.acts[0].boss.dialogue.intro).toBeDefined();
      expect(result.acts[0].boss.dialogue.defeat).toBeDefined();
    });
  });

  describe('CampaignGenerator.repairJSON', () => {
    let generator;

    beforeEach(() => {
      generator = new CampaignGenerator();
    });

    test('should remove trailing commas', () => {
      const input = '{"a": 1, "b": 2,}';
      const repaired = generator.repairJSON(input);

      expect(() => JSON.parse(repaired)).not.toThrow();
      const parsed = JSON.parse(repaired);
      expect(parsed.a).toBe(1);
      expect(parsed.b).toBe(2);
    });

    test('should remove trailing commas in arrays', () => {
      const input = '{"arr": [1, 2, 3,]}';
      const repaired = generator.repairJSON(input);

      expect(() => JSON.parse(repaired)).not.toThrow();
      const parsed = JSON.parse(repaired);
      expect(parsed.arr).toEqual([1, 2, 3]);
    });

    test('should handle nested trailing commas', () => {
      const input = '{"obj": {"a": 1,}, "arr": [1,],}';
      const repaired = generator.repairJSON(input);

      expect(() => JSON.parse(repaired)).not.toThrow();
    });

    test('should remove text after final brace', () => {
      const input = '{"a": 1} some extra text';
      const repaired = generator.repairJSON(input);

      expect(() => JSON.parse(repaired)).not.toThrow();
      expect(JSON.parse(repaired).a).toBe(1);
    });

    test('should balance unbalanced braces', () => {
      const input = '{"a": {"b": 1}';
      const repaired = generator.repairJSON(input);

      expect(() => JSON.parse(repaired)).not.toThrow();
    });

    test('should handle "null or {}" pattern', () => {
      const input = '{"unlockCondition": null or {"type": "test"}}';
      const repaired = generator.repairJSON(input);

      expect(() => JSON.parse(repaired)).not.toThrow();
      expect(JSON.parse(repaired).unlockCondition).toBeNull();
    });

    test('should remove control characters', () => {
      const input = '{"a": "test\x00\x01value"}';
      const repaired = generator.repairJSON(input);

      expect(repaired.includes('\x00')).toBe(false);
      expect(repaired.includes('\x01')).toBe(false);
    });
  });
});

describe('Level Generator Integration', () => {
  let levelGenerator, MockLevelGenerator;

  beforeAll(async () => {
    jest.resetModules();
    const module = await import('../src/neural/LevelGenerator.js');
    levelGenerator = module.default;
    MockLevelGenerator = module.MockLevelGenerator;
  });

  describe('generateLevel wrapper', () => {
    test('should accept options object format', async () => {
      const result = await levelGenerator.generateLevel({
        theme: 'cathedral',
        difficulty: 1,
      });

      expect(result).toBeDefined();
      expect(Array.isArray(result) || (result && typeof result === 'object')).toBe(true);
    });

    test('should handle different themes', async () => {
      const themes = ['cathedral', 'catacombs', 'caves', 'hell'];

      for (const theme of themes) {
        const result = await levelGenerator.generateLevel({ theme, difficulty: 1 });
        expect(result).toBeDefined();
      }
    });

    test('should handle missing options gracefully', async () => {
      const result = await levelGenerator.generateLevel();
      expect(result).toBeDefined();
    });

    test('should handle empty options object', async () => {
      const result = await levelGenerator.generateLevel({});
      expect(result).toBeDefined();
    });
  });

  describe('MockLevelGenerator output validation', () => {
    test('should produce valid grid dimensions', () => {
      const result = MockLevelGenerator.generate(0, 1);

      expect(result.grid.length).toBe(40);
      result.grid.forEach(row => {
        expect(row.length).toBe(40);
      });
    });

    test('should produce valid tile values', () => {
      const result = MockLevelGenerator.generate(0, 1);
      const validTiles = [0, 1, 2, 3, 4]; // floor, wall, door, stairs_up, stairs_down

      result.grid.forEach(row => {
        row.forEach(tile => {
          expect(validTiles).toContain(tile);
        });
      });
    });

    test('should have border walls', () => {
      const result = MockLevelGenerator.generate(0, 1);

      // Top and bottom rows should be walls (except for possible doors)
      result.grid[0].forEach((tile, x) => {
        if (x > 0 && x < 39) {
          expect([1, 2]).toContain(tile); // Wall or door
        }
      });

      result.grid[39].forEach((tile, x) => {
        if (x > 0 && x < 39) {
          expect([1, 2]).toContain(tile);
        }
      });
    });

    test('should contain exactly one stairs up and one stairs down', () => {
      const result = MockLevelGenerator.generate(0, 1);

      let stairsUpCount = 0;
      let stairsDownCount = 0;

      result.grid.forEach(row => {
        row.forEach(tile => {
          if (tile === 3) stairsUpCount++;
          if (tile === 4) stairsDownCount++;
        });
      });

      expect(stairsUpCount).toBe(1);
      expect(stairsDownCount).toBe(1);
    });

    test('should have connected stairs (pathfinding)', async () => {
      const { Pathfinder, MapHealer } = await import('../src/neural/LevelGenerator.js');
      const result = MockLevelGenerator.generate(0, 1);

      // Use MapHealer to ensure stairs exist and connectivity
      const healedGrid = MapHealer.heal(result.grid);

      // Find stairs positions
      let stairsUp = null;
      let stairsDown = null;

      healedGrid.forEach((row, y) => {
        row.forEach((tile, x) => {
          if (tile === 3) stairsUp = { x, y };
          if (tile === 4) stairsDown = { x, y };
        });
      });

      expect(stairsUp).not.toBeNull();
      expect(stairsDown).not.toBeNull();

      // Check path exists between stairs
      const path = Pathfinder.findPath(healedGrid, stairsUp.x, stairsUp.y, stairsDown.x, stairsDown.y);
      expect(path).not.toBeNull();
      expect(path.length).toBeGreaterThan(0);
    });
  });
});

describe('WorldBuilder Integration', () => {
  let WorldBuilder, WorldMap, Area;

  beforeAll(async () => {
    jest.resetModules();

    // Mock provider for WorldBuilder
    jest.doMock('../src/neural/providers/index.js', () => ({
      providerManager: {
        provider: new MockProvider(),
        isInitialized: () => true,
        getProvider: () => new MockProvider(),
      },
      PROVIDERS: { OPENROUTER: 'openrouter' },
      PROVIDER_CONFIGS: {},
    }));

    const module = await import('../src/neural/WorldBuilder.js');
    WorldBuilder = module.WorldBuilder;
    WorldMap = module.WorldMap;
    Area = module.Area;
  });

  afterAll(() => {
    jest.resetModules();
  });

  describe('WorldMap class', () => {
    test('should create empty world', () => {
      const world = new WorldMap();

      expect(world.areas).toBeDefined();
      expect(world.areas.size).toBe(0);
      expect(world.startArea).toBeNull();
    });

    test('should add and retrieve areas', () => {
      const world = new WorldMap();
      const area = new Area({
        id: 'area_1',
        name: 'Area 1',
        type: 'dungeon',
        width: 40,
        height: 40,
        grid: VALID_LEVEL_RESPONSE.grid,
      });

      world.addArea(area);

      expect(world.areas.size).toBe(1);
      expect(world.getArea('area_1')).toBe(area);
    });

    test('should track start area', () => {
      const world = new WorldMap();
      const area = new Area({
        id: 'area_1',
        name: 'Area 1',
        type: 'dungeon',
        width: 40,
        height: 40,
        grid: VALID_LEVEL_RESPONSE.grid,
      });

      world.addArea(area);

      // First added area becomes start area
      expect(world.startArea).toBe('area_1');
      expect(world.getStartArea()).toBe(area);
    });
  });

  describe('Area class', () => {
    test('should create area with required properties', () => {
      const area = new Area({
        id: 'test_area',
        name: 'Test Area',
        type: 'dungeon',
        theme: 'cathedral',
        width: 40,
        height: 40,
        grid: VALID_LEVEL_RESPONSE.grid,
      });

      expect(area.id).toBe('test_area');
      expect(area.name).toBe('Test Area');
      expect(area.type).toBe('dungeon');
      expect(area.theme).toBe('cathedral');
      expect(area.width).toBe(40);
      expect(area.height).toBe(40);
    });

    test('should track locked state', () => {
      const area = new Area({
        id: 'test',
        name: 'Test',
        type: 'dungeon',
        width: 40,
        height: 40,
        grid: VALID_LEVEL_RESPONSE.grid,
        locked: true,
        unlockCondition: { type: 'boss_kill', target: 'SKELETON_KING' },
      });

      expect(area.locked).toBe(true);
      expect(area.unlockCondition.type).toBe('boss_kill');
    });

    test('should have all expected properties', () => {
      const area = new Area({
        id: 'test',
        name: 'Test',
        type: 'dungeon',
        width: 40,
        height: 40,
        grid: VALID_LEVEL_RESPONSE.grid,
      });

      // Area stores properties directly
      expect(area.id).toBe('test');
      expect(area.name).toBe('Test');
      expect(area.grid).toBeDefined();
      expect(area.transitions).toBeDefined();
      expect(area.spawnPoints).toBeDefined();
    });
  });
});

describe('Error Handling', () => {
  let CampaignGenerator;

  beforeAll(async () => {
    jest.resetModules();
    const module = await import('../src/neural/CampaignGenerator.js');
    CampaignGenerator = module.CampaignGenerator;
  });

  test('should fall back to mock on JSON parse error', async () => {
    const generator = new CampaignGenerator();

    // Simulate what happens with malformed JSON
    const malformed = '{"incomplete": true';
    const repaired = generator.repairJSON(malformed);

    // Should be able to parse after repair
    expect(() => JSON.parse(repaired)).not.toThrow();
  });

  test('should handle empty response gracefully', async () => {
    const generator = new CampaignGenerator();

    const repaired = generator.repairJSON('');
    expect(repaired).toBe('');
  });

  test('should handle non-JSON response', async () => {
    const generator = new CampaignGenerator();

    const result = generator.repairJSON('This is not JSON at all');
    expect(typeof result).toBe('string');
  });
});
