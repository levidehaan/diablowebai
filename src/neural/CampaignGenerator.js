/**
 * Campaign Generator System
 *
 * Creates complete AI-generated campaigns including:
 * - New storylines (Diablo-themed but fresh)
 * - Mission chains with objectives
 * - Progression gates (kill boss to unlock areas)
 * - Quest sequences
 * - NPC dialogue trees
 */

import NeuralConfig from './config';
import { providerManager } from './providers';

/**
 * Campaign structure templates
 */
export const CAMPAIGN_TEMPLATES = {
  CLASSIC: {
    name: 'Classic Descent',
    description: 'Traditional dungeon delving with progressive difficulty',
    acts: 4,
    levelsPerAct: 4,
    bossPerAct: true,
  },
  SIEGE: {
    name: 'Under Siege',
    description: 'Defend Tristram from waves of demons',
    acts: 3,
    levelsPerAct: 3,
    bossPerAct: true,
    overworld: true,
  },
  CORRUPTION: {
    name: 'Spreading Corruption',
    description: 'Cleanse corrupted areas before darkness spreads',
    acts: 4,
    levelsPerAct: 3,
    bossPerAct: true,
    timedEvents: true,
  },
  QUEST: {
    name: 'Sacred Relics',
    description: 'Gather holy artifacts to seal the demon portal',
    acts: 5,
    levelsPerAct: 2,
    bossPerAct: false,
    collectibles: true,
  },
};

/**
 * Mission objective types
 */
export const OBJECTIVE_TYPES = {
  KILL_BOSS: 'kill_boss',
  KILL_ALL: 'kill_all',
  FIND_ITEM: 'find_item',
  REACH_LOCATION: 'reach_location',
  SURVIVE_WAVES: 'survive_waves',
  ESCORT_NPC: 'escort_npc',
  DESTROY_OBJECTS: 'destroy_objects',
  COLLECT_ITEMS: 'collect_items',
};

/**
 * Progression gate types
 */
export const GATE_TYPES = {
  BOSS_KILL: 'boss_kill',
  ITEM_REQUIRED: 'item_required',
  QUEST_COMPLETE: 'quest_complete',
  LEVEL_REQUIRED: 'level_required',
};

/**
 * Mock campaign generator for offline use
 */
class MockCampaignGenerator {
  static generateCampaign(template, seed = Date.now()) {
    const config = CAMPAIGN_TEMPLATES[template] || CAMPAIGN_TEMPLATES.CLASSIC;
    const random = seededRandom(seed);

    const campaign = {
      id: `campaign_${seed}`,
      name: this.generateCampaignName(random),
      description: '',
      template: template,
      seed: seed,
      createdAt: new Date().toISOString(),
      acts: [],
      quests: [],
      npcs: [],
      items: [],
    };

    // Generate acts
    for (let actNum = 1; actNum <= config.acts; actNum++) {
      const act = this.generateAct(actNum, config, random);
      campaign.acts.push(act);
    }

    // Generate main quest chain
    campaign.quests = this.generateQuestChain(campaign.acts, random);

    // Generate campaign description based on content
    campaign.description = this.generateDescription(campaign, random);

    return campaign;
  }

  static generateCampaignName(random) {
    const prefixes = ['The', 'A', 'Rise of', 'Fall of', 'Curse of', 'Legacy of', 'Shadow of'];
    const themes = ['Darkness', 'Corruption', 'Doom', 'Despair', 'Redemption', 'Vengeance', 'Terror'];
    const suffixes = ['', ' Returns', ' Awakens', ' Descends', ' Rises'];

    return `${prefixes[Math.floor(random() * prefixes.length)]} ${
      themes[Math.floor(random() * themes.length)]
    }${suffixes[Math.floor(random() * suffixes.length)]}`;
  }

  static generateAct(actNum, config, random) {
    const themes = ['Cathedral', 'Catacombs', 'Caves', 'Hell'];
    const actTheme = themes[Math.min(actNum - 1, themes.length - 1)];

    const act = {
      id: `act_${actNum}`,
      number: actNum,
      name: `Act ${actNum}: ${this.generateActName(actTheme, random)}`,
      theme: actTheme,
      levels: [],
      boss: null,
      unlockCondition: actNum === 1 ? null : {
        type: GATE_TYPES.BOSS_KILL,
        target: `act_${actNum - 1}_boss`,
      },
    };

    // Generate levels
    for (let levelNum = 1; levelNum <= config.levelsPerAct; levelNum++) {
      const level = this.generateLevel(actNum, levelNum, actTheme, random);
      act.levels.push(level);
    }

    // Generate boss for this act
    if (config.bossPerAct) {
      act.boss = this.generateBoss(actNum, actTheme, random);
      act.boss.id = `act_${actNum}_boss`;
    }

    return act;
  }

