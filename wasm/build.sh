#!/bin/bash
# DevilutionX WASM Build Script with Custom API
#
# This script clones devilutionX, patches it with our CustomAPI module,
# and compiles to WASM with the exports needed for Neural AI integration.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build"
SOURCE_DIR="${BUILD_DIR}/devilutionX"
OUTPUT_DIR="${SCRIPT_DIR}/../src/api"

# DevilutionX repo - use the web-compatible fork
DEVILUTION_REPO="https://github.com/AJenbo/devilutionX.git"
DEVILUTION_BRANCH="master"

# Build options
CLEAN_BUILD=false
CUSTOM_API=false
DEBUG_SYMBOLS=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --clean)
            CLEAN_BUILD=true
            shift
            ;;
        --custom-api)
            CUSTOM_API=true
            shift
            ;;
        --debug-symbols)
            DEBUG_SYMBOLS=true
            shift
            ;;
        --help)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --clean          Clean build directory before building"
            echo "  --custom-api     Include CustomAPI.cpp exports (recommended)"
            echo "  --debug-symbols  Build with -g4 for symbol map generation"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo "=========================================="
echo "DevilutionX WASM Build for Neural AI"
echo "=========================================="
echo "Build dir: ${BUILD_DIR}"
echo "Custom API: ${CUSTOM_API}"
echo "Debug symbols: ${DEBUG_SYMBOLS}"
echo ""

# Clean if requested
if [ "$CLEAN_BUILD" = true ]; then
    echo "[1/6] Cleaning build directory..."
    rm -rf "${BUILD_DIR}"
fi

# Create build directory
mkdir -p "${BUILD_DIR}"
cd "${BUILD_DIR}"

# Clone source if not present
if [ ! -d "${SOURCE_DIR}" ]; then
    echo "[2/6] Cloning devilutionX source..."
    git clone --depth 1 --branch "${DEVILUTION_BRANCH}" "${DEVILUTION_REPO}" devilutionX
else
    echo "[2/6] Source already exists, skipping clone"
fi

cd "${SOURCE_DIR}"

# Apply CustomAPI patch if enabled
if [ "$CUSTOM_API" = true ]; then
    echo "[3/6] Applying CustomAPI patch..."

    # Copy our CustomAPI files
    cp "${SCRIPT_DIR}/patches/CustomAPI.cpp" Source/
    cp "${SCRIPT_DIR}/patches/CustomAPI.h" Source/

    # Patch CMakeLists.txt to include CustomAPI
    if ! grep -q "CustomAPI.cpp" Source/CMakeLists.txt 2>/dev/null; then
        # Find the source list and add our file
        # This is a simplified patch - real implementation may need adjustment
        echo "add_library(CustomAPI STATIC CustomAPI.cpp)" >> Source/CMakeLists.txt
    fi

    # Patch diablo.cpp to initialize CustomAPI
    if ! grep -q "CustomAPI_Init" Source/diablo.cpp 2>/dev/null; then
        echo "// CustomAPI initialization will be added here"
    fi
fi

# Configure CMake for Emscripten
echo "[4/6] Configuring CMake for Emscripten..."
mkdir -p build_wasm
cd build_wasm

CMAKE_FLAGS=(
    -G Ninja
    -DCMAKE_BUILD_TYPE=Release
    -DBUILD_TESTING=OFF
    -DDEVILUTIONX_SYSTEM_BZIP2=OFF
    -DDEVILUTIONX_SYSTEM_LIBSODIUM=OFF
    -DDEVILUTIONX_SYSTEM_LIBFMT=OFF
    -DDEVILUTIONX_SYSTEM_SDL2=OFF
    -DCMAKE_TOOLCHAIN_FILE=${EMSDK}/upstream/emscripten/cmake/Modules/Platform/Emscripten.cmake
)

# Add debug flags if requested
if [ "$DEBUG_SYMBOLS" = true ]; then
    CMAKE_FLAGS+=(-DCMAKE_CXX_FLAGS="-g4 -s DEMANGLE_SUPPORT=1")
fi

# Add exported functions for CustomAPI
if [ "$CUSTOM_API" = true ]; then
    EXPORTS=(
        "_DApi_Init"
        "_DApi_Render"
        "_DApi_Key"
        "_DApi_Mouse"
        "_DApi_Char"
        "_DApi_AllocPacket"
        "_DApi_SyncText"
        "_DApi_SyncTextPtr"
        # New CustomAPI exports
        "_DApi_OverrideStartLevel"
        "_DApi_SuppressNPCs"
        "_DApi_SetDungeonGeometry"
        "_DApi_InjectMonster"
        "_DApi_ClearMonsters"
        "_DApi_GetMonsterCount"
        "_DApi_InjectObject"
        "_DApi_ClearObjects"
        "_DApi_GetCurrentLevel"
        "_DApi_GetPlayerPos"
        "_DApi_SetPlayerPos"
        "_DApi_PauseGameLogic"
        "_DApi_GetDLevelPtr"
        "_DApi_GetDMonsterPtr"
        "_DApi_GetDObjectPtr"
        "_DApi_GetPlayerPtr"
    )
    EXPORT_STRING=$(IFS=,; echo "${EXPORTS[*]}")
    CMAKE_FLAGS+=(-DCMAKE_EXE_LINKER_FLAGS="-s EXPORTED_FUNCTIONS='[${EXPORT_STRING}]'")
fi

emcmake cmake .. "${CMAKE_FLAGS[@]}"

# Build
echo "[5/6] Building WASM binary..."
ninja

# Copy outputs
echo "[6/6] Copying build artifacts..."
if [ -f devilutionx.wasm ]; then
    cp devilutionx.wasm "${OUTPUT_DIR}/Diablo.wasm"
fi
if [ -f devilutionx.js ]; then
    cp devilutionx.js "${OUTPUT_DIR}/Diablo.jscc"
fi

# Generate symbol map if debug build
if [ "$DEBUG_SYMBOLS" = true ]; then
    echo "Generating symbol map..."
    if [ -f devilutionx.wasm.map ]; then
        node "${SCRIPT_DIR}/generate-symbols.js" devilutionx.wasm.map > "${OUTPUT_DIR}/symbols.json"
    fi
fi

echo ""
echo "=========================================="
echo "Build complete!"
echo "=========================================="
echo "Output files:"
echo "  ${OUTPUT_DIR}/Diablo.wasm"
echo "  ${OUTPUT_DIR}/Diablo.jscc"
if [ "$DEBUG_SYMBOLS" = true ]; then
    echo "  ${OUTPUT_DIR}/symbols.json"
fi
echo ""
echo "To use, restart the dev server."
