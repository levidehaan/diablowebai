/**
 * DungeonConfig Tests
 *
 * Tests for the dungeon configuration system including:
 * - Level configuration
 * - Monster pool management
 * - Boss configuration
 * - Difficulty settings
 * - Story beat integration
 * - Pipeline stages
 */

import {
  DungeonConfig,
  DUNGEON_THEMES,
  DIFFICULTY_PRESETS,
  getThemeForLevel,
  getThemeDataForLevel,
} from '../src/neural/DungeonConfig';

import {
  CampaignPipeline,
  PIPELINE_STAGES,
  getOrderedStages,
  PipelineState,
} from '../src/neural/CampaignPipeline';

describe('DungeonConfig', () => {
  let config;

  beforeEach(() => {
    config = new DungeonConfig();
  });

  describe('Level Configuration', () => {
    test('should have 16 levels initialized', () => {
      for (let i = 1; i <= 16; i++) {
        const levelConfig = config.getLevelConfig(i);
        expect(levelConfig).toBeDefined();
        expect(levelConfig.level).toBe(i);
      }
    });

    test('should throw for invalid level numbers', () => {
      expect(() => config.getLevelConfig(0)).toThrow();
      expect(() => config.getLevelConfig(17)).toThrow();
      expect(() => config.getLevelConfig(-1)).toThrow();
    });

    test('should configure level partially', () => {
      const result = config.configureLevelPartial(1, {
        monsterDensity: 0.5,
        treasureDensity: 0.3,
      });

      expect(result.monsterDensity).toBe(0.5);
      expect(result.treasureDensity).toBe(0.3);
      expect(result.theme).toBe('CATHEDRAL'); // Default preserved
    });

    test('should configure level range', () => {
      config.configureLevelRange(1, 4, { monsterDensity: 0.8 });

      for (let i = 1; i <= 4; i++) {
        expect(config.getLevelConfig(i).monsterDensity).toBe(0.8);
      }
      // Level 5 should be unchanged
      expect(config.getLevelConfig(5).monsterDensity).not.toBe(0.8);
    });

    test('should configure by theme', () => {
      config.configureTheme('CATACOMBS', { treasureDensity: 0.6 });

      for (let i = 5; i <= 8; i++) {
        expect(config.getLevelConfig(i).treasureDensity).toBe(0.6);
      }
    });
  });

  describe('Theme Management', () => {
    test('should return correct theme for level', () => {
      expect(getThemeForLevel(1)).toBe('CATHEDRAL');
      expect(getThemeForLevel(4)).toBe('CATHEDRAL');
      expect(getThemeForLevel(5)).toBe('CATACOMBS');
      expect(getThemeForLevel(8)).toBe('CATACOMBS');
      expect(getThemeForLevel(9)).toBe('CAVES');
      expect(getThemeForLevel(12)).toBe('CAVES');
      expect(getThemeForLevel(13)).toBe('HELL');
      expect(getThemeForLevel(16)).toBe('HELL');
    });

    test('should override theme for a level', () => {
      config.setThemeOverride(5, 'HELL');
      const levelConfig = config.getLevelConfig(5);

      expect(levelConfig.themeOverride).toBe('HELL');
      expect(levelConfig.theme).toBe('HELL');
    });

    test('should get effective theme', () => {
      config.setThemeOverride(1, 'CAVES');
      const effective = config.getEffectiveTheme(1);

      expect(effective.name).toBe('CAVES');
      expect(effective.data).toBe(DUNGEON_THEMES.CAVES);
    });
  });

  describe('Monster Configuration', () => {
    test('should set allowed monsters', () => {
      config.setAllowedMonsters(1, ['ZOMBIE', 'SKELETON']);
      const levelConfig = config.getLevelConfig(1);

      expect(levelConfig.allowedMonsters).toEqual(['ZOMBIE', 'SKELETON']);
    });

    test('should add to allowed monsters', () => {
      const initial = config.getLevelConfig(1).allowedMonsters.length;
      config.addAllowedMonsters(1, ['NEW_MONSTER']);
      const after = config.getLevelConfig(1).allowedMonsters.length;

      expect(after).toBe(initial + 1);
      expect(config.getLevelConfig(1).allowedMonsters).toContain('NEW_MONSTER');
    });

    test('should remove monsters from allowed list', () => {
      config.setAllowedMonsters(1, ['ZOMBIE', 'SKELETON', 'FALLEN_ONE']);
      config.removeMonsters(1, ['ZOMBIE']);

      const monsters = config.getLevelConfig(1).allowedMonsters;
      expect(monsters).not.toContain('ZOMBIE');
      expect(monsters).toContain('SKELETON');
    });

    test('should get effective monsters respecting disallowed', () => {
      config.setAllowedMonsters(1, ['ZOMBIE', 'SKELETON', 'FALLEN_ONE']);
      config.setDisallowedMonsters(1, ['ZOMBIE']);

      const effective = config.getEffectiveMonsters(1);
      expect(effective).not.toContain('ZOMBIE');
      expect(effective).toContain('SKELETON');
    });

    test('should set monster density', () => {
      config.setMonsterDensity(1, 0.7);
      expect(config.getLevelConfig(1).monsterDensity).toBe(0.7);
    });

    test('should throw for invalid density', () => {
      expect(() => config.setMonsterDensity(1, 1.5)).toThrow();
      expect(() => config.setMonsterDensity(1, -0.1)).toThrow();
    });
  });

  describe('Boss Configuration', () => {
    test('should set boss for a level', () => {
      config.setBoss(5, {
        type: 'SKELETON_KING',
        name: 'The Cursed King',
        minions: 'SKELETON',
        minionCount: 6,
      });

      const boss = config.getBoss(5);
      expect(boss.type).toBe('SKELETON_KING');
      expect(boss.name).toBe('The Cursed King');
      expect(boss.minionCount).toBe(6);

      // Should mark as boss level
      expect(config.getLevelConfig(5).isBossLevel).toBe(true);
    });

    test('should remove boss from level', () => {
      config.setBoss(5, { type: 'BUTCHER' });
      config.removeBoss(5);

      expect(config.getBoss(5)).toBeNull();
      expect(config.getLevelConfig(5).isBossLevel).toBe(false);
    });

    test('should add custom boss', () => {
      const customBoss = config.addCustomBoss('dark_lord', {
        type: 'DIABLO',
        name: 'The Dark Lord',
        dialogue: { spawn: 'You dare enter my domain?' },
      });

      expect(customBoss.id).toBe('dark_lord');
      expect(customBoss.name).toBe('The Dark Lord');
    });

    test('should place custom boss on level', () => {
      config.addCustomBoss('my_boss', { type: 'LAZARUS', name: 'Evil One' });
      config.placeCustomBoss(10, 'my_boss', { x: 20, y: 20 });

      const boss = config.getBoss(10);
      expect(boss.name).toBe('Evil One');
      expect(config.getLevelConfig(10).customBossLocation).toEqual({ x: 20, y: 20 });
    });
  });

  describe('Difficulty Configuration', () => {
    test('should set difficulty preset', () => {
      config.setDifficultyPreset('NIGHTMARE');
      expect(config.global.difficultyPreset).toBe('NIGHTMARE');
    });

    test('should throw for invalid preset', () => {
      expect(() => config.setDifficultyPreset('INVALID')).toThrow();
    });

    test('should calculate effective difficulty', () => {
      config.setDifficultyPreset('NIGHTMARE');
      config.setLevelDifficulty(5, 1.5);

      const effective = config.getEffectiveDifficulty(5);

      expect(effective.monsterHealth).toBeGreaterThan(1);
      expect(effective.monsterDamage).toBeGreaterThan(1);
      expect(effective.xp).toBeGreaterThan(1);
    });

    test('should calculate effective monster density', () => {
      config.setDifficultyPreset('HELL'); // Higher density
      config.setMonsterDensity(1, 0.5);
      config.global.monsterDensityMultiplier = 1.2;

      const density = config.getEffectiveMonsterDensity(1);
      expect(density).toBeGreaterThan(0.5);
    });
  });

  describe('Treasure Configuration', () => {
    test('should set treasure density', () => {
      config.setTreasureDensity(1, 0.6);
      expect(config.getLevelConfig(1).treasureDensity).toBe(0.6);
    });

    test('should set item quality bonus', () => {
      config.setItemQualityBonus(16, 25);
      expect(config.getLevelConfig(16).itemQualityBonus).toBe(25);
    });

    test('should add guaranteed drops', () => {
      config.addGuaranteedDrops(16, ['epic_sword', 'healing_potion']);
      expect(config.getLevelConfig(16).guaranteedDrops).toContain('epic_sword');
    });

    test('should get effective loot config', () => {
      config.setDifficultyPreset('NIGHTMARE');
      config.setTreasureDensity(10, 0.4);
      config.setItemQualityBonus(10, 5);
      config.global.goldMultiplier = 1.5;

      const loot = config.getEffectiveLootConfig(10);
      expect(loot.density).toBe(0.4);
      expect(loot.goldMultiplier).toBeGreaterThan(1);
      expect(loot.qualityBonus).toBeGreaterThan(5);
    });
  });

  describe('Story Beat Configuration', () => {
    test('should add story beat to level', () => {
      const beat = config.addStoryBeat(5, {
        event: 'entry',
        dialogue: { speaker: 'Cain', text: 'Be careful...' },
      });

      expect(beat.id).toBeDefined();
      expect(beat.level).toBe(5);
      expect(config.getLevelConfig(5).storyBeats).toContain(beat);
    });

    test('should add level entry trigger', () => {
      const trigger = config.addLevelEntryTrigger(3, {
        dialogue: { speaker: 'Ghost', text: 'Turn back...' },
      });

      expect(trigger.type).toBe('LEVEL_ENTERED');
      expect(trigger.conditions.levelId).toBe(3);
    });

    test('should add boss defeat trigger', () => {
      config.setBoss(3, { type: 'SKELETON_KING', name: 'Leoric' });
      const trigger = config.addBossDefeatTrigger(3, {
        actions: [{ type: 'complete_quest', questId: 'defeat_leoric' }],
      });

      expect(trigger.type).toBe('BOSS_KILLED');
    });

    test('should set required quests', () => {
      config.setRequiredQuests(10, ['quest_1', 'quest_2']);
      expect(config.getLevelConfig(10).requiredQuests).toEqual(['quest_1', 'quest_2']);
    });

    test('should get all story beats for level', () => {
      config.addStoryBeat(5, { event: 'entry' });
      config.addLevelEntryTrigger(5, { dialogue: { text: 'Hello' } });

      const beats = config.getStoryBeats(5);
      expect(beats.onEntry.length).toBeGreaterThan(0);
      expect(beats.storyBeats.length).toBeGreaterThan(0);
    });
  });

  describe('Special Flags', () => {
    test('should set no monsters flag', () => {
      config.setNoMonsters(1, true);
      expect(config.getLevelConfig(1).noMonsters).toBe(true);
    });

    test('should set no treasure flag', () => {
      config.setNoTreasure(1, true);
      expect(config.getLevelConfig(1).noTreasure).toBe(true);
    });

    test('should mark as quest level', () => {
      config.setQuestLevel(5, true);
      expect(config.getLevelConfig(5).isQuestLevel).toBe(true);
    });
  });

  describe('Serialization', () => {
    test('should export configuration', () => {
      config.setDifficultyPreset('NIGHTMARE');
      config.setBoss(3, { type: 'SKELETON_KING' });

      const exported = config.export();

      expect(exported.version).toBe(1);
      expect(exported.global.difficultyPreset).toBe('NIGHTMARE');
      expect(exported.levels['3']).toBeDefined();
    });

    test('should import configuration', () => {
      const data = {
        version: 1,
        global: { difficultyPreset: 'HELL' },
        levels: {
          1: { monsterDensity: 0.9 },
        },
      };

      config.import(data);

      expect(config.global.difficultyPreset).toBe('HELL');
      expect(config.getLevelConfig(1).monsterDensity).toBe(0.9);
    });

    test('should reset to defaults', () => {
      config.setDifficultyPreset('HELL');
      config.setBoss(1, { type: 'DIABLO' });
      config.reset();

      expect(config.global.difficultyPreset).toBe('NORMAL');
      expect(config.getBoss(1)).toBeNull();
    });
  });

  describe('Validation', () => {
    test('should validate configuration', () => {
      const result = config.validate();
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should report boss level without boss', () => {
      config.configureLevelPartial(5, { isBossLevel: true });
      // Remove any boss
      config.removeBoss(5);

      const result = config.validate();
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('boss');
    });
  });

  describe('Summary', () => {
    test('should generate summary', () => {
      config.setBoss(3, { type: 'SKELETON_KING' });
      config.setBoss(16, { type: 'DIABLO' });

      const summary = config.getSummary();

      expect(summary.global).toBeDefined();
      expect(summary.levelSummaries.length).toBe(16);
      expect(summary.totalBosses).toBe(2);
    });
  });
});

