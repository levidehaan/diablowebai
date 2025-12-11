#!/bin/bash
# Simple WASM build script for DiabloWeb
# This builds the shareware (spawn) version with all core DApi exports

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUILD_DIR="${SCRIPT_DIR}/build/devilution"
OUTPUT_DIR="${SCRIPT_DIR}/../src/api"

# Source Emscripten environment
if [ -f "/home/user/emsdk/emsdk_env.sh" ]; then
    source /home/user/emsdk/emsdk_env.sh
elif [ -n "$EMSDK" ]; then
    source "${EMSDK}/emsdk_env.sh"
else
    echo "Error: Emscripten SDK not found"
    echo "Install with: git clone https://github.com/emscripten-core/emsdk.git && cd emsdk && ./emsdk install latest && ./emsdk activate latest"
    exit 1
fi

# Verify emcc is available
if ! command -v emcc &> /dev/null; then
    echo "Error: emcc not found. Make sure Emscripten is installed and activated."
    exit 1
fi

echo "==========================================="
echo "DiabloWeb WASM Build"
echo "==========================================="
echo "Build dir: ${BUILD_DIR}"
echo "Output dir: ${OUTPUT_DIR}"
echo ""

# Clone source if needed
if [ ! -d "${BUILD_DIR}" ]; then
    echo "Cloning d07RiV/devilution source..."
    mkdir -p "$(dirname ${BUILD_DIR})"
    git clone --depth 1 https://github.com/d07RiV/devilution.git "${BUILD_DIR}"
fi

cd "${BUILD_DIR}"

# Build flags
FLAGS="-O3 -DZ_SOLO -DEMSCRIPTEN -DNO_SYSTEM -Wno-logical-op-parentheses --std=c++17"
SPAWN_FLAGS="${FLAGS} -DSPAWN"

# Collect all source files
SOURCES=$(find Source -name "*.cpp" -o -name "*.c" | grep -v "/test/" | sort)

echo "Found $(echo "$SOURCES" | wc -l) source files"
echo ""

# Create object file directory
mkdir -p emcc_obj

# Compile each file
echo "Compiling source files..."
for src in $SOURCES; do
    obj="emcc_obj/$(basename ${src}).o"
    if [ ! -f "$obj" ] || [ "$src" -nt "$obj" ]; then
        echo "  Compiling: $src"
        if [[ "$src" == *.cpp ]]; then
            emcc -c "$src" -o "$obj" $FLAGS -I. 2>/dev/null || true
        else
            emcc -c "$src" -o "$obj" -DZ_SOLO -DEMSCRIPTEN -DNO_SYSTEM -Wno-logical-op-parentheses -I. 2>/dev/null || true
        fi
    fi
done

# Collect object files
OBJECTS=$(find emcc_obj -name "*.o" | sort)
OBJ_COUNT=$(echo "$OBJECTS" | wc -l)
echo ""
echo "Compiled $OBJ_COUNT object files"

# DApi functions that must be exported
EXPORTED_FUNCS="['_DApi_Init','_DApi_Mouse','_DApi_Key','_DApi_Char','_DApi_Render','_DApi_SyncTextPtr','_DApi_SyncText','_malloc','_free']"

# Link DiabloSpawn.wasm
echo ""
echo "Linking DiabloSpawn.wasm with explicit exports..."
emcc $OBJECTS -o DiabloSpawn.js \
    -s EXPORT_NAME="DiabloSpawn" \
    -s WASM=1 \
    -s MODULARIZE=1 \
    -s NO_FILESYSTEM=1 \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s TOTAL_MEMORY=134217728 \
    -s DISABLE_EXCEPTION_CATCHING=0 \
    -s "EXPORTED_FUNCTIONS=${EXPORTED_FUNCS}" \
    -s "EXPORTED_RUNTIME_METHODS=['ccall','cwrap','getValue','setValue']" \
    --post-js ./module-post.js \
    $SPAWN_FLAGS 2>&1 || {
        echo "Link failed. Trying without module-post.js..."
        emcc $OBJECTS -o DiabloSpawn.js \
            -s EXPORT_NAME="DiabloSpawn" \
            -s WASM=1 \
            -s MODULARIZE=1 \
            -s NO_FILESYSTEM=1 \
            -s ALLOW_MEMORY_GROWTH=1 \
            -s TOTAL_MEMORY=134217728 \
            -s DISABLE_EXCEPTION_CATCHING=0 \
            -s "EXPORTED_FUNCTIONS=${EXPORTED_FUNCS}" \
            -s "EXPORTED_RUNTIME_METHODS=['ccall','cwrap','getValue','setValue']" \
            $SPAWN_FLAGS
    }

# Rename outputs
if [ -f "DiabloSpawn.js" ]; then
    mv DiabloSpawn.js DiabloSpawn.jscc
    echo "Created DiabloSpawn.jscc"
fi

if [ -f "DiabloSpawn.wasm" ]; then
    echo "Created DiabloSpawn.wasm"

    # Verify exports
    echo ""
    echo "Verifying exports..."
    node -e "
const fs = require('fs');
const wasmBuffer = fs.readFileSync('DiabloSpawn.wasm');
WebAssembly.compile(wasmBuffer).then(module => {
  const exports = WebAssembly.Module.exports(module);
  const funcs = exports.filter(e => e.kind === 'function');
  console.log('Total exports:', exports.length);
  console.log('Function exports:', funcs.length);
  const dapi = funcs.filter(e => e.name.includes('DApi'));
  console.log('DApi exports:', dapi.length);
  if (dapi.length > 0) {
    console.log('DApi functions:');
    dapi.forEach(e => console.log('  -', e.name));
  }
});
"
fi

# Copy to output directory
echo ""
echo "Copying to ${OUTPUT_DIR}..."
mkdir -p "${OUTPUT_DIR}"
if [ -f "DiabloSpawn.wasm" ]; then
    cp DiabloSpawn.wasm "${OUTPUT_DIR}/"
fi
if [ -f "DiabloSpawn.jscc" ]; then
    cp DiabloSpawn.jscc "${OUTPUT_DIR}/"
fi

echo ""
echo "==========================================="
echo "Build complete!"
echo "==========================================="
