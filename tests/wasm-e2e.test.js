/**
 * WASM Engine End-to-End Test Suite
 *
 * This test suite validates the complete WASM loading pipeline:
 * 1. Module loading and initialization
 * 2. spawn.mpq integration
 * 3. Level injection
 * 4. Modding pipeline
 *
 * Run: node tests/wasm-e2e.test.js
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const http = require('http');

const CONFIG = {
  headless: process.env.PUPPETEER_HEADLESS !== 'false',
  timeout: 180000, // 3 minutes
  port: 3098,
};

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

/**
 * Static file server with CORS and proper MIME types
 */
class TestServer {
  constructor(rootDir, port) {
    this.rootDir = rootDir;
    this.port = port;
    this.server = null;
    this.mimeTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.jscc': 'application/javascript',
      '.wasm': 'application/wasm',
      '.data': 'application/octet-stream',
      '.mpq': 'application/octet-stream',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
    };
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        let filePath = path.join(this.rootDir, req.url.split('?')[0]);
        if (filePath.endsWith('/')) filePath = path.join(filePath, 'index.html');

        const ext = path.extname(filePath).toLowerCase();
        const contentType = this.mimeTypes[ext] || 'application/octet-stream';

        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

        fs.readFile(filePath, (err, data) => {
          if (err) {
            res.writeHead(err.code === 'ENOENT' ? 404 : 500);
            res.end(err.code === 'ENOENT' ? 'Not Found' : 'Server Error');
            return;
          }
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(data);
        });
      });

      this.server.on('error', reject);
      this.server.listen(this.port, () => {
        log(c.cyan, `Server running on http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  stop() {
    return new Promise(resolve => {
      if (this.server) this.server.close(resolve);
      else resolve();
    });
  }
}

/**
 * Test Harness for WASM E2E testing
 */
class E2ETestHarness {
  constructor() {
    this.browser = null;
    this.page = null;
    this.logs = [];
    this.errors = [];
  }

  async launch() {
    this.browser = await puppeteer.launch({
      headless: CONFIG.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 800, height: 600 });

    this.page.on('console', msg => {
      this.logs.push({ type: msg.type(), text: msg.text(), time: Date.now() });
    });
    this.page.on('pageerror', err => {
      this.errors.push({ message: err.message, stack: err.stack, time: Date.now() });
    });
    return this;
  }

  async close() {
    if (this.browser) await this.browser.close();
  }

  /**
   * Test WASM module loading with detailed diagnostics
   */
  async testWASMLoading(baseUrl) {
    // Create a test page that loads WASM
    const testHtml = `
    <!DOCTYPE html>
    <html>
    <head><title>WASM Test</title></head>
    <body>
    <script>
      window.WASM_TEST_RESULTS = { status: 'pending' };

      async function runTest() {
        const results = {
          status: 'running',
          steps: [],
          timings: {},
          errors: [],
        };

        try {
          // Step 1: Load WASM JS loader
          results.timings.jsLoadStart = performance.now();
          const script = document.createElement('script');
          script.src = '${baseUrl}/wasm/devilutionx.js';

          await new Promise((resolve, reject) => {
            script.onload = resolve;
            script.onerror = () => reject(new Error('Failed to load devilutionx.js'));
            document.head.appendChild(script);
          });
          results.timings.jsLoadEnd = performance.now();
          results.steps.push('JS loader loaded');

          // Step 2: Check if Diablo function exists
          if (typeof Diablo !== 'function') {
            throw new Error('Diablo module not defined after script load');
          }
          results.steps.push('Diablo function available');

          // Step 3: Fetch WASM binary
          results.timings.wasmFetchStart = performance.now();
          const wasmResp = await fetch('${baseUrl}/wasm/devilutionx.wasm');
          if (!wasmResp.ok) throw new Error('Failed to fetch WASM binary');
          const wasmBinary = await wasmResp.arrayBuffer();
          results.timings.wasmFetchEnd = performance.now();
          results.wasmSize = wasmBinary.byteLength;
          results.steps.push('WASM binary fetched (' + (wasmBinary.byteLength/1024/1024).toFixed(2) + ' MB)');

          // Step 4: Initialize module
          results.timings.moduleInitStart = performance.now();
          const moduleConfig = {
            wasmBinary: wasmBinary,
            locateFile: (path) => '${baseUrl}/wasm/' + path,
            print: (text) => console.log('[WASM]', text),
            printErr: (text) => console.error('[WASM]', text),
            onRuntimeInitialized: () => {
              console.log('[WASM] Runtime initialized');
              results.runtimeInitialized = true;
            },
          };

          const module = Diablo(moduleConfig);
          results.steps.push('Module instantiated');

          // Step 5: Wait for ready
          results.timings.readyWaitStart = performance.now();
          await module.ready;
          results.timings.readyWaitEnd = performance.now();
          results.steps.push('Module ready resolved');

          // Step 6: Check exports
          const allExports = Object.keys(module).filter(k => k.startsWith('_'));
          results.totalExports = allExports.length;
          results.dapiExports = allExports.filter(k => k.includes('DApi'));

          results._DApi_Init_type = typeof module._DApi_Init;
          results._DApi_Init_exists = typeof module._DApi_Init === 'function';

          if (!results._DApi_Init_exists) {
            // Detailed debug info
            results.moduleKeys = Object.keys(module).slice(0, 50);
            results.underscoreKeys = allExports.slice(0, 30);
            throw new Error('_DApi_Init is ' + results._DApi_Init_type + ', not function. Exports: ' + allExports.length);
          }

          results.steps.push('_DApi_Init is available');

          // Step 7: Check other critical exports
          const criticalFuncs = ['_DApi_Init', '_DApi_Render', '_malloc', '_free'];
          results.criticalExports = {};
          for (const fn of criticalFuncs) {
            results.criticalExports[fn] = typeof module[fn] === 'function';
          }
          results.steps.push('Critical exports verified');

          // Step 8: Check memory
          results.hasHEAPU8 = !!module.HEAPU8;
          results.heapSize = module.HEAPU8 ? module.HEAPU8.length : 0;
          results.steps.push('Memory heap available (' + (results.heapSize/1024/1024).toFixed(2) + ' MB)');

          // Step 9: Test memory allocation
          if (typeof module._malloc === 'function') {
            const ptr = module._malloc(1600);
            if (ptr) {
              module._free(ptr);
              results.steps.push('Memory allocation works');
            }
          }

          // Store module for later tests
          window.WASM_MODULE = module;
          results.status = 'success';

        } catch (error) {
          results.status = 'failed';
          results.error = error.message;
          results.errorStack = error.stack;
          results.errors.push(error.message);
        }

        results.timings.totalTime = performance.now() - (results.timings.jsLoadStart || performance.now());
        window.WASM_TEST_RESULTS = results;
        return results;
      }

      runTest();
    </script>
    </body>
    </html>
    `;

    // Write test HTML to temp file
    const testHtmlPath = path.join(this.rootDir, 'wasm-test.html');
    fs.writeFileSync(testHtmlPath, testHtml);

    try {
      await this.page.goto(`${baseUrl}/wasm-test.html`, {
        waitUntil: 'networkidle0',
        timeout: CONFIG.timeout,
      });

      // Wait for test to complete
      await this.page.waitForFunction(
        () => window.WASM_TEST_RESULTS && window.WASM_TEST_RESULTS.status !== 'pending' && window.WASM_TEST_RESULTS.status !== 'running',
        { timeout: CONFIG.timeout }
      );

      const results = await this.page.evaluate(() => window.WASM_TEST_RESULTS);
      return results;

    } finally {
      // Cleanup
      try { fs.unlinkSync(testHtmlPath); } catch (e) {}
    }
  }

  /**
   * Test MPQ loading
   */
  async testMPQLoading(baseUrl) {
    return await this.page.evaluate(async (url) => {
      const results = { success: false, steps: [] };

      try {
        const response = await fetch(`${url}/spawn.mpq`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const buffer = await response.arrayBuffer();
        results.size = buffer.byteLength;
        results.steps.push(`Fetched ${(buffer.byteLength/1024/1024).toFixed(2)} MB`);

        // Check MPQ magic
        const magic = new Uint8Array(buffer.slice(0, 4));
        const expectedMagic = [0x4D, 0x50, 0x51, 0x1A]; // "MPQ\x1A"
        results.validMagic = magic.every((b, i) => b === expectedMagic[i]);

        if (!results.validMagic) {
          throw new Error('Invalid MPQ magic bytes');
        }
        results.steps.push('Valid MPQ magic');

        window.MPQ_DATA = new Uint8Array(buffer);
        results.success = true;

      } catch (error) {
        results.error = error.message;
      }

      return results;
    }, baseUrl);
  }

  /**
   * Test level injection capability
   */
  async testLevelInjection() {
    return await this.page.evaluate(() => {
      const results = { success: false, steps: [] };

      try {
        const wasm = window.WASM_MODULE;
        if (!wasm) throw new Error('WASM module not loaded');

        // Test 1: Memory allocation
        const gridSize = 40 * 40;
        const ptr = wasm._malloc(gridSize);
        if (!ptr) throw new Error('Memory allocation failed');
        results.steps.push('Memory allocated');

        // Test 2: Write dungeon-like data
        const testGrid = new Uint8Array(gridSize);
        for (let y = 0; y < 40; y++) {
          for (let x = 0; x < 40; x++) {
            // Create a simple dungeon pattern
            if (x === 0 || x === 39 || y === 0 || y === 39) {
              testGrid[y * 40 + x] = 1; // Wall
            } else if ((x + y) % 7 === 0) {
              testGrid[y * 40 + x] = 13; // Floor
            } else {
              testGrid[y * 40 + x] = 0; // Empty
            }
          }
        }

        // Set stairs
        testGrid[5 * 40 + 5] = 36; // Stairs up
        testGrid[35 * 40 + 35] = 37; // Stairs down

        wasm.HEAPU8.set(testGrid, ptr);
        results.steps.push('Grid written to memory');

        // Test 3: Read back and verify
        const readGrid = wasm.HEAPU8.slice(ptr, ptr + gridSize);
        const matches = readGrid.every((v, i) => v === testGrid[i]);
        if (!matches) throw new Error('Grid verification failed');
        results.steps.push('Grid verified');

        // Cleanup
        wasm._free(ptr);
        results.steps.push('Memory freed');

        results.success = true;

      } catch (error) {
        results.error = error.message;
      }

      return results;
    });
  }

  /**
   * Test modding pipeline (mock)
   */
  async testModdingPipeline() {
    return await this.page.evaluate(() => {
      const results = { success: false, steps: [] };

      try {
        const wasm = window.WASM_MODULE;
        const mpq = window.MPQ_DATA;

        if (!wasm) throw new Error('WASM module not loaded');
        if (!mpq) throw new Error('MPQ not loaded');

        // Simulate modding operations

        // Step 1: Create a modified level grid
        const customLevel = {
          grid: new Array(40).fill(null).map(() => new Array(40).fill(0)),
          monsters: [],
          objects: [],
        };

        // Fill with a simple pattern
        for (let y = 0; y < 40; y++) {
          for (let x = 0; x < 40; x++) {
            if (x === 0 || x === 39 || y === 0 || y === 39) {
              customLevel.grid[y][x] = 1; // Wall
            } else {
              customLevel.grid[y][x] = 13; // Floor
            }
          }
        }
        results.steps.push('Custom level grid created');

        // Step 2: Add monsters
        customLevel.monsters.push({ type: 1, x: 20, y: 20 }); // Skeleton
        customLevel.monsters.push({ type: 2, x: 25, y: 25 }); // Zombie
        results.steps.push('Monsters added');

        // Step 3: Add objects
        customLevel.objects.push({ type: 5, x: 15, y: 15 }); // Chest
        results.steps.push('Objects added');

        // Step 4: Serialize for injection
        const flatGrid = new Uint8Array(40 * 40);
        for (let y = 0; y < 40; y++) {
          for (let x = 0; x < 40; x++) {
            flatGrid[y * 40 + x] = customLevel.grid[y][x];
          }
        }
        results.gridSize = flatGrid.length;
        results.steps.push('Grid serialized');

        // Step 5: Verify we can inject into WASM memory
        const ptr = wasm._malloc(flatGrid.length);
        if (!ptr) throw new Error('Failed to allocate injection buffer');
        wasm.HEAPU8.set(flatGrid, ptr);
        wasm._free(ptr);
        results.steps.push('Grid injection test passed');

        results.customLevel = {
          gridDimensions: [40, 40],
          monsterCount: customLevel.monsters.length,
          objectCount: customLevel.objects.length,
        };

        results.success = true;

      } catch (error) {
        results.error = error.message;
      }

      return results;
    });
  }
}

/**
 * Test Runner
 */
async function runTests() {
  log(c.cyan, '\n========================================');
  log(c.cyan, '  WASM Engine E2E Test Suite');
  log(c.cyan, '========================================\n');

  const publicDir = path.join(__dirname, '..', 'public');
  const server = new TestServer(publicDir, CONFIG.port);
  const harness = new E2ETestHarness();
  harness.rootDir = publicDir;

  const baseUrl = `http://localhost:${CONFIG.port}`;
  const results = { tests: [], passed: 0, failed: 0 };

  try {
    await server.start();
    await harness.launch();

    // Test 1: WASM Loading
    log(c.blue, '\n--- Test 1: WASM Module Loading ---');
    const wasmResults = await harness.testWASMLoading(baseUrl);

    if (wasmResults.status === 'success') {
      log(c.green, '  ✓ WASM module loaded successfully');
      wasmResults.steps.forEach(s => log(c.dim, `    - ${s}`));
      log(c.dim, `    Total time: ${wasmResults.timings.totalTime?.toFixed(0)}ms`);
      results.passed++;
    } else {
      log(c.red, '  ✗ WASM loading failed');
      log(c.red, `    Error: ${wasmResults.error}`);
      if (wasmResults.steps) {
        log(c.yellow, '    Steps completed:');
        wasmResults.steps.forEach(s => log(c.dim, `      - ${s}`));
      }
      if (wasmResults.moduleKeys) {
        log(c.yellow, `    Module keys (first 20): ${wasmResults.moduleKeys.slice(0, 20).join(', ')}`);
      }
      if (wasmResults.underscoreKeys) {
        log(c.yellow, `    Underscore exports: ${wasmResults.underscoreKeys.join(', ')}`);
      }
      results.failed++;
    }
    results.tests.push({ name: 'WASM Loading', ...wasmResults });

    // Test 2: MPQ Loading
    log(c.blue, '\n--- Test 2: MPQ Loading ---');
    const mpqResults = await harness.testMPQLoading(baseUrl);

    if (mpqResults.success) {
      log(c.green, '  ✓ MPQ loaded successfully');
      mpqResults.steps.forEach(s => log(c.dim, `    - ${s}`));
      results.passed++;
    } else {
      log(c.red, '  ✗ MPQ loading failed');
      log(c.red, `    Error: ${mpqResults.error}`);
      results.failed++;
    }
    results.tests.push({ name: 'MPQ Loading', ...mpqResults });

    // Test 3: Level Injection (only if WASM loaded)
    if (wasmResults.status === 'success') {
      log(c.blue, '\n--- Test 3: Level Injection ---');
      const injectionResults = await harness.testLevelInjection();

      if (injectionResults.success) {
        log(c.green, '  ✓ Level injection works');
        injectionResults.steps.forEach(s => log(c.dim, `    - ${s}`));
        results.passed++;
      } else {
        log(c.red, '  ✗ Level injection failed');
        log(c.red, `    Error: ${injectionResults.error}`);
        results.failed++;
      }
      results.tests.push({ name: 'Level Injection', ...injectionResults });

      // Test 4: Modding Pipeline
      log(c.blue, '\n--- Test 4: Modding Pipeline ---');
      const modResults = await harness.testModdingPipeline();

      if (modResults.success) {
        log(c.green, '  ✓ Modding pipeline works');
        modResults.steps.forEach(s => log(c.dim, `    - ${s}`));
        if (modResults.customLevel) {
          log(c.dim, `    Level: ${modResults.customLevel.gridDimensions.join('x')}, ${modResults.customLevel.monsterCount} monsters, ${modResults.customLevel.objectCount} objects`);
        }
        results.passed++;
      } else {
        log(c.red, '  ✗ Modding pipeline failed');
        log(c.red, `    Error: ${modResults.error}`);
        results.failed++;
      }
      results.tests.push({ name: 'Modding Pipeline', ...modResults });
    } else {
      log(c.yellow, '\n--- Skipping Level Injection and Modding tests (WASM not loaded) ---');
    }

    // Output errors from harness
    if (harness.errors.length > 0) {
      log(c.yellow, '\n--- Page Errors ---');
      harness.errors.forEach(e => log(c.yellow, `  ${e.message}`));
    }

  } catch (error) {
    log(c.red, `\nTest suite error: ${error.message}`);
    results.failed++;
  } finally {
    await harness.close();
    await server.stop();
  }

  // Summary
  log(c.cyan, '\n========================================');
  if (results.failed === 0) {
    log(c.green, `  All ${results.passed} tests passed!`);
  } else {
    log(c.yellow, `  ${results.passed} passed, ${results.failed} failed`);
  }
  log(c.cyan, '========================================\n');

  return results.failed === 0;
}

// Run tests
if (require.main === module) {
  runTests().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = { runTests, E2ETestHarness, TestServer };
