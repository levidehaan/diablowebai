/**
 * Campaign Builder
 *
 * Master orchestration system for building complete AI campaigns.
 * Takes a CampaignBlueprint and generates all necessary game content:
 * - Level geometry (DUN files)
 * - Monster placements
 * - Item distributions
 * - Quest triggers
 * - NPC dialogue
 * - Asset requirements
 *
 * Flow:
 * 1. Story Definition → AI generates complete narrative
 * 2. World Building → Generate map layouts for all locations
 * 3. Entity Placement → Place monsters, NPCs, objects
 * 4. Quest Setup → Configure triggers and objectives
 * 5. Asset Resolution → Identify missing assets for generation
 * 6. Validation → Ensure campaign is playable
 * 7. Export → Create MPQ-ready files
 */

import {
  CampaignBlueprint,
  Act,
  Chapter,
  Scene,
  Location,
  Character,
  Quest,
  QuestObjective,
  AssetRequirement,
  SCENE_TYPES,
  CHARACTER_ROLES,
  LOCATION_TYPES,
  DUNGEON_THEMES,
  ASSET_CATEGORIES,
  STORY_TEMPLATES,
} from './CampaignBlueprint';

import {
  MONSTER_REGISTRY,
  NPC_REGISTRY,
  ITEM_REGISTRY,
  OBJECT_REGISTRY,
  AssetSearch,
} from './AssetRegistry';

import { generateBSP, generateCave, generateDrunkardWalk, generateArena, generateForTheme } from './ProceduralGenerator';
import TileMapper from './TileMapper';
import MonsterMapper from './MonsterMapper';
import ObjectMapper from './ObjectMapper';
import DUNParser from './DUNParser';
import { validateLevel, checkPath } from './LevelValidator';
import questTriggerManager, { TRIGGER_TYPES, ACTION_TYPES, TriggerBuilder, ActionBuilder } from './QuestTriggers';
import { buildProgress, BUILD_STATUS, TASK_STATUS } from './CampaignBuildProgress';

// ============================================================================
// CAMPAIGN BUILDER
// ============================================================================

/**
 * Main Campaign Builder class
 */
export class CampaignBuilder {
  constructor(options = {}) {
    this.blueprint = null;
    this.generatedContent = {
      levels: new Map(),      // path → DUN data
      triggers: [],           // Quest triggers
      dialogue: new Map(),    // characterId → dialogue tree
      assets: new Map(),      // assetId → asset data
    };

    // Options
    this.options = {
      aiProvider: options.aiProvider || null,
      generateCustomAssets: options.generateCustomAssets || false,
      assetGenerator: options.assetGenerator || null, // NanoBanana integration
      validateOnBuild: options.validateOnBuild !== false,
      seed: options.seed || Date.now(),
      useProgressEmitter: options.useProgressEmitter !== false, // Enable progress tracking
      ...options,
    };

    // Build state
    this.buildState = {
      phase: 'idle',
      progress: 0,
      currentStep: '',
      errors: [],
      warnings: [],
    };

    // Event listeners
    this.listeners = new Map();
  }

  // ============================================================================
  // MAIN BUILD PIPELINE
  // ============================================================================

  /**
   * Build a complete campaign from a blueprint
   */
  async build(blueprint) {
    this.blueprint = blueprint instanceof CampaignBlueprint
      ? blueprint
      : new CampaignBlueprint(blueprint);

    this.buildState = {
      phase: 'starting',
      progress: 0,
      currentStep: 'Initializing...',
      errors: [],
      warnings: [],
    };

    // Start progress tracking
    if (this.options.useProgressEmitter) {
      buildProgress.startBuild(this.blueprint.id);
    }

    try {
      // Phase 1: Story Generation (if needed)
      await this.buildStory();

      // Phase 2: World Building
      await this.buildWorld();

      // Phase 3: Character Setup
      await this.buildCharacters();

      // Phase 4: Quest System
      await this.buildQuests();

      // Phase 5: Level Generation
      await this.buildLevels();

      // Phase 6: Asset Resolution
      await this.resolveAssets();

      // Phase 7: Validation
      if (this.options.validateOnBuild) {
        await this.validateCampaign();
      }

      this.buildState.phase = 'complete';
      this.buildState.progress = 100;

      const result = this.getResult();

      if (this.options.useProgressEmitter) {
        buildProgress.completeBuild(true, `Generated ${result.levels.length} levels, ${result.triggers.length} triggers`);
      }

      this.emit('buildComplete', result);
      return result;

    } catch (error) {
      this.buildState.phase = 'error';
      this.buildState.errors.push(error.message);

      if (this.options.useProgressEmitter) {
        buildProgress.completeBuild(false, error.message);
      }

      this.emit('buildError', error);
      throw error;
    }
  }