describe('CampaignPipeline', () => {
  describe('Pipeline Stages', () => {
    test('should have all required stages', () => {
      expect(Object.keys(PIPELINE_STAGES).length).toBeGreaterThanOrEqual(10);
    });

    test('should get ordered stages', () => {
      const stages = getOrderedStages();
      expect(stages.length).toBeGreaterThan(0);

      // Verify order
      for (let i = 1; i < stages.length; i++) {
        expect(stages[i].order).toBeGreaterThan(stages[i - 1].order);
      }
    });

    test('each stage should have required properties', () => {
      for (const stage of Object.values(PIPELINE_STAGES)) {
        expect(stage.id).toBeDefined();
        expect(stage.name).toBeDefined();
        expect(stage.order).toBeDefined();
        expect(stage.description).toBeDefined();
        expect(typeof stage.required).toBe('boolean');
        expect(typeof stage.retryable).toBe('boolean');
        expect(stage.maxRetries).toBeGreaterThanOrEqual(1);
      }
    });
  });

  describe('Pipeline State', () => {
    let state;

    beforeEach(() => {
      state = new PipelineState();
    });

    test('should start with idle status', () => {
      expect(state.status).toBe('idle');
    });

    test('should track stage completion', () => {
      state.start();
      state.stageStarted('stage_1');
      state.stageCompleted('stage_1', { success: true });

      expect(state.completedStages.has('stage_1')).toBe(true);
    });

    test('should track stage failures', () => {
      state.start();
      state.stageFailed('stage_1', 'Test error');

      expect(state.failedStages.has('stage_1')).toBe(true);
      expect(state.failedStages.get('stage_1').attempts).toBe(1);
    });

    test('should check retry eligibility', () => {
      state.start();

      // First attempt
      expect(state.canRetry('configure_dungeon')).toBe(true);

      // Fail multiple times
      for (let i = 0; i < 10; i++) {
        state.stageFailed('configure_dungeon', 'Error');
      }

      // Should not be able to retry after max attempts
      expect(state.canRetry('configure_dungeon')).toBe(false);
    });

    test('should calculate progress', () => {
      state.start();
      state.stageCompleted('configure_dungeon', {});
      state.stageCompleted('setup_story', {});
      state.stageStarted('setup_characters');

      const progress = state.getProgress();

      expect(progress.completed).toBe(2);
      expect(progress.current).toBe('setup_characters');
      expect(progress.percentage).toBeGreaterThan(0);
    });

    test('should export state', () => {
      state.start();
      state.stageCompleted('stage_1', {});
      state.complete();

      const exported = state.export();

      expect(exported.status).toBe('completed');
      expect(exported.completedStages).toContain('stage_1');
      expect(exported.duration).toBeDefined();
    });
  });

  describe('Pipeline Execution', () => {
    test('should get checklist', () => {
      const checklist = CampaignPipeline.getChecklist();

      expect(checklist.length).toBeGreaterThan(0);
      expect(checklist[0].step).toBe(1);
      expect(checklist[0].name).toBeDefined();
      expect(checklist[0].requiredTools).toBeDefined();
    });

    test('should create pipeline with options', () => {
      const pipeline = new CampaignPipeline({
        maxGlobalRetries: 5,
        validateEachStage: true,
        autoFix: false,
      });

      expect(pipeline.options.maxGlobalRetries).toBe(5);
      expect(pipeline.options.validateEachStage).toBe(true);
      expect(pipeline.options.autoFix).toBe(false);
    });

    test('should emit events', (done) => {
      const pipeline = new CampaignPipeline();
      let eventFired = false;

      pipeline.on('pipelineStarted', () => {
        eventFired = true;
      });

      // Trigger the pipeline start (will fail but event should fire)
      pipeline.execute({}).finally(() => {
        expect(eventFired).toBe(true);
        done();
      });
    });
  });
});

