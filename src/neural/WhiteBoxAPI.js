/**
 * WhiteBoxAPI - JavaScript wrapper for DevilutionX WASM exports
 *
 * This provides a clean interface to interact with the game engine
 * through our custom EMSCRIPTEN_KEEPALIVE exports.
 */

export class WhiteBoxAPI {
    constructor(wasmModule) {
        this.module = wasmModule;
        this._validateExports();
    }

    _validateExports() {
        const requiredExports = [
            'DApi_GetCurrentLevel',
            'DApi_GetDungeonWidth',
            'DApi_GetDungeonHeight'
        ];

        for (const exportName of requiredExports) {
            if (!this.module[`_${exportName}`]) {
                throw new Error(`Missing required WASM export: ${exportName}`);
            }
        }
    }

    _call(name, ...args) {
        const fn = this.module[`_${name}`];
        if (!fn) {
            throw new Error(`WASM export not found: ${name}`);
        }
        return fn(...args);
    }

    // ========================================================================
    // Game State Queries
    // ========================================================================

    getCurrentLevel() {
        return this._call('DApi_GetCurrentLevel');
    }

    getLevelType() {
        return this._call('DApi_GetLevelType');
    }

    getDungeonWidth() {
        return this._call('DApi_GetDungeonWidth');
    }

    getDungeonHeight() {
        return this._call('DApi_GetDungeonHeight');
    }

    getTileMapWidth() {
        return this._call('DApi_GetTileMapWidth');
    }

    getTileMapHeight() {
        return this._call('DApi_GetTileMapHeight');
    }

    // ========================================================================
    // Dungeon Geometry Access
    // ========================================================================

    getDungeonTile(x, y) {
        return this._call('DApi_GetDungeonTile', x, y);
    }

    setDungeonTile(x, y, value) {
        this._call('DApi_SetDungeonTile', x, y, value);
    }

    getDMonster(x, y) {
        return this._call('DApi_GetDMonster', x, y);
    }

    getDObject(x, y) {
        return this._call('DApi_GetDObject', x, y);
    }

    /**
     * Read the entire dungeon grid (40x40)
     * @returns {Uint8Array} 1600-byte array of dungeon tiles
     */
    getDungeonGrid() {
        const width = this.getDungeonWidth();
        const height = this.getDungeonHeight();
        const ptr = this._call('DApi_GetDungeonPtr');
        return new Uint8Array(this.module.HEAPU8.buffer, ptr, width * height);
    }

    /**
     * Read the tile-level monster map (112x112)
     * @returns {Int16Array} Array of monster IDs per tile
     */
    getMonsterGrid() {
        const width = this.getTileMapWidth();
        const height = this.getTileMapHeight();
        const ptr = this._call('DApi_GetDMonsterPtr');
        return new Int16Array(this.module.HEAPU8.buffer, ptr, width * height);
    }

    /**
     * Read the tile-level object map (112x112)
     * @returns {Int8Array} Array of object IDs per tile
     */
    getObjectGrid() {
        const width = this.getTileMapWidth();
        const height = this.getTileMapHeight();
        const ptr = this._call('DApi_GetDObjectPtr');
        return new Int8Array(this.module.HEAPU8.buffer, ptr, width * height);
    }

    // ========================================================================
    // Player State Access
    // ========================================================================

    getPlayerCount() {
        return this._call('DApi_GetPlayerCount');
    }

    getMyPlayerIndex() {
        return this._call('DApi_GetMyPlayerIndex');
    }

    getPlayerPosition(playerId = 0) {
        return {
            x: this._call('DApi_GetPlayerX', playerId),
            y: this._call('DApi_GetPlayerY', playerId)
        };
    }

    getPlayerHP(playerId = 0) {
        return this._call('DApi_GetPlayerHP', playerId);
    }

    getPlayerMaxHP(playerId = 0) {
        return this._call('DApi_GetPlayerMaxHP', playerId);
    }

    getPlayerMana(playerId = 0) {
        return this._call('DApi_GetPlayerMana', playerId);
    }

    getPlayerMaxMana(playerId = 0) {
        return this._call('DApi_GetPlayerMaxMana', playerId);
    }

