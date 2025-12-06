/**
 * Unit Tests for Preset Asset Library System
 *
 * Tests the preset library, layered compositor, path weaver,
 * macro processor, seed expander, and local simulator modules.
 */

// Mock browser APIs for Node.js environment
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

global.performance = {
  now: () => Date.now(),
};

// Mock IndexedDB for storage tests
const mockIDBData = new Map();
const mockObjectStore = {
  put: jest.fn((data) => ({
    onsuccess: null,
    onerror: null,
    result: data.id,
    get error() { return null; },
    set onsuccess(cb) { cb && cb(); },
  })),
  get: jest.fn((id) => ({
    onsuccess: null,
    onerror: null,
    result: mockIDBData.get(id),
    get error() { return null; },
    set onsuccess(cb) { cb && cb(); },
  })),
  delete: jest.fn(() => ({
    onsuccess: null,
    onerror: null,
    get error() { return null; },
    set onsuccess(cb) { cb && cb(); },
  })),
  openCursor: jest.fn(() => ({
    onsuccess: null,
    onerror: null,
    result: null,
    get error() { return null; },
    set onsuccess(cb) { cb && cb({ target: { result: null } }); },
  })),
  count: jest.fn(() => ({
    onsuccess: null,
    onerror: null,
    result: mockIDBData.size,
    get error() { return null; },
    set onsuccess(cb) { cb && cb(); },
  })),
  clear: jest.fn(() => ({
    onsuccess: null,
    onerror: null,
    get error() { return null; },
    set onsuccess(cb) { mockIDBData.clear(); cb && cb(); },
  })),
  index: jest.fn(() => mockObjectStore),
  createIndex: jest.fn(),
};

const mockTransaction = {
  objectStore: jest.fn(() => mockObjectStore),
};

const mockDB = {
  transaction: jest.fn(() => mockTransaction),
  objectStoreNames: { contains: jest.fn(() => false) },
  createObjectStore: jest.fn(() => mockObjectStore),
  close: jest.fn(),
};

global.indexedDB = {
  open: jest.fn(() => ({
    onsuccess: null,
    onerror: null,
    onupgradeneeded: null,
    result: mockDB,
    get error() { return null; },
    set onsuccess(cb) { cb && cb(); },
    set onupgradeneeded(cb) { cb && cb({ target: { result: mockDB } }); },
  })),
};

global.IDBKeyRange = {
  only: jest.fn((val) => ({ value: val })),
  upperBound: jest.fn((val) => ({ upper: val })),
};

