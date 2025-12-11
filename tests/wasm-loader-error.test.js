/**
 * WASM Loader Error Test
 *
 * Tests the actual WASM loading process and verifies that the
 * G._DApi_Init error is properly caught and reported.
 *
 * This test runs in Node.js and simulates what happens when the
 * game tries to load the WASM and call _DApi_Init.
 *
 * Run: node tests/wasm-loader-error.test.js
 */

const fs = require('fs');
const path = require('path');

// Colors for output
const c = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
};

function log(color, ...args) {
  console.log(`${color}${args.join(' ')}${c.reset}`);
}

// Paths
const PUBLIC_WASM = path.join(__dirname, '..', 'public', 'wasm');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Test state
let passed = 0;
let failed = 0;

async function test(name, fn) {
  const start = Date.now();
  try {
    await fn();
    log(c.green, `✓ ${name} (${Date.now() - start}ms)`);
    passed++;
    return true;
  } catch (e) {
    log(c.red, `✗ ${name}`);
    log(c.red, `  Error: ${e.message}`);
    failed++;
    return false;
  }
}

// ============================================================================
// WASM Module Loading Tests
// ============================================================================

async function loadWasmModule() {
  const wasmPath = path.join(PUBLIC_WASM, 'devilutionx.wasm');
  const wasmBuffer = fs.readFileSync(wasmPath);

  // Get imports that the WASM module expects
  const module = await WebAssembly.compile(wasmBuffer);
  const imports = WebAssembly.Module.imports(module);
  const exports = WebAssembly.Module.exports(module);

  return { module, imports, exports, wasmBuffer };
}

async function instantiateWithMockImports(module, imports) {
  // Create mock imports based on what the WASM expects
  const mockImports = {};

  for (const imp of imports) {
    if (!mockImports[imp.module]) {
      mockImports[imp.module] = {};
    }

    switch (imp.kind) {
      case 'function':
        // Mock all imported functions
        mockImports[imp.module][imp.name] = function(...args) {
          // Silent mock - just return 0 for everything
          return 0;
        };
        break;
      case 'memory':
        mockImports[imp.module][imp.name] = new WebAssembly.Memory({
          initial: 256,
          maximum: 32768,
        });
        break;
      case 'table':
        mockImports[imp.module][imp.name] = new WebAssembly.Table({
          initial: 1,
          element: 'anyfunc',
        });
        break;
      case 'global':
        mockImports[imp.module][imp.name] = new WebAssembly.Global(
          { value: 'i32', mutable: true },
          0
        );
        break;
    }
  }

  return WebAssembly.instantiate(module, mockImports);
}

// ============================================================================
// Core Error Detection Tests
// ============================================================================

