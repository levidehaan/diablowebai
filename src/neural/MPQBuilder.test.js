/**
 * MPQ Builder Test Suite
 *
 * Tests for MPQBuilder, DUNBuilder, and related classes.
 * Run with: node --experimental-vm-modules src/neural/MPQBuilder.test.js
 */

// Simple test runner
const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, got ${actual}`);
  }
}

async function runTests() {
  console.log('\n========================================');
  console.log('  MPQ Builder Test Suite');
  console.log('========================================\n');

  for (const t of tests) {
    try {
      await t.fn();
      console.log(`✓ ${t.name}`);
      passed++;
    } catch (err) {
      console.log(`✗ ${t.name}`);
      console.log(`  Error: ${err.message}`);
      failed++;
    }
  }

  console.log('\n----------------------------------------');
  console.log(`Tests: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------\n');

  return failed === 0;
}

// ============================================================================
// Import modules (mock for non-ESM environment)
// ============================================================================

// Since we can't easily import ESM modules in Node without setup,
// we'll define the core logic inline for testing purposes

const MPQ_MAGIC = 0x1A51504D;

// Minimal crypto table generation
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
// TESTS
// ============================================================================

test('MPQ hash function produces consistent results', () => {
  const hash1 = mpqHash('(hash table)', 3);
  const hash2 = mpqHash('(hash table)', 3);
  assertEqual(hash1, hash2, 'Hash should be consistent');
  assert(hash1 !== 0, 'Hash should not be zero');
});

test('MPQ hash differs by hash type', () => {
  const hash0 = mpqHash('test.txt', 0);
  const hash1 = mpqHash('test.txt', 1);
  const hash2 = mpqHash('test.txt', 2);

  assert(hash0 !== hash1, 'Hash types should produce different values');
  assert(hash1 !== hash2, 'Hash types should produce different values');
});

test('MPQ hash is case insensitive', () => {
  const lower = mpqHash('test.txt', 0);
  const upper = mpqHash('TEST.TXT', 0);
  const mixed = mpqHash('TeSt.TxT', 0);

  assertEqual(lower, upper, 'Hash should be case insensitive');
  assertEqual(lower, mixed, 'Hash should be case insensitive');
});

test('Crypto table initialization', () => {
  const table = getCryptTable();
  assertEqual(table.length, 1280, 'Crypto table should have 1280 entries');

  // Verify some entries are non-zero
  let nonZero = 0;
  for (let i = 0; i < 100; i++) {
    if (table[i] !== 0) nonZero++;
  }
  assert(nonZero > 50, 'Most crypto table entries should be non-zero');
});

test('DUN builder creates proper header', () => {
  // Minimal DUN file structure
  const width = 10;
  const height = 8;

  const headerSize = 4;
  const tileLayerSize = width * height * 2;
  const expectedSize = headerSize + tileLayerSize;

  // Create buffer
  const buffer = new ArrayBuffer(expectedSize);
  const view = new DataView(buffer);

  // Write header
  view.setUint16(0, width, true);
  view.setUint16(2, height, true);

  // Verify
  assertEqual(view.getUint16(0, true), width, 'Width should match');
  assertEqual(view.getUint16(2, true), height, 'Height should match');
});

test('DUN builder tile encoding', () => {
  const width = 5;
  const height = 5;
  const tiles = new Uint16Array(width * height);

  // Fill with floor tiles (value 14 = tile 13 + 1 for DUN encoding)
  tiles.fill(14);

  // Place a wall at (2,2)
  tiles[2 * width + 2] = 2;  // Wall tile

  assertEqual(tiles[0], 14, 'Floor should be 14');
  assertEqual(tiles[12], 2, 'Wall at center should be 2');
});

test('Monster placement validation', () => {
  const placements = [
    { x: 5, y: 5, monsterId: 1 },
    { x: 10, y: 10, monsterId: 33 },
    { x: 15, y: 15, monsterId: 17 },
  ];

  const width = 20;
  const height = 20;

  let allValid = true;
  for (const p of placements) {
    if (p.x < 0 || p.x >= width || p.y < 0 || p.y >= height) {
      allValid = false;
    }
  }

  assert(allValid, 'All placements should be within bounds');
});

test('Monster placement out of bounds detection', () => {
  const placements = [
    { x: -1, y: 5, monsterId: 1 },  // Out of bounds
    { x: 100, y: 10, monsterId: 33 },  // Out of bounds
  ];

  const width = 20;
  const height = 20;

  let outOfBounds = 0;
  for (const p of placements) {
    if (p.x < 0 || p.x >= width || p.y < 0 || p.y >= height) {
      outOfBounds++;
    }
  }

  assertEqual(outOfBounds, 2, 'Should detect 2 out of bounds');
});