describe('PresetLibrary', () => {
  let PresetLibrary, SeededRandom, PRESET_LIBRARY, presetEngine, poissonDiskSampling;

  beforeAll(async () => {
    jest.resetModules();
    const module = await import('../src/neural/PresetLibrary.js');
    PresetLibrary = module;
    SeededRandom = module.SeededRandom;
    PRESET_LIBRARY = module.PRESET_LIBRARY;
    presetEngine = module.presetEngine;
    poissonDiskSampling = module.poissonDiskSampling;
  });

  describe('SeededRandom', () => {
    test('should produce deterministic results with same seed', () => {
      const rng1 = new SeededRandom(12345);
      const rng2 = new SeededRandom(12345);

      const values1 = [rng1.next(), rng1.next(), rng1.next()];
      const values2 = [rng2.next(), rng2.next(), rng2.next()];

      expect(values1).toEqual(values2);
    });

    test('should produce different results with different seeds', () => {
      const rng1 = new SeededRandom(12345);
      const rng2 = new SeededRandom(54321);

      const val1 = rng1.next();
      const val2 = rng2.next();

      expect(val1).not.toBe(val2);
    });

    test('random() should return values between 0 and 1', () => {
      const rng = new SeededRandom(42);

      for (let i = 0; i < 100; i++) {
        const val = rng.random();
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThan(1);
      }
    });

    test('randomInt should return values within range', () => {
      const rng = new SeededRandom(42);

      for (let i = 0; i < 100; i++) {
        const val = rng.randomInt(5, 15);
        expect(val).toBeGreaterThanOrEqual(5);
        expect(val).toBeLessThan(15);
      }
    });

    test('pick should select from array', () => {
      const rng = new SeededRandom(42);
      const options = ['a', 'b', 'c', 'd'];

      for (let i = 0; i < 20; i++) {
        const val = rng.pick(options);
        expect(options).toContain(val);
      }
    });

    test('shuffle should return all elements', () => {
      const rng = new SeededRandom(42);
      const original = [1, 2, 3, 4, 5];
      const shuffled = rng.shuffle([...original]);

      expect(shuffled.length).toBe(original.length);
      expect(shuffled.sort()).toEqual(original.sort());
    });
  });

  describe('PRESET_LIBRARY', () => {
    test('should have town_cluster preset', () => {
      expect(PRESET_LIBRARY.town_cluster).toBeDefined();
      expect(PRESET_LIBRARY.town_cluster.name).toBe('town_cluster');
      expect(PRESET_LIBRARY.town_cluster.defaults).toBeDefined();
      expect(typeof PRESET_LIBRARY.town_cluster.generate).toBe('function');
    });

    test('should have forest_patch preset', () => {
      expect(PRESET_LIBRARY.forest_patch).toBeDefined();
      expect(PRESET_LIBRARY.forest_patch.name).toBe('forest_patch');
    });

    test('should have trail_segment preset', () => {
      expect(PRESET_LIBRARY.trail_segment).toBeDefined();
      expect(PRESET_LIBRARY.trail_segment.name).toBe('trail_segment');
    });

    test('should have room_cluster preset', () => {
      expect(PRESET_LIBRARY.room_cluster).toBeDefined();
      expect(PRESET_LIBRARY.room_cluster.category).toBe('dungeon');
    });

    test('should have monster_group preset', () => {
      expect(PRESET_LIBRARY.monster_group).toBeDefined();
      expect(PRESET_LIBRARY.monster_group.category).toBe('entity');
    });
  });

  describe('PresetEngine', () => {
    test('should instantiate town_cluster preset', () => {
      const grid = createTestGrid(30, 30);
      const result = presetEngine.instantiate(grid, 'town_cluster', {
        seed: 12345,
        x: 5,
        y: 5,
      });

      expect(result).toBeDefined();
      expect(result.preset).toBe('town_cluster');
      expect(result.placements).toBeDefined();
      expect(Array.isArray(result.placements)).toBe(true);
    });

    test('should instantiate forest_patch preset', () => {
      const grid = createTestGrid(30, 30);
      const result = presetEngine.instantiate(grid, 'forest_patch', {
        seed: 12345,
        density: 0.3,
      });

      expect(result).toBeDefined();
      expect(result.preset).toBe('forest_patch');
    });

    test('should return null for unknown preset', () => {
      const grid = createTestGrid(20, 20);
      const result = presetEngine.instantiate(grid, 'nonexistent_preset', {});

      expect(result).toBeNull();
    });

    test('should merge params with defaults', () => {
      const grid = createTestGrid(30, 30);

      // Default building count is 4, override to 2
      const result = presetEngine.instantiate(grid, 'town_cluster', {
        seed: 12345,
        buildingCount: 2,
      });

      expect(result).toBeDefined();
    });
  });

  describe('poissonDiskSampling', () => {
    test('should generate points with minimum distance', () => {
      const points = poissonDiskSampling(50, 50, 8, 30, new SeededRandom(42));

      expect(points.length).toBeGreaterThan(0);

      // Check all points are within bounds
      for (const p of points) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThan(50);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThan(50);
      }

      // Check minimum distance is maintained
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          const dx = points[i].x - points[j].x;
          const dy = points[i].y - points[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          expect(dist).toBeGreaterThanOrEqual(8 - 0.001); // Allow small floating point error
        }
      }
    });

    test('should be deterministic with same seed', () => {
      const points1 = poissonDiskSampling(30, 30, 5, 30, new SeededRandom(42));
      const points2 = poissonDiskSampling(30, 30, 5, 30, new SeededRandom(42));

      expect(points1.length).toBe(points2.length);
      for (let i = 0; i < points1.length; i++) {
        expect(points1[i].x).toBe(points2[i].x);
        expect(points1[i].y).toBe(points2[i].y);
      }
    });
  });
});