async function runTests() {
  log(c.cyan, '\n========================================');
  log(c.cyan, '  WASM Loader Error Detection Tests');
  log(c.cyan, '========================================\n');

  let wasmData = null;

  // Test 1: Load and compile WASM module
  await test('Load and compile WASM module', async () => {
    wasmData = await loadWasmModule();
    if (!wasmData.module) throw new Error('Failed to compile WASM');
    log(c.dim, `    Compiled successfully`);
  });

  // Test 2: Check for _DApi_Init in exports
  await test('Check _DApi_Init export (expected to fail)', async () => {
    const functionExports = wasmData.exports.filter(e => e.kind === 'function');
    const hasDApiInit = functionExports.some(e => e.name === '_DApi_Init');

    if (hasDApiInit) {
      log(c.green, `    _DApi_Init found - WASM is correctly built!`);
    } else {
      log(c.yellow, `    _DApi_Init NOT found - this causes the error`);
      log(c.dim, `    Function exports: ${functionExports.length}`);

      // List DApi exports that DO exist
      const dapiExports = functionExports.filter(e => e.name.includes('DApi'));
      if (dapiExports.length > 0) {
        log(c.dim, `    Available DApi exports: ${dapiExports.map(e => e.name).join(', ')}`);
      }

      throw new Error('_DApi_Init not exported - WASM needs rebuild with --custom-api');
    }
  });

  // Test 3: Check for _DApi_Render in exports
  await test('Check _DApi_Render export (expected to fail)', async () => {
    const functionExports = wasmData.exports.filter(e => e.kind === 'function');
    const hasDApiRender = functionExports.some(e => e.name === '_DApi_Render');

    if (!hasDApiRender) {
      throw new Error('_DApi_Render not exported - WASM needs rebuild');
    }
  });

  // Test 4: Simulate the exact error that occurs in game.worker.js
  await test('Simulate game.worker.js _DApi_Init call error', async () => {
    let instance = null;

    try {
      instance = await instantiateWithMockImports(wasmData.module, wasmData.imports);
    } catch (e) {
      log(c.dim, `    Could not instantiate (expected): ${e.message.slice(0, 80)}...`);
      // For this test, we'll check the export existence instead
    }

    if (instance) {
      // Try to call _DApi_Init like game.worker.js does at line 434
      if (typeof instance.exports._DApi_Init !== 'function') {
        throw new Error('TypeError: G._DApi_Init is not a function');
      }
    } else {
      // Check export list directly since we couldn't instantiate
      const functionExports = wasmData.exports.filter(e => e.kind === 'function');
      const hasDApiInit = functionExports.some(e => e.name === '_DApi_Init');

      if (!hasDApiInit) {
        throw new Error('TypeError: G._DApi_Init is not a function');
      }
    }
  });

  // Test 5: Verify all required game API exports
  await test('Verify all required game API exports', async () => {
    const requiredExports = [
      '_DApi_Init',     // Initialize game
      '_DApi_Render',   // Render frame
      '_DApi_Key',      // Keyboard input
      '_DApi_Mouse',    // Mouse input
      '_DApi_Char',     // Character input
    ];

    const functionExports = wasmData.exports.filter(e => e.kind === 'function');
    const missingExports = requiredExports.filter(
      name => !functionExports.some(e => e.name === name)
    );

    if (missingExports.length > 0) {
      log(c.red, `    Missing exports: ${missingExports.join(', ')}`);
      throw new Error(`Missing ${missingExports.length} required exports`);
    }

    log(c.dim, `    All ${requiredExports.length} required exports present`);
  });

  // Test 6: Check if spawn.mpq exists and is valid
  await test('Verify spawn.mpq exists and is valid', async () => {
    const spawnPath = path.join(PUBLIC_DIR, 'spawn.mpq');

    if (!fs.existsSync(spawnPath)) {
      throw new Error('spawn.mpq not found');
    }

    const stat = fs.statSync(spawnPath);
    log(c.dim, `    Size: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);

    // Check MPQ magic bytes
    const fd = fs.openSync(spawnPath, 'r');
    const header = Buffer.alloc(4);
    fs.readSync(fd, header, 0, 4, 0);
    fs.closeSync(fd);

    const magic = header.toString('ascii');
    if (!magic.startsWith('MPQ')) {
      throw new Error(`Invalid MPQ magic: ${magic}`);
    }

    log(c.dim, `    Magic: ${magic} (valid)`);
  });

  // Test 7: Verify error propagation chain
  await test('Verify error can be caught and propagated', async () => {
    // Simulate the error flow from game.worker.js -> loader.js -> App.js

    // Simulate worker error handler
    function workerOnError(err, action = 'error') {
      if (err instanceof Error) {
        return { action, error: err.toString(), stack: err.stack };
      } else {
        return { action, error: err.toString() };
      }
    }

    // Simulate the error
    const testError = new TypeError('G._DApi_Init is not a function');
    const workerMessage = workerOnError(testError, 'failed');

    // Verify error message format matches what App.js expects
    if (workerMessage.action !== 'failed') {
      throw new Error('Wrong action type');
    }

    if (!workerMessage.error.includes('_DApi_Init')) {
      throw new Error('Error message does not contain _DApi_Init');
    }

    log(c.dim, `    Error propagation chain verified`);
    log(c.dim, `    Error message: ${workerMessage.error}`);
  });

  // Test 8: Verify the fix is documented
  await test('Verify fix documentation in build script', async () => {
    const buildScript = path.join(__dirname, '..', 'wasm', 'build.sh');

    if (!fs.existsSync(buildScript)) {
      throw new Error('Build script not found');
    }

    const content = fs.readFileSync(buildScript, 'utf8');

    if (!content.includes('--custom-api')) {
      throw new Error('Build script missing --custom-api flag documentation');
    }

    if (!content.includes('_DApi_Init')) {
      throw new Error('Build script missing _DApi_Init in exports');
    }

    log(c.dim, `    Build script contains --custom-api flag`);
    log(c.dim, `    Build script contains _DApi_Init export`);
  });

  // Summary
  log(c.cyan, '\n----------------------------------------');
  if (failed > 0) {
    log(c.yellow, `${passed} passed, ${failed} failed`);
  } else {
    log(c.green, `All ${passed} tests passed`);
  }
  log(c.cyan, '----------------------------------------\n');

  // Provide actionable information
  if (failed > 0) {
    log(c.red, '\n*** ROOT CAUSE IDENTIFIED ***');
    log(c.red, 'The WASM module is missing core game API exports.');
    log(c.red, 'This causes: TypeError: G._DApi_Init is not a function');
    log(c.yellow, '\nTO FIX:');
    log(c.yellow, '1. Rebuild WASM with: cd wasm && ./build.sh --custom-api');
    log(c.yellow, '2. This requires Emscripten SDK or Docker');
    log(c.yellow, '3. The --custom-api flag adds these exports:');
    log(c.dim, '   _DApi_Init, _DApi_Render, _DApi_Key, _DApi_Mouse, _DApi_Char');
  }

  return failed === 0;
}

// ============================================================================
// Error Detection Pattern Matching Tests
// ============================================================================

async function testErrorPatterns() {
  log(c.cyan, '\n========================================');
  log(c.cyan, '  Error Pattern Detection Tests');
  log(c.cyan, '========================================\n');

  // Define error patterns to look for
  const knownErrors = [
    {
      pattern: /G\._DApi_Init is not a function/,
      cause: 'WASM missing _DApi_Init export',
      fix: 'Rebuild WASM with --custom-api flag',
      severity: 'critical',
    },
    {
      pattern: /G\._DApi_Render is not a function/,
      cause: 'WASM missing _DApi_Render export',
      fix: 'Rebuild WASM with --custom-api flag',
      severity: 'critical',
    },
    {
      pattern: /G\._DApi_Key is not a function/,
      cause: 'WASM missing _DApi_Key export',
      fix: 'Rebuild WASM with --custom-api flag',
      severity: 'critical',
    },
    {
      pattern: /Invalid MPQ/,
      cause: 'MPQ file corrupted or invalid',
      fix: 'Re-download or re-extract spawn.mpq',
      severity: 'high',
    },
    {
      pattern: /memory access out of bounds/,
      cause: 'WASM memory access violation',
      fix: 'Check MPQ file integrity, may need page refresh',
      severity: 'high',
    },
    {
      pattern: /CompileError.*wasm/i,
      cause: 'WASM compilation failed',
      fix: 'Browser may not support WASM or file corrupted',
      severity: 'critical',
    },
  ];

  // Test error detection
  const testErrors = [
    'TypeError: G._DApi_Init is not a function',
    'TypeError: G._DApi_Render is not a function',
    'RuntimeError: memory access out of bounds',
    'CompileError: WebAssembly.compile(): invalid section code',
    'Error: Invalid MPQ header',
  ];

  for (const errorMsg of testErrors) {
    const matched = knownErrors.find(e => e.pattern.test(errorMsg));

    if (matched) {
      log(c.green, `✓ Error pattern detected: "${errorMsg.slice(0, 50)}..."`);
      log(c.dim, `    Cause: ${matched.cause}`);
      log(c.dim, `    Fix: ${matched.fix}`);
      log(c.dim, `    Severity: ${matched.severity}`);
    } else {
      log(c.yellow, `? Unknown error pattern: "${errorMsg}"`);
    }
  }

  return true;
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  log(c.cyan, '\n╔══════════════════════════════════════════════╗');
  log(c.cyan, '║  WASM Loader Error Detection Test Suite     ║');
  log(c.cyan, '║  Tests the G._DApi_Init error scenario      ║');
  log(c.cyan, '╚══════════════════════════════════════════════╝\n');

  const loaderSuccess = await runTests();
  await testErrorPatterns();

  // Final verdict
  log(c.cyan, '\n========================================');
  log(c.cyan, '  Final Verdict');
  log(c.cyan, '========================================\n');

  if (!loaderSuccess) {
    log(c.red, 'ERROR CONFIRMED: The G._DApi_Init error will occur');
    log(c.red, 'The WASM module is missing required game API exports.');
    log(c.yellow, '\nThe game cannot load until the WASM is rebuilt.');
    process.exit(1);
  } else {
    log(c.green, 'SUCCESS: All tests passed');
    log(c.green, 'The WASM module appears to be correctly built.');
    process.exit(0);
  }
}

main().catch(e => {
  log(c.red, `Fatal error: ${e.message}`);
  console.error(e);
  process.exit(1);
});