    getPlayerLevel(playerId = 0) {
        return this._call('DApi_GetPlayerLevel', playerId);
    }

    getPlayerGold(playerId = 0) {
        return this._call('DApi_GetPlayerGold', playerId);
    }

    getPlayerClass(playerId = 0) {
        return this._call('DApi_GetPlayerClass', playerId);
    }

    getPlayerName(playerId = 0) {
        const ptr = this._call('DApi_GetPlayerName', playerId);
        return this.module.UTF8ToString(ptr);
    }

    /**
     * Get comprehensive player state
     * @param {number} playerId - Player index (0-3)
     * @returns {object} Player state object
     */
    getPlayerState(playerId = 0) {
        return {
            playerId,
            position: this.getPlayerPosition(playerId),
            hp: this.getPlayerHP(playerId),
            maxHp: this.getPlayerMaxHP(playerId),
            mana: this.getPlayerMana(playerId),
            maxMana: this.getPlayerMaxMana(playerId),
            level: this.getPlayerLevel(playerId),
            gold: this.getPlayerGold(playerId),
            class: this.getPlayerClass(playerId),
            name: this.getPlayerName(playerId)
        };
    }

    // ========================================================================
    // Monster State Access
    // ========================================================================

    getActiveMonsterCount() {
        return this._call('DApi_GetActiveMonsterCount');
    }

    getMaxMonsters() {
        return this._call('DApi_GetMaxMonsters');
    }

    getMonsterPosition(monsterId) {
        return {
            x: this._call('DApi_GetMonsterX', monsterId),
            y: this._call('DApi_GetMonsterY', monsterId)
        };
    }

    getMonsterHP(monsterId) {
        return this._call('DApi_GetMonsterHP', monsterId);
    }

    getMonsterMaxHP(monsterId) {
        return this._call('DApi_GetMonsterMaxHP', monsterId);
    }

    getMonsterType(monsterId) {
        return this._call('DApi_GetMonsterType', monsterId);
    }

    isMonsterActive(monsterId) {
        return this._call('DApi_IsMonsterActive', monsterId) === 1;
    }

    /**
     * Get comprehensive monster state
     * @param {number} monsterId - Monster index
     * @returns {object} Monster state object
     */
    getMonsterState(monsterId) {
        return {
            monsterId,
            position: this.getMonsterPosition(monsterId),
            hp: this.getMonsterHP(monsterId),
            maxHp: this.getMonsterMaxHP(monsterId),
            type: this.getMonsterType(monsterId),
            active: this.isMonsterActive(monsterId)
        };
    }

    /**
     * Get all active monsters
     * @returns {Array} Array of monster state objects
     */
    getAllActiveMonsters() {
        const monsters = [];
        const maxMonsters = this.getMaxMonsters();

        for (let i = 0; i < maxMonsters; i++) {
            if (this.isMonsterActive(i)) {
                monsters.push(this.getMonsterState(i));
            }
        }

        return monsters;
    }

    // ========================================================================
    // Object State Access
    // ========================================================================

    getActiveObjectCount() {
        return this._call('DApi_GetActiveObjectCount');
    }

    getObjectPosition(objectId) {
        return {
            x: this._call('DApi_GetObjectX', objectId),
            y: this._call('DApi_GetObjectY', objectId)
        };
    }

    getObjectType(objectId) {
        return this._call('DApi_GetObjectType', objectId);
    }

    // ========================================================================
    // Quest State Access
    // ========================================================================

    getQuestState(questId) {
        return this._call('DApi_GetQuestState', questId);
    }

    getQuestLevel(questId) {
        return this._call('DApi_GetQuestLevel', questId);
    }

    // ========================================================================
    // Quest State Mutation (for AI campaign control)
    // ========================================================================

    /**
     * Set quest state directly
     * @param {number} questId - Quest ID (0-23)
     * @param {number} state - 0=NOTAVAIL, 1=INIT, 2=ACTIVE, 3=DONE
     */
    setQuestState(questId, state) {
        this._call('DApi_SetQuestState', questId, state);
    }

    /**
     * Set whether quest appears in quest log
     * @param {number} questId - Quest ID
     * @param {boolean} show - Whether to show in log
     */
    setQuestLog(questId, show) {
        this._call('DApi_SetQuestLog', questId, show ? 1 : 0);
    }