describe('LayeredCompositor', () => {
  let LayeredCompositor, BlueprintBuilder, LAYER_TYPES, BIOMES, compositor;

  beforeAll(async () => {
    jest.resetModules();
    const module = await import('../src/neural/LayeredCompositor.js');
    LayeredCompositor = module.LayeredCompositor;
    BlueprintBuilder = module.BlueprintBuilder;
    LAYER_TYPES = module.LAYER_TYPES;
    BIOMES = module.BIOMES;
    compositor = module.compositor;
  });

  describe('LAYER_TYPES', () => {
    test('should have all required layer types', () => {
      expect(LAYER_TYPES.TERRAIN).toBeDefined();
      expect(LAYER_TYPES.STRUCTURES).toBeDefined();
      expect(LAYER_TYPES.PATHS).toBeDefined();
      expect(LAYER_TYPES.FOLIAGE).toBeDefined();
      expect(LAYER_TYPES.OBJECTS).toBeDefined();
      expect(LAYER_TYPES.ENTITIES).toBeDefined();
      expect(LAYER_TYPES.LIGHTING).toBeDefined();
      expect(LAYER_TYPES.SPECIAL).toBeDefined();
    });

    test('layer types should have correct priority order', () => {
      expect(LAYER_TYPES.TERRAIN.priority).toBe(0);
      expect(LAYER_TYPES.STRUCTURES.priority).toBe(1);
      expect(LAYER_TYPES.PATHS.priority).toBe(2);
      expect(LAYER_TYPES.FOLIAGE.priority).toBe(3);
    });
  });

  describe('BIOMES', () => {
    test('should have biome configurations', () => {
      expect(BIOMES.PLAINS).toBeDefined();
      expect(BIOMES.FOREST).toBeDefined();
      expect(BIOMES.UNDERGROUND).toBeDefined();
      expect(BIOMES.CORRUPTED).toBeDefined();
    });

    test('biomes should have required properties', () => {
      expect(BIOMES.PLAINS.name).toBe('plains');
      expect(BIOMES.PLAINS.baseTile).toBeDefined();
      expect(BIOMES.PLAINS.wallTile).toBeDefined();
      expect(Array.isArray(BIOMES.PLAINS.ambientObjects)).toBe(true);
    });
  });

  describe('BlueprintBuilder', () => {
    test('should create blueprint with dimensions', () => {
      const builder = new BlueprintBuilder(40, 40);
      const blueprint = builder.build();

      expect(blueprint.width).toBe(40);
      expect(blueprint.height).toBe(40);
    });

    test('should support fluent API', () => {
      const blueprint = new BlueprintBuilder(30, 30)
        .seed(12345)
        .terrain(BIOMES.PLAINS)
        .structures({ presets: ['town_cluster:5'] })
        .foliage(0.2)
        .build();

      expect(blueprint.seed).toBe(12345);
      expect(blueprint.layers.length).toBeGreaterThan(0);
    });

    test('should add layers in correct order', () => {
      const blueprint = new BlueprintBuilder(30, 30)
        .seed(42)
        .terrain(BIOMES.FOREST)
        .structures({ presets: [] })
        .paths({ preset: 'winding' })
        .foliage(0.3)
        .objects([{ type: 'chest', x: 10, y: 10 }])
        .entities([{ type: 'skeleton', x: 15, y: 15 }])
        .build();

      // Layers should be added
      expect(blueprint.layers.length).toBeGreaterThanOrEqual(5);
    });
  });

  describe('LayeredCompositor', () => {
    test('should compose layers into grid', () => {
      const blueprint = new BlueprintBuilder(20, 20)
        .seed(42)
        .terrain(BIOMES.PLAINS)
        .build();

      const result = compositor.compose(blueprint);

      expect(result).toBeDefined();
      expect(result.grid).toBeDefined();
      expect(result.grid.length).toBe(20);
      expect(result.grid[0].length).toBe(20);
    });

    test('should track metadata', () => {
      const blueprint = new BlueprintBuilder(20, 20)
        .seed(42)
        .terrain(BIOMES.PLAINS)
        .structures({ presets: ['room_cluster:3'] })
        .build();

      const result = compositor.compose(blueprint);

      expect(result.metadata).toBeDefined();
      expect(result.metadata.seed).toBe(42);
    });
  });
});

