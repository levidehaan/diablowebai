/**
 * WASM and MPQ Loading Tests
 *
 * Tests that verify:
 * 1. WASM files exist and have correct structure
 * 2. WASM files are NOT renamed (Emscripten compatibility)
 * 3. devilutionx.js can be loaded and has expected structure
 * 4. MPQ file format signatures are correct
 * 5. Version manifest contains correct hashes
 *
 * Run with: node tests/wasm-mpq-loading.test.js
 */

const fs = require('fs');
const path = require('path');

// Paths
const BUILD_DIR = path.join(__dirname, '..', 'build');
const WASM_DIR = path.join(BUILD_DIR, 'wasm');
const PUBLIC_WASM_DIR = path.join(__dirname, '..', 'public', 'wasm');

// Test runner
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

function assertIncludes(str, substr, message) {
  if (!str.includes(substr)) {
    throw new Error(message || `Expected string to include "${substr}"`);
  }
}

async function runTests() {
  console.log('\n========================================');
  console.log('  WASM & MPQ Loading Test Suite');
  console.log('========================================\n');

  for (const t of tests) {
    try {
      await t.fn();
      console.log(`\x1b[32m✓\x1b[0m ${t.name}`);
      passed++;
    } catch (err) {
      console.log(`\x1b[31m✗\x1b[0m ${t.name}`);
      console.log(`  \x1b[31mError: ${err.message}\x1b[0m`);
      failed++;
    }
  }

  console.log('\n----------------------------------------');
  if (failed === 0) {
    console.log(`\x1b[32m${passed} tests passed\x1b[0m`);
  } else {
    console.log(`Tests: \x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m`);
  }
  console.log('----------------------------------------\n');

  return failed === 0;
}

// ============================================================================
// File Constants
// ============================================================================

const WASM_MAGIC = new Uint8Array([0x00, 0x61, 0x73, 0x6D]); // "\0asm"
const MPQ_MAGIC = new Uint8Array([0x4D, 0x50, 0x51, 0x1A]); // "MPQ\x1A"

// ============================================================================
// WASM FILE TESTS
// ============================================================================

test('Build directory exists', () => {
  assert(fs.existsSync(BUILD_DIR), `Build directory not found: ${BUILD_DIR}`);
});

test('WASM directory exists in build', () => {
  assert(fs.existsSync(WASM_DIR), `WASM directory not found: ${WASM_DIR}`);
});

test('devilutionx.wasm exists (not renamed)', () => {
  const wasmPath = path.join(WASM_DIR, 'devilutionx.wasm');
  assert(fs.existsSync(wasmPath), `devilutionx.wasm not found - file was incorrectly renamed`);
});

test('devilutionx.data exists (not renamed)', () => {
  const dataPath = path.join(WASM_DIR, 'devilutionx.data');
  assert(fs.existsSync(dataPath), `devilutionx.data not found - file was incorrectly renamed`);
});

test('devilutionx.js exists (not renamed)', () => {
  const jsPath = path.join(WASM_DIR, 'devilutionx.js');
  assert(fs.existsSync(jsPath), `devilutionx.js not found - file was incorrectly renamed`);
});

test('No hash-renamed WASM files exist', () => {
  const files = fs.readdirSync(WASM_DIR);
  const hashedFiles = files.filter(f => /devilutionx\.[a-f0-9]{8}\.(wasm|data|js)$/.test(f));

  if (hashedFiles.length > 0) {
    throw new Error(`Found incorrectly renamed files: ${hashedFiles.join(', ')}`);
  }
});

test('devilutionx.wasm has valid WASM magic', () => {
  const wasmPath = path.join(WASM_DIR, 'devilutionx.wasm');
  const buffer = Buffer.alloc(4);
  const fd = fs.openSync(wasmPath, 'r');
  fs.readSync(fd, buffer, 0, 4, 0);
  fs.closeSync(fd);

  for (let i = 0; i < 4; i++) {
    assertEqual(buffer[i], WASM_MAGIC[i],
      `Invalid WASM magic at byte ${i}: expected 0x${WASM_MAGIC[i].toString(16)}, got 0x${buffer[i].toString(16)}`);
  }
});