    /**
     * Get whether quest is in quest log
     * @param {number} questId - Quest ID
     * @returns {boolean} True if in log
     */
    getQuestLog(questId) {
        return this._call('DApi_GetQuestLog', questId) === 1;
    }

    /**
     * Get quest variable 1
     * @param {number} questId - Quest ID
     * @returns {number} Variable value
     */
    getQuestVar1(questId) {
        return this._call('DApi_GetQuestVar1', questId);
    }

    /**
     * Set quest variable 1 (for tracking progress)
     * @param {number} questId - Quest ID
     * @param {number} value - Value to set
     */
    setQuestVar1(questId, value) {
        this._call('DApi_SetQuestVar1', questId, value);
    }

    /**
     * Get quest variable 2
     * @param {number} questId - Quest ID
     * @returns {number} Variable value
     */
    getQuestVar2(questId) {
        return this._call('DApi_GetQuestVar2', questId);
    }

    /**
     * Set quest variable 2 (for tracking progress)
     * @param {number} questId - Quest ID
     * @param {number} value - Value to set
     */
    setQuestVar2(questId, value) {
        this._call('DApi_SetQuestVar2', questId, value);
    }

    /**
     * Activate a quest and optionally set its level
     * @param {number} questId - Quest ID
     * @param {number} level - Level number (-1 to keep existing)
     */
    activateQuest(questId, level = -1) {
        this._call('DApi_ActivateQuest', questId, level);
    }

    /**
     * Mark a quest as completed
     * @param {number} questId - Quest ID
     */
    completeQuest(questId) {
        this._call('DApi_CompleteQuest', questId);
    }

    /**
     * Set quest trigger position
     * @param {number} questId - Quest ID
     * @param {number} x - X position
     * @param {number} y - Y position
     */
    setQuestPosition(questId, x, y) {
        this._call('DApi_SetQuestPosition', questId, x, y);
    }

    /**
     * Get count of currently active quests
     * @returns {number} Number of active quests
     */
    getActiveQuestCount() {
        return this._call('DApi_GetActiveQuestCount');
    }

    /**
     * Get comprehensive quest state
     * @param {number} questId - Quest ID
     * @returns {object} Quest state object
     */
    getQuestInfo(questId) {
        return {
            id: questId,
            state: this.getQuestState(questId),
            level: this.getQuestLevel(questId),
            inLog: this.getQuestLog(questId),
            var1: this.getQuestVar1(questId),
            var2: this.getQuestVar2(questId),
        };
    }

    /**
     * Get all quest states
     * @returns {Array} Array of quest info objects
     */
    getAllQuests() {
        const quests = [];
        for (let i = 0; i < 24; i++) {
            const state = this.getQuestState(i);
            if (state >= 0) {
                quests.push(this.getQuestInfo(i));
            }
        }
        return quests;
    }

    // ========================================================================
    // Automap Access
    // ========================================================================

    isAutomapActive() {
        return this._call('DApi_IsAutomapActive') === 1;
    }

    /**
     * Get automap exploration data (40x40)
     * @returns {Uint8Array} Exploration state per dungeon tile
     */
    getAutomapView() {
        const width = this.getDungeonWidth();
        const height = this.getDungeonHeight();
        const ptr = this._call('DApi_GetAutomapViewPtr');
        return new Uint8Array(this.module.HEAPU8.buffer, ptr, width * height);
    }

    // ========================================================================
    // Game Control Functions
    // ========================================================================

    setPlayerPosition(playerId, x, y) {
        this._call('DApi_SetPlayerPosition', playerId, x, y);
    }

    setMonsterPosition(monsterId, x, y) {
        this._call('DApi_SetMonsterPosition', monsterId, x, y);
    }

    setMonsterHP(monsterId, hp) {
        this._call('DApi_SetMonsterHP', monsterId, hp);
    }

    killMonster(monsterId) {
        this._call('DApi_KillMonster', monsterId);
    }

    // ========================================================================
    // Level Injection Support
    // ========================================================================

