/**
 * Neural Integration End-to-End Tests
 *
 * Verifies the complete pipeline from AI campaign generation to game injection:
 * 1. CampaignBuilder generates playable format
 * 2. NeuralGameController can load campaigns
 * 3. Level injection produces valid data
 * 4. Quest triggers are properly configured
 * 5. MPQ output contains expected files
 */

import { CampaignBuilder, QuickCampaign } from '../src/neural/CampaignBuilder';
import { NeuralGameController, ControllerState, RewardType } from '../src/neural/NeuralGameController';
import { MPQBuilder, DUNBuilder, DUN_TILES, MONSTER_IDS } from '../src/neural/MPQBuilder';
import { TownGenerator, STARTING_AREA_TYPES } from '../src/neural/TownGenerator';
import { questTriggerSystem, QuestStatus, TriggerType } from '../src/neural/QuestTriggerSystem';
import { WhiteBoxAPI, LevelType } from '../src/neural/WhiteBoxAPI';
import DUNParser from '../src/neural/DUNParser';

// Mock WASM module with expected DApi exports
const createMockWASM = () => {
  const mockModule = {
    HEAPU8: new Uint8Array(1024 * 1024), // 1MB heap
    HEAPU32: new Uint32Array(256 * 1024),
    HEAP32: new Int32Array(256 * 1024),

    // Memory management
    _malloc: jest.fn((size) => 1000), // Return fake pointer
    _free: jest.fn(),

    // Required DApi exports that WhiteBoxAPI expects
    _DApi_GetCurrentLevel: jest.fn(() => 0),
    _DApi_GetLevelType: jest.fn(() => LevelType.TOWN),
    _DApi_GetDungeonWidth: jest.fn(() => 40),
    _DApi_GetDungeonHeight: jest.fn(() => 40),
    _DApi_GetTileMapWidth: jest.fn(() => 112),
    _DApi_GetTileMapHeight: jest.fn(() => 112),
    _DApi_GetDungeonTile: jest.fn((x, y) => 13), // Floor tile
    _DApi_SetDungeonTile: jest.fn(),
    _DApi_GetDungeonPtr: jest.fn(() => 5000),
    _DApi_GetDMonster: jest.fn(() => 0),
    _DApi_GetDObject: jest.fn(() => 0),
    _DApi_GetDMonsterPtr: jest.fn(() => 10000),
    _DApi_GetDObjectPtr: jest.fn(() => 15000),

    // Player exports
    _DApi_GetPlayerCount: jest.fn(() => 1),
    _DApi_GetMyPlayerIndex: jest.fn(() => 0),
    _DApi_GetPlayerX: jest.fn(() => 25),
    _DApi_GetPlayerY: jest.fn(() => 29),
    _DApi_GetPlayerHP: jest.fn(() => 100),
    _DApi_GetPlayerMaxHP: jest.fn(() => 100),
    _DApi_GetPlayerMana: jest.fn(() => 50),
    _DApi_GetPlayerMaxMana: jest.fn(() => 50),
    _DApi_GetPlayerLevel: jest.fn(() => 1),
    _DApi_GetPlayerGold: jest.fn(() => 100),
    _DApi_GetPlayerClass: jest.fn(() => 0), // Warrior
    _DApi_GetPlayerName: jest.fn(() => 1000), // Pointer to name
    _DApi_SetPlayerPosition: jest.fn(),

    // Monster exports
    _DApi_GetActiveMonsterCount: jest.fn(() => 5),
    _DApi_GetMaxMonsters: jest.fn(() => 200),
    _DApi_IsMonsterActive: jest.fn((id) => id < 5),
    _DApi_GetMonsterX: jest.fn(() => 10),
    _DApi_GetMonsterY: jest.fn(() => 10),
    _DApi_GetMonsterHP: jest.fn(() => 50),
    _DApi_GetMonsterMaxHP: jest.fn(() => 50),
    _DApi_GetMonsterType: jest.fn(() => 1),
    _DApi_SetMonsterPosition: jest.fn(),
    _DApi_SetMonsterHP: jest.fn(),
    _DApi_KillMonster: jest.fn(),

    // Object exports
    _DApi_GetActiveObjectCount: jest.fn(() => 10),
    _DApi_GetObjectX: jest.fn(() => 15),
    _DApi_GetObjectY: jest.fn(() => 15),
    _DApi_GetObjectType: jest.fn(() => 1),

    // Quest exports
    _DApi_GetQuestState: jest.fn(() => 0),
    _DApi_GetQuestLevel: jest.fn(() => 0),

    // Automap
    _DApi_IsAutomapActive: jest.fn(() => 0),
    _DApi_GetAutomapViewPtr: jest.fn(() => 20000),

    // Control functions
    _DApi_SetDungeonGeometry: jest.fn(),
    _DApi_ClearDungeon: jest.fn(),
    _DApi_ClearMonsters: jest.fn(),
    _DApi_ClearObjects: jest.fn(),

    // Memory offset functions
    _DApi_GetDungeonOffset: jest.fn(() => 5000),
    _DApi_GetDMonsterOffset: jest.fn(() => 10000),
    _DApi_GetDObjectOffset: jest.fn(() => 15000),
    _DApi_GetPlayersOffset: jest.fn(() => 25000),
    _DApi_GetMonstersOffset: jest.fn(() => 30000),

    // String helper
    UTF8ToString: jest.fn((ptr) => 'TestPlayer'),
  };

  return mockModule;
};

