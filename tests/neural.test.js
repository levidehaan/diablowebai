/**
 * Unit Tests for Neural Augmentation Modules
 *
 * Tests the individual components of the Neural Augmentation system
 * without requiring browser or WASM context.
 */

// Mock browser APIs for Node.js environment
global.fetch = jest.fn();
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock performance.now
global.performance = {
  now: () => Date.now(),
  memory: {
    usedJSHeapSize: 0,
    totalJSHeapSize: 0,
    jsHeapSizeLimit: 0,
  },
};

describe('NeuralConfig', () => {
  let NeuralConfig;

  beforeAll(async () => {
    jest.resetModules();
    NeuralConfig = (await import('../src/neural/config.js')).default;
  });

  test('should have all required configuration sections', () => {
    expect(NeuralConfig.provider).toBeDefined();
    expect(NeuralConfig.levelGeneration).toBeDefined();
    expect(NeuralConfig.narrative).toBeDefined();
    expect(NeuralConfig.commander).toBeDefined();
    expect(NeuralConfig.assets).toBeDefined();
    expect(NeuralConfig.memory).toBeDefined();
    expect(NeuralConfig.debug).toBeDefined();
  });

  test('should have correct level generation tile types', () => {
    const tiles = NeuralConfig.levelGeneration.tileTypes;
    expect(tiles.FLOOR).toBe(0);
    expect(tiles.WALL).toBe(1);
    expect(tiles.DOOR).toBe(2);
    expect(tiles.STAIRS_UP).toBe(3);
    expect(tiles.STAIRS_DOWN).toBe(4);
  });

  test('should have NPC personality profiles', () => {
    const personalities = NeuralConfig.narrative.personalities;
    expect(personalities.CAIN).toBeDefined();
    expect(personalities.OGDEN).toBeDefined();
    expect(personalities.GRISWOLD).toBeDefined();
  });

  test('should have boss configurations', () => {
    const bosses = NeuralConfig.commander.bosses;
    expect(bosses.BUTCHER).toBeDefined();
    expect(bosses.SKELETON_KING).toBeDefined();
    expect(bosses.DIABLO).toBeDefined();
  });

  test('should be frozen to prevent modifications', () => {
    expect(() => {
      NeuralConfig.newProp = 'test';
    }).toThrow();
  });
});