describe('PathWeaver', () => {
  let PathWeaver, AStarPathfinder, BezierCurve, PATH_STYLES, DungeonPaths;

  beforeAll(async () => {
    jest.resetModules();
    const module = await import('../src/neural/PathWeaver.js');
    PathWeaver = module.PathWeaver;
    AStarPathfinder = module.AStarPathfinder;
    BezierCurve = module.BezierCurve;
    PATH_STYLES = module.PATH_STYLES;
    DungeonPaths = module.DungeonPaths;
  });

  describe('BezierCurve', () => {
    test('quadratic should interpolate correctly', () => {
      const p0 = { x: 0, y: 0 };
      const p1 = { x: 5, y: 10 };
      const p2 = { x: 10, y: 0 };

      const start = BezierCurve.quadratic(p0, p1, p2, 0);
      const end = BezierCurve.quadratic(p0, p1, p2, 1);
      const mid = BezierCurve.quadratic(p0, p1, p2, 0.5);

      expect(start.x).toBeCloseTo(0);
      expect(start.y).toBeCloseTo(0);
      expect(end.x).toBeCloseTo(10);
      expect(end.y).toBeCloseTo(0);
      expect(mid.y).toBeGreaterThan(0); // Curve should peak in middle
    });

    test('cubic should interpolate correctly', () => {
      const p0 = { x: 0, y: 0 };
      const p1 = { x: 3, y: 5 };
      const p2 = { x: 7, y: 5 };
      const p3 = { x: 10, y: 0 };

      const start = BezierCurve.cubic(p0, p1, p2, p3, 0);
      const end = BezierCurve.cubic(p0, p1, p2, p3, 1);

      expect(start.x).toBeCloseTo(0);
      expect(end.x).toBeCloseTo(10);
    });

    test('catmullRom should create smooth spline', () => {
      const points = [
        { x: 0, y: 0 },
        { x: 10, y: 5 },
        { x: 20, y: 0 },
        { x: 30, y: 5 },
      ];

      const spline = BezierCurve.catmullRomSpline(points, 10);

      expect(spline.length).toBeGreaterThan(points.length);
      // First and last should be near original endpoints
      expect(spline[0].x).toBeCloseTo(points[0].x, 0);
      expect(spline[spline.length - 1].x).toBeCloseTo(points[points.length - 1].x, 0);
    });
  });

  describe('AStarPathfinder', () => {
    test('should find path in simple grid', () => {
      // Create 10x10 grid with floor tiles
      const grid = createTestGrid(10, 10);

      const pathfinder = new AStarPathfinder(grid);
      const path = pathfinder.findPath(0, 0, 9, 9);

      expect(path).not.toBeNull();
      expect(path.length).toBeGreaterThan(0);
      expect(path[0]).toEqual({ x: 0, y: 0 });
      expect(path[path.length - 1]).toEqual({ x: 9, y: 9 });
    });

    test('should return null when no path exists', () => {
      // Create grid with wall blocking path
      const grid = createTestGrid(5, 5);
      // Create wall dividing grid
      for (let y = 0; y < 5; y++) {
        grid[y][2] = 1; // wall
      }

      const pathfinder = new AStarPathfinder(grid);
      const path = pathfinder.findPath(0, 2, 4, 2);

      expect(path).toBeNull();
    });

    test('should avoid obstacles', () => {
      const grid = createTestGrid(10, 10);
      // Add obstacle
      grid[5][5] = 1;

      const pathfinder = new AStarPathfinder(grid);
      const path = pathfinder.findPath(3, 5, 7, 5);

      if (path) {
        // Path should not go through obstacle
        const goesThrough = path.some(p => p.x === 5 && p.y === 5);
        expect(goesThrough).toBe(false);
      }
    });
  });

  describe('PATH_STYLES', () => {
    test('should have defined path styles', () => {
      expect(PATH_STYLES.STRAIGHT).toBeDefined();
      expect(PATH_STYLES.WINDING).toBeDefined();
      expect(PATH_STYLES.FOREST).toBeDefined();
      expect(PATH_STYLES.CAVE).toBeDefined();
      expect(PATH_STYLES.CORRIDOR).toBeDefined();
    });

    test('path styles should have required properties', () => {
      expect(PATH_STYLES.WINDING.curviness).toBeDefined();
      expect(PATH_STYLES.WINDING.pathTile).toBeDefined();
    });
  });

  describe('PathWeaver class', () => {
    test('should weave path between points', () => {
      const grid = createTestGrid(30, 30);
      const weaver = new PathWeaver(grid);

      const result = weaver.weave({
        start: { x: 5, y: 5 },
        end: { x: 25, y: 25 },
        style: 'winding',
      }, { random: () => Math.random() });

      expect(result).toBeDefined();
      expect(result.path).toBeDefined();
      expect(result.path.length).toBeGreaterThan(0);
    });
  });

  describe('DungeonPaths', () => {
    test('should connect rooms with MST', () => {
      const rooms = [
        { x: 5, y: 5, width: 5, height: 5 },
        { x: 15, y: 5, width: 5, height: 5 },
        { x: 10, y: 15, width: 5, height: 5 },
      ];

      const connections = DungeonPaths.connectRoomsMST(rooms);

      expect(connections.length).toBe(2); // MST of 3 nodes = 2 edges
    });

    test('should calculate room centers', () => {
      const room = { x: 10, y: 10, width: 6, height: 8 };
      const center = DungeonPaths.getRoomCenter(room);

      expect(center.x).toBe(13);
      expect(center.y).toBe(14);
    });
  });
});