  /**
   * Build from a story template
   */
  async buildFromTemplate(templateName, customizations = {}) {
    const template = STORY_TEMPLATES[templateName];
    if (!template) {
      throw new Error(`Unknown template: ${templateName}`);
    }

    // Create blueprint from template
    const blueprint = new CampaignBlueprint({
      name: customizations.name || `${templateName} Campaign`,
      story: {
        premise: template.premise,
        acts: [],
      },
    });

    // Generate acts from template
    for (let i = 0; i < template.acts; i++) {
      const theme = template.themes[i] || 'cathedral';
      const themeData = DUNGEON_THEMES[theme.toUpperCase()] || DUNGEON_THEMES.CATHEDRAL;

      blueprint.story.addAct({
        number: i + 1,
        title: `Act ${i + 1}: ${this.generateActTitle(theme)}`,
        theme,
        levelRange: themeData.levelRange,
        boss: template.bossProgression[i],
      });
    }

    // Apply customizations
    if (customizations.story) {
      Object.assign(blueprint.story, customizations.story);
    }

    return this.build(blueprint);
  }

  // ============================================================================
  // PHASE 1: STORY GENERATION
  // ============================================================================

  async buildStory() {
    this.updateProgress('story', 0, 'Generating story...');

    // If story is already complete, skip
    if (this.blueprint.story.acts.length > 0 &&
        this.blueprint.story.acts[0].chapters.length > 0) {
      this.blueprint.generationStatus.story = true;
      this.updateProgress('story', 100, 'Story loaded');
      return;
    }

    // Generate story structure using AI if available
    if (this.options.aiProvider) {
      await this.generateStoryWithAI();
    } else {
      await this.generateStoryProcedural();
    }

    this.blueprint.generationStatus.story = true;
    this.updateProgress('story', 100, 'Story complete');
  }

  async generateStoryWithAI() {
    const prompt = this.buildStoryPrompt();

    try {
      const response = await this.options.aiProvider.generate(prompt);
      const storyData = JSON.parse(response);
      this.applyStoryData(storyData);
    } catch (error) {
      console.warn('[CampaignBuilder] AI story generation failed, using procedural:', error);
      await this.generateStoryProcedural();
    }
  }

  async generateStoryProcedural() {
    const { story } = this.blueprint;

    // Generate chapters for each act
    for (const act of story.acts) {
      const chaptersPerAct = 4;
      const themeData = DUNGEON_THEMES[act.theme.toUpperCase()] || DUNGEON_THEMES.CATHEDRAL;

      for (let c = 0; c < chaptersPerAct; c++) {
        const chapter = act.addChapter({
          number: c + 1,
          title: this.generateChapterTitle(act.theme, c),
          description: this.generateChapterDescription(act, c),
          primaryLocation: `${act.theme}_level_${c + 1}`,
          enemies: themeData.enemies.slice(0, 3 + c),
          miniBoss: c === chaptersPerAct - 1 ? act.boss : null,
        });

        // Generate scenes for each chapter
        await this.generateChapterScenes(chapter, act);
      }
    }
  }

  async generateChapterScenes(chapter, act) {
    // Standard scene structure: Entry → Exploration → Combat → Boss/Transition

    // Entry scene
    chapter.addScene({
      type: SCENE_TYPES.LEVEL_TRANSITION,
      title: 'Descent',
      description: `Entering ${chapter.title}`,
      triggers: [{ type: 'level_entered', conditions: { levelId: chapter.primaryLocation } }],
    });

    // Exploration scenes
    chapter.addScene({
      type: SCENE_TYPES.EXPLORATION,
      title: 'The Unknown Path',
      description: 'Explore the dungeon and uncover its secrets',
    });

    // Combat encounters
    chapter.addScene({
      type: SCENE_TYPES.COMBAT,
      title: 'Hostile Territory',
      description: 'Face the denizens of this place',
      combat: {
        enemyTypes: chapter.enemies,
        spawnTemplate: 'patrol',
        difficulty: act.number + chapter.number - 1,
      },
    });

    // Boss/Mini-boss scene (if applicable)
    if (chapter.miniBoss) {
      chapter.addScene({
        type: SCENE_TYPES.BOSS_FIGHT,
        title: this.generateBossSceneTitle(chapter.miniBoss),
        description: `Confront ${chapter.miniBoss}`,
        combat: {
          bossId: chapter.miniBoss,
          spawnTemplate: 'boss_room',
        },
      });
    }
  }

  buildStoryPrompt() {
    return `Generate a complete Diablo-style campaign story in JSON format.

Campaign Name: ${this.blueprint.name}
Premise: ${this.blueprint.story.premise || 'A hero must descend into darkness to confront evil'}
Themes: ${this.blueprint.story.themes.join(', ')}
Number of Acts: ${this.blueprint.story.acts.length || 4}

Generate:
1. Opening cinematic narration
2. For each act: title, introduction, 4 chapters with objectives
3. For each chapter: title, description, key scenes, dialogue moments
4. Boss encounters with intro/defeat dialogue
5. Ending cinematic narration

Return as JSON with structure:
{
  "opening": { "narration": "...", "visuals": [...] },
  "acts": [{ "title": "...", "chapters": [...], "boss": {...} }],
  "ending": { "narration": "...", "epilogue": "..." }
}`;
  }

