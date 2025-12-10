/**
 * WASM Diagnostic Test
 *
 * Tests the WASM loading mechanics without requiring a browser.
 * Analyzes the module structure, exports, and initialization patterns.
 *
 * Run: node tests/wasm-diagnostic.test.js
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Colors
const c = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(color, ...args) {
  console.log(`${color}${args.join(' ')}${c.reset}`);
}

// Paths
const SRC_API = path.join(__dirname, '..', 'src', 'api');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PUBLIC_WASM = path.join(PUBLIC_DIR, 'wasm');

// Test runner
const tests = [];
let passed = 0;
let failed = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

async function runTests() {
  log(c.cyan, '\n========================================');
  log(c.cyan, '  WASM Diagnostic Test Suite');
  log(c.cyan, '========================================\n');

  for (const t of tests) {
    const startTime = Date.now();
    try {
      await t.fn();
      log(c.green, `✓ ${t.name} (${Date.now() - startTime}ms)`);
      passed++;
    } catch (err) {
      log(c.red, `✗ ${t.name}`);
      log(c.red, `  Error: ${err.message}`);
      failed++;
    }
  }

  log(c.cyan, '\n----------------------------------------');
  if (failed === 0) {
    log(c.green, `All ${passed} tests passed!`);
  } else {
    log(c.yellow, `${passed} passed, ${failed} failed`);
  }
  log(c.cyan, '----------------------------------------\n');

  return failed === 0;
}

// ============================================================================
// WASM File Structure Tests
// ============================================================================

test('WASM binary exists in public/wasm', () => {
  const wasmPath = path.join(PUBLIC_WASM, 'devilutionx.wasm');
  if (!fs.existsSync(wasmPath)) {
    throw new Error(`WASM file not found: ${wasmPath}`);
  }
  const stats = fs.statSync(wasmPath);
  log(c.dim, `    Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
});

test('WASM JS loader exists in public/wasm', () => {
  const jsPath = path.join(PUBLIC_WASM, 'devilutionx.js');
  if (!fs.existsSync(jsPath)) {
    throw new Error(`JS loader not found: ${jsPath}`);
  }
  const stats = fs.statSync(jsPath);
  log(c.dim, `    Size: ${(stats.size / 1024).toFixed(2)} KB`);
});

test('WASM data file exists in public/wasm', () => {
  const dataPath = path.join(PUBLIC_WASM, 'devilutionx.data');
  if (!fs.existsSync(dataPath)) {
    throw new Error(`Data file not found: ${dataPath}`);
  }
  const stats = fs.statSync(dataPath);
  log(c.dim, `    Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
});

test('WASM binary has valid magic bytes', () => {
  const wasmPath = path.join(PUBLIC_WASM, 'devilutionx.wasm');
  const buffer = Buffer.alloc(4);
  const fd = fs.openSync(wasmPath, 'r');
  fs.readSync(fd, buffer, 0, 4, 0);
  fs.closeSync(fd);

  const expected = [0x00, 0x61, 0x73, 0x6D]; // "\0asm"
  for (let i = 0; i < 4; i++) {
    if (buffer[i] !== expected[i]) {
      throw new Error(`Invalid WASM magic at byte ${i}: expected 0x${expected[i].toString(16)}, got 0x${buffer[i].toString(16)}`);
    }
  }
  log(c.dim, `    Magic: ${buffer.toString('hex')} (valid)`);
});

test('spawn.mpq exists and has valid magic', () => {
  const mpqPath = path.join(PUBLIC_DIR, 'spawn.mpq');
  if (!fs.existsSync(mpqPath)) {
    throw new Error(`MPQ file not found: ${mpqPath}`);
  }

  const buffer = Buffer.alloc(4);
  const fd = fs.openSync(mpqPath, 'r');
  fs.readSync(fd, buffer, 0, 4, 0);
  fs.closeSync(fd);

  // MPQ magic: "MPQ\x1A" = 0x4D 0x50 0x51 0x1A
  const expected = [0x4D, 0x50, 0x51, 0x1A];
  for (let i = 0; i < 4; i++) {
    if (buffer[i] !== expected[i]) {
      throw new Error(`Invalid MPQ magic at byte ${i}`);
    }
  }

  const stats = fs.statSync(mpqPath);
  log(c.dim, `    Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB, Magic: MPQ\\x1A (valid)`);
});

// ============================================================================
// Source File Analysis
// ============================================================================

test('DiabloSpawn.jscc exists in src/api', () => {
  const jsccPath = path.join(SRC_API, 'DiabloSpawn.jscc');
  if (!fs.existsSync(jsccPath)) {
    throw new Error(`DiabloSpawn.jscc not found`);
  }
  const stats = fs.statSync(jsccPath);
  log(c.dim, `    Size: ${(stats.size / 1024).toFixed(2)} KB`);
});

test('DiabloSpawn.wasm exists in src/api', () => {
  const wasmPath = path.join(SRC_API, 'DiabloSpawn.wasm');
  if (!fs.existsSync(wasmPath)) {
    throw new Error(`DiabloSpawn.wasm not found`);
  }
});

test('src/api and public/wasm WASM files match', () => {
  const srcWasm = path.join(SRC_API, 'DiabloSpawn.wasm');
  const pubWasm = path.join(PUBLIC_WASM, 'devilutionx.wasm');

  const srcHash = crypto.createHash('md5').update(fs.readFileSync(srcWasm)).digest('hex').slice(0, 8);
  const pubHash = crypto.createHash('md5').update(fs.readFileSync(pubWasm)).digest('hex').slice(0, 8);

  if (srcHash !== pubHash) {
    throw new Error(`WASM files differ: src=${srcHash}, pub=${pubHash}`);
  }
  log(c.dim, `    Hash: ${srcHash} (matched)`);
});

// ============================================================================
// Module Structure Analysis
// ============================================================================

test('JSCC module has ready promise pattern', () => {
  const jsccPath = path.join(SRC_API, 'DiabloSpawn.jscc');
  const content = fs.readFileSync(jsccPath, 'utf8');

  if (!content.includes('Module["ready"]=new Promise')) {
    throw new Error('Module ready promise pattern not found');
  }
  log(c.dim, `    Ready promise pattern found`);
});

test('JSCC module has DApi exports', () => {
  const jsccPath = path.join(SRC_API, 'DiabloSpawn.jscc');
  const content = fs.readFileSync(jsccPath, 'utf8');

  // Search for DApi function exports
  const dapiMatches = content.match(/_DApi_\w+/g) || [];
  const uniqueDapi = [...new Set(dapiMatches)];

  if (uniqueDapi.length === 0) {
    throw new Error('No DApi exports found in JSCC');
  }

  log(c.dim, `    Found ${uniqueDapi.length} DApi references`);
  log(c.dim, `    Including: ${uniqueDapi.slice(0, 5).join(', ')}...`);
});

test('JSCC module references wasmExports correctly', () => {
  const jsccPath = path.join(SRC_API, 'DiabloSpawn.jscc');
  const content = fs.readFileSync(jsccPath, 'utf8');

  // Check for wasmExports pattern
  if (!content.includes('wasmExports=instance.exports')) {
    throw new Error('wasmExports assignment pattern not found');
  }

  log(c.dim, `    wasmExports pattern found`);
});

test('JSCC module has locateFile support', () => {
  const jsccPath = path.join(SRC_API, 'DiabloSpawn.jscc');
  const content = fs.readFileSync(jsccPath, 'utf8');

  if (!content.includes('Module["locateFile"]')) {
    throw new Error('locateFile support not found');
  }
  log(c.dim, `    locateFile pattern found`);
});

test('JSCC references devilutionx.data file', () => {
  const jsccPath = path.join(SRC_API, 'DiabloSpawn.jscc');
  const content = fs.readFileSync(jsccPath, 'utf8');

  if (!content.includes('devilutionx.data')) {
    throw new Error('devilutionx.data reference not found');
  }
  log(c.dim, `    Data file reference found`);
});

// ============================================================================
// game.worker.js Analysis
// ============================================================================

test('game.worker.js imports WASM modules correctly', () => {
  const workerPath = path.join(SRC_API, 'game.worker.js');
  const content = fs.readFileSync(workerPath, 'utf8');

  if (!content.includes("import SpawnModule from './DiabloSpawn.jscc'")) {
    throw new Error('SpawnModule import not found');
  }
  if (!content.includes("import SpawnBinary from './DiabloSpawn.wasm'")) {
    throw new Error('SpawnBinary import not found');
  }
  log(c.dim, `    Module imports found`);
});

test('game.worker.js uses wasmBinary config', () => {
  const workerPath = path.join(SRC_API, 'game.worker.js');
  const content = fs.readFileSync(workerPath, 'utf8');

  if (!content.includes('wasmBinary: binary.data')) {
    throw new Error('wasmBinary config not found');
  }
  log(c.dim, `    wasmBinary config found`);
});

test('game.worker.js awaits module.ready', () => {
  const workerPath = path.join(SRC_API, 'game.worker.js');
  const content = fs.readFileSync(workerPath, 'utf8');

  if (!content.includes('await module.ready')) {
    throw new Error('module.ready await not found');
  }
  log(c.dim, `    Module ready await found`);
});

test('game.worker.js calls _DApi_Init correctly', () => {
  const workerPath = path.join(SRC_API, 'game.worker.js');
  const content = fs.readFileSync(workerPath, 'utf8');

  if (!content.includes('wasm._DApi_Init(')) {
    throw new Error('_DApi_Init call not found');
  }

  // Check the call signature
  const initMatch = content.match(/wasm\._DApi_Init\([^)]+\)/);
  if (initMatch) {
    log(c.dim, `    Call: ${initMatch[0].slice(0, 80)}...`);
  }
});

test('game.worker.js has proper locateFile for data', () => {
  const workerPath = path.join(SRC_API, 'game.worker.js');
  const content = fs.readFileSync(workerPath, 'utf8');

  if (!content.includes("path.endsWith('.data')")) {
    throw new Error('locateFile .data handling not found');
  }
  log(c.dim, `    Data file locateFile handling found`);
});

// ============================================================================
// Potential Issue Detection
// ============================================================================

test('Check for race condition patterns', () => {
  const workerPath = path.join(SRC_API, 'game.worker.js');
  const content = fs.readFileSync(workerPath, 'utf8');

  // Check sequence: module created -> await ready -> use exports
  const moduleCreation = content.indexOf('SpawnModule)(moduleConfig)');
  const awaitReady = content.indexOf('await module.ready');
  const dapiInit = content.indexOf('wasm._DApi_Init(');

  if (moduleCreation > awaitReady || awaitReady > dapiInit) {
    log(c.yellow, `    Warning: Operation order may have issues`);
    log(c.dim, `      Module creation: line ~${content.slice(0, moduleCreation).split('\n').length}`);
    log(c.dim, `      Await ready: line ~${content.slice(0, awaitReady).split('\n').length}`);
    log(c.dim, `      DApi_Init: line ~${content.slice(0, dapiInit).split('\n').length}`);
  } else {
    log(c.dim, `    Operation sequence looks correct`);
  }
});

test('Check data file dependency handling', () => {
  const jsccPath = path.join(SRC_API, 'DiabloSpawn.jscc');
  const content = fs.readFileSync(jsccPath, 'utf8');

  // Check for addRunDependency/removeRunDependency
  const addDep = (content.match(/addRunDependency/g) || []).length;
  const removeDep = (content.match(/removeRunDependency/g) || []).length;

  log(c.dim, `    addRunDependency calls: ${addDep}`);
  log(c.dim, `    removeRunDependency calls: ${removeDep}`);

  if (addDep === 0) {
    log(c.yellow, `    Warning: No dependency tracking found`);
  }
});

test('Verify Module export mechanism', () => {
  const jsccPath = path.join(SRC_API, 'DiabloSpawn.jscc');
  const content = fs.readFileSync(jsccPath, 'utf8');

  // Look for how exports are exposed
  const hasModuleExports = content.includes('module.exports');
  const hasReturn = content.includes('return Module');
  const hasDefaultExport = content.includes('export default');

  log(c.dim, `    module.exports: ${hasModuleExports}`);
  log(c.dim, `    return Module: ${hasReturn}`);
  log(c.dim, `    export default: ${hasDefaultExport}`);

  // Check end of file pattern
  const last200 = content.slice(-200);
  log(c.dim, `    File ending pattern found`);
});

// ============================================================================
// Cross-file Consistency
// ============================================================================

test('Check VERSION environment variable usage', () => {
  const workerPath = path.join(SRC_API, 'game.worker.js');
  const content = fs.readFileSync(workerPath, 'utf8');

  const versionMatch = content.match(/process\.env\.VERSION/);
  if (versionMatch) {
    // Find the regex pattern used
    const patternMatch = content.match(/VERSION\.match\([^)]+\)/);
    if (patternMatch) {
      log(c.dim, `    Version pattern: ${patternMatch[0]}`);
    }
  }
});

test('Check PUBLIC_URL usage for asset paths', () => {
  const workerPath = path.join(SRC_API, 'game.worker.js');
  const content = fs.readFileSync(workerPath, 'utf8');

  const publicUrlMatches = content.match(/process\.env\.PUBLIC_URL/g) || [];
  log(c.dim, `    PUBLIC_URL references: ${publicUrlMatches.length}`);
});

// ============================================================================
// Critical Export Verification
// ============================================================================

test('CRITICAL: Check for _DApi_Init export', () => {
  const jsPath = path.join(PUBLIC_WASM, 'devilutionx.js');
  const content = fs.readFileSync(jsPath, 'utf8');

  const hasDApiInit = content.includes('Module["_DApi_Init"]');

  if (!hasDApiInit) {
    log(c.red, '\n    *** CRITICAL ERROR FOUND ***');
    log(c.red, '    _DApi_Init is NOT exported from the WASM module!');
    log(c.red, '    This is the root cause of "G._DApi_Init is not a function"');
    log(c.yellow, '\n    To fix this issue:');
    log(c.yellow, '    1. Rebuild WASM with: cd wasm && ./build.sh --custom-api');
    log(c.yellow, '    2. This will include _DApi_Init, _DApi_Render, and other core exports');
    log(c.yellow, '    3. Copy the new files to public/wasm/ and src/api/');
    throw new Error('_DApi_Init NOT EXPORTED - WASM rebuild required with --custom-api flag');
  }

  log(c.dim, '    _DApi_Init is properly exported');
});

test('CRITICAL: Check for _DApi_Render export', () => {
  const jsPath = path.join(PUBLIC_WASM, 'devilutionx.js');
  const content = fs.readFileSync(jsPath, 'utf8');

  const hasDApiRender = content.includes('Module["_DApi_Render"]');

  if (!hasDApiRender) {
    log(c.red, '\n    *** CRITICAL ERROR FOUND ***');
    log(c.red, '    _DApi_Render is NOT exported from the WASM module!');
    log(c.red, '    This will cause render loop failures');
    log(c.yellow, '\n    To fix: Rebuild WASM with --custom-api flag');
    throw new Error('_DApi_Render NOT EXPORTED - WASM rebuild required');
  }

  log(c.dim, '    _DApi_Render is properly exported');
});

test('Verify all required core game exports', () => {
  const jsPath = path.join(PUBLIC_WASM, 'devilutionx.js');
  const content = fs.readFileSync(jsPath, 'utf8');

  const requiredExports = [
    '_DApi_Init',
    '_DApi_Render',
    '_DApi_Key',
    '_DApi_Mouse',
    '_DApi_Char',
  ];

  const missing = requiredExports.filter(exp =>
    !content.includes(`Module["${exp}"]`)
  );

  if (missing.length > 0) {
    log(c.red, `\n    Missing core exports: ${missing.join(', ')}`);
    log(c.yellow, '\n    The WASM was built WITHOUT core game function exports.');
    log(c.yellow, '    Current build only has neural API functions.');
    log(c.yellow, '\n    Required action:');
    log(c.yellow, '      cd wasm && ./build.sh --custom-api');
    throw new Error(`Missing ${missing.length} core exports: ${missing.join(', ')}`);
  }

  log(c.dim, `    All ${requiredExports.length} core exports present`);
});

// ============================================================================
// Summary Report
// ============================================================================

test('Generate diagnostic summary', () => {
  const summary = {
    wasmFiles: {
      srcApi: {
        'DiabloSpawn.wasm': fs.existsSync(path.join(SRC_API, 'DiabloSpawn.wasm')),
        'DiabloSpawn.jscc': fs.existsSync(path.join(SRC_API, 'DiabloSpawn.jscc')),
        'Diablo.wasm': fs.existsSync(path.join(SRC_API, 'Diablo.wasm')),
        'Diablo.jscc': fs.existsSync(path.join(SRC_API, 'Diablo.jscc')),
      },
      publicWasm: {
        'devilutionx.wasm': fs.existsSync(path.join(PUBLIC_WASM, 'devilutionx.wasm')),
        'devilutionx.js': fs.existsSync(path.join(PUBLIC_WASM, 'devilutionx.js')),
        'devilutionx.data': fs.existsSync(path.join(PUBLIC_WASM, 'devilutionx.data')),
      },
      publicRoot: {
        'spawn.mpq': fs.existsSync(path.join(PUBLIC_DIR, 'spawn.mpq')),
        'devilutionx.wasm': fs.existsSync(path.join(PUBLIC_DIR, 'devilutionx.wasm')),
        'devilutionx.js': fs.existsSync(path.join(PUBLIC_DIR, 'devilutionx.js')),
      },
    },
  };

  log(c.dim, '\n    File availability:');
  log(c.dim, '    src/api:');
  Object.entries(summary.wasmFiles.srcApi).forEach(([f, exists]) => {
    log(c.dim, `      ${exists ? '✓' : '✗'} ${f}`);
  });
  log(c.dim, '    public/wasm:');
  Object.entries(summary.wasmFiles.publicWasm).forEach(([f, exists]) => {
    log(c.dim, `      ${exists ? '✓' : '✗'} ${f}`);
  });
  log(c.dim, '    public/:');
  Object.entries(summary.wasmFiles.publicRoot).forEach(([f, exists]) => {
    log(c.dim, `      ${exists ? '✓' : '✗'} ${f}`);
  });
});

// Run all tests
runTests().then(success => {
  if (!success) {
    log(c.yellow, '\nDiagnostic analysis complete. Review findings above.');
  }
  process.exit(success ? 0 : 1);
});