describe('MacroProcessor', () => {
  let parseMacro, parseMultipleMacros, expandShorthand, MACRO_PREFIXES, MacroProcessor;

  beforeAll(async () => {
    jest.resetModules();
    const module = await import('../src/neural/MacroProcessor.js');
    parseMacro = module.parseMacro;
    parseMultipleMacros = module.parseMultipleMacros;
    expandShorthand = module.expandShorthand;
    MACRO_PREFIXES = module.MACRO_PREFIXES;
    MacroProcessor = module.MacroProcessor;
  });

  describe('MACRO_PREFIXES', () => {
    test('should have all macro prefix types', () => {
      expect(MACRO_PREFIXES.PRESET).toBe('@');
      expect(MACRO_PREFIXES.PATH).toBe('^');
      expect(MACRO_PREFIXES.SCATTER).toBe('*');
      expect(MACRO_PREFIXES.ENTITY).toBe('#');
      expect(MACRO_PREFIXES.OBJECT).toBe('!');
      expect(MACRO_PREFIXES.MODIFIER).toBe('$');
      expect(MACRO_PREFIXES.TERRAIN).toBe('%');
      expect(MACRO_PREFIXES.COMPOSITE).toBe('&');
    });
  });

  describe('parseMacro', () => {
    test('should parse preset macro', () => {
      const result = parseMacro('@town:medium');

      expect(result).toBeDefined();
      expect(result.type).toBe('preset');
      expect(result.name).toBe('town');
      expect(result.variant).toBe('medium');
    });

    test('should parse scatter macro with count', () => {
      const result = parseMacro('*trees[50]');

      expect(result).toBeDefined();
      expect(result.type).toBe('scatter');
      expect(result.name).toBe('trees');
      expect(result.params).toBe('50');
    });

    test('should parse entity macro with position', () => {
      const result = parseMacro('#skeleton@10,15');

      expect(result).toBeDefined();
      expect(result.type).toBe('entity');
      expect(result.name).toBe('skeleton');
      expect(result.x).toBe(10);
      expect(result.y).toBe(15);
    });

    test('should parse path macro', () => {
      const result = parseMacro('^road:winding');

      expect(result).toBeDefined();
      expect(result.type).toBe('path');
      expect(result.name).toBe('road');
      expect(result.variant).toBe('winding');
    });

    test('should return null for invalid macro', () => {
      const result = parseMacro('invalid');
      expect(result).toBeNull();
    });
  });

  describe('parseMultipleMacros', () => {
    test('should parse multiple macros from string', () => {
      const result = parseMultipleMacros('@town:medium *trees[30] #skeleton@5,5');

      expect(result.length).toBe(3);
      expect(result[0].type).toBe('preset');
      expect(result[1].type).toBe('scatter');
      expect(result[2].type).toBe('entity');
    });

    test('should handle empty string', () => {
      const result = parseMultipleMacros('');
      expect(result.length).toBe(0);
    });
  });

  describe('expandShorthand', () => {
    test('should expand shorthand notation', () => {
      const expanded = expandShorthand('@T');

      expect(expanded).toBe('@town');
    });

    test('should expand multiple shorthands', () => {
      const expanded = expandShorthand('@T *t');

      expect(expanded).toContain('@town');
      expect(expanded).toContain('*trees');
    });

    test('should pass through non-shorthand notation', () => {
      const expanded = expandShorthand('@custom_preset');

      expect(expanded).toBe('@custom_preset');
    });
  });

  describe('MacroProcessor class', () => {
    test('should process macro string', () => {
      const processor = new MacroProcessor();
      const grid = createTestGrid(30, 30);

      const result = processor.process('@town:small', grid, { seed: 42 });

      expect(result).toBeDefined();
      expect(result.operations).toBeDefined();
      expect(Array.isArray(result.operations)).toBe(true);
    });

    test('should track token usage', () => {
      const processor = new MacroProcessor();
      const grid = createTestGrid(30, 30);

      processor.process('@town:medium *trees[20]', grid, { seed: 42 });
      const stats = processor.getStats();

      expect(stats.macrosProcessed).toBeGreaterThan(0);
    });
  });
});