  applyStoryData(storyData) {
    if (storyData.opening) {
      this.blueprint.story.opening.narration = storyData.opening.narration;
      this.blueprint.story.opening.visuals = storyData.opening.visuals;
    }

    if (storyData.acts) {
      for (let i = 0; i < storyData.acts.length; i++) {
        const actData = storyData.acts[i];
        const act = this.blueprint.story.acts[i];
        if (act && actData) {
          act.title = actData.title || act.title;
          act.introduction = actData.introduction || '';
          // Apply chapters...
        }
      }
    }

    if (storyData.ending) {
      this.blueprint.story.ending.narration = storyData.ending.narration;
      this.blueprint.story.ending.epilogue = storyData.epilogue;
    }
  }

  // ============================================================================
  // PHASE 2: WORLD BUILDING
  // ============================================================================

  async buildWorld() {
    this.updateProgress('world', 0, 'Building world...');

    // Create town location
    this.blueprint.world.addLocation({
      id: 'town',
      name: 'Tristram',
      type: LOCATION_TYPES.TOWN,
      theme: 'town',
      description: 'The small village of Tristram, gateway to the cathedral',
    });

    // Create locations for each act/chapter
    let locationIndex = 0;
    const totalLocations = this.blueprint.story.getTotalChapters() + 1;

    for (const act of this.blueprint.story.acts) {
      for (const chapter of act.chapters) {
        locationIndex++;
        this.updateProgress('world', (locationIndex / totalLocations) * 100, `Creating ${chapter.title}...`);

        const locationId = `${act.theme}_level_${chapter.number}`;
        this.blueprint.world.addLocation({
          id: locationId,
          name: chapter.title,
          type: LOCATION_TYPES.DUNGEON,
          theme: act.theme,
          description: chapter.description,
          mapSettings: {
            width: 40,
            height: 40,
            algorithm: this.selectAlgorithmForTheme(act.theme),
            seed: this.options.seed + locationIndex,
          },
          enemyTable: chapter.enemies.map(e => ({
            type: e,
            weight: 1,
            minCount: 5,
            maxCount: 15,
          })),
          objectTable: this.generateObjectTable(act.theme),
        });

        // Update chapter's primary location
        chapter.primaryLocation = locationId;
      }
    }

    // Set up connections
    this.setupWorldConnections();

    this.blueprint.generationStatus.world = true;
    this.updateProgress('world', 100, 'World complete');
  }

  selectAlgorithmForTheme(theme) {
    switch (theme) {
      case 'cathedral':
      case 'catacombs':
        return 'bsp';
      case 'caves':
        return 'cellular';
      case 'hell':
        return 'arena';
      default:
        return 'bsp';
    }
  }

  generateObjectTable(theme) {
    const objects = AssetSearch.searchObjects({ theme });
    return objects.map(obj => ({
      type: obj.key,
      weight: obj.category === 'container' ? 2 : 1,
    }));
  }

  setupWorldConnections() {
    const locations = Array.from(this.blueprint.world.locations.values());

    // Connect town to first dungeon
    const firstDungeon = locations.find(l => l.type === LOCATION_TYPES.DUNGEON);
    if (firstDungeon) {
      this.blueprint.world.connections.push({
        from: 'town',
        to: firstDungeon.id,
        type: 'stairs_down',
        bidirectional: true,
      });
    }

    // Connect dungeons in sequence
    const dungeons = locations.filter(l => l.type === LOCATION_TYPES.DUNGEON);
    for (let i = 0; i < dungeons.length - 1; i++) {
      this.blueprint.world.connections.push({
        from: dungeons[i].id,
        to: dungeons[i + 1].id,
        type: 'stairs_down',
        bidirectional: true,
      });
    }
  }

  // ============================================================================
  // PHASE 3: CHARACTER SETUP
  // ============================================================================

