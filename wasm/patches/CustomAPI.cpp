/**
 * CustomAPI.cpp - Neural AI Integration Layer for DevilutionX
 *
 * This module implements the exported functions that allow the JavaScript
 * layer to control game state for custom campaigns.
 *
 * Compatible with DevilutionX web builds (AJenbo/devilutionX fork)
 */

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define CUSTOM_API extern "C" EMSCRIPTEN_KEEPALIVE
#else
#define CUSTOM_API extern "C"
#endif

#include <cstdint>
#include <cstring>

// Forward declarations for DevilutionX internals
// These are defined in the main DevilutionX source
namespace devilution {
    extern int currlevel;
    extern int leveltype;
    extern int nummonsters;
    extern int nobjects;

    // Dungeon arrays (112x112 for dPiece, 40x40 for dLevel)
    extern uint8_t dungeon[40][40];

    // Player structure
    struct Player;
    extern Player *MyPlayer;
}

// ============================================================
// CUSTOM API STATE
// ============================================================

struct CustomAPIState {
    bool initialized;
    int overrideStartLevel;
    bool suppressNPCs;
    bool gamePaused;
    bool customCampaignMode;
};

static CustomAPIState g_customAPI = {
    false,  // initialized
    -1,     // overrideStartLevel (-1 = no override)
    false,  // suppressNPCs
    false,  // gamePaused
    false   // customCampaignMode
};

// ============================================================
// INITIALIZATION
// ============================================================

CUSTOM_API void CustomAPI_Init() {
    g_customAPI.initialized = true;
    g_customAPI.overrideStartLevel = -1;
    g_customAPI.suppressNPCs = false;
    g_customAPI.gamePaused = false;
    g_customAPI.customCampaignMode = false;
}

// ============================================================
// GAME FLOW CONTROL
// ============================================================

CUSTOM_API void DApi_OverrideStartLevel(int levelId) {
    g_customAPI.overrideStartLevel = levelId;
    g_customAPI.customCampaignMode = (levelId > 0);
}

CUSTOM_API void DApi_SuppressNPCs(int suppress) {
    g_customAPI.suppressNPCs = (suppress != 0);
}

CUSTOM_API int DApi_GetCurrentLevel() {
    return devilution::currlevel;
}

CUSTOM_API void DApi_PauseGameLogic(int paused) {
    g_customAPI.gamePaused = (paused != 0);
}

// ============================================================
// LEVEL GEOMETRY
// ============================================================

CUSTOM_API int DApi_SetDungeonGeometry(const uint8_t* gridPtr, int width, int height) {
    if (!gridPtr || width != 40 || height != 40) {
        return 0;
    }

    // Copy the grid into the internal dungeon array
    for (int y = 0; y < 40; y++) {
        for (int x = 0; x < 40; x++) {
            devilution::dungeon[x][y] = gridPtr[y * 40 + x];
        }
    }

    return 1;
}

CUSTOM_API uintptr_t DApi_GetDLevelPtr() {
    return reinterpret_cast<uintptr_t>(&devilution::dungeon[0][0]);
}

// ============================================================
// MONSTER CONTROL
// ============================================================

CUSTOM_API int DApi_InjectMonster(int x, int y, int typeId, int hp, int flags) {
    // Bounds check
    if (x < 0 || x >= 40 || y < 0 || y >= 40) {
        return -1;
    }

    // Check for available slot
    if (devilution::nummonsters >= 200) {
        return -1;
    }

    // In full implementation, call AddMonster
    // For now, return the slot that would be used
    int slot = devilution::nummonsters;
    devilution::nummonsters++;

    return slot;
}

CUSTOM_API void DApi_ClearMonsters() {
    devilution::nummonsters = 0;
}

CUSTOM_API int DApi_GetMonsterCount() {
    return devilution::nummonsters;
}

CUSTOM_API uintptr_t DApi_GetDMonsterPtr() {
    // Return 0 - actual implementation needs monster array pointer
    return 0;
}

// ============================================================
// OBJECT CONTROL
// ============================================================

CUSTOM_API int DApi_InjectObject(int x, int y, int typeId) {
    if (x < 0 || x >= 40 || y < 0 || y >= 40) {
        return -1;
    }

    if (devilution::nobjects >= 127) {
        return -1;
    }

    int slot = devilution::nobjects;
    devilution::nobjects++;

    return slot;
}

CUSTOM_API void DApi_ClearObjects() {
    devilution::nobjects = 0;
}

CUSTOM_API uintptr_t DApi_GetDObjectPtr() {
    return 0;
}

// ============================================================
// PLAYER CONTROL
// ============================================================

CUSTOM_API void DApi_GetPlayerPos(int* outX, int* outY) {
    if (!outX || !outY) return;

    // Placeholder - actual implementation reads from player struct
    *outX = 0;
    *outY = 0;
}

CUSTOM_API int DApi_SetPlayerPos(int x, int y) {
    if (x < 0 || x >= 40 || y < 0 || y >= 40) {
        return 0;
    }

    // Placeholder - actual implementation modifies player struct
    return 1;
}

CUSTOM_API uintptr_t DApi_GetPlayerPtr() {
    return reinterpret_cast<uintptr_t>(devilution::MyPlayer);
}

// ============================================================
// QUEST/FLAG ACCESS
// ============================================================

CUSTOM_API int DApi_GetQuestFlag(int questId) {
    if (questId < 0 || questId >= 16) {
        return -1;
    }

    // Placeholder
    return 0;
}

CUSTOM_API void DApi_SetQuestFlag(int questId, int value) {
    if (questId < 0 || questId >= 16) {
        return;
    }

    // Placeholder
}

// ============================================================
// HOOKS INTO MAIN GAME LOOP
// These are called from patched DevilutionX source
// ============================================================

CUSTOM_API int CustomAPI_GetStartLevel() {
    if (g_customAPI.overrideStartLevel >= 0) {
        return g_customAPI.overrideStartLevel;
    }
    return 0;
}

CUSTOM_API int CustomAPI_ShouldCreateTowners() {
    return g_customAPI.suppressNPCs ? 0 : 1;
}

CUSTOM_API int CustomAPI_ShouldProcessGameLogic() {
    return g_customAPI.gamePaused ? 0 : 1;
}

CUSTOM_API int CustomAPI_IsCustomCampaign() {
    return g_customAPI.customCampaignMode ? 1 : 0;
}