  static generateActName(theme, random) {
    const names = {
      Cathedral: ['Hallowed Grounds', 'Desecrated Halls', 'Fallen Sanctuary', 'Broken Faith'],
      Catacombs: ['Depths of Despair', 'Forgotten Tombs', 'Ancient Crypts', 'Endless Graves'],
      Caves: ['Twisted Caverns', 'Molten Depths', 'Crystal Abyss', 'Burning Tunnels'],
      Hell: ['Infernal Pits', 'Realm of Chaos', 'Diablo\'s Domain', 'The Final Descent'],
    };

    const themeNames = names[theme] || names.Cathedral;
    return themeNames[Math.floor(random() * themeNames.length)];
  }

  static generateLevel(actNum, levelNum, theme, random) {
    const difficultyBase = (actNum - 1) * 3 + levelNum;

    return {
      id: `act_${actNum}_level_${levelNum}`,
      name: `${theme} Level ${levelNum}`,
      difficulty: Math.min(difficultyBase, 10),
      theme: theme.toLowerCase(),
      objectives: this.generateObjectives(difficultyBase, random),
      spawnAreas: this.generateSpawnAreas(random),
      specialFeatures: this.generateSpecialFeatures(theme, random),
      unlockCondition: levelNum === 1 ? null : {
        type: GATE_TYPES.QUEST_COMPLETE,
        target: `act_${actNum}_level_${levelNum - 1}_clear`,
      },
    };
  }

  static generateObjectives(difficulty, random) {
    const objectives = [];

    // Primary objective
    const primaryTypes = [OBJECTIVE_TYPES.KILL_BOSS, OBJECTIVE_TYPES.REACH_LOCATION, OBJECTIVE_TYPES.FIND_ITEM];
    objectives.push({
      id: `obj_primary_${Math.floor(random() * 1000)}`,
      type: primaryTypes[Math.floor(random() * primaryTypes.length)],
      description: this.generateObjectiveDescription(primaryTypes[0], random),
      required: true,
      reward: {
        experience: 500 * difficulty,
        gold: 200 * difficulty,
      },
    });

    // Optional objectives
    if (random() > 0.5) {
      objectives.push({
        id: `obj_optional_${Math.floor(random() * 1000)}`,
        type: OBJECTIVE_TYPES.KILL_ALL,
        description: 'Eliminate all enemies in the area',
        required: false,
        reward: {
          experience: 200 * difficulty,
          gold: 100 * difficulty,
        },
      });
    }

    return objectives;
  }

  static generateObjectiveDescription(type, random) {
    const descriptions = {
      [OBJECTIVE_TYPES.KILL_BOSS]: ['Slay the guardian', 'Defeat the area boss', 'Destroy the demon lord'],
      [OBJECTIVE_TYPES.REACH_LOCATION]: ['Find the entrance to the next level', 'Locate the hidden passage', 'Discover the secret chamber'],
      [OBJECTIVE_TYPES.FIND_ITEM]: ['Retrieve the ancient artifact', 'Find the sacred relic', 'Recover the lost tome'],
    };

    const options = descriptions[type] || descriptions[OBJECTIVE_TYPES.KILL_BOSS];
    return options[Math.floor(random() * options.length)];
  }

  static generateSpawnAreas(random) {
    const areas = [];
    const numAreas = 3 + Math.floor(random() * 4);

    for (let i = 0; i < numAreas; i++) {
      areas.push({
        id: `spawn_${i}`,
        x: 5 + Math.floor(random() * 30),
        y: 5 + Math.floor(random() * 30),
        template: ['PATROL', 'AMBUSH', 'GUARD', 'HORDE'][Math.floor(random() * 4)],
      });
    }

    return areas;
  }