describe('Level Generator', () => {
  let MockLevelGenerator, MapHealer, Pathfinder;

  beforeAll(async () => {
    jest.resetModules();
    const module = await import('../src/neural/LevelGenerator.js');
    MockLevelGenerator = module.MockLevelGenerator;
    MapHealer = module.MapHealer;
    Pathfinder = module.Pathfinder;
  });

  describe('MockLevelGenerator', () => {
    test('should generate a grid of correct dimensions', () => {
      const result = MockLevelGenerator.generate(1, 1);

      expect(result.grid).toBeDefined();
      expect(result.grid.length).toBe(40);
      expect(result.grid[0].length).toBe(40);
    });

    test('should generate rooms', () => {
      const result = MockLevelGenerator.generate(1, 1);

      expect(result.rooms).toBeDefined();
      expect(result.rooms.length).toBeGreaterThanOrEqual(1);
    });

    test('should generate entity spawn points', () => {
      const result = MockLevelGenerator.generate(1, 1);

      expect(result.entities).toBeDefined();
      expect(Array.isArray(result.entities)).toBe(true);
    });

    test('should place stairs', () => {
      const result = MockLevelGenerator.generate(1, 1);

      let hasStairsUp = false;
      let hasStairsDown = false;

      for (const row of result.grid) {
        for (const tile of row) {
          if (tile === 3) hasStairsUp = true;
          if (tile === 4) hasStairsDown = true;
        }
      }

      expect(hasStairsUp).toBe(true);
      expect(hasStairsDown).toBe(true);
    });
  });

  describe('Pathfinder', () => {
    test('should find a path in an open grid', () => {
      const grid = Array(10).fill(null).map(() => Array(10).fill(0));
      const path = Pathfinder.findPath(grid, 0, 0, 9, 9);

      expect(path).toBeDefined();
      expect(path.length).toBeGreaterThan(0);
      expect(path[0]).toEqual({ x: 0, y: 0 });
      expect(path[path.length - 1]).toEqual({ x: 9, y: 9 });
    });

    test('should return null when no path exists', () => {
      const grid = Array(10).fill(null).map(() => Array(10).fill(1)); // All walls
      const path = Pathfinder.findPath(grid, 0, 0, 9, 9);

      expect(path).toBeNull();
    });

    test('should navigate around walls', () => {
      const grid = Array(10).fill(null).map(() => Array(10).fill(0));
      // Create a wall in the middle
      for (let y = 0; y < 8; y++) {
        grid[y][5] = 1;
      }

      const path = Pathfinder.findPath(grid, 0, 0, 9, 0);

      expect(path).toBeDefined();
      // Path should go around the wall
      expect(path.some(p => p.y >= 8)).toBe(true);
    });
  });

  describe('MapHealer', () => {
    test('should ensure connectivity', () => {
      // Create a disconnected grid
      const grid = Array(40).fill(null).map(() => Array(40).fill(1));

      // Create two separate rooms
      for (let y = 5; y < 10; y++) {
        for (let x = 5; x < 10; x++) {
          grid[y][x] = 0;
        }
      }
      for (let y = 25; y < 30; y++) {
        for (let x = 25; x < 30; x++) {
          grid[y][x] = 0;
        }
      }

      grid[7][7] = 3; // Stairs up
      grid[27][27] = 4; // Stairs down

      const healed = MapHealer.heal(grid);

      // Check connectivity
      const path = Pathfinder.findPath(healed, 7, 7, 27, 27);
      expect(path).not.toBeNull();
    });

    test('should place stairs if missing', () => {
      const grid = Array(40).fill(null).map(() => Array(40).fill(1));
      // Create a room without stairs
      for (let y = 15; y < 25; y++) {
        for (let x = 15; x < 25; x++) {
          grid[y][x] = 0;
        }
      }

      const healed = MapHealer.heal(grid);

      let hasStairsUp = false;
      let hasStairsDown = false;

      for (const row of healed) {
        for (const tile of row) {
          if (tile === 3) hasStairsUp = true;
          if (tile === 4) hasStairsDown = true;
        }
      }

      expect(hasStairsUp).toBe(true);
      expect(hasStairsDown).toBe(true);
    });
  });
});