    /**
     * Inject custom dungeon geometry
     * @param {Uint8Array} data - Dungeon tile data (40x40 max)
     * @param {number} width - Width of data
     * @param {number} height - Height of data
     */
    setDungeonGeometry(data, width, height) {
        // Allocate memory in WASM and copy data
        const ptr = this.module._malloc(data.length);
        this.module.HEAPU8.set(data, ptr);

        this._call('DApi_SetDungeonGeometry', ptr, width, height);

        // Free allocated memory
        this.module._free(ptr);
    }

    clearDungeon() {
        this._call('DApi_ClearDungeon');
    }

    clearMonsters() {
        this._call('DApi_ClearMonsters');
    }

    clearObjects() {
        this._call('DApi_ClearObjects');
    }

    // ========================================================================
    // Monster/Object Injection
    // ========================================================================

    /**
     * Inject a monster at runtime
     * @param {number} monsterType - Monster type ID
     * @param {number} x - X position
     * @param {number} y - Y position
     * @param {number} hp - Hit points
     * @param {boolean} isBoss - Whether this is a boss monster
     * @returns {number} Monster slot ID, or -1 on failure
     */
    injectMonster(monsterType, x, y, hp, isBoss = false) {
        return this._call('DApi_InjectMonster', monsterType, x, y, hp, isBoss ? 1 : 0);
    }

    /**
     * Inject an object at runtime
     * @param {number} objectType - Object type ID
     * @param {number} x - X position
     * @param {number} y - Y position
     * @returns {number} Object slot ID, or -1 on failure
     */
    injectObject(objectType, x, y) {
        return this._call('DApi_InjectObject', objectType, x, y);
    }

    // ========================================================================
    // Player Rewards
    // ========================================================================

    /**
     * Give gold to a player
     * @param {number} playerId - Player index
     * @param {number} amount - Amount of gold
     */
    givePlayerGold(playerId, amount) {
        this._call('DApi_GivePlayerGold', playerId, amount);
    }

    /**
     * Give an item to a player
     * @param {number} playerId - Player index
     * @param {number} itemId - Item type ID
     * @param {number} quality - Item quality
     * @returns {number} Inventory slot, or -1 if no space
     */
    givePlayerItem(playerId, itemId, quality = 0) {
        return this._call('DApi_GivePlayerItem', playerId, itemId, quality);
    }

    /**
     * Give experience to a player
     * @param {number} playerId - Player index
     * @param {number} amount - Amount of experience
     */
    givePlayerExperience(playerId, amount) {
        this._call('DApi_GivePlayerExperience', playerId, amount);
    }

    // ========================================================================
    // Campaign/Level Override Support
    // ========================================================================

    /**
     * Override the starting level for a new game
     * @param {number} levelNum - Level number to start on
     */
    overrideStartLevel(levelNum) {
        this._call('DApi_OverrideStartLevel', levelNum);
    }

    /**
     * Get the current override start level
     * @returns {number} Override level, or -1 if not set
     */
    getOverrideStartLevel() {
        return this._call('DApi_GetOverrideStartLevel');
    }

    /**
     * Clear the start level override
     */
    clearOverrideStartLevel() {
        this._call('DApi_ClearOverrideStartLevel');
    }

    /**
     * Set custom player spawn point
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     */
    setPlayerSpawnPoint(x, y) {
        this._call('DApi_SetPlayerSpawnPoint', x, y);
    }

    /**
     * Get custom spawn X coordinate
     * @returns {number} X coordinate, or -1 if not set
     */
    getSpawnX() {
        return this._call('DApi_GetSpawnX');
    }

    /**
     * Get custom spawn Y coordinate
     * @returns {number} Y coordinate, or -1 if not set
     */
    getSpawnY() {
        return this._call('DApi_GetSpawnY');
    }

    // ========================================================================
    // NPC Suppression (for custom NPCs)
    // ========================================================================

    /**
     * Suppress default NPC spawning
     * @param {boolean} suppress - Whether to suppress NPCs
     */
    suppressNPCs(suppress) {
        this._call('DApi_SuppressNPCs', suppress ? 1 : 0);
    }

    /**
     * Check if NPCs are suppressed
     * @returns {boolean} True if NPCs are suppressed
     */
    areNPCsSuppressed() {
        return this._call('DApi_AreNPCsSuppressed') === 1;
    }