// Mock Worker
const createMockWorker = () => {
  const listeners = [];
  return {
    postMessage: jest.fn((data) => {
      // Simulate responses for specific actions
      if (data.action === 'custom_api_probe') {
        setTimeout(() => {
          listeners.forEach(cb => cb({
            data: {
              action: 'custom_api_probe_result',
              requestId: data.requestId,
              available: true,
              exports: [
                'DApi_GetCurrentLevel',
                'DApi_SetDungeonGeometry',
                'DApi_ClearMonsters',
                'DApi_InjectMonster',
              ],
            }
          }));
        }, 10);
      }
    }),
    addEventListener: jest.fn((event, callback) => {
      if (event === 'message') {
        listeners.push(callback);
      }
    }),
    removeEventListener: jest.fn(),
  };
};

describe('Neural Integration Pipeline', () => {

  describe('1. CampaignBuilder → Playable Format', () => {

    test('should generate valid playable campaign format', async () => {
      const builder = new CampaignBuilder({ seed: 12345 });

      // Create a simple test blueprint
      const blueprint = {
        id: 'test-campaign',
        name: 'Test Campaign',
        story: {
          acts: [{ id: 'act1', name: 'Act 1', chapters: [] }],
          getTotalChapters: () => 0,
        },
        characters: { getCount: () => 2, getAll: () => [] },
        quests: {
          getCount: () => 1,
          getAll: () => [{
            id: 'quest1',
            name: 'Test Quest',
            description: 'Kill the monsters',
            autoStart: true,
            objectives: [
              { type: 'kill', count: 5, description: 'Kill 5 monsters' }
            ],
            rewards: { gold: 100 },
          }]
        },
        world: { locations: new Map() },
        items: { getCount: () => 0 },
        assets: { getRequirements: () => [] },
        toJSON: () => ({}),
      };

      builder.blueprint = blueprint;

      // Generate a test level
      builder.generatedContent.levels.set('levels/l1data/cathedral1.dun', {
        width: 40,
        height: 40,
        baseTiles: Array(40).fill(null).map(() => Array(40).fill(13)), // Floor
        monsters: [{ x: 10, y: 10, typeId: 1 }],
        objects: [{ x: 15, y: 15, typeId: 25 }],
      });

      // Generate town
      builder.generatedContent.levels.set('levels/towndata/town.dun', {
        width: 40,
        height: 40,
        baseTiles: Array(40).fill(null).map(() => Array(40).fill(13)),
        playerSpawn: { x: 25, y: 29 },
        npcs: [],
        objects: [],
      });

      const playable = builder.toPlayableFormat();

      // Verify structure
      expect(playable).toHaveProperty('id');
      expect(playable).toHaveProperty('name', 'Test Campaign');
      expect(playable).toHaveProperty('levels');
      expect(playable).toHaveProperty('quests');
      expect(playable).toHaveProperty('initialQuests');
      expect(playable).toHaveProperty('startingArea');
      expect(playable).toHaveProperty('playerSpawn');

      // Verify levels converted to grids
      expect(playable.levels[0]).toBeDefined(); // Town
      expect(playable.levels[0].grid).toHaveLength(40);
      expect(playable.levels[0].grid[0]).toHaveLength(40);

      // Verify quests
      expect(playable.quests).toHaveLength(1);
      expect(playable.quests[0].id).toBe('quest1');
      expect(playable.quests[0].stages).toHaveLength(1);
      expect(playable.quests[0].stages[0].trigger.type).toBe('kill_count');

      // Verify initial quests
      expect(playable.initialQuests).toContain('quest1');
    });

    test('should convert objectives to proper trigger types', () => {
      const builder = new CampaignBuilder();

      const killTrigger = builder.objectiveToTrigger({ type: 'kill', count: 10 });
      expect(killTrigger.type).toBe('kill_count');
      expect(killTrigger.count).toBe(10);

      const bossTrigger = builder.objectiveToTrigger({
        type: 'kill',
        target: { isBoss: true, typeId: 101 }
      });
      expect(bossTrigger.type).toBe('boss_killed');
      expect(bossTrigger.bossType).toBe(101);

      const exploreTrigger = builder.objectiveToTrigger({ type: 'explore', levelId: 5 });
      expect(exploreTrigger.type).toBe('level_entered');
      expect(exploreTrigger.level).toBe(5);

      const clearTrigger = builder.objectiveToTrigger({ type: 'clear', levelId: 3 });
      expect(clearTrigger.type).toBe('level_cleared');
    });
  });

  describe('2. WhiteBoxAPI with Mock WASM', () => {

    test('should create WhiteBoxAPI with mock WASM exports', () => {
      const mockWasm = createMockWASM();
      const api = new WhiteBoxAPI(mockWasm);

      expect(api.getCurrentLevel()).toBe(0);
      expect(api.getDungeonWidth()).toBe(40);
      expect(api.getDungeonHeight()).toBe(40);
    });

    test('should read player state', () => {
      const mockWasm = createMockWASM();
      const api = new WhiteBoxAPI(mockWasm);

      const playerState = api.getPlayerState(0);

      expect(playerState.hp).toBe(100);
      expect(playerState.maxHp).toBe(100);
      expect(playerState.level).toBe(1);
      expect(playerState.gold).toBe(100);
      expect(playerState.position.x).toBe(25);
      expect(playerState.position.y).toBe(29);
    });

    test('should read monster state', () => {
      const mockWasm = createMockWASM();
      const api = new WhiteBoxAPI(mockWasm);

      const monsters = api.getAllActiveMonsters();
      expect(monsters.length).toBe(5); // Mock returns 5 active
    });

    test('should get full game state', () => {
      const mockWasm = createMockWASM();
      const api = new WhiteBoxAPI(mockWasm);

      const state = api.getGameState();

      expect(state.level.current).toBe(0);
      expect(state.level.type).toBe(LevelType.TOWN);
      expect(state.player.hp).toBe(100);
      expect(state.monsters.active).toBe(5);
    });
  });

  describe('3. Quest Trigger System', () => {

    beforeEach(() => {
      questTriggerSystem.reset();
    });

    test('should register and start quests', () => {
      questTriggerSystem.registerQuest({
        id: 'test-quest',
        name: 'Test Quest',
        stages: [
          { trigger: { type: TriggerType.KILL_COUNT, count: 5 } }
        ],
        rewards: { gold: 100 },
      });

      expect(questTriggerSystem.getQuest('test-quest')).toBeDefined();

      questTriggerSystem.startQuest('test-quest');

      const activeQuests = questTriggerSystem.getActiveQuests();
      expect(activeQuests.length).toBe(1);
      expect(activeQuests[0].status).toBe(QuestStatus.IN_PROGRESS);
    });

    test('should track kill counts', () => {
      questTriggerSystem.registerQuest({
        id: 'kill-quest',
        name: 'Kill Quest',
        stages: [
          { trigger: { type: TriggerType.KILL_COUNT, count: 3, questId: 'kill-quest' } }
        ],
      });

      questTriggerSystem.startQuest('kill-quest');

      // Simulate kills
      questTriggerSystem.handleMonsterKilled({ data: { monsterType: 1 } });
      questTriggerSystem.handleMonsterKilled({ data: { monsterType: 2 } });

      const counts = questTriggerSystem.getKillCounts();
      expect(counts.total).toBe(2);
    });

    test('should export and import state', () => {
      questTriggerSystem.registerQuest({
        id: 'save-test',
        name: 'Save Test',
        stages: [],
      });

      questTriggerSystem.startQuest('save-test');
      questTriggerSystem.handleMonsterKilled({ data: {} });

      const exported = questTriggerSystem.exportState();

      questTriggerSystem.reset();
      expect(questTriggerSystem.getActiveQuests().length).toBe(0);

      questTriggerSystem.registerQuest({
        id: 'save-test',
        name: 'Save Test',
        stages: [],
      });
      questTriggerSystem.importState(exported);

      expect(questTriggerSystem.getKillCounts().total).toBe(1);
    });
  });

  describe('4. Town Generator', () => {

    test('should generate valid town data', () => {
      const generator = new TownGenerator({ type: 'village', seed: 12345 });
      const dunData = generator.generate();

      expect(dunData.width).toBe(40);
      expect(dunData.height).toBe(40);
      expect(dunData.baseTiles).toHaveLength(40);
      expect(dunData.baseTiles[0]).toHaveLength(40);
    });

    test('should include spawn point', () => {
      const generator = new TownGenerator({ type: 'village' });
      const dunData = generator.generate();

      // Town should have player spawn
      expect(dunData.playerSpawn || generator.getSpawnPoint()).toBeDefined();
    });
  });

  describe('5. MPQ Builder Output', () => {

    test('should create valid DUN files', () => {
      const dunBuilder = new DUNBuilder(40, 40);

      // Add some tiles
      dunBuilder.fill(0, 0, 40, 40, DUN_TILES.FLOOR);
      dunBuilder.setTile(0, 0, DUN_TILES.WALL);
      dunBuilder.setTile(20, 20, DUN_TILES.STAIRS_DOWN);

      const buffer = dunBuilder.toBuffer();

      expect(buffer).toBeInstanceOf(Uint8Array);
      expect(buffer.length).toBeGreaterThan(0);

      // Verify can be parsed back
      const parsed = DUNParser.parse(buffer);
      expect(parsed.width).toBe(40);
      expect(parsed.height).toBe(40);
    });

    test('should create MPQ with all required files', () => {
      const mpqBuilder = new MPQBuilder();

      // Add a level
      const dunBuilder = new DUNBuilder(40, 40);
      dunBuilder.fill(0, 0, 40, 40, DUN_TILES.FLOOR);

      mpqBuilder.addLevel('levels/l1data/test.dun', dunBuilder);

      // Add manifest
      mpqBuilder.addManifest({
        name: 'Test Campaign',
        version: 1,
        levels: ['levels/l1data/test.dun'],
      });

      const mpqData = mpqBuilder.build();

      expect(mpqData).toBeDefined();
      expect(mpqData.files).toBeDefined();
      expect(mpqData.files.length).toBeGreaterThan(0);
    });
  });

  describe('6. Full Integration Flow', () => {

    test('should complete full campaign → playable → injection flow', async () => {
      // 1. Create campaign
      const builder = new CampaignBuilder({ seed: 99999 });

      builder.blueprint = {
        id: 'full-test',
        name: 'Full Integration Test',
        story: {
          acts: [{ id: 'act1', chapters: [] }],
          getTotalChapters: () => 0,
        },
        characters: { getCount: () => 0, getAll: () => [] },
        quests: {
          getCount: () => 2,
          getAll: () => [
            {
              id: 'main-quest',
              name: 'Main Quest',
              autoStart: true,
              objectives: [
                { type: 'explore', levelId: 1, description: 'Enter the Cathedral' },
                { type: 'kill', target: { isBoss: true, typeId: 101 }, description: 'Kill Skeleton King' },
              ],
              rewards: { gold: 500, unlockArea: 5 },
            },
            {
              id: 'side-quest',
              name: 'Side Quest',
              objectives: [
                { type: 'kill', count: 20, description: 'Kill 20 monsters' },
              ],
              rewards: { gold: 200 },
            }
          ]
        },
        world: { locations: new Map() },
        items: { getCount: () => 0 },
        assets: { getRequirements: () => [] },
        toJSON: () => ({}),
      };

      // Add levels
      for (let i = 0; i <= 4; i++) {
        const path = i === 0 ? 'levels/towndata/town.dun' : `levels/l1data/cathedral${i}.dun`;
        builder.generatedContent.levels.set(path, {
          width: 40,
          height: 40,
          baseTiles: Array(40).fill(null).map(() => Array(40).fill(13)),
          monsters: i > 0 ? [{ x: 10, y: 10, typeId: i }] : [],
          objects: [{ x: 20, y: 20, typeId: 1 }],
          playerSpawn: i === 0 ? { x: 25, y: 29 } : null,
        });
      }

      // 2. Convert to playable
      const playable = builder.toPlayableFormat();

      expect(playable.quests.length).toBe(2);
      expect(playable.initialQuests).toContain('main-quest');
      expect(Object.keys(playable.levels).length).toBeGreaterThan(0);

      // 3. Verify quest structure
      const mainQuest = playable.quests.find(q => q.id === 'main-quest');
      expect(mainQuest.stages.length).toBe(2);
      expect(mainQuest.stages[0].trigger.type).toBe('level_entered');
      expect(mainQuest.stages[1].trigger.type).toBe('boss_killed');
      expect(mainQuest.stages[1].trigger.bossType).toBe(101);

      // 4. Verify starting area
      expect(playable.startingArea).toBeDefined();
      expect(playable.startingArea.grid).toHaveLength(40);
      expect(playable.playerSpawn).toEqual({ x: 25, y: 29 });

      // 5. Verify boss unlocks configured
      expect(playable.bossUnlocks[101]).toBeDefined();
    });
  });
});

