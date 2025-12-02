/**
 * Commander AI System
 *
 * Hierarchical tactical AI for NPC behavior.
 * Implements Goal-Oriented Action Planning (GOAP) with squad coordination.
 */

import NeuralConfig from './config';
import neuralInterop, { MONSTER_MODES } from './NeuralInterop';

const { commander: config } = NeuralConfig;

/**
 * Squad formations
 */
const FORMATIONS = {
  LINE: {
    name: 'Line',
    getPositions: (leaderX, leaderY, count, targetX, targetY) => {
      const positions = [];
      const dx = targetX - leaderX;
      const dy = targetY - leaderY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const perpX = -dy / dist;
      const perpY = dx / dist;

      for (let i = 0; i < count; i++) {
        const offset = (i - (count - 1) / 2) * 2;
        positions.push({
          x: Math.round(leaderX + perpX * offset),
          y: Math.round(leaderY + perpY * offset),
        });
      }
      return positions;
    },
  },

  WEDGE: {
    name: 'Wedge',
    getPositions: (leaderX, leaderY, count, targetX, targetY) => {
      const positions = [{ x: leaderX, y: leaderY }];
      const dx = targetX - leaderX;
      const dy = targetY - leaderY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const backX = -dx / dist;
      const backY = -dy / dist;
      const perpX = -dy / dist;
      const perpY = dx / dist;

      for (let i = 1; i < count; i++) {
        const row = Math.ceil(i / 2);
        const side = i % 2 === 1 ? 1 : -1;
        positions.push({
          x: Math.round(leaderX + backX * row * 2 + perpX * side * row),
          y: Math.round(leaderY + backY * row * 2 + perpY * side * row),
        });
      }
      return positions;
    },
  },

  FLANK: {
    name: 'Flank',
    getPositions: (leaderX, leaderY, count, targetX, targetY) => {
      const positions = [];
      const dx = targetX - leaderX;
      const dy = targetY - leaderY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const perpX = -dy / dist;
      const perpY = dx / dist;

      // Split into two groups on opposite sides
      const leftCount = Math.ceil(count / 2);
      const rightCount = count - leftCount;

      for (let i = 0; i < leftCount; i++) {
        positions.push({
          x: Math.round(targetX + perpX * (i + 3)),
          y: Math.round(targetY + perpY * (i + 3)),
        });
      }

      for (let i = 0; i < rightCount; i++) {
        positions.push({
          x: Math.round(targetX - perpX * (i + 3)),
          y: Math.round(targetY - perpY * (i + 3)),
        });
      }

      return positions;
    },
  },

  SURROUND: {
    name: 'Surround',
    getPositions: (leaderX, leaderY, count, targetX, targetY) => {
      const positions = [];
      const radius = 3;

      for (let i = 0; i < count; i++) {
        const angle = (2 * Math.PI * i) / count;
        positions.push({
          x: Math.round(targetX + Math.cos(angle) * radius),
          y: Math.round(targetY + Math.sin(angle) * radius),
        });
      }
      return positions;
    },
  },

  RETREAT: {
    name: 'Retreat',
    getPositions: (leaderX, leaderY, count, targetX, targetY) => {
      const positions = [];
      const dx = leaderX - targetX;
      const dy = leaderY - targetY;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const awayX = dx / dist;
      const awayY = dy / dist;

      for (let i = 0; i < count; i++) {
        positions.push({
          x: Math.round(leaderX + awayX * (5 + i)),
          y: Math.round(leaderY + awayY * (5 + i)),
        });
      }
      return positions;
    },
  },
};

/**
 * Individual monster AI state
 */
class MonsterAI {
  constructor(monsterId, monsterType, uniqueType = null) {
    this.id = monsterId;
    this.type = monsterType;
    this.uniqueType = uniqueType;
    this.x = 0;
    this.y = 0;
    this.hp = 0;
    this.maxHp = 0;
    this.mode = MONSTER_MODES.MM_STAND;

    // AI State
    this.role = this.determineRole();
    this.squadId = null;
    this.targetX = 0;
    this.targetY = 0;
    this.currentGoal = null;
    this.lastDecision = 0;

    // Utility AI scores
    this.utilityScores = {
      attack: 0,
      retreat: 0,
      flank: 0,
      support: 0,
      hold: 0,
    };
  }