    /**
     * Get the number of active towners
     * @returns {number} Towner count
     */
    getTownerCount() {
        return this._call('DApi_GetTownerCount');
    }

    /**
     * Clear all towners from the town
     */
    clearTowners() {
        this._call('DApi_ClearTowners');
    }

    // ========================================================================
    // Game Logic Control
    // ========================================================================

    /**
     * Pause or unpause game logic
     * @param {boolean} pause - Whether to pause
     */
    pauseGameLogic(pause) {
        this._call('DApi_PauseGameLogic', pause ? 1 : 0);
    }

    /**
     * Check if game logic is paused
     * @returns {boolean} True if paused
     */
    isGamePaused() {
        return this._call('DApi_IsGamePaused') === 1;
    }

    /**
     * Force a complete screen redraw
     */
    forceRedraw() {
        this._call('DApi_ForceRedraw');
    }

    /**
     * Get current game mode
     * @returns {number} 1 if game running, 0 otherwise
     */
    getGameMode() {
        return this._call('DApi_GetGameMode');
    }

    // ========================================================================
    // Item Placement
    // ========================================================================

    /**
     * Place an item on the ground
     * @param {number} itemId - Item type ID
     * @param {number} x - X position
     * @param {number} y - Y position
     * @returns {number} Item slot, or -1 if no space
     */
    placeGroundItem(itemId, x, y) {
        return this._call('DApi_PlaceGroundItem', itemId, x, y);
    }

    /**
     * Clear all items from the ground
     */
    clearGroundItems() {
        this._call('DApi_ClearGroundItems');
    }

    // ========================================================================
    // Memory Offsets (for debugging/Glass Box integration)
    // ========================================================================

    getMemoryOffsets() {
        return {
            dungeon: this._call('DApi_GetDungeonOffset'),
            dMonster: this._call('DApi_GetDMonsterOffset'),
            dObject: this._call('DApi_GetDObjectOffset'),
            players: this._call('DApi_GetPlayersOffset'),
            monsters: this._call('DApi_GetMonstersOffset')
        };
    }

    // ========================================================================
    // Utility Methods
    // ========================================================================

    /**
     * Get complete game state snapshot
     * @returns {object} Full game state
     */
    getGameState() {
        const myPlayer = this.getMyPlayerIndex();

        return {
            level: {
                current: this.getCurrentLevel(),
                type: this.getLevelType(),
                dungeonSize: {
                    width: this.getDungeonWidth(),
                    height: this.getDungeonHeight()
                },
                tileMapSize: {
                    width: this.getTileMapWidth(),
                    height: this.getTileMapHeight()
                }
            },
            player: this.getPlayerState(myPlayer),
            monsters: {
                active: this.getActiveMonsterCount(),
                max: this.getMaxMonsters()
            },
            objects: {
                active: this.getActiveObjectCount()
            },
            automap: {
                active: this.isAutomapActive()
            }
        };
    }

    /**
     * Log game state to console for debugging
     */
    debugState() {
        const state = this.getGameState();
        console.log('=== DevilutionX Game State ===');
        console.log('Level:', state.level.current, 'Type:', state.level.type);
        console.log('Player:', state.player.name, 'at', state.player.position);
        console.log('HP:', state.player.hp, '/', state.player.maxHp);
        console.log('Monsters:', state.monsters.active, 'active of', state.monsters.max);
        console.log('Objects:', state.objects.active, 'active');
        return state;
    }
}

// Level type constants (from gendung_defs.hpp)
export const LevelType = {
    TOWN: 0,
    CATHEDRAL: 1,
    CATACOMBS: 2,
    CAVES: 3,
    HELL: 4,
    NEST: 5,
    CRYPT: 6
};

// Player class constants
export const PlayerClass = {
    WARRIOR: 0,
    ROGUE: 1,
    SORCERER: 2,
    MONK: 3,
    BARD: 4,
    BARBARIAN: 5
};

// Quest state constants
export const QuestState = {
    NOTAVAIL: 0,
    INIT: 1,
    ACTIVE: 2,
    DONE: 3
};

export default WhiteBoxAPI;