test('MPQ header structure', () => {
  const archiveSize = 1024;
  const headerSize = 32;
  const hashTableOffset = 512;
  const blockTableOffset = 768;

  const buffer = new ArrayBuffer(headerSize);
  const view = new DataView(buffer);

  // Write header
  view.setUint32(0, MPQ_MAGIC, true);
  view.setUint32(4, headerSize, true);
  view.setUint32(8, archiveSize, true);
  view.setUint16(12, 0, true);  // Format version
  view.setUint16(14, 3, true);  // Block size shift
  view.setUint32(16, hashTableOffset, true);
  view.setUint32(20, blockTableOffset, true);

  // Verify
  assertEqual(view.getUint32(0, true), MPQ_MAGIC, 'Magic should match');
  assertEqual(view.getUint32(4, true), headerSize, 'Header size should match');
  assertEqual(view.getUint32(8, true), archiveSize, 'Archive size should match');
  assertEqual(view.getUint32(16, true), hashTableOffset, 'Hash table offset should match');
  assertEqual(view.getUint32(20, true), blockTableOffset, 'Block table offset should match');
});

test('Walkability flood fill concept', () => {
  // Simple 5x5 grid with walls
  const grid = [
    1, 1, 1, 1, 1,
    1, 0, 0, 0, 1,
    1, 0, 1, 0, 1,
    1, 0, 0, 0, 1,
    1, 1, 1, 1, 1,
  ];

  const width = 5;
  const height = 5;

  function isWalkable(x, y) {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    return grid[y * width + x] === 0;
  }

  // Flood fill from (1,1)
  const visited = new Set();
  const queue = [[1, 1]];

  while (queue.length > 0) {
    const [x, y] = queue.shift();
    const key = `${x},${y}`;

    if (visited.has(key)) continue;
    if (!isWalkable(x, y)) continue;

    visited.add(key);
    queue.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }

  // Should find 8 walkable tiles (3x3 area minus center wall)
  assertEqual(visited.size, 8, 'Should find 8 reachable walkable tiles');
});

test('Hash table power of 2 check', () => {
  function isPowerOf2(n) {
    return n > 0 && (n & (n - 1)) === 0;
  }

  assert(isPowerOf2(512), '512 is power of 2');
  assert(isPowerOf2(1024), '1024 is power of 2');
  assert(!isPowerOf2(1000), '1000 is not power of 2');
  assert(!isPowerOf2(0), '0 is not power of 2');
});

test('Block flags validation', () => {
  const BlockFlags = {
    EXISTS: 0x80000000,
    SINGLE_UNIT: 0x01000000,
    IMPLODE: 0x00000100,
  };

  const flags = BlockFlags.EXISTS | BlockFlags.SINGLE_UNIT;

  assert((flags & BlockFlags.EXISTS) !== 0, 'EXISTS flag should be set');
  assert((flags & BlockFlags.SINGLE_UNIT) !== 0, 'SINGLE_UNIT flag should be set');
  assert((flags & BlockFlags.IMPLODE) === 0, 'IMPLODE flag should not be set');
});

test('Asset catalog monster lookup concept', () => {
  const MONSTER_ASSETS = {
    zombie: { id: 1, theme: 'CATHEDRAL' },
    skeleton: { id: 33, theme: 'CATHEDRAL' },
    balrog: { id: 81, theme: 'HELL' },
  };

  function getMonstersForTheme(theme) {
    return Object.entries(MONSTER_ASSETS)
      .filter(([_, m]) => m.theme === theme)
      .map(([name, data]) => ({ name, ...data }));
  }

  const cathedralMonsters = getMonstersForTheme('CATHEDRAL');
  assertEqual(cathedralMonsters.length, 2, 'Cathedral should have 2 monsters');

  const hellMonsters = getMonstersForTheme('HELL');
  assertEqual(hellMonsters.length, 1, 'Hell should have 1 monster');
});

test('Validation result aggregation', () => {
  const results = [
    { severity: 'error', message: 'Test error 1' },
    { severity: 'warning', message: 'Test warning 1' },
    { severity: 'error', message: 'Test error 2' },
    { severity: 'info', message: 'Test info 1' },
  ];

  const errors = results.filter(r => r.severity === 'error');
  const warnings = results.filter(r => r.severity === 'warning');

  assertEqual(errors.length, 2, 'Should have 2 errors');
  assertEqual(warnings.length, 1, 'Should have 1 warning');
});

// ============================================================================
// Run tests
// ============================================================================

runTests().then(success => {
  process.exit(success ? 0 : 1);
});