  async buildCharacters() {
    this.updateProgress('characters', 0, 'Setting up characters...');

    // Add standard Diablo NPCs
    for (const [id, npcData] of Object.entries(NPC_REGISTRY)) {
      this.blueprint.characters.addCharacter({
        id,
        name: npcData.name,
        title: npcData.title,
        role: this.mapNPCRole(npcData.role),
        location: 'town',
        appearance: {
          sprite: npcData.sprite,
          portrait: npcData.portrait,
        },
        personality: npcData.personality,
        dialogue: npcData.dialogue,
        tags: npcData.tags,
      });
    }

    // Add bosses from story
    for (const act of this.blueprint.story.acts) {
      if (act.boss) {
        const bossData = MONSTER_REGISTRY[act.boss];
        if (bossData) {
          this.blueprint.characters.addCharacter({
            id: `boss_${act.boss}`,
            name: bossData.name,
            role: act.number === this.blueprint.story.acts.length
              ? CHARACTER_ROLES.FINAL_BOSS
              : CHARACTER_ROLES.BOSS,
            appearance: {
              sprite: bossData.sprite,
            },
            combat: {
              health: bossData.bossData?.health || 500,
              ...bossData.bossData,
            },
            bossData: bossData.bossData,
            tags: bossData.tags,
          });
        }
      }
    }

    this.blueprint.generationStatus.characters = true;
    this.updateProgress('characters', 100, 'Characters complete');
  }

  mapNPCRole(npcRole) {
    const roleMap = {
      mentor: CHARACTER_ROLES.MENTOR,
      merchant: CHARACTER_ROLES.MERCHANT,
      healer: CHARACTER_ROLES.HEALER,
      quest_giver: CHARACTER_ROLES.QUEST_GIVER,
      information: CHARACTER_ROLES.NEUTRAL,
    };
    return roleMap[npcRole] || CHARACTER_ROLES.NEUTRAL;
  }

  // ============================================================================
  // PHASE 4: QUEST SYSTEM
  // ============================================================================

  async buildQuests() {
    this.updateProgress('quests', 0, 'Creating quests...');

    // Create main quest line
    const mainQuest = this.blueprint.quests.setMainQuest({
      id: 'main_quest',
      name: 'The Lord of Terror',
      description: 'Descend into the depths and defeat Diablo',
      objectives: this.generateMainQuestObjectives(),
      rewards: {
        experience: 10000,
        gold: 5000,
      },
      completionDialogue: 'You have saved Tristram from the darkness.',
    });

    // Create side quests
    await this.generateSideQuests();

    // Set up victory conditions
    this.blueprint.completion.victoryConditions = [
      { type: 'quest_completed', target: 'main_quest' },
      { type: 'boss_defeated', target: 'diablo' },
    ];

    // Create quest triggers
    await this.setupQuestTriggers();

    this.blueprint.generationStatus.quests = true;
    this.updateProgress('quests', 100, 'Quests complete');
  }

  generateMainQuestObjectives() {
    const objectives = [];

    for (const act of this.blueprint.story.acts) {
      if (act.boss) {
        objectives.push(new QuestObjective({
          id: `defeat_${act.boss}`,
          type: 'kill',
          description: `Defeat ${MONSTER_REGISTRY[act.boss]?.name || act.boss}`,
          target: act.boss,
          count: 1,
        }));
      }
    }

    return objectives;
  }

  async generateSideQuests() {
    // Generate quests from NPCs
    const questGivers = this.blueprint.characters.search({ tags: ['quest_giver'] });

    for (const giver of questGivers) {
      // Each quest giver gets 1-2 quests
      const numQuests = 1 + Math.floor(Math.random() * 2);

      for (let i = 0; i < numQuests; i++) {
        const quest = this.generateQuestForNPC(giver);
        this.blueprint.quests.addSideQuest(quest);
        giver.questsGiven = giver.questsGiven || [];
        giver.questsGiven.push(quest.id);
      }
    }
  }

  generateQuestForNPC(npc) {
    const questTypes = ['kill', 'find', 'explore'];
    const type = questTypes[Math.floor(Math.random() * questTypes.length)];

    let quest;
    switch (type) {
      case 'kill':
        const monsters = AssetSearch.searchMonsters({ maxDifficulty: 10 });
        const target = monsters[Math.floor(Math.random() * monsters.length)];
        quest = {
          id: `quest_${npc.id}_${Date.now()}`,
          name: `Slay the ${target.name}s`,
          description: `${npc.name} asks you to eliminate the ${target.name} threat.`,
          giver: npc.id,
          objectives: [{
            type: 'kill',
            target: target.key,
            count: 5 + Math.floor(Math.random() * 10),
            description: `Kill ${target.name}s`,
          }],
          rewards: {
            experience: 500,
            gold: 200,
          },
        };
        break;

      case 'find':
        const items = AssetSearch.searchItems({ type: 'consumable' });
        const item = items[Math.floor(Math.random() * items.length)];
        quest = {
          id: `quest_${npc.id}_${Date.now()}`,
          name: `Gather Supplies`,
          description: `${npc.name} needs ${item.name}s.`,
          giver: npc.id,
          objectives: [{
            type: 'collect',
            target: item.key,
            count: 3,
            description: `Find ${item.name}s`,
          }],
          rewards: {
            experience: 300,
            gold: 100,
          },
        };
        break;

      case 'explore':
      default:
        const locations = Array.from(this.blueprint.world.locations.values())
          .filter(l => l.type === LOCATION_TYPES.DUNGEON);
        const location = locations[Math.floor(Math.random() * locations.length)];
        quest = {
          id: `quest_${npc.id}_${Date.now()}`,
          name: `Explore ${location?.name || 'the Depths'}`,
          description: `${npc.name} wants you to explore and report back.`,
          giver: npc.id,
          objectives: [{
            type: 'reach',
            target: location?.id,
            count: 1,
            description: `Reach ${location?.name || 'the destination'}`,
          }],
          rewards: {
            experience: 400,
            gold: 150,
          },
        };
        break;
    }

    return quest;
  }