describe('Narrative Engine', () => {
  let StoryContext, DialogueCache, QuestManager, MockDialogueGenerator;

  beforeAll(async () => {
    jest.resetModules();
    const module = await import('../src/neural/NarrativeEngine.js');
    StoryContext = module.StoryContext;
    DialogueCache = module.DialogueCache;
    QuestManager = module.QuestManager;
    MockDialogueGenerator = module.MockDialogueGenerator;
  });

  describe('StoryContext', () => {
    test('should track player state', () => {
      const context = new StoryContext();
      context.updatePlayer({
        class: 0,
        level: 10,
        hp: 75,
        maxHp: 100,
      });

      const summary = context.getSummary();
      expect(summary.player.class).toBe('Warrior');
      expect(summary.player.level).toBe(10);
      expect(summary.player.isWounded).toBe(true);
    });

    test('should track boss defeats', () => {
      const context = new StoryContext();
      context.defeatBoss('BUTCHER');
      context.defeatBoss('SKELETON_KING');

      const summary = context.getSummary();
      expect(summary.world.bossesDefeated).toContain('BUTCHER');
      expect(summary.world.bossesDefeated).toContain('SKELETON_KING');
    });

    test('should maintain event history', () => {
      const context = new StoryContext();
      context.addEvent({ type: 'LEVEL_ENTERED', depth: 1 });
      context.addEvent({ type: 'MONSTER_KILLED', monster: 'SKELETON' });

      const summary = context.getSummary();
      expect(summary.recentEvents).toContain('LEVEL_ENTERED');
      expect(summary.recentEvents).toContain('MONSTER_KILLED');
    });

    test('should serialize and deserialize', () => {
      const context = new StoryContext();
      context.updatePlayer({ class: 1, level: 5 });
      context.defeatBoss('DIABLO');

      const json = context.toJSON();
      const restored = new StoryContext();
      restored.fromJSON(json);

      const summary = restored.getSummary();
      expect(summary.world.bossesDefeated).toContain('DIABLO');
    });
  });

  describe('DialogueCache', () => {
    test('should cache and retrieve values', () => {
      const cache = new DialogueCache(10);
      cache.set('key1', 'value1');

      expect(cache.get('key1')).toBe('value1');
    });

    test('should return null for missing keys', () => {
      const cache = new DialogueCache(10);

      expect(cache.get('nonexistent')).toBeNull();
    });

    test('should evict oldest entries when full', () => {
      const cache = new DialogueCache(3);
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4');

      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key4')).toBe('value4');
    });
  });

  describe('MockDialogueGenerator', () => {
    test('should generate dialogue for known NPCs', () => {
      const dialogue = MockDialogueGenerator.generate('CAIN', {});

      expect(typeof dialogue).toBe('string');
      expect(dialogue.length).toBeGreaterThan(0);
    });

    test('should generate fallback dialogue for unknown NPCs', () => {
      const dialogue = MockDialogueGenerator.generate('UNKNOWN', {});

      expect(typeof dialogue).toBe('string');
      expect(dialogue.length).toBeGreaterThan(0);
    });
  });
});

describe('Commander AI', () => {
  let MonsterAI, BossAI, Squad, FORMATIONS;

  beforeAll(async () => {
    jest.resetModules();
    const module = await import('../src/neural/CommanderAI.js');
    MonsterAI = module.MonsterAI;
    BossAI = module.BossAI;
    Squad = module.Squad;
    FORMATIONS = module.FORMATIONS;
  });

  describe('MonsterAI', () => {
    test('should assign roles based on type', () => {
      const skeleton = new MonsterAI(1, 'SKELETON');
      const archer = new MonsterAI(2, 'SKELETON_ARCHER');

      expect(skeleton.role).toBe('MELEE');
      expect(archer.role).toBe('RANGED');
    });

    test('should calculate utility scores', () => {
      const monster = new MonsterAI(1, 'SKELETON');
      monster.x = 10;
      monster.y = 10;
      monster.hp = 50;
      monster.maxHp = 100;

      monster.calculateUtility(15, 15, []);

      expect(monster.utilityScores.attack).toBeDefined();
      expect(monster.utilityScores.retreat).toBeDefined();
    });
  });

  describe('BossAI', () => {
    test('should have personality profile', () => {
      const butcher = new BossAI(1, 'BUTCHER');

      expect(butcher.profile).toBeDefined();
      expect(butcher.profile.personality).toBe('relentless pursuer');
    });

    test('should select tactics', () => {
      const boss = new BossAI(1, 'SKELETON_KING');
      boss.hp = 100;
      boss.maxHp = 100;

      const tactic = boss.selectTactic(10, 10, Date.now());

      expect(typeof tactic).toBe('string');
    });

    test('should recognize retreat threshold', () => {
      const boss = new BossAI(1, 'SKELETON_KING');
      boss.hp = 20;
      boss.maxHp = 100;

      expect(boss.shouldRetreat()).toBe(true);
    });

    test('BUTCHER should never retreat', () => {
      const butcher = new BossAI(1, 'BUTCHER');
      butcher.hp = 1;
      butcher.maxHp = 100;

      expect(butcher.shouldRetreat()).toBe(false);
    });
  });

  describe('Squad', () => {
    test('should manage members', () => {
      const squad = new Squad('squad_1');
      const monster1 = new MonsterAI(1, 'SKELETON');
      const monster2 = new MonsterAI(2, 'SKELETON');

      squad.addMember(monster1);
      squad.addMember(monster2);

      expect(squad.members.length).toBe(2);
      expect(squad.leader).toBe(monster1);
    });

    test('should enforce max squad size', () => {
      const squad = new Squad('squad_1');

      for (let i = 0; i < 10; i++) {
        squad.addMember(new MonsterAI(i, 'SKELETON'));
      }

      expect(squad.members.length).toBeLessThanOrEqual(6);
    });

    test('should calculate average health', () => {
      const squad = new Squad('squad_1');
      const m1 = new MonsterAI(1, 'SKELETON');
      const m2 = new MonsterAI(2, 'SKELETON');

      m1.hp = 50;
      m1.maxHp = 100;
      m2.hp = 100;
      m2.maxHp = 100;

      squad.addMember(m1);
      squad.addMember(m2);

      expect(squad.getAverageHealth()).toBe(0.75);
    });
  });

  describe('Formations', () => {
    test('LINE should distribute members perpendicular to target', () => {
      const positions = FORMATIONS.LINE.getPositions(10, 10, 3, 20, 10);

      expect(positions.length).toBe(3);
      // Should be roughly in a line perpendicular to target direction
      expect(positions[0].x).toBe(positions[1].x);
      expect(positions[1].x).toBe(positions[2].x);
    });

    test('SURROUND should place members in a circle', () => {
      const positions = FORMATIONS.SURROUND.getPositions(10, 10, 4, 20, 20);

      expect(positions.length).toBe(4);
      // All positions should be roughly equidistant from target
      positions.forEach(pos => {
        const dist = Math.sqrt(Math.pow(pos.x - 20, 2) + Math.pow(pos.y - 20, 2));
        expect(Math.abs(dist - 3)).toBeLessThan(1);
      });
    });

    test('RETREAT should place members away from target', () => {
      const positions = FORMATIONS.RETREAT.getPositions(10, 10, 3, 5, 5);

      expect(positions.length).toBe(3);
      // All positions should be further from target than leader
      positions.forEach(pos => {
        const leaderDist = Math.sqrt(Math.pow(10 - 5, 2) + Math.pow(10 - 5, 2));
        const posDist = Math.sqrt(Math.pow(pos.x - 5, 2) + Math.pow(pos.y - 5, 2));
        expect(posDist).toBeGreaterThan(leaderDist);
      });
    });
  });
});

