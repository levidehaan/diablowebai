/**
 * CustomAPI.cpp - Neural AI Integration Layer for DevilutionX
 *
 * This module implements the exported functions that allow the JavaScript
 * layer to control game state for custom campaigns.
 *
 * IMPLEMENTATION NOTES:
 * - This file must be compiled into the DevilutionX WASM binary
 * - Functions use EMSCRIPTEN_KEEPALIVE to ensure they're exported
 * - Internal game variables are accessed via extern declarations
 * - Some functions may need adjustment based on the specific DevilutionX fork
 */

#include "CustomAPI.h"
#include <cstring>

// Include DevilutionX headers
// NOTE: These includes depend on the specific devilutionX version
// Adjust paths as needed for your fork
#ifdef DEVILUTIONX_INCLUDES
#include "diablo.h"
#include "gendung.h"
#include "monster.h"
#include "objects.h"
#include "player.h"
#include "quests.h"
#include "towners.h"
#endif

// ============================================================
// EXTERNAL GAME VARIABLES
// These are defined in the main DevilutionX source
// ============================================================

// From gendung.cpp - dungeon layout
extern "C" {
    // Dungeon tile array (40x40)
    extern uint8_t dLevel[40][40];

    // Current level ID
    extern int currlevel;

    // Level type (cathedral, catacombs, etc.)
    extern int leveltype;
}

// From monster.cpp - monster management
extern "C" {
    // Monster array
    extern void* monster;  // MonsterStruct monster[MAXMONSTERS]

    // Number of active monsters
    extern int nummonsters;

    // Maximum monsters
    #define MAXMONSTERS 200
}

// From objects.cpp - object management
extern "C" {
    // Object array
    extern void* object;  // ObjectStruct object[MAXOBJECTS]

    // Number of active objects
    extern int nobjects;

    #define MAXOBJECTS 127
}

// From player.cpp - player state
extern "C" {
    // Player array (supports multiplayer)
    extern void* plr;  // PlayerStruct plr[MAX_PLRS]

    // Current player index
    extern int myplr;
}

// From quests.cpp - quest flags
extern "C" {
    extern void* quests;  // QuestStruct quests[MAXQUESTS]
    #define MAXQUESTS 16
}

// ============================================================
// CUSTOM API STATE
// ============================================================

CustomAPIState g_customAPI = {
    false,  // initialized
    -1,     // overrideStartLevel (-1 = no override)
    false,  // suppressNPCs
    false,  // gamePaused
    false   // customCampaignMode
};

// ============================================================
// INITIALIZATION
// ============================================================

extern "C" CUSTOM_API_EXPORT void CustomAPI_Init() {
    g_customAPI.initialized = true;
    g_customAPI.overrideStartLevel = -1;
    g_customAPI.suppressNPCs = false;
    g_customAPI.gamePaused = false;
    g_customAPI.customCampaignMode = false;
}

// ============================================================
// GAME FLOW CONTROL
// ============================================================

extern "C" CUSTOM_API_EXPORT void DApi_OverrideStartLevel(int levelId) {
    g_customAPI.overrideStartLevel = levelId;
    g_customAPI.customCampaignMode = (levelId > 0);
}

extern "C" CUSTOM_API_EXPORT void DApi_SuppressNPCs(bool suppress) {
    g_customAPI.suppressNPCs = suppress;
}

extern "C" CUSTOM_API_EXPORT int DApi_GetCurrentLevel() {
    return currlevel;
}

extern "C" CUSTOM_API_EXPORT void DApi_PauseGameLogic(bool paused) {
    g_customAPI.gamePaused = paused;
    // Note: The actual pause logic needs to be integrated into
    // the main game loop in diablo.cpp
}

// ============================================================
// LEVEL GEOMETRY
// ============================================================

extern "C" CUSTOM_API_EXPORT bool DApi_SetDungeonGeometry(const uint8_t* gridPtr, int width, int height) {
    if (!gridPtr || width != 40 || height != 40) {
        return false;
    }

    // Copy the grid into the internal dLevel array
    for (int y = 0; y < 40; y++) {
        for (int x = 0; x < 40; x++) {
            dLevel[x][y] = gridPtr[y * 40 + x];
        }
    }

    return true;
}

extern "C" CUSTOM_API_EXPORT uintptr_t DApi_GetDLevelPtr() {
    return reinterpret_cast<uintptr_t>(&dLevel[0][0]);
}

// ============================================================
// MONSTER CONTROL
// ============================================================