  async setupQuestTriggers() {
    // Main quest triggers
    const mainQuest = this.blueprint.quests.mainQuest;
    if (mainQuest) {
      // Quest start trigger
      this.generatedContent.triggers.push({
        id: 'main_quest_start',
        type: TRIGGER_TYPES.LEVEL_ENTERED,
        conditions: { levelId: 'cathedral_level_1' },
        actions: [
          ActionBuilder.startQuest(mainQuest.id, mainQuest.name, mainQuest.description, mainQuest.objectives),
        ],
        oneShot: true,
      });

      // Boss defeat triggers
      for (const objective of mainQuest.objectives) {
        if (objective.type === 'kill') {
          this.generatedContent.triggers.push({
            id: `boss_defeat_${objective.target}`,
            type: TRIGGER_TYPES.BOSS_KILLED,
            conditions: { bossId: objective.target },
            actions: [
              ActionBuilder.updateObjective(mainQuest.id, objective.id, 1, true),
              ActionBuilder.notification(`${MONSTER_REGISTRY[objective.target]?.name || objective.target} defeated!`),
            ],
            oneShot: true,
          });
        }
      }
    }

    // Side quest triggers
    for (const quest of this.blueprint.quests.sideQuests.values()) {
      // Quest available trigger (talking to NPC)
      this.generatedContent.triggers.push({
        id: `${quest.id}_available`,
        type: TRIGGER_TYPES.OBJECT_ACTIVATED,
        conditions: { objectId: quest.giver },
        actions: [
          ActionBuilder.dialogue(quest.giver, quest.giverDialogue?.offer || `Will you help me?`),
          ActionBuilder.startQuest(quest.id, quest.name, quest.description, quest.objectives),
        ],
        oneShot: true,
      });
    }
  }

  // ============================================================================
  // PHASE 5: LEVEL GENERATION
  // ============================================================================

  async buildLevels() {
    this.updateProgress('levels', 0, 'Generating levels...');

    const dungeonLocations = Array.from(this.blueprint.world.locations.values())
      .filter(l => l.type === LOCATION_TYPES.DUNGEON);

    // Add tasks for each level
    dungeonLocations.forEach((loc, i) => {
      this.addTask(`level_${loc.id}`, `Generate Level: ${loc.name}`);
    });

    for (let i = 0; i < dungeonLocations.length; i++) {
      const location = dungeonLocations[i];
      const taskId = `level_${location.id}`;

      this.startTask(taskId);
      this.updateProgress('levels', (i / dungeonLocations.length) * 100, `Generating ${location.name}...`);

      try {
        const level = await this.generateLevel(location);
        const path = `levels/${location.theme}/ai_${location.id}.dun`;
        this.generatedContent.levels.set(path, level);

        // Validate the level
        const validation = validateLevel(level, location.theme);
        if (validation.valid) {
          this.completeTask(taskId, TASK_STATUS.SUCCESS, `${level.width}x${level.height}`);
        } else {
          this.completeTask(taskId, TASK_STATUS.WARNING, validation.warnings[0]);
          this.buildState.warnings.push(`Level ${location.name}: ${validation.warnings[0]}`);
        }
      } catch (error) {
        this.completeTask(taskId, TASK_STATUS.ERROR, error.message);
        console.error(`[CampaignBuilder] Failed to generate level ${location.name}:`, error);
      }
    }

    this.updateProgress('levels', 100, 'Levels complete');
  }

