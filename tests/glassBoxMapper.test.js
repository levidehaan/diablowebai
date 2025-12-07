/**
 * Tests for GlassBoxMapper
 *
 * Tests the Glass Box memory pattern matching system
 * that discovers and manipulates game structures in WASM memory.
 */

describe('GlassBoxMapper', () => {
  let GlassBoxMapper, glassBoxMapper;

  beforeAll(() => {
    // Import the module
    const module = require('../src/neural/GlassBoxMapper');
    GlassBoxMapper = module.GlassBoxMapper;
    glassBoxMapper = module.default;
  });

  describe('Constants', () => {
    test('should export correct constants', () => {
      const { DMAXX, DMAXY, MAXDUNX, MAXDUNY, MAXMONSTERS, MAXOBJECTS } = require('../src/neural/GlassBoxMapper');

      expect(DMAXX).toBe(40);
      expect(DMAXY).toBe(40);
      expect(MAXDUNX).toBe(112);
      expect(MAXDUNY).toBe(112);
      expect(MAXMONSTERS).toBe(200);
      expect(MAXOBJECTS).toBe(127);
    });
  });

  describe('GlassBoxMapper Class', () => {
    let mapper;

    beforeEach(() => {
      mapper = new GlassBoxMapper();
    });

    test('should initialize with null values', () => {
      expect(mapper.wasm).toBeNull();
      expect(mapper.heap).toBeNull();
      expect(mapper.discovered.dungeon).toBeNull();
    });

    test('should fail initialization without wasm module', () => {
      const result = mapper.initialize(null);
      expect(result).toBe(false);
    });

    test('should fail initialization without HEAPU8', () => {
      const result = mapper.initialize({ someProp: true });
      expect(result).toBe(false);
    });

    test('should initialize with valid mock wasm module', () => {
      const mockHeap = new Uint8Array(1024 * 1024); // 1MB
      const mockWasm = {
        HEAPU8: mockHeap,
        HEAP32: new Int32Array(mockHeap.buffer),
      };

      const result = mapper.initialize(mockWasm);
      expect(result).toBe(true);
      expect(mapper.heap).toBe(mockHeap);
    });

    test('getStatus should return correct structure', () => {
      const status = mapper.getStatus();

      expect(status).toHaveProperty('initialized');
      expect(status).toHaveProperty('heapSize');
      expect(status).toHaveProperty('discovered');
      expect(status).toHaveProperty('lastScanTime');
    });
  });

  describe('Memory Scanning', () => {
    let mapper;
    let mockHeap;
    let mockWasm;

    beforeEach(() => {
      mapper = new GlassBoxMapper();
      // Create a larger heap to simulate real WASM memory
      mockHeap = new Uint8Array(4 * 1024 * 1024); // 4MB
      mockWasm = {
        HEAPU8: mockHeap,
        HEAP32: new Int32Array(mockHeap.buffer),
      };
    });

    test('fullScan should fail if not initialized', () => {
      const result = mapper.fullScan();
      expect(result.success).toBe(false);
    });

    test('fullScan should work on empty memory', () => {
      mapper.initialize(mockWasm);
      const result = mapper.fullScan();

      // Should complete without error but may not find anything
      expect(result).toHaveProperty('success');
      expect(result).toHaveProperty('scanTime');
    });

    test('scoreDungeonCandidate should score valid dungeon patterns', () => {
      mapper.initialize(mockWasm);

      // Create a dungeon-like pattern at offset 10000
      const offset = 10000;
      const DMAXX = 40;
      const DMAXY = 40;

      // Fill with floor tiles (13-15) and walls (1-12)
      for (let y = 0; y < DMAXY; y++) {
        for (let x = 0; x < DMAXX; x++) {
          const i = offset + y * DMAXX + x;

          // Border walls
          if (x === 0 || x === 39 || y === 0 || y === 39) {
            mockHeap[i] = 1 + Math.floor(Math.random() * 12); // Wall
          } else {
            mockHeap[i] = 13 + Math.floor(Math.random() * 3); // Floor
          }
        }
      }

      // Add stairs
      mockHeap[offset + 5 * DMAXX + 5] = 36; // Stairs up
      mockHeap[offset + 35 * DMAXX + 35] = 37; // Stairs down

      const score = mapper.scoreDungeonCandidate(offset);
      expect(score).toBeGreaterThan(100); // Should have a positive score
    });

    test('scoreDungeonCandidate should reject invalid patterns', () => {
      mapper.initialize(mockWasm);

      // Fill with high values (invalid tiles)
      const offset = 20000;
      for (let i = 0; i < 1600; i++) {
        mockHeap[offset + i] = 200; // Invalid tile value
      }

      const score = mapper.scoreDungeonCandidate(offset);
      expect(score).toBe(0);
    });
  });

  describe('Grid Operations', () => {
    let mapper;
    let mockHeap;
    let mockWasm;

    beforeEach(() => {
      mapper = new GlassBoxMapper();
      mockHeap = new Uint8Array(1024 * 1024);
      mockWasm = {
        HEAPU8: mockHeap,
        HEAP32: new Int32Array(mockHeap.buffer),
      };
      mapper.initialize(mockWasm);
    });

    test('readDungeonGrid should return null if dungeon not discovered', () => {
      const grid = mapper.readDungeonGrid();
      expect(grid).toBeNull();
    });

    test('writeDungeonGrid should return false if dungeon not discovered', () => {
      const grid = Array(40).fill().map(() => Array(40).fill(1));
      const result = mapper.writeDungeonGrid(grid);
      expect(result).toBe(false);
    });

    test('readDungeonGrid should work after discovery', () => {
      // Manually set discovered offset
      mapper.discovered.dungeon = 5000;

      // Fill with test data
      for (let y = 0; y < 40; y++) {
        for (let x = 0; x < 40; x++) {
          mockHeap[5000 + y * 40 + x] = (x + y) % 60;
        }
      }

      const grid = mapper.readDungeonGrid();

      expect(grid).not.toBeNull();
      expect(grid.length).toBe(40);
      expect(grid[0].length).toBe(40);
      expect(grid[0][0]).toBe(0);
      expect(grid[1][1]).toBe(2);
    });

    test('writeDungeonGrid should modify memory', () => {
      mapper.discovered.dungeon = 5000;

      const grid = Array(40).fill().map(() => Array(40).fill(15));
      const result = mapper.writeDungeonGrid(grid);

      expect(result).toBe(true);

      // Verify memory was modified
      for (let i = 0; i < 1600; i++) {
        expect(mockHeap[5000 + i]).toBe(15);
      }
    });

    test('writeTile should work for valid coordinates', () => {
      mapper.discovered.dungeon = 5000;

      const result = mapper.writeTile(10, 10, 42);
      expect(result).toBe(true);

      expect(mockHeap[5000 + 10 * 40 + 10]).toBe(42);
    });

    test('writeTile should fail for invalid coordinates', () => {
      mapper.discovered.dungeon = 5000;

      expect(mapper.writeTile(-1, 10, 42)).toBe(false);
      expect(mapper.writeTile(10, 50, 42)).toBe(false);
      expect(mapper.writeTile(100, 10, 42)).toBe(false);
    });
  });

  describe('Int32 Read/Write', () => {
    let mapper;
    let mockHeap;

    beforeEach(() => {
      mapper = new GlassBoxMapper();
      mockHeap = new Uint8Array(1024);
      const mockWasm = {
        HEAPU8: mockHeap,
        HEAP32: new Int32Array(mockHeap.buffer),
      };
      mapper.initialize(mockWasm);
    });

    test('readInt32 should correctly read 32-bit integers', () => {
      // Write a known value using DataView for correctness
      const view = new DataView(mockHeap.buffer);
      view.setInt32(100, 12345678, true); // little-endian

      const result = mapper.readInt32(100);
      expect(result).toBe(12345678);
    });

    test('writeInt32 should correctly write 32-bit integers', () => {
      mapper.writeInt32(100, 87654321);

      // Read back using DataView
      const view = new DataView(mockHeap.buffer);
      const result = view.getInt32(100, true);
      expect(result).toBe(87654321);
    });

    test('readInt32/writeInt32 round-trip should work', () => {
      const testValues = [0, 1, -1, 255, 256, 65535, -32768, 2147483647, -2147483648];

      testValues.forEach((value, i) => {
        const offset = i * 4;
        mapper.writeInt32(offset, value);
        expect(mapper.readInt32(offset)).toBe(value);
      });
    });
  });

  describe('Singleton Instance', () => {
    test('should export a singleton instance', () => {
      expect(glassBoxMapper).toBeDefined();
      expect(glassBoxMapper instanceof GlassBoxMapper).toBe(true);
    });

    test('singleton should have same methods as class', () => {
      expect(typeof glassBoxMapper.initialize).toBe('function');
      expect(typeof glassBoxMapper.fullScan).toBe('function');
      expect(typeof glassBoxMapper.readDungeonGrid).toBe('function');
      expect(typeof glassBoxMapper.writeDungeonGrid).toBe('function');
      expect(typeof glassBoxMapper.getStatus).toBe('function');
    });
  });
});