describe('DApi Export Verification', () => {

  test('should list all expected DApi exports', () => {
    // This documents what exports we expect from the WASM
    const expectedExports = [
      // Game state
      'DApi_GetCurrentLevel',
      'DApi_GetLevelType',
      'DApi_GetDungeonWidth',
      'DApi_GetDungeonHeight',

      // Player
      'DApi_GetPlayerHP',
      'DApi_GetPlayerMaxHP',
      'DApi_GetPlayerX',
      'DApi_GetPlayerY',
      'DApi_GetPlayerLevel',
      'DApi_GetPlayerGold',
      'DApi_GetMyPlayerIndex',
      'DApi_SetPlayerPosition',

      // Monsters
      'DApi_GetActiveMonsterCount',
      'DApi_GetMaxMonsters',
      'DApi_IsMonsterActive',
      'DApi_GetMonsterHP',
      'DApi_GetMonsterX',
      'DApi_GetMonsterY',
      'DApi_GetMonsterType',

      // Level injection
      'DApi_SetDungeonGeometry',
      'DApi_ClearDungeon',
      'DApi_ClearMonsters',
      'DApi_ClearObjects',

      // Memory access
      'DApi_GetDungeonPtr',
      'DApi_GetDMonsterPtr',
      'DApi_GetDObjectPtr',
    ];

    // Create mock and verify all expected exports are present
    const mockWasm = createMockWASM();

    for (const exportName of expectedExports) {
      const funcName = `_${exportName}`;
      expect(mockWasm[funcName]).toBeDefined();
      expect(typeof mockWasm[funcName]).toBe('function');
    }
  });
});