  async generateLevel(location) {
    const { mapSettings, enemyTable, objectTable, theme } = location;

    // Generate dungeon layout
    let dungeon;
    switch (mapSettings.algorithm) {
      case 'bsp':
        dungeon = generateBSP(mapSettings.width, mapSettings.height, {
          seed: mapSettings.seed,
        });
        break;
      case 'cellular':
        dungeon = generateCave(mapSettings.width, mapSettings.height, {
          seed: mapSettings.seed,
        });
        break;
      case 'drunkard':
        dungeon = generateDrunkardWalk(mapSettings.width, mapSettings.height, {
          seed: mapSettings.seed,
        });
        break;
      case 'arena':
        dungeon = generateArena(mapSettings.width, mapSettings.height, {
          seed: mapSettings.seed,
        });
        break;
      default:
        dungeon = generateForTheme(mapSettings.width, mapSettings.height, theme, {
          seed: mapSettings.seed,
        });
    }

    // Convert to tile grid
    const tileGrid = TileMapper.convertToTileGrid(dungeon.grid, theme);

    // Create DUN data structure
    const dunData = {
      width: mapSettings.width,
      height: mapSettings.height,
      baseTiles: tileGrid,
      monsters: this.generateMonsterLayer(dungeon, enemyTable, mapSettings),
      objects: this.generateObjectLayer(dungeon, objectTable, mapSettings),
      items: DUNParser.createEmptySubLayer(mapSettings.width, mapSettings.height),
      hasMonsters: true,
      hasObjects: true,
      hasItems: true,
    };

    // Place stairs
    if (dungeon.stairs) {
      if (dungeon.stairs.up) {
        dunData.baseTiles[dungeon.stairs.up.y][dungeon.stairs.up.x] =
          TileMapper.TILE_SETS[theme]?.stairsUp || 36;
      }
      if (dungeon.stairs.down) {
        dunData.baseTiles[dungeon.stairs.down.y][dungeon.stairs.down.x] =
          TileMapper.TILE_SETS[theme]?.stairsDown || 37;
      }
    }

    // Validate level
    const validation = validateLevel(dunData, theme);
    if (!validation.valid) {
      console.warn(`[CampaignBuilder] Level ${location.id} validation warnings:`, validation.warnings);
    }

    return dunData;
  }

  generateMonsterLayer(dungeon, enemyTable, settings) {
    const layer = DUNParser.createEmptySubLayer(settings.width, settings.height);

    if (!enemyTable || enemyTable.length === 0) return layer;

    // Use rooms from dungeon to place monsters
    const rooms = dungeon.rooms || [];

    for (const room of rooms) {
      // Determine how many monsters in this room
      const monsterCount = 2 + Math.floor(Math.random() * 4);

      for (let i = 0; i < monsterCount; i++) {
        // Pick random enemy from table
        const enemy = this.weightedRandom(enemyTable);
        const monsterData = MONSTER_REGISTRY[enemy.type];

        if (monsterData) {
          // Random position in room
          const x = room.x + 1 + Math.floor(Math.random() * (room.width - 2));
          const y = room.y + 1 + Math.floor(Math.random() * (room.height - 2));

          // Place at sub-tile resolution (2x)
          const sx = x * 2;
          const sy = y * 2;

          if (sy < layer.length && sx < layer[0].length) {
            layer[sy][sx] = monsterData.id;
          }
        }
      }
    }

    return layer;
  }

  generateObjectLayer(dungeon, objectTable, settings) {
    const layer = DUNParser.createEmptySubLayer(settings.width, settings.height);

    if (!objectTable || objectTable.length === 0) return layer;

    const rooms = dungeon.rooms || [];

    for (const room of rooms) {
      // Place 1-3 objects per room
      const objectCount = 1 + Math.floor(Math.random() * 3);

      for (let i = 0; i < objectCount; i++) {
        const obj = this.weightedRandom(objectTable);
        const objectData = OBJECT_REGISTRY[obj.type];

        if (objectData) {
          const x = room.x + 1 + Math.floor(Math.random() * (room.width - 2));
          const y = room.y + 1 + Math.floor(Math.random() * (room.height - 2));

          const sx = x * 2;
          const sy = y * 2;

          if (sy < layer.length && sx < layer[0].length && layer[sy][sx] === 0) {
            layer[sy][sx] = objectData.id;
          }
        }
      }
    }

    return layer;
  }

  weightedRandom(table) {
    const totalWeight = table.reduce((sum, item) => sum + (item.weight || 1), 0);
    let random = Math.random() * totalWeight;

    for (const item of table) {
      random -= (item.weight || 1);
      if (random <= 0) return item;
    }

    return table[0];
  }

  // ============================================================================
  // PHASE 6: ASSET RESOLUTION
  // ============================================================================

  async resolveAssets() {
    this.updateProgress('assets', 0, 'Resolving assets...');

    // Collect all asset requirements
    const requirements = new Set();

    // From characters
    for (const char of this.blueprint.characters.characters.values()) {
      if (char.appearance.sprite) requirements.add(char.appearance.sprite);
      if (char.appearance.portrait) requirements.add(char.appearance.portrait);
    }

    // From locations
    for (const loc of this.blueprint.world.locations.values()) {
      for (const req of loc.assetRequirements || []) {
        requirements.add(req);
      }
    }

    // Check which assets exist vs need generation
    for (const assetPath of requirements) {
      const exists = await this.checkAssetExists(assetPath);

      if (exists) {
        this.blueprint.assets.markAsExisting(assetPath);
      } else {
        // Add to generation queue
        this.blueprint.assets.addAsset({
          id: assetPath,
          name: assetPath.split('/').pop(),
          category: this.categorizeAsset(assetPath),
          generationPrompt: this.generateAssetPrompt(assetPath),
          fallbackAsset: this.findFallbackAsset(assetPath),
        });
      }
    }

    // If custom asset generation is enabled, generate missing assets
    if (this.options.generateCustomAssets && this.options.assetGenerator) {
      const needsGeneration = this.blueprint.assets.getAssetsNeedingGeneration();
      for (const asset of needsGeneration) {
        await this.generateAsset(asset);
      }
    }

    this.blueprint.generationStatus.assets = true;
    this.updateProgress('assets', 100, 'Assets resolved');
  }