describe('SeedExpander', () => {
  let SeedExpander, seedExpander, parseSeedNotation, toSeedNotation, GENERATION_TEMPLATES;

  beforeAll(async () => {
    jest.resetModules();
    const module = await import('../src/neural/SeedExpander.js');
    SeedExpander = module.SeedExpander;
    seedExpander = module.seedExpander;
    parseSeedNotation = module.parseSeedNotation;
    toSeedNotation = module.toSeedNotation;
    GENERATION_TEMPLATES = module.GENERATION_TEMPLATES;
  });

  describe('GENERATION_TEMPLATES', () => {
    test('should have village template', () => {
      expect(GENERATION_TEMPLATES.village).toBeDefined();
      expect(GENERATION_TEMPLATES.village.name).toBe('village');
    });

    test('should have dungeon template', () => {
      expect(GENERATION_TEMPLATES.dungeon).toBeDefined();
      expect(GENERATION_TEMPLATES.dungeon.name).toBe('dungeon');
    });

    test('should have arena template', () => {
      expect(GENERATION_TEMPLATES.arena).toBeDefined();
    });

    test('templates should have required properties', () => {
      const template = GENERATION_TEMPLATES.village;
      expect(template.baseWidth).toBeDefined();
      expect(template.baseHeight).toBeDefined();
      expect(Array.isArray(template.layers)).toBe(true);
    });
  });

  describe('parseSeedNotation', () => {
    test('should parse simple seed:template notation', () => {
      const result = parseSeedNotation('12345:village');

      expect(result.seed).toBe(12345);
      expect(result.template).toBe('village');
    });

    test('should parse full notation with modifiers', () => {
      const result = parseSeedNotation('12345:dungeon:high:dark:large');

      expect(result.seed).toBe(12345);
      expect(result.template).toBe('dungeon');
      expect(result.mods.density).toBe('high');
      expect(result.mods.theme).toBe('dark');
      expect(result.mods.size).toBe('large');
    });

    test('should handle missing modifiers', () => {
      const result = parseSeedNotation('42:arena');

      expect(result.seed).toBe(42);
      expect(result.template).toBe('arena');
      expect(result.mods).toBeDefined();
    });
  });

  describe('toSeedNotation', () => {
    test('should create notation string', () => {
      const notation = toSeedNotation(12345, 'village', { density: 'high' });

      expect(notation).toContain('12345');
      expect(notation).toContain('village');
      expect(notation).toContain('high');
    });

    test('should be reversible with parseSeedNotation', () => {
      const original = { seed: 99999, template: 'dungeon', mods: { density: 'normal', theme: 'dark' } };
      const notation = toSeedNotation(original.seed, original.template, original.mods);
      const parsed = parseSeedNotation(notation);

      expect(parsed.seed).toBe(original.seed);
      expect(parsed.template).toBe(original.template);
    });
  });

  describe('SeedExpander class', () => {
    test('should expand seed to level', () => {
      const result = seedExpander.expand(12345, 'village', {});

      expect(result).toBeDefined();
      expect(result.dunData).toBeDefined();
      expect(result.dunData.width).toBeGreaterThan(0);
      expect(result.dunData.height).toBeGreaterThan(0);
    });

    test('should expand notation string', () => {
      const result = seedExpander.expandNotation('12345:dungeon:normal');

      expect(result).toBeDefined();
      expect(result.seed).toBe(12345);
      expect(result.template).toBe('dungeon');
    });

    test('should generate level sequence', () => {
      const sequence = seedExpander.expandSequence({
        seed: 42,
        template: 'dungeon',
        mods: {},
      }, 3);

      expect(sequence.length).toBe(3);
      for (let i = 0; i < sequence.length; i++) {
        expect(sequence[i].levelIndex).toBe(i);
        expect(sequence[i].dunData).toBeDefined();
      }
    });

    test('should produce deterministic results', () => {
      const result1 = seedExpander.expand(12345, 'village', { density: 'normal' });
      const result2 = seedExpander.expand(12345, 'village', { density: 'normal' });

      expect(result1.dunData.width).toBe(result2.dunData.width);
      expect(result1.dunData.height).toBe(result2.dunData.height);
    });
  });
});

