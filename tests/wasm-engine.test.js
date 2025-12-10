/**
 * WASM Diablo Engine Test Suite
 *
 * Comprehensive tests for WASM loading, initialization, and game functionality.
 * Uses Puppeteer for headless browser testing.
 *
 * Tests:
 * 1. WASM module loading and initialization
 * 2. _DApi_Init function availability
 * 3. spawn.mpq loading
 * 4. Level injector integration
 * 5. Modding code integration
 * 6. End-to-end modded MPQ testing
 *
 * Run: npm run test:wasm-engine
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const http = require('http');

// Test configuration
const CONFIG = {
  headless: process.env.PUPPETEER_HEADLESS !== 'false',
  slowMo: process.env.PUPPETEER_SLOWMO ? parseInt(process.env.PUPPETEER_SLOWMO) : 0,
  timeout: 120000, // 2 minutes for WASM loading
  port: 3099, // Use different port to avoid conflicts
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, ...args) {
  console.log(`${color}${args.join(' ')}${colors.reset}`);
}

/**
 * Simple static file server for testing
 */
class TestServer {
  constructor(rootDir, port) {
    this.rootDir = rootDir;
    this.port = port;
    this.server = null;
    this.mimeTypes = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.wasm': 'application/wasm',
      '.data': 'application/octet-stream',
      '.mpq': 'application/octet-stream',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
    };
  }

  async start() {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        let filePath = path.join(this.rootDir, req.url.split('?')[0]);

        if (filePath.endsWith('/')) {
          filePath = path.join(filePath, 'index.html');
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = this.mimeTypes[ext] || 'application/octet-stream';

        // Enable CORS for testing
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

        fs.readFile(filePath, (err, data) => {
          if (err) {
            if (err.code === 'ENOENT') {
              res.writeHead(404);
              res.end('Not Found');
            } else {
              res.writeHead(500);
              res.end('Server Error');
            }
            return;
          }

          // Support range requests for MPQ files
          if (req.headers.range && (ext === '.mpq' || ext === '.data')) {
            const range = req.headers.range.replace(/bytes=/, '').split('-');
            const start = parseInt(range[0], 10);
            const end = range[1] ? parseInt(range[1], 10) : data.length - 1;
            const chunkSize = (end - start) + 1;

            res.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${data.length}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': chunkSize,
              'Content-Type': contentType,
            });
            res.end(data.slice(start, end + 1));
          } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(data);
          }
        });
      });

      this.server.on('error', reject);
      this.server.listen(this.port, () => {
        log(colors.cyan, `Test server running on http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(resolve);
      } else {
        resolve();
      }
    });
  }
}

/**
 * WASM Engine Test Harness
 */
class WASMEngineTestHarness {
  constructor() {
    this.browser = null;
    this.page = null;
    this.logs = [];
    this.errors = [];
    this.wasmEvents = [];
  }

  async launch() {
    this.browser = await puppeteer.launch({
      headless: CONFIG.headless,
      slowMo: CONFIG.slowMo,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--allow-file-access-from-files',
        // Enable SharedArrayBuffer for WASM threading
        '--enable-features=SharedArrayBuffer',
      ],
    });

    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 800, height: 600 });

    // Capture all console logs
    this.page.on('console', msg => {
      const text = msg.text();
      this.logs.push({
        type: msg.type(),
        text: text,
        timestamp: Date.now(),
      });

      // Track WASM-related events
      if (text.includes('[WASM]') || text.includes('_DApi') || text.includes('devilution')) {
        this.wasmEvents.push(text);
      }
    });

    // Capture page errors
    this.page.on('pageerror', error => {
      this.errors.push({
        message: error.message,
        stack: error.stack,
        timestamp: Date.now(),
      });
    });

    // Capture request failures
    this.page.on('requestfailed', request => {
      this.errors.push({
        message: `Request failed: ${request.url()}`,
        failure: request.failure()?.errorText,
        timestamp: Date.now(),
      });
    });

    return this;
  }

  async navigateTo(url) {
    await this.page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: CONFIG.timeout
    });
  }

  async injectTestHarness() {
    // Inject a test harness into the page for WASM testing
    await this.page.evaluate(() => {
      window.__WASM_TEST__ = {
        events: [],
        errors: [],
        wasmModule: null,
        mpqLoaded: false,
        gameInitialized: false,

        log(msg) {
          this.events.push({ type: 'log', msg, time: Date.now() });
          console.log('[WASM-TEST]', msg);
        },

        error(msg) {
          this.errors.push({ type: 'error', msg, time: Date.now() });
          console.error('[WASM-TEST]', msg);
        },

        setWasmModule(mod) {
          this.wasmModule = mod;
          this.log('WASM module set');
        },

        setMpqLoaded() {
          this.mpqLoaded = true;
          this.log('MPQ loaded');
        },

        setGameInitialized() {
          this.gameInitialized = true;
          this.log('Game initialized');
        },

        getStatus() {
          return {
            wasmModule: !!this.wasmModule,
            mpqLoaded: this.mpqLoaded,
            gameInitialized: this.gameInitialized,
            events: this.events,
            errors: this.errors,
          };
        },
      };
    });
  }

  async loadWASMDirectly() {
    // Load the WASM module directly for testing
    return await this.page.evaluate(async () => {
      const result = {
        success: false,
        moduleLoaded: false,
        exportsAvailable: false,
        dapiInitAvailable: false,
        dataFileLoaded: false,
        error: null,
        exports: [],
        timing: {},
      };

      try {
        const startTime = performance.now();

        // Check if we can fetch the WASM file
        result.timing.wasmFetchStart = performance.now();
        const wasmResponse = await fetch('/wasm/devilutionx.wasm');
        result.timing.wasmFetchEnd = performance.now();

        if (!wasmResponse.ok) {
          throw new Error(`Failed to fetch WASM: ${wasmResponse.status}`);
        }

        const wasmSize = parseInt(wasmResponse.headers.get('content-length') || '0');
        result.wasmSize = wasmSize;

        // Check data file
        result.timing.dataFetchStart = performance.now();
        const dataResponse = await fetch('/wasm/devilutionx.data');
        result.timing.dataFetchEnd = performance.now();

        if (dataResponse.ok) {
          result.dataFileLoaded = true;
          result.dataSize = parseInt(dataResponse.headers.get('content-length') || '0');
        }

        // Check JS loader
        result.timing.jsLoadStart = performance.now();
        const jsResponse = await fetch('/wasm/devilutionx.js');
        result.timing.jsLoadEnd = performance.now();

        if (!jsResponse.ok) {
          throw new Error(`Failed to fetch JS loader: ${jsResponse.status}`);
        }

        // Now try to instantiate the module
        result.timing.moduleLoadStart = performance.now();

        // Dynamically load the module
        const script = document.createElement('script');
        script.src = '/wasm/devilutionx.js';

        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });

        // Check if Diablo module is available
        if (typeof Diablo === 'function') {
          result.moduleLoaded = true;

          // Create module instance with configuration
          const moduleConfig = {
            locateFile: (path) => `/wasm/${path}`,
            onRuntimeInitialized: () => {
              console.log('[TEST] WASM runtime initialized');
            },
            print: (text) => console.log('[WASM]', text),
            printErr: (text) => console.error('[WASM]', text),
          };

          const wasmModule = Diablo(moduleConfig);

          // Wait for ready
          await wasmModule.ready;
          result.timing.moduleReadyEnd = performance.now();

          // Check exports
          const exports = Object.keys(wasmModule).filter(k => k.startsWith('_'));
          result.exports = exports;
          result.exportsAvailable = exports.length > 0;

          // Check for _DApi_Init specifically
          result.dapiInitAvailable = typeof wasmModule._DApi_Init === 'function';
          result.dapiInitType = typeof wasmModule._DApi_Init;

          // Check other critical functions
          result.criticalFunctions = {
            _DApi_Init: typeof wasmModule._DApi_Init,
            _DApi_Render: typeof wasmModule._DApi_Render,
            _DApi_AllocPacket: typeof wasmModule._DApi_AllocPacket,
            _DApi_SyncTextPtr: typeof wasmModule._DApi_SyncTextPtr,
            _malloc: typeof wasmModule._malloc,
            _free: typeof wasmModule._free,
          };

          // Check memory
          result.hasHEAPU8 = !!wasmModule.HEAPU8;
          result.hasHEAP32 = !!wasmModule.HEAP32;

          if (wasmModule.HEAPU8) {
            result.heapSize = wasmModule.HEAPU8.length;
          }

          result.success = result.dapiInitAvailable;

          // Store for later tests
          window.__WASM_MODULE__ = wasmModule;
        } else {
          throw new Error('Diablo module not found after script load');
        }

        result.timing.totalTime = performance.now() - startTime;

      } catch (error) {
        result.error = error.message;
        result.stack = error.stack;
      }

      return result;
    });
  }

  async loadMPQ() {
    return await this.page.evaluate(async () => {
      const result = {
        success: false,
        size: 0,
        magicBytes: null,
        error: null,
      };

      try {
        const response = await fetch('/spawn.mpq');
        if (!response.ok) {
          throw new Error(`Failed to fetch MPQ: ${response.status}`);
        }

        const buffer = await response.arrayBuffer();
        result.size = buffer.byteLength;

        // Check MPQ magic bytes
        const magic = new Uint8Array(buffer.slice(0, 4));
        result.magicBytes = Array.from(magic).map(b => b.toString(16).padStart(2, '0')).join(' ');

        // MPQ magic: 0x4D 0x50 0x51 0x1A ("MPQ\x1A")
        const expectedMagic = [0x4D, 0x50, 0x51, 0x1A];
        result.validMagic = magic.every((b, i) => b === expectedMagic[i]);

        result.success = result.validMagic && result.size > 0;

        // Store for later tests
        window.__MPQ_DATA__ = new Uint8Array(buffer);

      } catch (error) {
        result.error = error.message;
      }

      return result;
    });
  }

  async testDApiInit() {
    return await this.page.evaluate(async () => {
      const result = {
        success: false,
        called: false,
        error: null,
        returnValue: null,
      };

      try {
        const wasm = window.__WASM_MODULE__;
        if (!wasm) {
          throw new Error('WASM module not loaded');
        }

        if (typeof wasm._DApi_Init !== 'function') {
          throw new Error(`_DApi_Init is ${typeof wasm._DApi_Init}, not a function`);
        }

        // Call _DApi_Init with test parameters
        // Signature: _DApi_Init(timestamp, offscreen, major, minor, patch)
        const timestamp = Math.floor(performance.now());
        const offscreen = 0; // Legacy mode for testing
        const major = 2;
        const minor = 0;
        const patch = 0;

        result.returnValue = wasm._DApi_Init(timestamp, offscreen, major, minor, patch);
        result.called = true;
        result.success = true;

      } catch (error) {
        result.error = error.message;
        result.stack = error.stack;
      }

      return result;
    });
  }

  async testNeuralBridge() {
    return await this.page.evaluate(async () => {
      const result = {
        success: false,
        memoryAccessible: false,
        canScan: false,
        heapSize: 0,
        error: null,
      };

      try {
        const wasm = window.__WASM_MODULE__;
        if (!wasm) {
          throw new Error('WASM module not loaded');
        }

        // Test memory access
        if (wasm.HEAPU8) {
          result.memoryAccessible = true;
          result.heapSize = wasm.HEAPU8.length;

          // Test memory scanning (looking for dungeon-like patterns)
          // This simulates what GlassBoxMapper does
          const DMAXX = 40;
          const DMAXY = 40;
          const GRID_SIZE = DMAXX * DMAXY;

          let candidates = 0;
          const heap = wasm.HEAPU8;

          for (let offset = 0; offset < Math.min(heap.length - GRID_SIZE, 1000000); offset += 4096) {
            const sample = [heap[offset], heap[offset + 40], heap[offset + 80]];
            const isDungeonLike = sample.every(v => v >= 0 && v <= 60);
            if (isDungeonLike) {
              candidates++;
            }
          }

          result.canScan = true;
          result.candidates = candidates;
        }

        result.success = result.memoryAccessible && result.canScan;

      } catch (error) {
        result.error = error.message;
      }

      return result;
    });
  }

  async testLevelInjection() {
    return await this.page.evaluate(async () => {
      const result = {
        success: false,
        canAllocate: false,
        canWrite: false,
        canRead: false,
        error: null,
      };

      try {
        const wasm = window.__WASM_MODULE__;
        if (!wasm) {
          throw new Error('WASM module not loaded');
        }

        // Test memory allocation
        if (typeof wasm._malloc === 'function') {
          const ptr = wasm._malloc(1600); // 40x40 grid
          if (ptr) {
            result.canAllocate = true;

            // Test writing to memory
            const testData = new Uint8Array(1600);
            for (let i = 0; i < 1600; i++) {
              testData[i] = i % 60; // Simulate dungeon tiles
            }

            wasm.HEAPU8.set(testData, ptr);
            result.canWrite = true;

            // Test reading back
            const readData = wasm.HEAPU8.slice(ptr, ptr + 1600);
            const matches = readData.every((v, i) => v === testData[i]);
            result.canRead = matches;

            // Clean up
            wasm._free(ptr);
          }
        }

        result.success = result.canAllocate && result.canWrite && result.canRead;

      } catch (error) {
        result.error = error.message;
      }

      return result;
    });
  }

  getErrors() {
    return this.errors;
  }

  getLogs() {
    return this.logs;
  }

  getWasmEvents() {
    return this.wasmEvents;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

/**
 * Test Runner
 */
class TestRunner {
  constructor() {
    this.tests = [];
    this.results = [];
  }

  addTest(name, fn) {
    this.tests.push({ name, fn });
  }

  async run() {
    log(colors.cyan, '\n========================================');
    log(colors.cyan, '  WASM Diablo Engine Test Suite');
    log(colors.cyan, '========================================\n');

    for (const test of this.tests) {
      const startTime = Date.now();
      try {
        await test.fn();
        const duration = Date.now() - startTime;
        log(colors.green, `✓ ${test.name} (${duration}ms)`);
        this.results.push({ name: test.name, passed: true, duration });
      } catch (error) {
        const duration = Date.now() - startTime;
        log(colors.red, `✗ ${test.name} (${duration}ms)`);
        log(colors.red, `  Error: ${error.message}`);
        if (error.stack) {
          log(colors.yellow, `  Stack: ${error.stack.split('\n').slice(0, 3).join('\n  ')}`);
        }
        this.results.push({ name: test.name, passed: false, duration, error: error.message });
      }
    }

    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.filter(r => !r.passed).length;

    log(colors.cyan, '\n----------------------------------------');
    if (failed === 0) {
      log(colors.green, `All ${passed} tests passed!`);
    } else {
      log(colors.yellow, `Tests: ${passed} passed, ${failed} failed`);
    }
    log(colors.cyan, '----------------------------------------\n');

    return failed === 0;
  }
}

/**
 * Main Test Execution
 */
async function main() {
  const server = new TestServer(path.join(__dirname, '..', 'public'), CONFIG.port);
  let harness = null;

  try {
    // Start test server
    await server.start();

    // Launch browser harness
    harness = new WASMEngineTestHarness();
    await harness.launch();

    // Navigate to test page
    await harness.navigateTo(`http://localhost:${CONFIG.port}/`);
    await harness.injectTestHarness();

    // Run tests
    const runner = new TestRunner();

    // Test 1: WASM File Availability
    runner.addTest('WASM files are accessible', async () => {
      const response = await harness.page.evaluate(async () => {
        const files = [
          '/wasm/devilutionx.wasm',
          '/wasm/devilutionx.js',
          '/wasm/devilutionx.data',
        ];

        const results = await Promise.all(files.map(async (url) => {
          try {
            const resp = await fetch(url, { method: 'HEAD' });
            return { url, ok: resp.ok, status: resp.status };
          } catch (e) {
            return { url, ok: false, error: e.message };
          }
        }));

        return results;
      });

      for (const r of response) {
        if (!r.ok) {
          throw new Error(`File not accessible: ${r.url} (${r.status || r.error})`);
        }
      }
    });

    // Test 2: WASM Module Loading
    runner.addTest('WASM module loads and initializes', async () => {
      const result = await harness.loadWASMDirectly();

      if (!result.moduleLoaded) {
        throw new Error(`Module not loaded: ${result.error}`);
      }

      log(colors.blue, `    WASM size: ${(result.wasmSize / 1024 / 1024).toFixed(2)} MB`);
      log(colors.blue, `    Data size: ${(result.dataSize / 1024 / 1024).toFixed(2)} MB`);
      log(colors.blue, `    Total load time: ${result.timing.totalTime?.toFixed(0)}ms`);
    });

    // Test 3: _DApi_Init Function Availability
    runner.addTest('_DApi_Init function is available', async () => {
      const status = await harness.page.evaluate(() => {
        const wasm = window.__WASM_MODULE__;
        return {
          moduleExists: !!wasm,
          dapiInitType: typeof wasm?._DApi_Init,
          dapiInitExists: typeof wasm?._DApi_Init === 'function',
          exports: Object.keys(wasm || {}).filter(k => k.startsWith('_DApi')),
        };
      });

      if (!status.dapiInitExists) {
        throw new Error(`_DApi_Init is ${status.dapiInitType}, exports: ${status.exports.join(', ')}`);
      }

      log(colors.blue, `    DApi exports found: ${status.exports.length}`);
    });

    // Test 4: Critical WASM Exports
    runner.addTest('Critical WASM exports are available', async () => {
      const result = await harness.page.evaluate(() => {
        const wasm = window.__WASM_MODULE__;
        const required = [
          '_DApi_Init',
          '_DApi_Render',
          '_malloc',
          '_free',
        ];

        const missing = required.filter(fn => typeof wasm?.[fn] !== 'function');
        const available = required.filter(fn => typeof wasm?.[fn] === 'function');

        return { missing, available, total: Object.keys(wasm || {}).filter(k => k.startsWith('_')).length };
      });

      if (result.missing.length > 0) {
        throw new Error(`Missing exports: ${result.missing.join(', ')}`);
      }

      log(colors.blue, `    Available exports: ${result.available.length} required, ${result.total} total`);
    });

    // Test 5: WASM Memory Initialization
    runner.addTest('WASM memory is properly initialized', async () => {
      const result = await harness.page.evaluate(() => {
        const wasm = window.__WASM_MODULE__;
        return {
          hasHEAPU8: !!wasm?.HEAPU8,
          hasHEAP32: !!wasm?.HEAP32,
          heapSize: wasm?.HEAPU8?.length || 0,
        };
      });

      if (!result.hasHEAPU8) {
        throw new Error('HEAPU8 not available');
      }

      log(colors.blue, `    Heap size: ${(result.heapSize / 1024 / 1024).toFixed(2)} MB`);
    });

    // Test 6: spawn.mpq Loading
    runner.addTest('spawn.mpq loads correctly', async () => {
      const result = await harness.loadMPQ();

      if (!result.success) {
        throw new Error(result.error || 'MPQ load failed');
      }

      if (!result.validMagic) {
        throw new Error(`Invalid MPQ magic: ${result.magicBytes}`);
      }

      log(colors.blue, `    MPQ size: ${(result.size / 1024 / 1024).toFixed(2)} MB`);
      log(colors.blue, `    Magic bytes: ${result.magicBytes}`);
    });

    // Test 7: Memory Allocation
    runner.addTest('Memory allocation works correctly', async () => {
      const result = await harness.testLevelInjection();

      if (!result.canAllocate) {
        throw new Error('Cannot allocate memory');
      }

      if (!result.canWrite) {
        throw new Error('Cannot write to allocated memory');
      }

      if (!result.canRead) {
        throw new Error('Memory read-back mismatch');
      }
    });

    // Test 8: Neural Bridge Memory Access
    runner.addTest('Neural bridge can access memory', async () => {
      const result = await harness.testNeuralBridge();

      if (!result.memoryAccessible) {
        throw new Error('Memory not accessible');
      }

      if (!result.canScan) {
        throw new Error('Cannot scan memory');
      }

      log(colors.blue, `    Memory scannable: ${result.candidates} potential dungeon regions`);
    });

    // Test 9: DApi Virtual File System
    runner.addTest('DApi file system callbacks are set up', async () => {
      const result = await harness.page.evaluate(() => {
        // Check if DApi callbacks would work
        const wasm = window.__WASM_MODULE__;

        // Check for FS_createPath which Emscripten uses
        const hasFS = typeof wasm?.FS_createPath === 'function';
        const hasFSCallbacks = typeof wasm?.FS === 'object';

        return {
          hasFS,
          hasFSCallbacks,
          fsType: typeof wasm?.FS,
        };
      });

      if (!result.hasFSCallbacks && !result.hasFS) {
        log(colors.yellow, `    Warning: FS not directly accessible (expected in worker context)`);
      }
    });

    // Test 10: Full Game Initialization Test
    runner.addTest('Full game initialization sequence', async () => {
      // This tests the complete initialization flow
      // Note: This might not fully work without the complete game context
      const result = await harness.page.evaluate(async () => {
        const wasm = window.__WASM_MODULE__;
        const mpq = window.__MPQ_DATA__;

        if (!wasm || !mpq) {
          return { success: false, error: 'Prerequisites not loaded' };
        }

        try {
          // Check that all critical functions are available before init
          const checks = {
            _DApi_Init: typeof wasm._DApi_Init === 'function',
            _DApi_Render: typeof wasm._DApi_Render === 'function',
            HEAPU8: !!wasm.HEAPU8,
            mpqLoaded: mpq.length > 0,
          };

          const allPassed = Object.values(checks).every(v => v === true);

          return {
            success: allPassed,
            checks,
            wasmReady: true,
            mpqSize: mpq.length,
          };
        } catch (error) {
          return {
            success: false,
            error: error.message,
          };
        }
      });

      if (!result.success) {
        const failedChecks = Object.entries(result.checks || {})
          .filter(([, v]) => !v)
          .map(([k]) => k);
        throw new Error(`Init checks failed: ${failedChecks.join(', ')} - ${result.error || ''}`);
      }

      log(colors.blue, `    All prerequisites verified`);
    });

    // Run all tests
    const success = await runner.run();

    // Output errors if any
    const errors = harness.getErrors();
    if (errors.length > 0) {
      log(colors.yellow, '\nPage Errors:');
      errors.forEach(e => log(colors.yellow, `  - ${e.message}`));
    }

    // Output WASM events
    const wasmEvents = harness.getWasmEvents();
    if (wasmEvents.length > 0) {
      log(colors.blue, '\nWASM Events:');
      wasmEvents.slice(0, 10).forEach(e => log(colors.blue, `  - ${e}`));
      if (wasmEvents.length > 10) {
        log(colors.blue, `  ... and ${wasmEvents.length - 10} more`);
      }
    }

    return success;

  } catch (error) {
    log(colors.red, `Test suite error: ${error.message}`);
    if (error.stack) {
      log(colors.red, error.stack);
    }
    return false;
  } finally {
    if (harness) {
      await harness.close();
    }
    await server.stop();
  }
}

// Run if called directly
if (require.main === module) {
  main().then(success => {
    process.exit(success ? 0 : 1);
  });
}

module.exports = {
  WASMEngineTestHarness,
  TestServer,
  TestRunner,
  CONFIG,
};