describe('Asset Pipeline', () => {
  let quantizeToPalette, findNearestPaletteColor, DIABLO_PALETTE;

  beforeAll(async () => {
    jest.resetModules();

    // Mock ImageData
    global.ImageData = class {
      constructor(width, height) {
        this.width = width;
        this.height = height;
        this.data = new Uint8ClampedArray(width * height * 4);
      }
    };

    const module = await import('../src/neural/AssetPipeline.js');
    quantizeToPalette = module.quantizeToPalette;
    findNearestPaletteColor = module.findNearestPaletteColor;
    DIABLO_PALETTE = module.DIABLO_PALETTE;
  });

  test('should have 256 palette colors', () => {
    expect(DIABLO_PALETTE.length).toBe(256);
  });

  test('should find nearest palette color', () => {
    // Black should map to a dark color
    const blackIndex = findNearestPaletteColor(0, 0, 0);
    const blackColor = DIABLO_PALETTE[blackIndex];

    expect(blackColor.r).toBeLessThan(50);
    expect(blackColor.g).toBeLessThan(50);
    expect(blackColor.b).toBeLessThan(50);
  });

  test('should quantize image data', () => {
    const imageData = new ImageData(4, 4);
    // Fill with red pixels
    for (let i = 0; i < imageData.data.length; i += 4) {
      imageData.data[i] = 255;     // R
      imageData.data[i + 1] = 0;   // G
      imageData.data[i + 2] = 0;   // B
      imageData.data[i + 3] = 255; // A
    }

    const indices = quantizeToPalette(imageData);

    expect(indices.length).toBe(16);
    // All pixels should map to the same palette index
    const firstIndex = indices[0];
    indices.forEach(idx => {
      expect(idx).toBe(firstIndex);
    });
  });
});