  determineRole() {
    // Determine role based on monster type
    // This would ideally use the monster's attack type from the game data
    const rangedTypes = ['SKELETON_ARCHER', 'MAGE', 'GOAT_ARCHER'];
    const supportTypes = ['FALLEN_SHAMAN', 'ADVOCATE'];

    if (rangedTypes.includes(this.type)) {
      return 'RANGED';
    } else if (supportTypes.includes(this.type)) {
      return 'SUPPORT';
    } else if (this.uniqueType) {
      return 'BOSS';
    }
    return 'MELEE';
  }

  updateState(stateData) {
    this.x = stateData.x;
    this.y = stateData.y;
    this.hp = stateData.hp;
    this.maxHp = stateData.maxHp;
    this.mode = stateData.mode;
  }

  calculateUtility(playerX, playerY, allies) {
    const distToPlayer = Math.sqrt(
      Math.pow(this.x - playerX, 2) + Math.pow(this.y - playerY, 2)
    );

    const hpRatio = this.hp / this.maxHp;
    const roleConfig = config.roles[this.role] || config.roles.MELEE;

    // Attack utility: higher when healthy and at preferred range
    const rangeFactor = Math.max(0, 1 - Math.abs(distToPlayer - roleConfig.rangePreference) / 5);
    this.utilityScores.attack = roleConfig.aggression * hpRatio * rangeFactor;

    // Retreat utility: higher when low HP
    this.utilityScores.retreat = (1 - hpRatio) * (1 - roleConfig.aggression);

    // Flank utility: for melee when not in optimal position
    this.utilityScores.flank = this.role === 'MELEE' && distToPlayer > 2 ? 0.5 : 0;

    // Support utility: for support roles when allies are low
    const lowAllies = allies.filter(a => a.hp / a.maxHp < 0.5).length;
    this.utilityScores.support = this.role === 'SUPPORT' ? lowAllies * 0.3 : 0;

    // Hold utility: ranged units prefer to maintain distance
    this.utilityScores.hold = this.role === 'RANGED' && distToPlayer >= 5 ? 0.6 : 0;
  }

  getBestAction() {
    let bestAction = 'hold';
    let bestScore = this.utilityScores.hold;

    for (const [action, score] of Object.entries(this.utilityScores)) {
      if (score > bestScore) {
        bestScore = score;
        bestAction = action;
      }
    }

    return bestAction;
  }
}

/**
 * Squad coordination
 */
class Squad {
  constructor(id) {
    this.id = id;
    this.members = [];
    this.leader = null;
    this.formation = 'LINE';
    this.currentObjective = null;
  }

  addMember(monster) {
    if (this.members.length >= config.squads.maxSquadSize) {
      return false;
    }

    monster.squadId = this.id;
    this.members.push(monster);

    if (!this.leader) {
      this.leader = monster;
    }

    return true;
  }

  removeMember(monster) {
    const index = this.members.indexOf(monster);
    if (index !== -1) {
      this.members.splice(index, 1);
      monster.squadId = null;

      if (this.leader === monster && this.members.length > 0) {
        this.leader = this.members[0];
      }
    }
  }

  setFormation(formationType) {
    if (FORMATIONS[formationType]) {
      this.formation = formationType;
    }
  }

  getFormationPositions(targetX, targetY) {
    if (!this.leader || this.members.length === 0) {
      return [];
    }

    const formation = FORMATIONS[this.formation];
    return formation.getPositions(
      this.leader.x,
      this.leader.y,
      this.members.length,
      targetX,
      targetY
    );
  }

  assignPositions(targetX, targetY) {
    const positions = this.getFormationPositions(targetX, targetY);

    for (let i = 0; i < this.members.length && i < positions.length; i++) {
      this.members[i].targetX = positions[i].x;
      this.members[i].targetY = positions[i].y;
    }
  }

  getAverageHealth() {
    if (this.members.length === 0) return 1;

    const totalRatio = this.members.reduce(
      (sum, m) => sum + (m.hp / m.maxHp),
      0
    );
    return totalRatio / this.members.length;
  }

  isAlive() {
    return this.members.some(m => m.hp > 0);
  }
}

/**
 * Boss behavior profiles
 */
class BossAI extends MonsterAI {
  constructor(monsterId, bossType) {
    super(monsterId, bossType, true);
    this.bossType = bossType;
    this.profile = config.bosses[bossType] || {};
    this.currentTactic = null;
    this.phaseIndex = 0;
    this.lastTacticChange = 0;
    this.minions = [];
  }

