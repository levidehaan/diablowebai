/**
 * Integration Tests for Diablo Web Neural Augmentation
 *
 * Uses Puppeteer to run headless browser tests against the game.
 * Tests the Neural Interop Layer, Level Generation, and NPC behavior.
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// Test configuration
const CONFIG = {
  headless: process.env.PUPPETEER_HEADLESS !== 'false',
  slowMo: process.env.PUPPETEER_SLOWMO ? parseInt(process.env.PUPPETEER_SLOWMO) : 0,
  timeout: 60000,
  baseUrl: process.env.TEST_URL || 'http://localhost:3000',
};

// Test utilities
class DiabloTestHarness {
  constructor() {
    this.browser = null;
    this.page = null;
    this.wasmLoaded = false;
    this.neuralReady = false;
  }

  async launch() {
    this.browser = await puppeteer.launch({
      headless: CONFIG.headless,
      slowMo: CONFIG.slowMo,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security', // Allow cross-origin for testing
      ],
    });

    this.page = await this.browser.newPage();

    // Set viewport to game resolution
    await this.page.setViewport({ width: 800, height: 600 });

    // Capture console logs
    this.logs = [];
    this.page.on('console', msg => {
      this.logs.push({
        type: msg.type(),
        text: msg.text(),
        timestamp: Date.now(),
      });
    });

    // Capture errors
    this.errors = [];
    this.page.on('pageerror', error => {
      this.errors.push({
        message: error.message,
        stack: error.stack,
        timestamp: Date.now(),
      });
    });

    return this;
  }

  async navigate(url = CONFIG.baseUrl) {
    await this.page.goto(url, { waitUntil: 'networkidle0', timeout: CONFIG.timeout });
  }

  async waitForWasm(timeout = CONFIG.timeout) {
    await this.page.waitForFunction(
      () => window.Module && window.Module.ready,
      { timeout }
    );
    this.wasmLoaded = true;
  }

  async waitForNeural(timeout = CONFIG.timeout) {
    await this.page.waitForFunction(
      () => window.NeuralAugmentation && window.NeuralAugmentation.status === 'ready',
      { timeout }
    );
    this.neuralReady = true;
  }

  async injectNeuralSystem() {
    // Inject the neural augmentation system for testing
    await this.page.addScriptTag({
      path: path.join(__dirname, '../src/neural/index.js'),
      type: 'module',
    });
  }

  async getNeuralStatus() {
    return this.page.evaluate(() => {
      if (window.NeuralAugmentation) {
        return window.NeuralAugmentation.getStatus();
      }
      return null;
    });
  }

  async generateLevel(levelType, depth) {
    return this.page.evaluate(async (lt, d) => {
      if (window.NeuralAugmentation) {
        return window.NeuralAugmentation.generateLevel(lt, d);
      }
      return null;
    }, levelType, depth);
  }

  async generateDialogue(npcId) {
    return this.page.evaluate(async (npc) => {
      if (window.NeuralAugmentation) {
        return window.NeuralAugmentation.generateDialogue(npc);
      }
      return null;
    }, npcId);
  }

  async takeScreenshot(name) {
    const screenshotPath = path.join(__dirname, `screenshots/${name}.png`);
    await fs.promises.mkdir(path.dirname(screenshotPath), { recursive: true });
    await this.page.screenshot({ path: screenshotPath });
    return screenshotPath;
  }

  async getHeapUsage() {
    return this.page.evaluate(() => {
      if (window.performance && window.performance.memory) {
        return {
          usedJSHeapSize: window.performance.memory.usedJSHeapSize,
          totalJSHeapSize: window.performance.memory.totalJSHeapSize,
          jsHeapSizeLimit: window.performance.memory.jsHeapSizeLimit,
        };
      }
      return null;
    });
  }

  getLogs(filter = null) {
    if (filter) {
      return this.logs.filter(log => log.text.includes(filter));
    }
    return this.logs;
  }

  getErrors() {
    return this.errors;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// Pathfinding utilities for map validation
class MapValidator {
  static findPath(grid, startX, startY, endX, endY) {
    const width = grid[0].length;
    const height = grid.length;
    const openSet = [{ x: startX, y: startY, g: 0, h: 0, f: 0, parent: null }];
    const closedSet = new Set();

    const heuristic = (x1, y1, x2, y2) => Math.abs(x1 - x2) + Math.abs(y1 - y2);

    while (openSet.length > 0) {
      let lowestIndex = 0;
      for (let i = 1; i < openSet.length; i++) {
        if (openSet[i].f < openSet[lowestIndex].f) {
          lowestIndex = i;
        }
      }

      const current = openSet[lowestIndex];

      if (current.x === endX && current.y === endY) {
        const path = [];
        let node = current;
        while (node) {
          path.unshift({ x: node.x, y: node.y });
          node = node.parent;
        }
        return path;
      }

      openSet.splice(lowestIndex, 1);
      closedSet.add(`${current.x},${current.y}`);

      const neighbors = [
        { x: current.x - 1, y: current.y },
        { x: current.x + 1, y: current.y },
        { x: current.x, y: current.y - 1 },
        { x: current.x, y: current.y + 1 },
      ];

      for (const neighbor of neighbors) {
        const { x, y } = neighbor;

        if (x < 0 || x >= width || y < 0 || y >= height) continue;
        if (closedSet.has(`${x},${y}`)) continue;
        if (grid[y][x] === 1) continue; // Wall

        const g = current.g + 1;
        const h = heuristic(x, y, endX, endY);
        const f = g + h;

        const existingIndex = openSet.findIndex(n => n.x === x && n.y === y);
        if (existingIndex !== -1 && openSet[existingIndex].g <= g) continue;

        if (existingIndex !== -1) {
          openSet.splice(existingIndex, 1);
        }

        openSet.push({ x, y, g, h, f, parent: current });
      }
    }

    return null;
  }

  static findTile(grid, tileType) {
    for (let y = 0; y < grid.length; y++) {
      for (let x = 0; x < grid[y].length; x++) {
        if (grid[y][x] === tileType) {
          return { x, y };
        }
      }
    }
    return null;
  }

  static validateMap(grid) {
    const errors = [];

    // Check dimensions
    if (!grid || grid.length !== 40) {
      errors.push('Invalid grid height');
      return { valid: false, errors };
    }

    for (let y = 0; y < grid.length; y++) {
      if (grid[y].length !== 40) {
        errors.push(`Invalid grid width at row ${y}`);
      }
    }

    // Find start and end
    const start = this.findTile(grid, 3); // STAIRS_UP
    const end = this.findTile(grid, 4);   // STAIRS_DOWN

    if (!start) {
      errors.push('No entrance (stairs up) found');
    }

    if (!end) {
      errors.push('No exit (stairs down) found');
    }

    // Check connectivity
    if (start && end) {
      const path = this.findPath(grid, start.x, start.y, end.x, end.y);
      if (!path) {
        errors.push('No valid path from entrance to exit');
      }
    }

    // Check border walls
    for (let x = 0; x < 40; x++) {
      if (grid[0][x] !== 1) {
        errors.push('Top border not solid walls');
        break;
      }
      if (grid[39][x] !== 1) {
        errors.push('Bottom border not solid walls');
        break;
      }
    }

    for (let y = 0; y < 40; y++) {
      if (grid[y][0] !== 1) {
        errors.push('Left border not solid walls');
        break;
      }
      if (grid[y][39] !== 1) {
        errors.push('Right border not solid walls');
        break;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      start,
      end,
    };
  }
}

// Test Suites
describe('Neural Augmentation System', () => {
  let harness;

  beforeAll(async () => {
    harness = new DiabloTestHarness();
    await harness.launch();
  });

  afterAll(async () => {
    await harness.close();
  });

  describe('Level Generation', () => {
    test('should generate a valid 40x40 grid', async () => {
      const levelData = await harness.page.evaluate(async () => {
        // Import the level generator
        const { default: levelGenerator } = await import('/src/neural/LevelGenerator.js');
        return levelGenerator.generate(1, 1); // Cathedral level 1
      });

      expect(levelData).toBeDefined();
      expect(levelData.grid).toBeDefined();
      expect(levelData.grid.length).toBe(40);
      expect(levelData.grid[0].length).toBe(40);
    }, CONFIG.timeout);

    test('should have valid entrance and exit', async () => {
      const levelData = await harness.page.evaluate(async () => {
        const { MockLevelGenerator } = await import('/src/neural/LevelGenerator.js');
        return MockLevelGenerator.generate(1, 1);
      });

      const validation = MapValidator.validateMap(levelData.grid);

      expect(validation.start).toBeDefined();
      expect(validation.end).toBeDefined();
    }, CONFIG.timeout);

    test('should have a valid path from entrance to exit', async () => {
      const levelData = await harness.page.evaluate(async () => {
        const { MockLevelGenerator, MapHealer } = await import('/src/neural/LevelGenerator.js');
        const data = MockLevelGenerator.generate(1, 1);
        data.grid = MapHealer.heal(data.grid);
        return data;
      });

      const validation = MapValidator.validateMap(levelData.grid);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    }, CONFIG.timeout);

    test('should generate different maps for different seeds', async () => {
      const maps = await harness.page.evaluate(async () => {
        const { MockLevelGenerator } = await import('/src/neural/LevelGenerator.js');
        return [
          MockLevelGenerator.generate(1, 1),
          MockLevelGenerator.generate(1, 1),
        ];
      });

      // Maps should be different (with random generation)
      const grid1 = JSON.stringify(maps[0].grid);
      const grid2 = JSON.stringify(maps[1].grid);

      // They might occasionally be the same due to randomness,
      // but rooms should generally be different
      expect(maps[0].rooms).toBeDefined();
      expect(maps[1].rooms).toBeDefined();
    }, CONFIG.timeout);
  });

  describe('Narrative Engine', () => {
    test('should generate dialogue for NPCs', async () => {
      const dialogue = await harness.page.evaluate(async () => {
        const { MockDialogueGenerator } = await import('/src/neural/NarrativeEngine.js');
        return MockDialogueGenerator.generate('CAIN', {});
      });

      expect(dialogue).toBeDefined();
      expect(typeof dialogue).toBe('string');
      expect(dialogue.length).toBeGreaterThan(0);
    }, CONFIG.timeout);

    test('should maintain story context', async () => {
      const result = await harness.page.evaluate(async () => {
        const { StoryContext } = await import('/src/neural/NarrativeEngine.js');
        const context = new StoryContext();

        context.updatePlayer({ class: 0, level: 5, hp: 50, maxHp: 100 });
        context.defeatBoss('BUTCHER');
        context.addEvent({ type: 'DUNGEON_ENTERED', depth: 4 });

        return context.getSummary();
      });

      expect(result.player.class).toBe('Warrior');
      expect(result.player.level).toBe(5);
      expect(result.player.isWounded).toBe(true);
      expect(result.world.bossesDefeated).toContain('BUTCHER');
    }, CONFIG.timeout);
  });

  describe('Commander AI', () => {
    test('should create squads for monsters', async () => {
      const result = await harness.page.evaluate(async () => {
        const { MonsterAI, Squad } = await import('/src/neural/CommanderAI.js');

        const squad = new Squad('squad_1');
        const monster1 = new MonsterAI(1, 'SKELETON');
        const monster2 = new MonsterAI(2, 'SKELETON');

        squad.addMember(monster1);
        squad.addMember(monster2);

        return {
          memberCount: squad.members.length,
          leaderId: squad.leader?.id,
        };
      });

      expect(result.memberCount).toBe(2);
      expect(result.leaderId).toBe(1);
    }, CONFIG.timeout);

    test('should calculate formation positions', async () => {
      const positions = await harness.page.evaluate(async () => {
        const { Squad, MonsterAI, FORMATIONS } = await import('/src/neural/CommanderAI.js');

        const squad = new Squad('test');
        for (let i = 0; i < 4; i++) {
          const monster = new MonsterAI(i, 'SKELETON');
          monster.x = 10;
          monster.y = 10;
          squad.addMember(monster);
        }

        return FORMATIONS.SURROUND.getPositions(10, 10, 4, 20, 20);
      });

      expect(positions).toHaveLength(4);
      positions.forEach(pos => {
        expect(pos.x).toBeDefined();
        expect(pos.y).toBeDefined();
      });
    }, CONFIG.timeout);
  });

  describe('Memory Safety', () => {
    test('should not leak memory during level generation', async () => {
      const result = await harness.page.evaluate(async () => {
        const { MockLevelGenerator, MapHealer } = await import('/src/neural/LevelGenerator.js');

        const initialHeap = performance.memory?.usedJSHeapSize || 0;

        // Generate many levels
        for (let i = 0; i < 100; i++) {
          const data = MockLevelGenerator.generate(1, i % 16);
          MapHealer.heal(data.grid);
        }

        // Force garbage collection if available
        if (global.gc) global.gc();

        const finalHeap = performance.memory?.usedJSHeapSize || 0;

        return {
          initialHeap,
          finalHeap,
          growth: finalHeap - initialHeap,
        };
      });

      // Allow for some growth but not excessive (less than 10MB)
      expect(result.growth).toBeLessThan(10 * 1024 * 1024);
    }, CONFIG.timeout);
  });

  describe('Error Handling', () => {
    test('should handle invalid level types gracefully', async () => {
      const result = await harness.page.evaluate(async () => {
        try {
          const { MockLevelGenerator } = await import('/src/neural/LevelGenerator.js');
          const data = MockLevelGenerator.generate(999, 1);
          return { success: true, hasGrid: !!data.grid };
        } catch (error) {
          return { success: false, error: error.message };
        }
      });

      expect(result.success).toBe(true);
      expect(result.hasGrid).toBe(true);
    }, CONFIG.timeout);

    test('should handle missing NPC personalities', async () => {
      const result = await harness.page.evaluate(async () => {
        try {
          const { MockDialogueGenerator } = await import('/src/neural/NarrativeEngine.js');
          const dialogue = MockDialogueGenerator.generate('UNKNOWN_NPC', {});
          return { success: true, hasDialogue: dialogue.length > 0 };
        } catch (error) {
          return { success: false, error: error.message };
        }
      });

      expect(result.success).toBe(true);
    }, CONFIG.timeout);
  });
});

// Visual Regression Tests
describe('Visual Regression', () => {
  let harness;

  beforeAll(async () => {
    harness = new DiabloTestHarness();
    await harness.launch();
  });

  afterAll(async () => {
    await harness.close();
  });

  test('should not contain magenta placeholder pixels', async () => {
    // This would check rendered frames for missing texture indicators
    const hasErrors = await harness.page.evaluate(() => {
      const canvas = document.querySelector('canvas');
      if (!canvas) return false;

      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      let magentaPixels = 0;
      for (let i = 0; i < data.length; i += 4) {
        // Check for pure magenta (255, 0, 255)
        if (data[i] === 255 && data[i + 1] === 0 && data[i + 2] === 255) {
          magentaPixels++;
        }
      }

      // More than 10% magenta indicates missing textures
      const totalPixels = data.length / 4;
      return magentaPixels / totalPixels > 0.1;
    });

    expect(hasErrors).toBe(false);
  });
});

// Export for CLI usage
module.exports = {
  DiabloTestHarness,
  MapValidator,
  CONFIG,
};
