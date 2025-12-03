/**
 * Mock AI Response Fixtures
 *
 * These fixtures simulate the JSON responses that would come from AI providers.
 * Used for testing without making actual API calls.
 */

/**
 * Valid campaign response that should parse correctly
 */
export const VALID_CAMPAIGN_RESPONSE = {
  id: "campaign_test_1",
  name: "The Darkness Beneath",
  description: "A classic descent into the depths beneath Tristram Cathedral.",
  acts: [
    {
      id: "act_1",
      number: 1,
      name: "Act 1: Cathedral",
      theme: "Cathedral",
      levels: [
        {
          id: "act_1_level_1",
          name: "Cathedral Level 1",
          difficulty: 1,
          objectives: [
            { id: "obj_1", type: "clear", description: "Clear the entrance" }
          ],
          spawnAreas: [
            { x: 10, y: 15, template: "PATROL" },
            { x: 25, y: 20, template: "AMBUSH" }
          ],
          unlockCondition: null
        },
        {
          id: "act_1_level_2",
          name: "Cathedral Level 2",
          difficulty: 2,
          objectives: [
            { id: "obj_2", type: "kill", target: "SKELETON_KING", description: "Defeat the Skeleton King" }
          ],
          spawnAreas: [
            { x: 15, y: 10, template: "GUARD" }
          ],
          unlockCondition: { type: "level_complete", target: "act_1_level_1" }
        }
      ],
      boss: {
        name: "King Leoric",
        type: "SKELETON_KING",
        difficulty: 3,
        dialogue: {
          intro: "You dare disturb my eternal rest?",
          defeat: "My curse... is lifted..."
        }
      },
      unlockCondition: null
    },
    {
      id: "act_2",
      number: 2,
      name: "Act 2: Catacombs",
      theme: "Catacombs",
      levels: [
        {
          id: "act_2_level_1",
          name: "Catacombs Level 1",
          difficulty: 4,
          objectives: [],
          spawnAreas: [],
          unlockCondition: { type: "boss_kill", target: "SKELETON_KING" }
        }
      ],
      boss: {
        name: "The Butcher",
        type: "BUTCHER",
        difficulty: 6,
        dialogue: {
          intro: "Fresh meat!",
          defeat: "..."
        }
      },
      unlockCondition: { type: "boss_kill", target: "SKELETON_KING" }
    }
  ],
  quests: [
    {
      id: "quest_1",
      name: "The Curse of King Leoric",
      type: "main",
      description: "Defeat the mad king in the depths of the cathedral."
    }
  ]
};

/**
 * Campaign response with common AI JSON errors (missing commas, etc.)
 */
export const MALFORMED_CAMPAIGN_RESPONSE = `{
  "id": "campaign_malformed",
  "name": "Test Campaign"
  "description": "Missing comma above",
  "acts": [
    {
      "id": "act_1",
      "number": 1,
      "name": "Act 1",
      "theme": "Cathedral",
      "levels": [],
      "unlockCondition": null or {"type": "boss_kill", "target": "test"}
    }
  ],
  "quests": []
}`;

/**
 * Campaign response with trailing commas
 */
export const TRAILING_COMMA_RESPONSE = `{
  "id": "campaign_trailing",
  "name": "Trailing Commas",
  "description": "Has trailing commas",
  "acts": [
    {
      "id": "act_1",
      "number": 1,
      "name": "Act 1",
      "theme": "Cathedral",
      "levels": [],
      "boss": null,
      "unlockCondition": null,
    },
  ],
  "quests": [],
}`;

/**
 * Valid level generation response
 */
export const VALID_LEVEL_RESPONSE = {
  grid: Array(40).fill(null).map((_, y) =>
    Array(40).fill(null).map((_, x) => {
      // Border walls
      if (x === 0 || x === 39 || y === 0 || y === 39) return 1;
      // Room in center
      if (x >= 15 && x <= 25 && y >= 15 && y <= 25) return 0;
      // Corridors
      if ((x === 20 && y < 15) || (y === 20 && x < 15)) return 0;
      if ((x === 20 && y > 25) || (y === 20 && x > 25)) return 0;
      // Walls elsewhere
      return 1;
    })
  ),
  rooms: [
    { x: 15, y: 15, width: 11, height: 11 }
  ],
  entities: [
    { type: 'MONSTER_SPAWN', x: 18, y: 18, count: 3 },
    { type: 'MONSTER_SPAWN', x: 22, y: 22, count: 2 }
  ]
};

// Add stairs to the level grid
VALID_LEVEL_RESPONSE.grid[16][16] = 3; // Stairs up
VALID_LEVEL_RESPONSE.grid[24][24] = 4; // Stairs down

/**
 * Valid dialogue response
 */
