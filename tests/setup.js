/**
 * Jest Test Setup
 *
 * Configures the test environment for Neural Augmentation tests.
 */

// Increase timeout for integration tests
jest.setTimeout(60000);

// Mock browser APIs that may not exist in Node.js
if (typeof window === 'undefined') {
  global.window = {};
}

if (typeof document === 'undefined') {
  global.document = {
    createElement: (tag) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            fillRect: jest.fn(),
            fillStyle: '',
            beginPath: jest.fn(),
            arc: jest.fn(),
            fill: jest.fn(),
            drawImage: jest.fn(),
            getImageData: (x, y, w, h) => ({
              width: w,
              height: h,
              data: new Uint8ClampedArray(w * h * 4),
            }),
            putImageData: jest.fn(),
            createImageData: (w, h) => ({
              width: w,
              height: h,
              data: new Uint8ClampedArray(w * h * 4),
            }),
          }),
          appendChild: jest.fn(),
        };
      }
      return {};
    },
    querySelector: jest.fn(),
  };
}

if (typeof Image === 'undefined') {
  global.Image = class Image {
    constructor() {
      this.onload = null;
      this.onerror = null;
      this.src = '';
    }

    set src(value) {
      this._src = value;
      // Simulate async load
      setTimeout(() => {
        if (this.onload) this.onload();
      }, 0);
    }

    get src() {
      return this._src;
    }
  };
}

if (typeof ImageData === 'undefined') {
  global.ImageData = class ImageData {
    constructor(widthOrData, heightOrWidth, height) {
      if (typeof widthOrData === 'number') {
        this.width = widthOrData;
        this.height = heightOrWidth;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        this.data = widthOrData;
        this.width = heightOrWidth;
        this.height = height || 1;
      }
    }
  };
}

// Mock fetch API
global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  })
);

// Mock performance API
if (typeof performance === 'undefined' || !performance.now) {
  global.performance = {
    now: () => Date.now(),
    memory: {
      usedJSHeapSize: 0,
      totalJSHeapSize: 0,
      jsHeapSizeLimit: 0,
    },
  };
}

// Mock console methods for cleaner test output
const originalConsole = { ...console };
global.console = {
  ...originalConsole,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Restore console for debugging when needed
global.enableConsole = () => {
  global.console = originalConsole;
};

// Clean up after each test
afterEach(() => {
  jest.clearAllMocks();
});

// Global test utilities
global.testUtils = {
  // Create a mock WASM module
  createMockWasm: () => ({
    HEAPU8: new Uint8Array(1024 * 1024), // 1MB heap
    HEAPU16: new Uint16Array(512 * 1024),
    HEAPU32: new Uint32Array(256 * 1024),
    HEAP8: new Int8Array(1024 * 1024),
    HEAP16: new Int16Array(512 * 1024),
    HEAP32: new Int32Array(256 * 1024),
    HEAPF32: new Float32Array(256 * 1024),
    HEAPF64: new Float64Array(128 * 1024),
    _DApi_Init: jest.fn(),
    _DApi_Render: jest.fn(),
    _DApi_Mouse: jest.fn(),
    _DApi_Key: jest.fn(),
    ready: Promise.resolve(),
  }),

  // Create a mock game state
  createMockGameState: () => ({
    player: {
      x: 50,
      y: 50,
      hp: 100,
      maxHp: 100,
      mana: 50,
      maxMana: 50,
      level: 5,
      class: 0,
      gold: 1000,
    },
    monsters: [],
    level: {
      type: 1,
      depth: 3,
      grid: null,
    },
    quests: [],
  }),

  // Generate a random dungeon grid
  generateRandomGrid: (width = 40, height = 40) => {
    const grid = [];
    for (let y = 0; y < height; y++) {
      const row = [];
      for (let x = 0; x < width; x++) {
        // Border is always wall
        if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
          row.push(1);
        } else {
          row.push(Math.random() > 0.3 ? 0 : 1);
        }
      }
      grid.push(row);
    }
    return grid;
  },

  // Wait for a condition
  waitFor: async (condition, timeout = 5000, interval = 100) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await condition()) return true;
      await new Promise(r => setTimeout(r, interval));
    }
    return false;
  },

  // Delay utility
  delay: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
};

// Export test utilities
module.exports = global.testUtils;