  static generateSpecialFeatures(theme, random) {
    const features = [];

    const featurePool = {
      Cathedral: ['altar', 'fountain', 'bookshelf', 'candles'],
      Catacombs: ['sarcophagus', 'bone_pile', 'tomb', 'coffin'],
      Caves: ['lava_pool', 'crystal_formation', 'stalagmite', 'bridge'],
      Hell: ['demon_shrine', 'hellfire', 'pentagram', 'soul_cage'],
    };

    const pool = featurePool[theme] || featurePool.Cathedral;
    const numFeatures = 1 + Math.floor(random() * 3);

    for (let i = 0; i < numFeatures; i++) {
      features.push({
        type: pool[Math.floor(random() * pool.length)],
        x: Math.floor(random() * 40),
        y: Math.floor(random() * 40),
      });
    }

    return features;
  }

  static generateBoss(actNum, theme, random) {
    const bossTemplates = {
      1: { name: 'The Defiler', type: 'SKELETON_KING', minions: ['SKELETON', 'SKELETON_ARCHER'] },
      2: { name: 'The Corruptor', type: 'HIDDEN', minions: ['GOAT_MAN', 'GOAT_ARCHER'] },
      3: { name: 'The Infernal', type: 'BALROG', minions: ['MAGMA_DEMON', 'LIGHTNING_DEMON'] },
      4: { name: 'Lord of Terror', type: 'DIABLO', minions: ['ADVOCATE', 'KNIGHT'] },
    };

    const template = bossTemplates[actNum] || bossTemplates[1];

    return {
      name: template.name,
      type: template.type,
      difficulty: actNum * 4 + 2,
      minions: template.minions,
      loot: this.generateBossLoot(actNum, random),
      dialogue: this.generateBossDialogue(template.name, random),
    };
  }

  static generateBossLoot(actNum, random) {
    const qualities = ['magical', 'rare', 'unique'];
    const types = ['sword', 'armor', 'helm', 'ring', 'amulet'];

    return {
      guaranteed: {
        type: types[Math.floor(random() * types.length)],
        quality: qualities[Math.min(actNum - 1, qualities.length - 1)],
      },
      gold: 1000 * actNum,
      experience: 2000 * actNum,
    };
  }

  static generateBossDialogue(bossName, random) {
    const intros = [
      `You dare enter my domain? I am ${bossName}, and this shall be your grave!`,
      `Foolish mortal! ${bossName} will feast upon your soul!`,
      `At last, fresh prey. Prepare to meet your end at the hands of ${bossName}!`,
    ];

    const defeats = [
      'This... cannot be... I am eternal...',
      'You may have won this battle, but darkness will return...',
      'My master will avenge me... you will all burn...',
    ];

    return {
      intro: intros[Math.floor(random() * intros.length)],
      defeat: defeats[Math.floor(random() * defeats.length)],
    };
  }

  static generateQuestChain(acts, random) {
    const quests = [];

    // Main quest
    quests.push({
      id: 'main_quest',
      name: 'The Descent',
      type: 'main',
      description: 'Descend through the depths of evil and destroy the source of corruption',
      stages: acts.map((act, i) => ({
        id: `main_stage_${i + 1}`,
        actId: act.id,
        description: `Complete Act ${i + 1}`,
        objectives: [
          { type: GATE_TYPES.BOSS_KILL, target: act.boss?.id },
        ],
      })),
    });

    // Side quests
    const sideQuestTemplates = [
      { name: 'Lost Souls', description: 'Free the trapped spirits throughout the dungeon' },
      { name: 'Ancient Knowledge', description: 'Collect the scattered tomes of forbidden lore' },
      { name: 'Treasure Hunter', description: 'Discover hidden treasure caches' },
    ];

    for (const template of sideQuestTemplates) {
      if (random() > 0.3) {
        quests.push({
          id: `side_quest_${quests.length}`,
          name: template.name,
          type: 'side',
          description: template.description,
          reward: {
            experience: 1000,
            gold: 500,
          },
        });
      }
    }

    return quests;
  }

  static generateDescription(campaign, random) {
    const descriptions = [
      `A new darkness has awakened beneath Tristram. In "${campaign.name}", brave heroes must descend through ${campaign.acts.length} treacherous acts to confront the ancient evil that threatens to consume the world.`,
      `Evil stirs once more in the depths below. "${campaign.name}" challenges adventurers to battle through ${campaign.acts.length} acts of terror, facing horrors unimaginable and bosses of legendary power.`,
      `The portal to Hell has been breached. In "${campaign.name}", you must fight through ${campaign.acts.length} acts of demonic horror, sealing the breach before darkness consumes all.`,
    ];

    return descriptions[Math.floor(random() * descriptions.length)];
  }
}