describe('LocalSimulator', () => {
  let LocalSimulator, CollisionDetector, ConnectivityAnalyzer, simulator;

  beforeAll(async () => {
    jest.resetModules();
    const module = await import('../src/neural/LocalSimulator.js');
    LocalSimulator = module.LocalSimulator;
    CollisionDetector = module.CollisionDetector;
    ConnectivityAnalyzer = module.ConnectivityAnalyzer;
    simulator = module.simulator;
  });

  describe('CollisionDetector', () => {
    test('should detect point collision with wall', () => {
      const grid = createTestGrid(10, 10);
      grid[5][5] = 1; // wall

      const detector = new CollisionDetector(grid);
      const collides = detector.checkPoint(5, 5);

      expect(collides).toBe(true);
    });

    test('should not collide with floor', () => {
      const grid = createTestGrid(10, 10);

      const detector = new CollisionDetector(grid);
      const collides = detector.checkPoint(5, 5);

      expect(collides).toBe(false);
    });

    test('should detect rectangle collision', () => {
      const grid = createTestGrid(10, 10);
      grid[5][5] = 1; // wall in middle

      const detector = new CollisionDetector(grid);
      const collides = detector.checkRect(4, 4, 3, 3);

      expect(collides).toBe(true);
    });

    test('should not collide with clear area', () => {
      const grid = createTestGrid(10, 10);

      const detector = new CollisionDetector(grid);
      const collides = detector.checkRect(2, 2, 3, 3);

      expect(collides).toBe(false);
    });
  });

  describe('ConnectivityAnalyzer', () => {
    test('should find connected regions', () => {
      const grid = createTestGrid(10, 10);

      const analyzer = new ConnectivityAnalyzer(grid);
      const regions = analyzer.findRegions();

      expect(regions.length).toBeGreaterThan(0);
    });

    test('should detect disconnected regions', () => {
      const grid = createTestGrid(10, 10);
      // Create wall dividing grid
      for (let y = 0; y < 10; y++) {
        grid[y][5] = 1; // wall
      }

      const analyzer = new ConnectivityAnalyzer(grid);
      const regions = analyzer.findRegions();

      expect(regions.length).toBe(2);
    });

    test('should check if points are connected', () => {
      const grid = createTestGrid(10, 10);

      const analyzer = new ConnectivityAnalyzer(grid);
      const connected = analyzer.areConnected({ x: 0, y: 0 }, { x: 9, y: 9 });

      expect(connected).toBe(true);
    });
  });

  describe('LocalSimulator class', () => {
    test('should initialize with grid', () => {
      const grid = createTestGrid(20, 20);
      const sim = new LocalSimulator(grid);

      expect(sim).toBeDefined();
    });

    test('should process simple query', () => {
      const grid = createTestGrid(20, 20);
      const sim = new LocalSimulator(grid);

      const result = sim.query('check collision at [5,5]');

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
    });

    test('should validate placement', () => {
      const grid = createTestGrid(20, 20);
      const sim = new LocalSimulator(grid);

      const result = sim.validatePlacement({
        type: 'building',
        x: 5,
        y: 5,
        width: 3,
        height: 3,
      });

      expect(result).toBeDefined();
      expect(result.valid).toBe(true);
    });

    test('should reject invalid placement', () => {
      const grid = createTestGrid(20, 20);
      // Add walls in target area
      for (let x = 5; x < 8; x++) {
        for (let y = 5; y < 8; y++) {
          grid[y][x] = 1;
        }
      }

      const sim = new LocalSimulator(grid);
      const result = sim.validatePlacement({
        type: 'building',
        x: 5,
        y: 5,
        width: 3,
        height: 3,
      });

      expect(result.valid).toBe(false);
      expect(result.conflicts.length).toBeGreaterThan(0);
    });
  });
});

// Helper function to create test grid
function createTestGrid(width, height, fillValue = 0) {
  const grid = [];
  for (let y = 0; y < height; y++) {
    grid[y] = [];
    for (let x = 0; x < width; x++) {
      grid[y][x] = fillValue;
    }
  }
  return grid;
}