  async checkAssetExists(path) {
    // Check if asset exists in game files
    // This would check the MPQ or asset storage
    return false; // For now, assume we need to check
  }

  categorizeAsset(path) {
    if (path.includes('monster')) return ASSET_CATEGORIES.ENEMY;
    if (path.includes('npc')) return ASSET_CATEGORIES.NPC;
    if (path.includes('item')) return ASSET_CATEGORIES.WEAPON;
    if (path.includes('tile')) return ASSET_CATEGORIES.TILE_FLOOR;
    if (path.includes('portrait')) return ASSET_CATEGORIES.PORTRAIT;
    return ASSET_CATEGORIES.DECORATION;
  }

  generateAssetPrompt(path) {
    // Generate a prompt for NanoBanana based on asset type
    const filename = path.split('/').pop().replace('.cel', '');
    return `Diablo 1 style pixel art sprite of ${filename.replace(/_/g, ' ')}, dark fantasy, 256 color palette, isometric perspective`;
  }

  findFallbackAsset(path) {
    // Find an existing asset to use as fallback
    if (path.includes('monster')) return 'monsters/zombie.cel';
    if (path.includes('npc')) return 'npcs/cain.cel';
    return null;
  }

  async generateAsset(asset) {
    if (!this.options.assetGenerator) return;

    try {
      const generated = await this.options.assetGenerator.generate(asset.generationPrompt, {
        width: asset.dimensions.width,
        height: asset.dimensions.height,
        style: 'pixel_art',
      });

      this.generatedContent.assets.set(asset.id, generated);
      this.blueprint.assets.markAsGenerated(asset.id);

    } catch (error) {
      console.warn(`[CampaignBuilder] Asset generation failed for ${asset.id}:`, error);
      this.buildState.warnings.push(`Failed to generate asset: ${asset.id}`);
    }
  }

  // ============================================================================
  // PHASE 7: VALIDATION
  // ============================================================================

  async validateCampaign() {
    this.updateProgress('validation', 0, 'Validating campaign...');

    // Validate blueprint
    const blueprintValidation = this.blueprint.validate();
    if (!blueprintValidation.valid) {
      this.buildState.errors.push(...blueprintValidation.errors);
    }
    this.buildState.warnings.push(...blueprintValidation.warnings);

    // Validate each level
    for (const [path, dunData] of this.generatedContent.levels) {
      const theme = path.split('/')[1] || 'cathedral';
      const levelValidation = validateLevel(dunData, theme);

      if (!levelValidation.valid) {
        this.buildState.errors.push(`Level ${path}: ${levelValidation.errors.join(', ')}`);
      }
    }

    // Check quest completability
    const mainQuest = this.blueprint.quests.mainQuest;
    if (mainQuest) {
      for (const objective of mainQuest.objectives) {
        if (objective.type === 'kill' && objective.target) {
          const bossExists = this.blueprint.characters.getCharacter(`boss_${objective.target}`);
          if (!bossExists) {
            this.buildState.warnings.push(`Boss ${objective.target} not found in characters`);
          }
        }
      }
    }

    this.blueprint.generationStatus.validated = this.buildState.errors.length === 0;
    this.updateProgress('validation', 100, 'Validation complete');
  }

  // ============================================================================
  // UTILITIES
  // ============================================================================

  updateProgress(phase, progress, step) {
    const previousPhase = this.buildState.phase;
    this.buildState.phase = phase;
    this.buildState.progress = progress;
    this.buildState.currentStep = step;
    this.emit('progress', { phase, progress, step });

    // Emit to buildProgress
    if (this.options.useProgressEmitter) {
      // Start new phase if different
      if (previousPhase !== phase && progress === 0) {
        buildProgress.startPhase(phase);
      }

      // Update phase progress
      buildProgress.updatePhaseProgress(phase, progress, step);

      // Complete phase if at 100%
      if (progress >= 100) {
        buildProgress.completePhase(phase, TASK_STATUS.SUCCESS);
      }
    }
  }

  /**
   * Add a task for progress tracking
   */
  addTask(taskId, name) {
    if (this.options.useProgressEmitter) {
      buildProgress.addTask(taskId, name, this.buildState.phase);
    }
  }