  selectTactic(playerX, playerY, currentTime) {
    // Change tactics periodically or when HP thresholds are crossed
    const hpRatio = this.hp / this.maxHp;
    const timeSinceChange = currentTime - this.lastTacticChange;
    const shouldChange = timeSinceChange > 5000 || this.crossedHpThreshold(hpRatio);

    if (!shouldChange && this.currentTactic) {
      return this.currentTactic;
    }

    const availableTactics = this.profile.tactics || ['charge', 'attack'];

    // Weight tactics based on current situation
    const tacticsWithWeights = availableTactics.map(tactic => {
      let weight = 1;

      switch (tactic) {
        case 'charge':
          weight = hpRatio > 0.5 ? 2 : 0.5;
          break;
        case 'retreat_behind_minions':
          weight = this.minions.length > 0 && hpRatio < 0.5 ? 3 : 0.1;
          break;
        case 'summon':
          weight = this.minions.length < 3 ? 2 : 0.2;
          break;
        case 'curse':
        case 'apocalypse':
          weight = hpRatio < 0.3 ? 2 : 0.5;
          break;
        case 'teleport':
        case 'hide':
          weight = hpRatio < 0.4 ? 2 : 0.3;
          break;
        default:
          weight = 1;
      }

      return { tactic, weight };
    });

    // Weighted random selection
    const totalWeight = tacticsWithWeights.reduce((sum, t) => sum + t.weight, 0);
    let random = Math.random() * totalWeight;

    for (const { tactic, weight } of tacticsWithWeights) {
      random -= weight;
      if (random <= 0) {
        this.currentTactic = tactic;
        this.lastTacticChange = currentTime;
        return tactic;
      }
    }

    this.currentTactic = availableTactics[0];
    return this.currentTactic;
  }

  crossedHpThreshold(hpRatio) {
    const thresholds = [0.75, 0.5, 0.25];
    const newPhase = thresholds.findIndex(t => hpRatio <= t);

    if (newPhase > this.phaseIndex) {
      this.phaseIndex = newPhase;
      return true;
    }
    return false;
  }

  shouldRetreat() {
    const hpRatio = this.hp / this.maxHp;
    const retreatThreshold = this.profile.retreatThreshold ?? 0.2;
    return hpRatio < retreatThreshold;
  }
}

/**
 * Mock AI decision generator
 */
class MockCommanderAI {
  static generateDirective(situation) {
    const directives = [
      { type: 'HOLD', description: 'Maintain current positions' },
      { type: 'ADVANCE', description: 'Move towards player' },
      { type: 'FLANK', formation: 'FLANK', description: 'Flank the player' },
      { type: 'SURROUND', formation: 'SURROUND', description: 'Surround the player' },
      { type: 'RETREAT', formation: 'RETREAT', description: 'Fall back' },
    ];

    // Simple decision based on situation
    const avgHealth = situation.monsters.reduce((sum, m) => sum + m.hp / m.maxHp, 0) /
      (situation.monsters.length || 1);

    if (avgHealth < 0.3) {
      return directives.find(d => d.type === 'RETREAT');
    } else if (situation.monsters.length > 3) {
      return directives.find(d => d.type === 'SURROUND');
    } else if (Math.random() > 0.5) {
      return directives.find(d => d.type === 'FLANK');
    }

    return directives.find(d => d.type === 'ADVANCE');
  }
}

/**
 * Main Commander AI System
 */
class CommanderAI {
  constructor() {
    this.monsters = new Map();
    this.squads = new Map();
    this.bosses = new Map();
    this.frameCount = 0;
    this.lastTacticalUpdate = 0;
    this.lastStrategicUpdate = 0;
    this.playerPosition = { x: 0, y: 0 };
    this.enabled = config.enabled;
  }

  /**
   * Initialize the Commander AI
   */
  initialize() {
    neuralInterop.on('frame', data => this.onFrame(data));
    neuralInterop.on('stateUpdate', state => this.onStateUpdate(state));

    console.log('[CommanderAI] Initialized');
  }

  /**
   * Frame update handler
   */
  onFrame({ frameCount, timestamp }) {
    if (!this.enabled) return;

    this.frameCount = frameCount;

    // Tactical update (every few seconds)
    if (frameCount - this.lastTacticalUpdate >= config.tacticalUpdateInterval) {
      this.performTacticalUpdate();
      this.lastTacticalUpdate = frameCount;
    }

    // Strategic update (less frequent)
    if (frameCount - this.lastStrategicUpdate >= config.strategicUpdateInterval) {
      this.performStrategicUpdate();
      this.lastStrategicUpdate = frameCount;
    }

    // Boss updates (more frequent)
    for (const [bossId, boss] of this.bosses) {
      if (frameCount % config.bossUpdateInterval === 0) {
        this.updateBossAI(boss);
      }
    }
  }