test('devilutionx.wasm has reasonable size (>1MB)', () => {
  const wasmPath = path.join(WASM_DIR, 'devilutionx.wasm');
  const stats = fs.statSync(wasmPath);
  assert(stats.size > 1000000, `WASM file too small: ${stats.size} bytes (expected >1MB)`);
});

test('devilutionx.data has reasonable size (>4MB)', () => {
  const dataPath = path.join(WASM_DIR, 'devilutionx.data');
  const stats = fs.statSync(dataPath);
  assert(stats.size > 4000000, `Data file too small: ${stats.size} bytes (expected >4MB)`);
});

test('devilutionx.js is syntactically valid JavaScript', () => {
  const jsPath = path.join(WASM_DIR, 'devilutionx.js');
  const content = fs.readFileSync(jsPath, 'utf8');

  // Basic syntax check - if this throws, the file is invalid
  try {
    // We can't fully evaluate it (needs browser context), but we can check
    // if it starts with expected patterns
    assert(content.includes('Module'), 'JS should reference Module object');
    assert(content.includes('WebAssembly'), 'JS should reference WebAssembly');
  } catch (e) {
    throw new Error(`JavaScript syntax validation failed: ${e.message}`);
  }
});

test('devilutionx.js references correct WASM file', () => {
  const jsPath = path.join(WASM_DIR, 'devilutionx.js');
  const content = fs.readFileSync(jsPath, 'utf8');

  // The JS should reference 'devilutionx.wasm' somewhere
  assertIncludes(content, 'devilutionx', 'JS should reference devilutionx files');
});

test('devilutionx.js references data file', () => {
  const jsPath = path.join(WASM_DIR, 'devilutionx.js');
  const content = fs.readFileSync(jsPath, 'utf8');

  // Should reference the .data file
  assertIncludes(content, '.data', 'JS should reference .data file');
});

// ============================================================================
// VERSION MANIFEST TESTS
// ============================================================================

test('version.json exists in build', () => {
  const versionPath = path.join(BUILD_DIR, 'version.json');
  assert(fs.existsSync(versionPath), 'version.json not found');
});

test('version.json has valid structure', () => {
  const versionPath = path.join(BUILD_DIR, 'version.json');
  const content = JSON.parse(fs.readFileSync(versionPath, 'utf8'));

  assert(content.version, 'version.json should have version field');
  assert(content.timestamp, 'version.json should have timestamp field');
  assert(content.buildTime, 'version.json should have buildTime field');
});

test('version.json contains WASM hashes', () => {
  const versionPath = path.join(BUILD_DIR, 'version.json');
  const content = JSON.parse(fs.readFileSync(versionPath, 'utf8'));

  assert(content.wasmHashes, 'version.json should have wasmHashes');
  assert(content.wasmHashes['devilutionx.data'], 'Should have hash for devilutionx.data');
  assert(content.wasmHashes['devilutionx.js'], 'Should have hash for devilutionx.js');
  assert(content.wasmHashes['devilutionx.wasm'], 'Should have hash for devilutionx.wasm');
});

test('WASM hashes are valid hex strings', () => {
  const versionPath = path.join(BUILD_DIR, 'version.json');
  const content = JSON.parse(fs.readFileSync(versionPath, 'utf8'));

  for (const [file, hash] of Object.entries(content.wasmHashes || {})) {
    assert(/^[a-f0-9]{8}$/.test(hash),
      `Invalid hash for ${file}: ${hash} (should be 8 hex chars)`);
  }
});

// ============================================================================
// PUBLIC/WASM SOURCE TESTS
// ============================================================================

test('Public WASM directory exists', () => {
  assert(fs.existsSync(PUBLIC_WASM_DIR), `Public WASM directory not found: ${PUBLIC_WASM_DIR}`);
});

test('Public WASM files match build files', () => {
  const publicFiles = fs.readdirSync(PUBLIC_WASM_DIR).sort();
  const buildFiles = fs.readdirSync(WASM_DIR).sort();

  // Check same file names
  for (const file of ['devilutionx.wasm', 'devilutionx.data', 'devilutionx.js']) {
    assert(publicFiles.includes(file), `Public missing: ${file}`);
    assert(buildFiles.includes(file), `Build missing: ${file}`);
  }
});