  /**
   * Start a task
   */
  startTask(taskId) {
    if (this.options.useProgressEmitter) {
      buildProgress.startTask(taskId);
    }
  }

  /**
   * Complete a task
   */
  completeTask(taskId, status = TASK_STATUS.SUCCESS, message = null) {
    if (this.options.useProgressEmitter) {
      buildProgress.completeTask(taskId, status, message);
    }
  }

  /**
   * Retry a task
   */
  retryTask(taskId, reason) {
    if (this.options.useProgressEmitter) {
      buildProgress.retryTask(taskId, reason);
    }
  }

  generateActTitle(theme) {
    const titles = {
      cathedral: ['The Fallen Cathedral', 'The Church of Darkness', 'The Unholy Sanctuary'],
      catacombs: ['The Forgotten Tombs', 'The Bone Gardens', 'The Silent Crypts'],
      caves: ['The Depths Below', 'The Sunless Caverns', 'The Earthen Abyss'],
      hell: ['The Gates of Hell', 'The Burning Hells', 'The Lord\'s Domain'],
    };
    const options = titles[theme] || titles.cathedral;
    return options[Math.floor(Math.random() * options.length)];
  }

  generateChapterTitle(theme, chapterNum) {
    const bases = {
      cathedral: ['The Entry Hall', 'The Inner Sanctum', 'The Choir Loft', 'The Archbishop\'s Chambers'],
      catacombs: ['The Burial Halls', 'The Ossuary', 'The Noble Tombs', 'The Ancient Crypt'],
      caves: ['The Upper Mines', 'The Fungal Grotto', 'The Crystal Caverns', 'The Deepest Pit'],
      hell: ['The Outer Ring', 'The River of Flame', 'The Chaos Sanctuary', 'Diablo\'s Lair'],
    };
    const options = bases[theme] || bases.cathedral;
    return options[chapterNum] || `Level ${chapterNum + 1}`;
  }

  generateChapterDescription(act, chapterNum) {
    return `Venture deeper into ${act.title} to discover what horrors await.`;
  }

  generateBossSceneTitle(bossId) {
    const bossData = MONSTER_REGISTRY[bossId];
    return bossData?.bossData?.title || `Confrontation with ${bossData?.name || bossId}`;
  }

  // Event emitter
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index !== -1) listeners.splice(index, 1);
    }
  }

  emit(event, data) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(cb => cb(data));
    }
  }

  // ============================================================================
  // OUTPUT
  // ============================================================================

  getResult() {
    return {
      blueprint: this.blueprint,
      generatedContent: {
        levels: Object.fromEntries(this.generatedContent.levels),
        triggers: this.generatedContent.triggers,
        dialogue: Object.fromEntries(this.generatedContent.dialogue),
        assets: Object.fromEntries(this.generatedContent.assets),
      },
      buildState: this.buildState,
      summary: {
        name: this.blueprint.name,
        acts: this.blueprint.story.acts.length,
        chapters: this.blueprint.story.getTotalChapters(),
        levels: this.generatedContent.levels.size,
        characters: this.blueprint.characters.getCount(),
        quests: this.blueprint.quests.getCount(),
        triggers: this.generatedContent.triggers.length,
        errors: this.buildState.errors.length,
        warnings: this.buildState.warnings.length,
      },
    };
  }

  /**
   * Export campaign to files for MPQ packaging
   */
  exportToFiles() {
    const files = [];

    // Export DUN levels
    for (const [path, dunData] of this.generatedContent.levels) {
      files.push({
        path,
        buffer: DUNParser.write(dunData),
        type: 'dun',
      });
    }

    // Export campaign manifest
    files.push({
      path: 'campaign/manifest.json',
      buffer: new TextEncoder().encode(JSON.stringify(this.blueprint.toJSON(), null, 2)),
      type: 'json',
    });

    // Export triggers
    files.push({
      path: 'campaign/triggers.json',
      buffer: new TextEncoder().encode(JSON.stringify(this.generatedContent.triggers, null, 2)),
      type: 'json',
    });

    return files;
  }
}

// ============================================================================
// QUICK BUILDERS
// ============================================================================

/**
 * Quick builder for creating campaigns
 */
export const QuickCampaign = {
  /**
   * Create a classic 4-act campaign
   */
  classic(name, options = {}) {
    return new CampaignBuilder(options).buildFromTemplate('CLASSIC_DIABLO', { name });
  },

  /**
   * Create a siege-style campaign
   */
  siege(name, options = {}) {
    return new CampaignBuilder(options).buildFromTemplate('SIEGE', { name });
  },

  /**
   * Create from custom blueprint
   */
  custom(blueprint, options = {}) {
    return new CampaignBuilder(options).build(blueprint);
  },
};

// Export
export default CampaignBuilder;