describe('Theme Constants', () => {
  test('DUNGEON_THEMES should have all 4 themes', () => {
    expect(DUNGEON_THEMES.CATHEDRAL).toBeDefined();
    expect(DUNGEON_THEMES.CATACOMBS).toBeDefined();
    expect(DUNGEON_THEMES.CAVES).toBeDefined();
    expect(DUNGEON_THEMES.HELL).toBeDefined();
  });

  test('each theme should have required properties', () => {
    for (const theme of Object.values(DUNGEON_THEMES)) {
      expect(theme.id).toBeDefined();
      expect(theme.name).toBeDefined();
      expect(theme.levelRange).toHaveLength(2);
      expect(theme.tilePrefix).toBeDefined();
      expect(theme.defaultMonsters).toBeDefined();
      expect(theme.defaultMonsters.length).toBeGreaterThan(0);
    }
  });
});

describe('Difficulty Presets', () => {
  test('should have all presets', () => {
    expect(DIFFICULTY_PRESETS.EASY).toBeDefined();
    expect(DIFFICULTY_PRESETS.NORMAL).toBeDefined();
    expect(DIFFICULTY_PRESETS.NIGHTMARE).toBeDefined();
    expect(DIFFICULTY_PRESETS.HELL).toBeDefined();
  });

  test('presets should have increasing difficulty', () => {
    const presets = ['EASY', 'NORMAL', 'NIGHTMARE', 'HELL'];
    let prevHealth = 0;

    for (const preset of presets) {
      const { monsterHealthMultiplier } = DIFFICULTY_PRESETS[preset];
      expect(monsterHealthMultiplier).toBeGreaterThanOrEqual(prevHealth);
      prevHealth = monsterHealthMultiplier;
    }
  });
});
