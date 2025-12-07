#!/usr/bin/env node
/**
 * Quick Integration Verification Script
 *
 * Tests the key integration points without full Jest setup
 */

// Use babel-register for ES module support
require('@babel/register')({
  presets: ['@babel/preset-env', '@babel/preset-react'],
  plugins: ['@babel/plugin-transform-runtime'],
  ignore: [/node_modules/],
});

// Mock browser globals
global.window = { localStorage: { getItem: () => null, setItem: () => {} } };
global.document = { createElement: () => ({ getContext: () => null }) };
global.localStorage = { getItem: () => null, setItem: () => {} };
global.fetch = () => Promise.resolve({ json: () => ({}) });
global.Image = class {};
global.HTMLCanvasElement = class {};

console.log('=== Neural Integration Verification ===\n');

async function verifyIntegration() {
  let passed = 0;
  let failed = 0;

  // Test 1: CampaignBuilder imports and toPlayableFormat exists
  console.log('1. Testing CampaignBuilder...');
  try {
    const { CampaignBuilder } = require('../src/neural/CampaignBuilder');
    const builder = new CampaignBuilder();

    if (typeof builder.toPlayableFormat !== 'function') {
      throw new Error('toPlayableFormat method not found');
    }

    // Create minimal blueprint
    builder.blueprint = {
      id: 'test',
      name: 'Test',
      story: { acts: [], getTotalChapters: () => 0 },
      characters: { getCount: () => 0, getAll: () => [] },
      quests: { getCount: () => 0, getAll: () => [] },
      world: { locations: new Map() },
      items: { getCount: () => 0 },
      assets: { getRequirements: () => [] },
      toJSON: () => ({}),
    };

    // Add a level
    builder.generatedContent.levels.set('levels/l1data/test.dun', {
      width: 40,
      height: 40,
      baseTiles: Array(40).fill(null).map(() => Array(40).fill(13)),
    });

    const playable = builder.toPlayableFormat();

    if (!playable.id || !playable.levels) {
      throw new Error('Invalid playable format');
    }

    console.log('   ✓ CampaignBuilder.toPlayableFormat() works');
    console.log(`   ✓ Generated campaign: ${playable.name}`);
    console.log(`   ✓ Levels: ${Object.keys(playable.levels).length}`);
    passed++;
  } catch (err) {
    console.log(`   ✗ FAILED: ${err.message}`);
    failed++;
  }

  // Test 2: DUNBuilder creates valid DUN files
  console.log('\n2. Testing DUNBuilder...');
  try {
    const { DUNBuilder, DUN_TILES } = require('../src/neural/MPQBuilder');
    const dunBuilder = new DUNBuilder(40, 40);

    dunBuilder.fill(0, 0, 40, 40, DUN_TILES.FLOOR);
    dunBuilder.setTile(0, 0, DUN_TILES.WALL);

    const buffer = dunBuilder.toBuffer();

    if (!(buffer instanceof Uint8Array)) {
      throw new Error('Buffer not created');
    }

    if (buffer.length < 100) {
      throw new Error('Buffer too small');
    }

    // Verify header (width/height as 16-bit LE)
    const view = new DataView(buffer.buffer);
    const width = view.getInt16(0, true);
    const height = view.getInt16(2, true);

    if (width !== 40 || height !== 40) {
      throw new Error(`Invalid dimensions: ${width}x${height}`);
    }

    console.log(`   ✓ DUNBuilder creates valid buffer (${buffer.length} bytes)`);
    console.log(`   ✓ Dimensions: ${width}x${height}`);
    passed++;
  } catch (err) {
    console.log(`   ✗ FAILED: ${err.message}`);
    failed++;
  }

  // Test 3: TownGenerator creates towns
  console.log('\n3. Testing TownGenerator...');
  try {
    const { TownGenerator } = require('../src/neural/TownGenerator');
    const generator = new TownGenerator({ type: 'village', seed: 12345 });
    const dunData = generator.generate();

    if (dunData.width !== 40 || dunData.height !== 40) {
      throw new Error('Invalid town dimensions');
    }

    if (!dunData.baseTiles || dunData.baseTiles.length !== 40) {
      throw new Error('Invalid baseTiles');
    }

    console.log(`   ✓ TownGenerator creates ${dunData.width}x${dunData.height} town`);
    console.log(`   ✓ Base tiles: ${dunData.baseTiles.length} rows`);
    passed++;
  } catch (err) {
    console.log(`   ✗ FAILED: ${err.message}`);
    failed++;
  }

  // Test 4: QuestTriggerSystem works
  console.log('\n4. Testing QuestTriggerSystem...');
  try {
    const { questTriggerSystem, QuestStatus, TriggerType } = require('../src/neural/QuestTriggerSystem');

    questTriggerSystem.reset();

    questTriggerSystem.registerQuest({
      id: 'test-quest',
      name: 'Test Quest',
      stages: [
        { trigger: { type: TriggerType.KILL_COUNT, count: 5 } }
      ],
    });

    questTriggerSystem.startQuest('test-quest');

    const active = questTriggerSystem.getActiveQuests();
    if (active.length !== 1) {
      throw new Error('Quest not started');
    }

    questTriggerSystem.handleMonsterKilled({ data: { monsterType: 1 } });
    questTriggerSystem.handleMonsterKilled({ data: { monsterType: 2 } });

    const counts = questTriggerSystem.getKillCounts();
    if (counts.total !== 2) {
      throw new Error(`Kill count wrong: ${counts.total}`);
    }

    console.log(`   ✓ Quest registered and started`);
    console.log(`   ✓ Kill count tracking: ${counts.total} kills`);
    passed++;
  } catch (err) {
    console.log(`   ✗ FAILED: ${err.message}`);
    failed++;
  }

  // Test 5: NeuralGameController exists and has expected methods
  console.log('\n5. Testing NeuralGameController...');
  try {
    const { NeuralGameController, ControllerState, RewardType } = require('../src/neural/NeuralGameController');
    const controller = new NeuralGameController();

    const expectedMethods = [
      'initialize',
      'loadCampaign',
      'onGameStart',
      'onBossKilled',
      'executeRewards',
      'getStatus',
    ];

    for (const method of expectedMethods) {
      if (typeof controller[method] !== 'function') {
        throw new Error(`Missing method: ${method}`);
      }
    }

    if (!ControllerState.READY) {
      throw new Error('ControllerState not exported');
    }

    if (!RewardType.GOLD) {
      throw new Error('RewardType not exported');
    }

    const status = controller.getStatus();
    if (status.state !== ControllerState.UNINITIALIZED) {
      throw new Error('Invalid initial state');
    }

    console.log(`   ✓ NeuralGameController has all expected methods`);
    console.log(`   ✓ Initial state: ${status.state}`);
    passed++;
  } catch (err) {
    console.log(`   ✗ FAILED: ${err.message}`);
    failed++;
  }

  // Test 6: WhiteBoxAPI structure
  console.log('\n6. Testing WhiteBoxAPI structure...');
  try {
    const { WhiteBoxAPI, LevelType, PlayerClass } = require('../src/neural/WhiteBoxAPI');

    // Verify class exists
    if (typeof WhiteBoxAPI !== 'function') {
      throw new Error('WhiteBoxAPI not a class');
    }

    // Verify constants
    if (LevelType.TOWN !== 0) {
      throw new Error('LevelType constants wrong');
    }

    if (PlayerClass.WARRIOR !== 0) {
      throw new Error('PlayerClass constants wrong');
    }

    // List expected methods (without instantiating - needs WASM)
    const expectedMethods = [
      'getCurrentLevel',
      'getPlayerState',
      'getAllActiveMonsters',
      'getGameState',
      'setDungeonGeometry',
      'clearMonsters',
    ];

    console.log(`   ✓ WhiteBoxAPI class exists`);
    console.log(`   ✓ LevelType: TOWN=${LevelType.TOWN}, CATHEDRAL=${LevelType.CATHEDRAL}`);
    console.log(`   ✓ PlayerClass: WARRIOR=${PlayerClass.WARRIOR}, ROGUE=${PlayerClass.ROGUE}`);
    passed++;
  } catch (err) {
    console.log(`   ✗ FAILED: ${err.message}`);
    failed++;
  }

  // Test 7: MPQBuilder creates valid output
  console.log('\n7. Testing MPQBuilder...');
  try {
    const { MPQBuilder, DUNBuilder, DUN_TILES } = require('../src/neural/MPQBuilder');
    const mpqBuilder = new MPQBuilder();

    const dunBuilder = new DUNBuilder(40, 40);
    dunBuilder.fill(0, 0, 40, 40, DUN_TILES.FLOOR);

    mpqBuilder.addLevel('levels/l1data/test.dun', dunBuilder);
    mpqBuilder.addManifest({
      name: 'Test Campaign',
      version: 1,
    });

    const mpqData = mpqBuilder.build();

    if (!mpqData.files || mpqData.files.length < 2) {
      throw new Error('MPQ missing files');
    }

    const levelFile = mpqData.files.find(f => f.path.includes('test.dun'));
    if (!levelFile) {
      throw new Error('Level file not in MPQ');
    }

    console.log(`   ✓ MPQBuilder creates valid output`);
    console.log(`   ✓ Files in MPQ: ${mpqData.files.length}`);
    console.log(`   ✓ Includes: ${mpqData.files.map(f => f.path).join(', ')}`);
    passed++;
  } catch (err) {
    console.log(`   ✗ FAILED: ${err.message}`);
    failed++;
  }

  // Test 8: Objective to Trigger conversion
  console.log('\n8. Testing objective → trigger conversion...');
  try {
    const { CampaignBuilder } = require('../src/neural/CampaignBuilder');
    const builder = new CampaignBuilder();

    const tests = [
      { input: { type: 'kill', count: 10 }, expected: 'kill_count' },
      { input: { type: 'explore', levelId: 1 }, expected: 'level_entered' },
      { input: { type: 'clear', levelId: 3 }, expected: 'level_cleared' },
      { input: { type: 'kill', target: { isBoss: true, typeId: 101 } }, expected: 'boss_killed' },
    ];

    for (const test of tests) {
      const trigger = builder.objectiveToTrigger(test.input);
      if (trigger.type !== test.expected) {
        throw new Error(`${test.input.type} → ${trigger.type} (expected ${test.expected})`);
      }
    }

    console.log(`   ✓ All objective types convert correctly`);
    console.log(`   ✓ kill → kill_count, explore → level_entered`);
    console.log(`   ✓ clear → level_cleared, boss → boss_killed`);
    passed++;
  } catch (err) {
    console.log(`   ✗ FAILED: ${err.message}`);
    failed++;
  }

  // Summary
  console.log('\n=== Summary ===');
  console.log(`Passed: ${passed}/${passed + failed}`);
  console.log(`Failed: ${failed}/${passed + failed}`);

  if (failed > 0) {
    console.log('\n⚠️  Some tests failed. Check output above.');
    process.exit(1);
  } else {
    console.log('\n✅ All integration points verified!');
    process.exit(0);
  }
}

verifyIntegration().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
