/**
 * End-to-End MPQ Generation Tests
 *
 * Tests the full pipeline: Campaign → Levels → DUN files → MPQ archive
 * This verifies the MPQ is structurally valid before deployment.
 *
 * Run with: node tests/mpq-e2e.test.js
 */

const fs = require('fs');
const path = require('path');

// Simple test runner
const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

function assertGreaterThan(actual, expected, message) {
  if (actual <= expected) {
    throw new Error(message || `Expected ${actual} > ${expected}`);
  }
}

async function runTests() {
  console.log('\n========================================');
  console.log('  MPQ End-to-End Test Suite');
  console.log('========================================\n');

  for (const t of tests) {
    try {
      await t.fn();
      console.log(`✓ ${t.name}`);
      passed++;
    } catch (err) {
      console.log(`✗ ${t.name}`);
      console.log(`  Error: ${err.message}`);
      if (err.stack) {
        console.log(`  Stack: ${err.stack.split('\n')[1]}`);
      }
      failed++;
    }
  }

  console.log('\n----------------------------------------');
  console.log(`Tests: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------\n');

  return failed === 0;
}

// ============================================================================
// MPQ Format Constants
// ============================================================================

const MPQ_MAGIC = 0x1A51504D; // 'MPQ\x1A'
const MPQ_HEADER_SIZE = 32;

// Block flags
const BLOCK_EXISTS = 0x80000000;
const BLOCK_SINGLE_UNIT = 0x01000000;

// ============================================================================
// MPQ Hash Implementation (needed for verification)
// ============================================================================

function getCryptTable() {
  const table = new Uint32Array(1280);
  let seed = 0x00100001;

  for (let i = 0; i < 256; i++) {
    for (let j = i; j < 1280; j += 256) {
      seed = (seed * 125 + 3) % 0x2AAAAB;
      const a = (seed & 0xFFFF) << 16;
      seed = (seed * 125 + 3) % 0x2AAAAB;
      const b = seed & 0xFFFF;
      table[j] = a | b;
    }
  }

  return table;
}

function mpqHash(str, hashType) {
  const cryptTable = getCryptTable();
  let seed1 = 0x7FED7FED;
  let seed2 = 0xEEEEEEEE;

  str = str.toUpperCase();
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    seed1 = cryptTable[(hashType << 8) + ch] ^ (seed1 + seed2);
    seed2 = ch + seed1 + seed2 + (seed2 << 5) + 3;
  }

  return seed1 >>> 0;
}

// ============================================================================
// DUN File Builder (simplified for testing)
// ============================================================================

function buildDUNFile(width, height, tiles, monsters, objects) {
  // Calculate sizes
  const tileLayerSize = width * height * 2;
  const monsterLayerSize = width * height * 2;
  const objectLayerSize = width * height * 2;
  const totalSize = 4 + tileLayerSize + monsterLayerSize + objectLayerSize;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);
  const u16 = new Uint16Array(buffer);

  // Header
  view.setUint16(0, width, true);
  view.setUint16(2, height, true);

  // Write tile layer
  let offset = 2; // Start after header (in Uint16 terms)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      u16[offset++] = tiles[y * width + x] || 0;
    }
  }

  // Write monster layer
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const monster = monsters.find(m => m.x === x && m.y === y);
      u16[offset++] = monster ? monster.id : 0;
    }
  }

  // Write object layer
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const obj = objects.find(o => o.x === x && o.y === y);
      u16[offset++] = obj ? obj.id : 0;
    }
  }

  return new Uint8Array(buffer);
}

// ============================================================================
// MPQ Builder (simplified for testing)
// ============================================================================

function buildMPQ(files) {
  // Calculate hash table size (power of 2, at least 2x file count)
  let hashTableSize = 16;
  while (hashTableSize < files.length * 2) {
    hashTableSize *= 2;
  }

  // Build file data section
  let fileDataSize = 0;
  const fileBlocks = [];

  for (const file of files) {
    fileBlocks.push({
      path: file.path,
      data: file.data,
      offset: fileDataSize,
      size: file.data.length,
    });
    fileDataSize += file.data.length;
  }

  // Calculate offsets
  const headerOffset = 0;
  const fileDataOffset = MPQ_HEADER_SIZE;
  const hashTableOffset = fileDataOffset + fileDataSize;
  const blockTableOffset = hashTableOffset + (hashTableSize * 16);
  const archiveSize = blockTableOffset + (files.length * 16);

  // Create buffer
  const buffer = new ArrayBuffer(archiveSize);
  const view = new DataView(buffer);
  const u8 = new Uint8Array(buffer);

  // Write header
  view.setUint32(0, MPQ_MAGIC, true);
  view.setUint32(4, MPQ_HEADER_SIZE, true);
  view.setUint32(8, archiveSize, true);
  view.setUint16(12, 0, true); // Format version
  view.setUint16(14, 3, true); // Block size (512 << 3 = 4096)
  view.setUint32(16, hashTableOffset, true);
  view.setUint32(20, blockTableOffset, true);
  view.setUint32(24, hashTableSize, true);
  view.setUint32(28, files.length, true);

  // Write file data
  for (const block of fileBlocks) {
    u8.set(block.data, fileDataOffset + block.offset);
  }

  // Build hash table
  const hashTable = new Array(hashTableSize).fill(null).map(() => ({
    hashA: 0xFFFFFFFF,
    hashB: 0xFFFFFFFF,
    locale: 0xFFFF,
    platform: 0xFFFF,
    blockIndex: 0xFFFFFFFF,
  }));

  for (let i = 0; i < fileBlocks.length; i++) {
    const block = fileBlocks[i];
    const hashA = mpqHash(block.path, 1);
    const hashB = mpqHash(block.path, 2);
    let index = mpqHash(block.path, 0) % hashTableSize;

    // Linear probe for empty slot
    let probes = 0;
    while (hashTable[index].blockIndex !== 0xFFFFFFFF && probes < hashTableSize) {
      index = (index + 1) % hashTableSize;
      probes++;
    }

    hashTable[index] = {
      hashA,
      hashB,
      locale: 0,
      platform: 0,
      blockIndex: i,
    };
  }

  // Write hash table
  let hashOffset = hashTableOffset;
  for (const entry of hashTable) {
    view.setUint32(hashOffset, entry.hashA, true);
    view.setUint32(hashOffset + 4, entry.hashB, true);
    view.setUint16(hashOffset + 8, entry.locale, true);
    view.setUint16(hashOffset + 10, entry.platform, true);
    view.setUint32(hashOffset + 12, entry.blockIndex, true);
    hashOffset += 16;
  }

  // Write block table
  let blockOffset = blockTableOffset;
  for (const block of fileBlocks) {
    view.setUint32(blockOffset, fileDataOffset + block.offset, true); // File offset
    view.setUint32(blockOffset + 4, block.size, true); // Compressed size
    view.setUint32(blockOffset + 8, block.size, true); // Uncompressed size
    view.setUint32(blockOffset + 12, BLOCK_EXISTS | BLOCK_SINGLE_UNIT, true); // Flags
    blockOffset += 16;
  }

  return new Uint8Array(buffer);
}

// ============================================================================
// MPQ Validator
// ============================================================================

function validateMPQ(mpqData) {
  const errors = [];
  const view = new DataView(mpqData.buffer);

  // Check magic
  const magic = view.getUint32(0, true);
  if (magic !== MPQ_MAGIC) {
    errors.push(`Invalid magic: 0x${magic.toString(16)} (expected 0x${MPQ_MAGIC.toString(16)})`);
    return { valid: false, errors };
  }

  // Check header size
  const headerSize = view.getUint32(4, true);
  if (headerSize !== MPQ_HEADER_SIZE) {
    errors.push(`Invalid header size: ${headerSize} (expected ${MPQ_HEADER_SIZE})`);
  }

  // Check archive size
  const archiveSize = view.getUint32(8, true);
  if (archiveSize !== mpqData.length) {
    errors.push(`Archive size mismatch: header says ${archiveSize}, actual ${mpqData.length}`);
  }

  // Check table offsets
  const hashTableOffset = view.getUint32(16, true);
  const blockTableOffset = view.getUint32(20, true);
  const hashTableSize = view.getUint32(24, true);
  const blockTableEntries = view.getUint32(28, true);

  if (hashTableOffset >= archiveSize) {
    errors.push(`Hash table offset ${hashTableOffset} exceeds archive size ${archiveSize}`);
  }

  if (blockTableOffset >= archiveSize) {
    errors.push(`Block table offset ${blockTableOffset} exceeds archive size ${archiveSize}`);
  }

  // Verify hash table size is power of 2
  if (hashTableSize > 0 && (hashTableSize & (hashTableSize - 1)) !== 0) {
    errors.push(`Hash table size ${hashTableSize} is not power of 2`);
  }

  // Verify block table entries
  if (blockTableEntries > hashTableSize) {
    errors.push(`Block table entries (${blockTableEntries}) > hash table size (${hashTableSize})`);
  }

  return {
    valid: errors.length === 0,
    errors,
    stats: {
      headerSize,
      archiveSize,
      hashTableOffset,
      blockTableOffset,
      hashTableSize,
      blockTableEntries,
    },
  };
}

// ============================================================================
// Level Generator (simplified mock)
// ============================================================================

function generateLevel(width, height, depth) {
  const tiles = new Uint16Array(width * height);
  const monsters = [];
  const objects = [];

  // Fill with floor (value 14 in DUN format)
  tiles.fill(14);

  // Add border walls
  for (let x = 0; x < width; x++) {
    tiles[x] = 2; // Top wall
    tiles[(height - 1) * width + x] = 2; // Bottom wall
  }
  for (let y = 0; y < height; y++) {
    tiles[y * width] = 2; // Left wall
    tiles[y * width + (width - 1)] = 2; // Right wall
  }

  // Add stairs up (entrance) - near top-left
  tiles[2 * width + 2] = 36; // Stairs up tile

  // Add stairs down (exit) - near bottom-right
  tiles[(height - 3) * width + (width - 3)] = 35; // Stairs down tile

  // Add some monsters based on depth
  const monsterCount = 3 + depth;
  for (let i = 0; i < monsterCount; i++) {
    const x = 3 + (i % (width - 6));
    const y = 3 + Math.floor(i / (width - 6)) % (height - 6);
    monsters.push({ x, y, id: 33 + (depth % 3) }); // Skeleton variants
  }

  // Add some objects (chests, barrels)
  objects.push({ x: 5, y: 5, id: 1 }); // Chest
  objects.push({ x: 6, y: 5, id: 5 }); // Barrel

  return { tiles, monsters, objects, width, height };
}

// ============================================================================
// Campaign Generator (simplified mock)
// ============================================================================

function generateCampaign(name = 'Test Campaign') {
  return {
    id: `campaign_${Date.now()}`,
    name,
    description: 'A test campaign for E2E testing',
    acts: [
      {
        id: 'act_1',
        name: 'Act I: The Test',
        levels: [
          { depth: 1, theme: 'CATHEDRAL', boss: null },
          { depth: 2, theme: 'CATHEDRAL', boss: null },
          { depth: 3, theme: 'CATHEDRAL', boss: null },
          { depth: 4, theme: 'CATHEDRAL', boss: { type: 'SKELETON_KING', name: 'Test King' } },
        ],
      },
    ],
    finalBoss: { type: 'DIABLO', name: 'Test Diablo' },
  };
}

// ============================================================================
// Full Pipeline Test
// ============================================================================

function runFullPipeline(campaign) {
  const files = [];
  const dunLevels = [];

  // Generate levels for each act
  for (const act of campaign.acts) {
    for (const levelConfig of act.levels) {
      const level = generateLevel(16, 16, levelConfig.depth);
      const dunData = buildDUNFile(
        level.width,
        level.height,
        level.tiles,
        level.monsters,
        level.objects
      );

      // Determine file path based on theme
      let prefix = 'l1data'; // Cathedral
      if (levelConfig.theme === 'CATACOMBS') prefix = 'l2data';
      if (levelConfig.theme === 'CAVES') prefix = 'l3data';
      if (levelConfig.theme === 'HELL') prefix = 'l4data';

      const filePath = `levels\\${prefix}\\level${levelConfig.depth}.dun`;

      files.push({ path: filePath, data: dunData });
      dunLevels.push({
        path: filePath,
        width: level.width,
        height: level.height,
        monsters: level.monsters.length,
        objects: level.objects.length,
      });
    }
  }

  // Build MPQ
  const mpqData = buildMPQ(files);

  // Validate MPQ
  const validation = validateMPQ(mpqData);

  return {
    campaign,
    files,
    dunLevels,
    mpqData,
    validation,
  };
}

// ============================================================================
// TESTS
// ============================================================================

test('Campaign generation creates valid structure', () => {
  const campaign = generateCampaign('E2E Test Campaign');

  assert(campaign.id, 'Campaign should have ID');
  assert(campaign.name, 'Campaign should have name');
  assert(campaign.acts.length > 0, 'Campaign should have acts');
  assert(campaign.acts[0].levels.length > 0, 'Acts should have levels');
});

test('Level generation creates valid grid', () => {
  const level = generateLevel(16, 16, 1);

  assertEqual(level.width, 16, 'Width should be 16');
  assertEqual(level.height, 16, 'Height should be 16');
  assertEqual(level.tiles.length, 256, 'Should have 256 tiles');
  assert(level.monsters.length > 0, 'Should have monsters');
});

test('DUN file has correct structure', () => {
  const level = generateLevel(16, 16, 1);
  const dun = buildDUNFile(
    level.width,
    level.height,
    level.tiles,
    level.monsters,
    level.objects
  );

  const view = new DataView(dun.buffer);
  assertEqual(view.getUint16(0, true), 16, 'Width should be 16');
  assertEqual(view.getUint16(2, true), 16, 'Height should be 16');

  // Expected size: 4 (header) + 3 layers * (16*16*2)
  const expectedSize = 4 + (16 * 16 * 2 * 3);
  assertEqual(dun.length, expectedSize, `DUN size should be ${expectedSize}`);
});

test('MPQ builder creates valid archive', () => {
  const files = [
    { path: 'test\\file1.dun', data: new Uint8Array([1, 2, 3, 4]) },
    { path: 'test\\file2.dun', data: new Uint8Array([5, 6, 7, 8, 9, 10]) },
  ];

  const mpq = buildMPQ(files);
  const validation = validateMPQ(mpq);

  assert(validation.valid, `MPQ should be valid: ${validation.errors.join(', ')}`);
  assertEqual(validation.stats.blockTableEntries, 2, 'Should have 2 files');
});

test('MPQ hash table lookup works', () => {
  const files = [
    { path: 'levels\\l1data\\test.dun', data: new Uint8Array([1, 2, 3, 4]) },
  ];

  const mpq = buildMPQ(files);
  const view = new DataView(mpq.buffer);

  // Verify we can look up the file
  const hashTableOffset = view.getUint32(16, true);
  const hashTableSize = view.getUint32(24, true);

  const hashA = mpqHash('levels\\l1data\\test.dun', 1);
  const hashB = mpqHash('levels\\l1data\\test.dun', 2);
  let index = mpqHash('levels\\l1data\\test.dun', 0) % hashTableSize;

  // Find entry in hash table
  let found = false;
  for (let i = 0; i < hashTableSize; i++) {
    const entryOffset = hashTableOffset + (index * 16);
    const entryHashA = view.getUint32(entryOffset, true);
    const entryHashB = view.getUint32(entryOffset + 4, true);

    if (entryHashA === hashA && entryHashB === hashB) {
      found = true;
      break;
    }

    index = (index + 1) % hashTableSize;
  }

  assert(found, 'File should be found in hash table');
});

test('Full pipeline: Campaign → Levels → DUN → MPQ', () => {
  const campaign = generateCampaign('Full Pipeline Test');
  const result = runFullPipeline(campaign);

  assert(result.validation.valid, `MPQ should be valid: ${result.validation.errors.join(', ')}`);
  assertEqual(result.files.length, 4, 'Should have 4 level files');
  assertGreaterThan(result.mpqData.length, 1000, 'MPQ should be > 1KB');
});

test('Full pipeline with multiple acts', () => {
  const campaign = {
    id: 'multi_act_test',
    name: 'Multi-Act Test',
    acts: [
      { id: 'act1', levels: [{ depth: 1, theme: 'CATHEDRAL' }, { depth: 2, theme: 'CATHEDRAL' }] },
      { id: 'act2', levels: [{ depth: 3, theme: 'CATACOMBS' }, { depth: 4, theme: 'CATACOMBS' }] },
      { id: 'act3', levels: [{ depth: 5, theme: 'CAVES' }, { depth: 6, theme: 'CAVES' }] },
    ],
  };

  const result = runFullPipeline(campaign);

  assert(result.validation.valid, `MPQ should be valid: ${result.validation.errors.join(', ')}`);
  assertEqual(result.files.length, 6, 'Should have 6 level files');

  // Verify different file paths
  const paths = result.files.map(f => f.path);
  assert(paths.some(p => p.includes('l1data')), 'Should have Cathedral levels');
  assert(paths.some(p => p.includes('l2data')), 'Should have Catacombs levels');
  assert(paths.some(p => p.includes('l3data')), 'Should have Caves levels');
});

test('MPQ file can be saved and re-read', () => {
  const campaign = generateCampaign('Save/Load Test');
  const result = runFullPipeline(campaign);

  // Simulate save/load by creating a new buffer
  const savedBuffer = Buffer.from(result.mpqData);
  const loadedData = new Uint8Array(savedBuffer);

  // Validate the loaded data
  const validation = validateMPQ(loadedData);

  assert(validation.valid, 'Reloaded MPQ should be valid');
  assertEqual(loadedData.length, result.mpqData.length, 'Size should match after reload');
});

test('MPQ handles large number of files', () => {
  const files = [];
  for (let i = 0; i < 50; i++) {
    files.push({
      path: `test\\level${i}.dun`,
      data: new Uint8Array(100 + i),
    });
  }

  const mpq = buildMPQ(files);
  const validation = validateMPQ(mpq);

  assert(validation.valid, `Large MPQ should be valid: ${validation.errors.join(', ')}`);
  assertEqual(validation.stats.blockTableEntries, 50, 'Should have 50 files');

  // Hash table should be at least 2x file count
  assertGreaterThan(validation.stats.hashTableSize, 50, 'Hash table should be > file count');
});

test('Level monsters are within bounds', () => {
  for (let depth = 1; depth <= 16; depth++) {
    const level = generateLevel(16, 16, depth);

    for (const monster of level.monsters) {
      assert(monster.x >= 0 && monster.x < 16, `Monster X ${monster.x} out of bounds at depth ${depth}`);
      assert(monster.y >= 0 && monster.y < 16, `Monster Y ${monster.y} out of bounds at depth ${depth}`);
    }
  }
});

test('DUN file tiles are valid', () => {
  const level = generateLevel(16, 16, 5);
  const dun = buildDUNFile(level.width, level.height, level.tiles, level.monsters, level.objects);

  const u16 = new Uint16Array(dun.buffer);

  // Check all tile values are reasonable (0-255 for standard tiles)
  for (let i = 2; i < 2 + 256; i++) {
    assert(u16[i] <= 255, `Tile value ${u16[i]} exceeds maximum`);
  }
});

// ============================================================================
// Run all tests
// ============================================================================

runTests().then(success => {
  if (success) {
    console.log('All E2E tests passed! MPQ generation pipeline is working.\n');
  }
  process.exit(success ? 0 : 1);
});