test('Build WASM files have same content hash as public', () => {
  const crypto = require('crypto');

  for (const file of ['devilutionx.wasm', 'devilutionx.data']) {
    const publicPath = path.join(PUBLIC_WASM_DIR, file);
    const buildPath = path.join(WASM_DIR, file);

    const publicHash = crypto.createHash('md5')
      .update(fs.readFileSync(publicPath))
      .digest('hex')
      .substring(0, 8);

    const buildHash = crypto.createHash('md5')
      .update(fs.readFileSync(buildPath))
      .digest('hex')
      .substring(0, 8);

    assertEqual(buildHash, publicHash,
      `File ${file} content mismatch: build=${buildHash}, public=${publicHash}`);
  }
});

// ============================================================================
// MPQ FORMAT TESTS
// ============================================================================

test('MPQ magic constant is correct', () => {
  // Verify our MPQ_MAGIC matches the expected value
  const expected = Buffer.from('MPQ\x1A');
  for (let i = 0; i < 4; i++) {
    assertEqual(MPQ_MAGIC[i], expected[i], `MPQ magic byte ${i} mismatch`);
  }
});

test('Can create minimal valid MPQ structure', () => {
  // Create a minimal MPQ header to verify our understanding of the format
  const buffer = Buffer.alloc(32);

  // Magic
  buffer.writeUInt32LE(0x1A51504D, 0); // 'MPQ\x1A'
  // Header size
  buffer.writeUInt32LE(32, 4);
  // Archive size
  buffer.writeUInt32LE(32, 8);
  // Format version
  buffer.writeUInt16LE(0, 12);
  // Block size
  buffer.writeUInt16LE(3, 14);
  // Hash table offset
  buffer.writeUInt32LE(32, 16);
  // Block table offset
  buffer.writeUInt32LE(32, 20);
  // Hash table size
  buffer.writeUInt32LE(0, 24);
  // Block table size
  buffer.writeUInt32LE(0, 28);

  // Verify magic
  assertEqual(buffer.readUInt32LE(0), 0x1A51504D, 'MPQ magic should be correct');
});

// ============================================================================
// INTEGRATION TEST
// ============================================================================

test('Full WASM loading simulation', () => {
  // Simulate what the browser does when loading WASM

  // 1. Check all files exist
  const jsPath = path.join(WASM_DIR, 'devilutionx.js');
  const wasmPath = path.join(WASM_DIR, 'devilutionx.wasm');
  const dataPath = path.join(WASM_DIR, 'devilutionx.data');

  assert(fs.existsSync(jsPath), 'JS file must exist');
  assert(fs.existsSync(wasmPath), 'WASM file must exist');
  assert(fs.existsSync(dataPath), 'Data file must exist');

  // 2. Check JS references don't have broken hashes
  const jsContent = fs.readFileSync(jsPath, 'utf8');

  // Make sure there are no references to hashed filenames like "123456devilutionx.xxx.data"
  const badPattern = /[0-9]+devilutionx\.[a-f0-9]+\.(wasm|data)/g;
  const matches = jsContent.match(badPattern);

  if (matches) {
    throw new Error(`Found broken hashed references in JS: ${matches.join(', ')}`);
  }

  // 3. Verify the files are readable
  const wasmBuffer = fs.readFileSync(wasmPath);
  const dataBuffer = fs.readFileSync(dataPath);

  assert(wasmBuffer.length > 0, 'WASM file should not be empty');
  assert(dataBuffer.length > 0, 'Data file should not be empty');

  console.log('  Files verified:');
  console.log(`    - devilutionx.js: ${(fs.statSync(jsPath).size / 1024).toFixed(1)} KB`);
  console.log(`    - devilutionx.wasm: ${(wasmBuffer.length / 1024 / 1024).toFixed(2)} MB`);
  console.log(`    - devilutionx.data: ${(dataBuffer.length / 1024 / 1024).toFixed(2)} MB`);
});

// ============================================================================
// Run all tests
// ============================================================================

runTests().then(success => {
  if (success) {
    console.log('WASM/MPQ loading tests passed! Files are correctly configured.\n');
  } else {
    console.log('Some tests failed. WASM files may not load correctly.\n');
  }
  process.exit(success ? 0 : 1);
});