extern "C" CUSTOM_API_EXPORT int DApi_InjectMonster(int x, int y, int typeId, int hp, int flags) {
    // Bounds check
    if (x < 0 || x >= 40 || y < 0 || y >= 40) {
        return -1;
    }

    // Check for available slot
    if (nummonsters >= MAXMONSTERS) {
        return -1;
    }

    // In a full implementation, this would call the internal
    // AddMonster or PlaceMonster function. For now, we return
    // the slot that would be used.
    //
    // The actual implementation depends on the DevilutionX version:
    //
    // Option A: Call internal function
    // int slot = AddMonster(x, y, dir, typeId, true);
    //
    // Option B: Manually populate monster struct
    // MonsterStruct* m = &monster[nummonsters];
    // m->_mx = x;
    // m->_my = y;
    // m->_mtype = typeId;
    // m->_mhitpoints = hp > 0 ? hp : GetMonsterHP(typeId);
    // nummonsters++;

    int slot = nummonsters;
    nummonsters++;  // Placeholder - actual implementation needed

    return slot;
}

extern "C" CUSTOM_API_EXPORT void DApi_ClearMonsters() {
    // Zero out the monster array
    // memset(monster, 0, MAXMONSTERS * sizeof(MonsterStruct));
    nummonsters = 0;
}

extern "C" CUSTOM_API_EXPORT int DApi_GetMonsterCount() {
    return nummonsters;
}

extern "C" CUSTOM_API_EXPORT uintptr_t DApi_GetDMonsterPtr() {
    return reinterpret_cast<uintptr_t>(monster);
}

// ============================================================
// OBJECT CONTROL
// ============================================================

extern "C" CUSTOM_API_EXPORT int DApi_InjectObject(int x, int y, int typeId) {
    // Bounds check
    if (x < 0 || x >= 40 || y < 0 || y >= 40) {
        return -1;
    }

    // Check for available slot
    if (nobjects >= MAXOBJECTS) {
        return -1;
    }

    // Similar to monsters - actual implementation depends on version
    // AddObject(typeId, x, y);

    int slot = nobjects;
    nobjects++;  // Placeholder

    return slot;
}

extern "C" CUSTOM_API_EXPORT void DApi_ClearObjects() {
    nobjects = 0;
}

extern "C" CUSTOM_API_EXPORT uintptr_t DApi_GetDObjectPtr() {
    return reinterpret_cast<uintptr_t>(object);
}

// ============================================================
// PLAYER CONTROL
// ============================================================

extern "C" CUSTOM_API_EXPORT void DApi_GetPlayerPos(int* outX, int* outY) {
    if (!outX || !outY) return;

    // Access player position
    // In actual implementation:
    // *outX = plr[myplr]._px;
    // *outY = plr[myplr]._py;

    *outX = 0;  // Placeholder
    *outY = 0;
}

extern "C" CUSTOM_API_EXPORT bool DApi_SetPlayerPos(int x, int y) {
    if (x < 0 || x >= 40 || y < 0 || y >= 40) {
        return false;
    }

    // In actual implementation:
    // plr[myplr]._px = x;
    // plr[myplr]._py = y;
    // plr[myplr]._pfutx = x;
    // plr[myplr]._pfuty = y;

    return true;
}

extern "C" CUSTOM_API_EXPORT uintptr_t DApi_GetPlayerPtr() {
    return reinterpret_cast<uintptr_t>(plr);
}

// ============================================================
// QUEST/FLAG ACCESS
// ============================================================

extern "C" CUSTOM_API_EXPORT int DApi_GetQuestFlag(int questId) {
    if (questId < 0 || questId >= MAXQUESTS) {
        return -1;
    }

    // In actual implementation:
    // return quests[questId]._qactive;

    return 0;  // Placeholder
}

extern "C" CUSTOM_API_EXPORT void DApi_SetQuestFlag(int questId, int value) {
    if (questId < 0 || questId >= MAXQUESTS) {
        return;
    }

    // In actual implementation:
    // quests[questId]._qactive = value;
}

// ============================================================
// HOOKS INTO MAIN GAME LOOP
// These functions are called from the patched devilutionX source
// ============================================================

/**
 * Called at the start of StartNewGame()
 * Returns the level to start on (overrides default Tristram)
 */
extern "C" int CustomAPI_GetStartLevel() {
    if (g_customAPI.overrideStartLevel >= 0) {
        return g_customAPI.overrideStartLevel;
    }
    return 0;  // Default to Tristram
}

/**
 * Called before CreateTowners()
 * Returns false to suppress standard NPC spawning
 */
extern "C" bool CustomAPI_ShouldCreateTowners() {
    return !g_customAPI.suppressNPCs;
}

/**
 * Called at the start of each game tick
 * Returns false to skip game logic (for pause)
 */
extern "C" bool CustomAPI_ShouldProcessGameLogic() {
    return !g_customAPI.gamePaused;
}

/**
 * Called when entering a new level
 * Allows JS to inject level data before first render
 */
extern "C" void CustomAPI_OnLevelEnter(int levelId) {
    // This will trigger a callback to JS
    // The JS layer can then call DApi_SetDungeonGeometry, etc.
}