  /**
   * State update handler
   */
  onStateUpdate(state) {
    if (state.player) {
      this.playerPosition = {
        x: state.player.x,
        y: state.player.y,
      };
    }

    if (state.monsters) {
      this.syncMonsters(state.monsters);
    }
  }

  /**
   * Synchronize monster state
   */
  syncMonsters(monstersData) {
    const activeIds = new Set();

    for (const monsterData of monstersData) {
      activeIds.add(monsterData.id);

      let monster = this.monsters.get(monsterData.id);

      if (!monster) {
        // Create new monster AI
        if (monsterData.uniqueType) {
          monster = new BossAI(monsterData.id, monsterData.uniqueType);
          this.bosses.set(monsterData.id, monster);
        } else {
          monster = new MonsterAI(monsterData.id, monsterData.type);
        }
        this.monsters.set(monsterData.id, monster);

        // Assign to squad
        this.assignToSquad(monster);
      }

      monster.updateState(monsterData);

      // Remove dead monsters
      if (monsterData.hp <= 0) {
        this.removeMonster(monsterData.id);
      }
    }

    // Remove monsters no longer in state
    for (const [id, monster] of this.monsters) {
      if (!activeIds.has(id)) {
        this.removeMonster(id);
      }
    }
  }

  /**
   * Assign monster to a squad
   */
  assignToSquad(monster) {
    if (monster instanceof BossAI) {
      // Bosses don't join squads
      return;
    }

    // Find a squad with space, or create new one
    for (const [squadId, squad] of this.squads) {
      if (squad.members.length < config.squads.maxSquadSize &&
          squad.members[0]?.type === monster.type) {
        squad.addMember(monster);
        return;
      }
    }

    // Create new squad
    const squadId = `squad_${Date.now()}_${this.squads.size}`;
    const squad = new Squad(squadId);
    squad.addMember(monster);
    this.squads.set(squadId, squad);
  }

  /**
   * Remove a monster
   */
  removeMonster(monsterId) {
    const monster = this.monsters.get(monsterId);
    if (!monster) return;

    // Remove from squad
    if (monster.squadId) {
      const squad = this.squads.get(monster.squadId);
      if (squad) {
        squad.removeMember(monster);

        // Remove empty squads
        if (squad.members.length === 0) {
          this.squads.delete(monster.squadId);
        }
      }
    }

    this.monsters.delete(monsterId);
    this.bosses.delete(monsterId);

    neuralInterop.emit('monsterRemoved', { monsterId });
  }

  /**
   * Perform tactical update
   */
  performTacticalUpdate() {
    const allMonsters = Array.from(this.monsters.values());

    // Calculate utility for each monster
    for (const monster of allMonsters) {
      if (monster instanceof BossAI) continue;

      monster.calculateUtility(
        this.playerPosition.x,
        this.playerPosition.y,
        allMonsters.filter(m => m.squadId === monster.squadId)
      );
    }

    // Update squad formations
    for (const [squadId, squad] of this.squads) {
      if (!squad.isAlive()) continue;

      // Determine best formation based on squad health and situation
      const avgHealth = squad.getAverageHealth();

      if (avgHealth < 0.3) {
        squad.setFormation('RETREAT');
      } else if (squad.members.length >= 4) {
        squad.setFormation('SURROUND');
      } else if (avgHealth > 0.7) {
        squad.setFormation('WEDGE');
      } else {
        squad.setFormation('LINE');
      }

      squad.assignPositions(this.playerPosition.x, this.playerPosition.y);
    }

    // Emit tactical orders
    this.emitTacticalOrders();
  }

  /**
   * Perform strategic update (AI-driven)
   */
  async performStrategicUpdate() {
    if (this.monsters.size === 0) return;

    const situation = {
      player: this.playerPosition,
      monsters: Array.from(this.monsters.values()).map(m => ({
        id: m.id,
        x: m.x,
        y: m.y,
        hp: m.hp,
        maxHp: m.maxHp,
        role: m.role,
      })),
      squads: Array.from(this.squads.values()).map(s => ({
        id: s.id,
        memberCount: s.members.length,
        formation: s.formation,
        avgHealth: s.getAverageHealth(),
      })),
    };

    try {
      let directive;

      if (NeuralConfig.debug.mockAPIResponses || !NeuralConfig.provider.apiKey) {
        directive = MockCommanderAI.generateDirective(situation);
      } else {
        directive = await this.callAI(situation);
      }

      this.executeDirective(directive);
    } catch (error) {
      console.error('[CommanderAI] Strategic update failed:', error);
    }
  }

