/**
 * CustomAPI.h - Neural AI Integration Layer for DevilutionX
 *
 * This header exposes internal game functions to the JavaScript layer,
 * enabling the "White Box" strategy for total game state control.
 *
 * The AI system can use these exports to:
 * - Override the starting level (skip Tristram)
 * - Inject custom monsters and objects at runtime
 * - Control game flow (pause for dialogue, etc.)
 * - Access memory pointers for direct manipulation
 */

#pragma once

#include <cstdint>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define CUSTOM_API_EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define CUSTOM_API_EXPORT
#endif

extern "C" {

// ============================================================
// GAME FLOW CONTROL
// ============================================================

/**
 * Override the starting level for new games.
 * Call this BEFORE the game starts to skip Tristram.
 *
 * @param levelId The level to start on:
 *   0 = Tristram (default)
 *   1-4 = Cathedral
 *   5-8 = Catacombs
 *   9-12 = Caves
 *   13-16 = Hell
 *   100+ = Custom levels (if supported)
 */
CUSTOM_API_EXPORT void DApi_OverrideStartLevel(int levelId);

/**
 * Suppress the standard Tristram NPCs from spawning.
 * Use this when creating a custom town experience.
 *
 * @param suppress If true, CreateTowners() is skipped
 */
CUSTOM_API_EXPORT void DApi_SuppressNPCs(bool suppress);

/**
 * Get the current dungeon level ID.
 *
 * @return Current level (0 = Tristram, 1-16 = dungeons)
 */
CUSTOM_API_EXPORT int DApi_GetCurrentLevel();

/**
 * Pause or resume the game logic tick.
 * Use this when showing dialogue overlays - freezes monsters
 * but keeps rendering active.
 *
 * @param paused If true, game logic stops; rendering continues
 */
CUSTOM_API_EXPORT void DApi_PauseGameLogic(bool paused);

// ============================================================
// LEVEL GEOMETRY
// ============================================================

/**
 * Inject a custom dungeon tile grid.
 * This overwrites the current level geometry.
 *
 * @param gridPtr Pointer to a 40x40 byte array of tile IDs
 * @param width Grid width (must be 40)
 * @param height Grid height (must be 40)
 * @return true on success
 */
CUSTOM_API_EXPORT bool DApi_SetDungeonGeometry(const uint8_t* gridPtr, int width, int height);

/**
 * Get the pointer to the dLevel array.
 * Use this for direct memory access from JS.
 *
 * @return Pointer to dLevel[40][40] in WASM heap
 */
CUSTOM_API_EXPORT uintptr_t DApi_GetDLevelPtr();

// ============================================================
// MONSTER CONTROL
// ============================================================

/**
 * Inject a monster into the current level.
 *
 * @param x X position (0-39)
 * @param y Y position (0-39)
 * @param typeId Monster type ID (see MonsterMapper.js)
 * @param hp Initial HP (-1 for default)
 * @param flags Monster flags (0 = normal, 1 = unique, 2 = champion)
 * @return Monster slot index, or -1 on failure
 */
CUSTOM_API_EXPORT int DApi_InjectMonster(int x, int y, int typeId, int hp, int flags);

/**
 * Clear all monsters from the current level.
 * Use this before injecting a custom monster set.
 */
CUSTOM_API_EXPORT void DApi_ClearMonsters();

/**
 * Get the number of active monsters.
 *
 * @return Number of monsters currently alive
 */
CUSTOM_API_EXPORT int DApi_GetMonsterCount();

/**
 * Get the pointer to the monster array.
 *
 * @return Pointer to monster struct array in WASM heap
 */
CUSTOM_API_EXPORT uintptr_t DApi_GetDMonsterPtr();

// ============================================================
// OBJECT CONTROL
// ============================================================

/**
 * Inject an object (chest, shrine, etc.) into the current level.
 *
 * @param x X position (0-39)
 * @param y Y position (0-39)
 * @param typeId Object type ID (see ObjectMapper.js)
 * @return Object slot index, or -1 on failure
 */
CUSTOM_API_EXPORT int DApi_InjectObject(int x, int y, int typeId);

/**
 * Clear all objects from the current level.
 */
CUSTOM_API_EXPORT void DApi_ClearObjects();

/**
 * Get the pointer to the object array.
 *
 * @return Pointer to object struct array in WASM heap
 */
CUSTOM_API_EXPORT uintptr_t DApi_GetDObjectPtr();

// ============================================================
// PLAYER CONTROL
// ============================================================

/**
 * Get the player's current position.
 *
 * @param outX Pointer to store X coordinate
 * @param outY Pointer to store Y coordinate
 */
CUSTOM_API_EXPORT void DApi_GetPlayerPos(int* outX, int* outY);

/**
 * Teleport the player to a new position.
 *
 * @param x Target X coordinate (0-39)
 * @param y Target Y coordinate (0-39)
 * @return true if teleport succeeded
 */
CUSTOM_API_EXPORT bool DApi_SetPlayerPos(int x, int y);

/**
 * Get the pointer to the player struct.
 *
 * @return Pointer to player[0] in WASM heap
 */
CUSTOM_API_EXPORT uintptr_t DApi_GetPlayerPtr();

// ============================================================
// QUEST/FLAG ACCESS
// ============================================================

/**
 * Get a quest flag value.
 *
 * @param questId Quest ID (0-15)
 * @return Quest state value
 */
CUSTOM_API_EXPORT int DApi_GetQuestFlag(int questId);

/**
 * Set a quest flag value.
 *
 * @param questId Quest ID (0-15)
 * @param value New state value
 */
CUSTOM_API_EXPORT void DApi_SetQuestFlag(int questId, int value);

// ============================================================
// CUSTOM API STATE
// ============================================================

/**
 * Global state for the CustomAPI module.
 * These are set from JS before game start.
 */
struct CustomAPIState {
    bool initialized;
    int overrideStartLevel;
    bool suppressNPCs;
    bool gamePaused;
    bool customCampaignMode;
};

extern CustomAPIState g_customAPI;

/**
 * Initialize the CustomAPI module.
 * Called automatically on WASM load.
 */
CUSTOM_API_EXPORT void CustomAPI_Init();

} // extern "C"