/**
 * Seeded random number generator for reproducible campaigns
 */
function seededRandom(seed) {
  let state = seed;
  return function() {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/**
 * Main Campaign Generator
 */
class CampaignGenerator {
  constructor() {
    this.currentCampaign = null;
    this.campaignProgress = {};
  }

  /**
   * Generate a new campaign
   */
  async generateCampaign(template = 'CLASSIC', options = {}) {
    const seed = options.seed || Date.now();

    const provider = providerManager.getProvider();
    if (!provider || NeuralConfig.debug.mockAPIResponses) {
      this.currentCampaign = MockCampaignGenerator.generateCampaign(template, seed);
    } else {
      this.currentCampaign = await this.generateWithAI(template, seed, options);
    }

    // Initialize progress tracking
    this.campaignProgress = {
      campaignId: this.currentCampaign.id,
      currentAct: 1,
      currentLevel: 1,
      completedObjectives: [],
      unlockedAreas: ['act_1_level_1'],
      defeatedBosses: [],
      collectedItems: [],
      startedAt: new Date().toISOString(),
    };

    return this.currentCampaign;
  }

  /**
   * Generate campaign using AI
   */
  async generateWithAI(template, seed, options) {
    const provider = providerManager.getProvider();
    if (!provider) {
      return MockCampaignGenerator.generateCampaign(template, seed);
    }

    const templateConfig = CAMPAIGN_TEMPLATES[template] || CAMPAIGN_TEMPLATES.CLASSIC;

    const prompt = `Generate a Diablo-style campaign with the following parameters:

Template: ${templateConfig.name}
Description: ${templateConfig.description}
Acts: ${templateConfig.acts}
Levels per Act: ${templateConfig.levelsPerAct}
Theme: Dark fantasy horror, demonic corruption

${options.customTheme ? `Custom Theme: ${options.customTheme}` : ''}
${options.difficulty ? `Difficulty: ${options.difficulty}` : ''}

Create a compelling narrative with:
1. An overarching story about demonic invasion/corruption
2. Each act should have a unique theme and boss
3. Interesting level objectives
4. Progression gates (kill boss to unlock next act)
5. Side quests for additional content
6. Memorable boss encounters with dialogue

The campaign should feel like Diablo but be ORIGINAL - new story, new bosses, new locations.

Respond with a JSON object containing:
{
  "id": "unique_id",
  "name": "Campaign Name",
  "description": "2-3 sentence description",
  "acts": [
    {
      "id": "act_1",
      "number": 1,
      "name": "Act 1: Name",
      "theme": "Cathedral|Catacombs|Caves|Hell",
      "levels": [
        {
          "id": "act_1_level_1",
          "name": "Level Name",
          "difficulty": 1-10,
          "objectives": [{"type": "kill_boss|find_item|reach_location", "description": "..."}],
          "spawnAreas": [{"x": 0-39, "y": 0-39, "template": "PATROL|AMBUSH|GUARD|HORDE"}]
        }
      ],
      "boss": {
        "name": "Boss Name",
        "type": "ENEMY_TYPE",
        "dialogue": {"intro": "...", "defeat": "..."}
      },
      "unlockCondition": null or {"type": "boss_kill", "target": "previous_boss_id"}
    }
  ],
  "quests": [
    {"id": "quest_1", "name": "Quest Name", "type": "main|side", "description": "..."}
  ]
}`;

    try {
      const response = await provider.generateText(prompt, {
        temperature: 0.8,
        maxTokens: 4000,
      });

      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const campaign = JSON.parse(jsonMatch[0]);
        campaign.seed = seed;
        campaign.template = template;
        campaign.createdAt = new Date().toISOString();
        return this.validateCampaign(campaign);
      }
    } catch (error) {
      console.error('[CampaignGenerator] AI generation failed:', error);
    }

    return MockCampaignGenerator.generateCampaign(template, seed);
  }

  /**
   * Validate and fix AI-generated campaign
   */
  validateCampaign(campaign) {
    // Ensure required fields
    if (!campaign.id) campaign.id = `campaign_${Date.now()}`;
    if (!campaign.name) campaign.name = 'Unknown Campaign';
    if (!campaign.description) campaign.description = 'An AI-generated adventure awaits.';
    if (!Array.isArray(campaign.acts)) campaign.acts = [];
    if (!Array.isArray(campaign.quests)) campaign.quests = [];

    // Validate each act
    campaign.acts = campaign.acts.map((act, i) => {
      if (!act.id) act.id = `act_${i + 1}`;
      if (!act.number) act.number = i + 1;
      if (!act.name) act.name = `Act ${i + 1}`;
      if (!act.theme) act.theme = ['Cathedral', 'Catacombs', 'Caves', 'Hell'][Math.min(i, 3)];
      if (!Array.isArray(act.levels)) act.levels = [];

      // Validate levels
      act.levels = act.levels.map((level, j) => {
        if (!level.id) level.id = `${act.id}_level_${j + 1}`;
        if (!level.name) level.name = `Level ${j + 1}`;
        if (typeof level.difficulty !== 'number') level.difficulty = (i * 3) + j + 1;
        if (!Array.isArray(level.objectives)) level.objectives = [];
        if (!Array.isArray(level.spawnAreas)) level.spawnAreas = [];
        return level;
      });

      // Validate boss
      if (act.boss) {
        if (!act.boss.name) act.boss.name = `Act ${i + 1} Boss`;
        if (!act.boss.type) act.boss.type = 'SKELETON_KING';
        if (!act.boss.dialogue) act.boss.dialogue = { intro: 'You will die!', defeat: 'No...' };
      }

      return act;
    });

    return campaign;
  }

  /**
   * Get current campaign
   */
  getCampaign() {
    return this.currentCampaign;
  }

  /**
   * Get current progress
   */
  getProgress() {
    return this.campaignProgress;
  }

  /**
   * Mark objective as complete
   */
  completeObjective(objectiveId) {
    if (!this.campaignProgress.completedObjectives.includes(objectiveId)) {
      this.campaignProgress.completedObjectives.push(objectiveId);
      this.checkUnlocks();
    }
  }

  /**
   * Mark boss as defeated
   */
  defeatBoss(bossId) {
    if (!this.campaignProgress.defeatedBosses.includes(bossId)) {
      this.campaignProgress.defeatedBosses.push(bossId);
      this.checkUnlocks();
    }
  }

  /**
   * Check and unlock new areas based on progress
   */
  checkUnlocks() {
    if (!this.currentCampaign) return;

    for (const act of this.currentCampaign.acts) {
      // Check act unlock
      if (act.unlockCondition) {
        const { type, target } = act.unlockCondition;

        if (type === GATE_TYPES.BOSS_KILL && this.campaignProgress.defeatedBosses.includes(target)) {
          const firstLevel = act.levels[0]?.id;
          if (firstLevel && !this.campaignProgress.unlockedAreas.includes(firstLevel)) {
            this.campaignProgress.unlockedAreas.push(firstLevel);
          }
        }
      }

      // Check level unlocks within act
      for (let i = 0; i < act.levels.length; i++) {
        const level = act.levels[i];

        if (level.unlockCondition) {
          const { type, target } = level.unlockCondition;

          if (type === GATE_TYPES.QUEST_COMPLETE &&
              this.campaignProgress.completedObjectives.includes(target)) {
            if (!this.campaignProgress.unlockedAreas.includes(level.id)) {
              this.campaignProgress.unlockedAreas.push(level.id);
            }
          }
        }
      }
    }
  }

  /**
   * Check if an area is unlocked
   */
  isAreaUnlocked(areaId) {
    return this.campaignProgress.unlockedAreas.includes(areaId);
  }

  /**
   * Get the next available level
   */
  getNextLevel() {
    if (!this.currentCampaign) return null;

    for (const act of this.currentCampaign.acts) {
      for (const level of act.levels) {
        if (this.isAreaUnlocked(level.id) &&
            !this.campaignProgress.completedObjectives.includes(`${level.id}_clear`)) {
          return { act, level };
        }
      }
    }

    return null;
  }

  /**
   * Export campaign for saving
   */
  export() {
    return {
      campaign: this.currentCampaign,
      progress: this.campaignProgress,
      version: 1,
    };
  }

  /**
   * Import saved campaign
   */
  import(data) {
    if (data.version === 1) {
      this.currentCampaign = data.campaign;
      this.campaignProgress = data.progress;
      return true;
    }
    return false;
  }

  /**
   * Clear current campaign
   */
  clear() {
    this.currentCampaign = null;
    this.campaignProgress = {};
  }
}

// Singleton instance
const campaignGenerator = new CampaignGenerator();

export {
  CampaignGenerator,
  MockCampaignGenerator,
  seededRandom,
};

export default campaignGenerator;