  /**
   * Update boss AI
   */
  updateBossAI(boss) {
    const currentTime = Date.now();
    const tactic = boss.selectTactic(
      this.playerPosition.x,
      this.playerPosition.y,
      currentTime
    );

    // Convert tactic to actions
    let targetX = this.playerPosition.x;
    let targetY = this.playerPosition.y;
    let mode = MONSTER_MODES.MM_WALK;

    switch (tactic) {
      case 'charge':
        mode = MONSTER_MODES.MM_CHARGE;
        break;

      case 'retreat_behind_minions':
        // Move away from player, towards minions
        const dx = boss.x - this.playerPosition.x;
        const dy = boss.y - this.playerPosition.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        targetX = boss.x + (dx / dist) * 5;
        targetY = boss.y + (dy / dist) * 5;
        break;

      case 'summon':
        mode = MONSTER_MODES.MM_SPSTAND;
        break;

      case 'teleport':
        // Random position away from player
        const angle = Math.random() * Math.PI * 2;
        targetX = this.playerPosition.x + Math.cos(angle) * 8;
        targetY = this.playerPosition.y + Math.sin(angle) * 8;
        break;

      case 'hide':
        mode = MONSTER_MODES.MM_FADEOUT;
        break;

      default:
        mode = MONSTER_MODES.MM_ATTACK;
    }

    boss.targetX = targetX;
    boss.targetY = targetY;

    neuralInterop.emit('bossAction', {
      bossId: boss.id,
      tactic,
      targetX,
      targetY,
      mode,
    });
  }

  /**
   * Emit tactical orders to game
   */
  emitTacticalOrders() {
    const orders = [];

    for (const monster of this.monsters.values()) {
      if (monster.targetX !== undefined && monster.targetY !== undefined) {
        orders.push({
          monsterId: monster.id,
          targetX: monster.targetX,
          targetY: monster.targetY,
          action: monster.getBestAction(),
        });
      }
    }

    neuralInterop.emit('tacticalOrders', orders);
  }

  /**
   * Execute a strategic directive
   */
  executeDirective(directive) {
    if (!directive) return;

    neuralInterop.emit('strategicDirective', directive);

    // Apply formation changes
    if (directive.formation) {
      for (const squad of this.squads.values()) {
        squad.setFormation(directive.formation);
      }
    }
  }

  /**
   * Call AI API for strategic decisions
   */
  async callAI(situation) {
    const prompt = `Analyze this tactical situation and provide a directive:

Player Position: (${situation.player.x}, ${situation.player.y})

Monsters (${situation.monsters.length} total):
${situation.monsters.map(m => `- ID ${m.id}: ${m.role} at (${m.x}, ${m.y}), HP ${m.hp}/${m.maxHp}`).join('\n')}

Squads (${situation.squads.length}):
${situation.squads.map(s => `- ${s.id}: ${s.memberCount} members, ${s.formation} formation, ${(s.avgHealth * 100).toFixed(0)}% health`).join('\n')}

Provide a tactical directive as JSON:
{
  "type": "HOLD|ADVANCE|FLANK|SURROUND|RETREAT",
  "formation": "LINE|WEDGE|FLANK|SURROUND|RETREAT",
  "description": "Brief tactical description"
}`;

    const response = await fetch(`${NeuralConfig.provider.endpoint}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${NeuralConfig.provider.apiKey}`,
      },
      body: JSON.stringify({
        model: NeuralConfig.provider.model,
        messages: [
          { role: 'system', content: 'You are a tactical AI commander. Output only JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.5,
        max_tokens: 200,
      }),
    });

    if (!response.ok) {
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No valid JSON in response');
    }

    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Enable/disable the Commander AI
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    console.log(`[CommanderAI] ${enabled ? 'Enabled' : 'Disabled'}`);
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      enabled: this.enabled,
      monsterCount: this.monsters.size,
      squadCount: this.squads.size,
      bossCount: this.bosses.size,
      frameCount: this.frameCount,
    };
  }

  /**
   * Clear all AI state
   */
  clear() {
    this.monsters.clear();
    this.squads.clear();
    this.bosses.clear();
  }
}

// Singleton instance
const commanderAI = new CommanderAI();

export {
  CommanderAI,
  MonsterAI,
  BossAI,
  Squad,
  FORMATIONS,
  MockCommanderAI,
};

export default commanderAI;