export const VALID_DIALOGUE_RESPONSES = {
  CAIN: "Stay a while and listen, young warrior. The darkness grows stronger beneath the cathedral. King Leoric's madness has spread to his subjects, and now the dead walk the halls. You must be cautious.",
  OGDEN: "Welcome, traveler! I've got rooms available and ale aplenty. Though I warn you, strange sounds have been coming from the cellar lately. Best not venture down there after dark.",
  GRISWOLD: "Ah, another hero seeking glory! Your blade looks like it's seen better days. Let me take a look at that armor too - can't have you facing demons in dented plate.",
  PEPIN: "I sense dark energies have touched you. Let me examine those wounds. The creatures below carry corruption in their claws.",
  WIRT: "Psst! Hey you! Looking for something special? I've got items you won't find anywhere else... for the right price."
};

/**
 * Valid enemy placement response
 */
export const VALID_ENEMY_PLACEMENT = {
  placements: [
    { x: 10, y: 15, enemyType: 'SKELETON', difficulty: 1, count: 3 },
    { x: 25, y: 20, enemyType: 'ZOMBIE', difficulty: 1, count: 2 },
    { x: 18, y: 18, enemyType: 'FALLEN', difficulty: 2, count: 4 }
  ],
  bossPlacement: {
    x: 20, y: 20,
    enemyType: 'SKELETON_KING',
    isBoss: true,
    minions: [
      { x: 18, y: 18, enemyType: 'SKELETON', difficulty: 2 },
      { x: 22, y: 22, enemyType: 'SKELETON', difficulty: 2 }
    ]
  }
};

/**
 * Mock provider that returns fixtures
 */
export class MockProvider {
  constructor() {
    this.callCount = 0;
    this.lastPrompt = null;
  }

  async generateText(prompt, options = {}) {
    this.callCount++;
    this.lastPrompt = prompt;

    // Detect what type of response is needed based on prompt
    if (prompt.includes('campaign') || prompt.includes('acts')) {
      return JSON.stringify(VALID_CAMPAIGN_RESPONSE);
    }

    if (prompt.includes('grid') || prompt.includes('dungeon') || prompt.includes('level')) {
      return JSON.stringify(VALID_LEVEL_RESPONSE);
    }

    if (prompt.includes('dialogue') || prompt.includes('NPC')) {
      const npc = prompt.match(/CAIN|OGDEN|GRISWOLD|PEPIN|WIRT/i)?.[0]?.toUpperCase();
      return VALID_DIALOGUE_RESPONSES[npc] || VALID_DIALOGUE_RESPONSES.CAIN;
    }

    if (prompt.includes('enemy') || prompt.includes('spawn') || prompt.includes('placement')) {
      return JSON.stringify(VALID_ENEMY_PLACEMENT);
    }

    // Default response
    return '{"status": "ok"}';
  }

  async generateImage(prompt, options = {}) {
    this.callCount++;
    this.lastPrompt = prompt;

    // Return a tiny valid PNG as base64 (1x1 red pixel)
    return 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  }

  async getModels() {
    return [
      { id: 'mock-model-1', name: 'Mock Model 1', context: 8000 },
      { id: 'mock-model-2', name: 'Mock Model 2', context: 16000 }
    ];
  }

  async getImageModels() {
    return [
      { id: 'mock-image-1', name: 'Mock Image Model' }
    ];
  }

  async testConnection() {
    return { success: true };
  }

  reset() {
    this.callCount = 0;
    this.lastPrompt = null;
  }
}

/**
 * Mock provider that returns malformed JSON to test error handling
 */
export class MalformedMockProvider extends MockProvider {
  async generateText(prompt, options = {}) {
    this.callCount++;
    this.lastPrompt = prompt;

    if (prompt.includes('campaign')) {
      return MALFORMED_CAMPAIGN_RESPONSE;
    }

    if (prompt.includes('trailing')) {
      return TRAILING_COMMA_RESPONSE;
    }

    return super.generateText(prompt, options);
  }
}

/**
 * Mock provider that simulates network errors
 */
export class ErrorMockProvider extends MockProvider {
  async generateText(prompt, options = {}) {
    this.callCount++;
    throw new Error('Network error: Connection refused');
  }

  async generateImage(prompt, options = {}) {
    this.callCount++;
    throw new Error('Network error: Timeout');
  }
}

export default {
  VALID_CAMPAIGN_RESPONSE,
  MALFORMED_CAMPAIGN_RESPONSE,
  TRAILING_COMMA_RESPONSE,
  VALID_LEVEL_RESPONSE,
  VALID_DIALOGUE_RESPONSES,
  VALID_ENEMY_PLACEMENT,
  MockProvider,
  MalformedMockProvider,
  ErrorMockProvider,
};
