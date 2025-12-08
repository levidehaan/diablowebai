'use strict';

/**
 * Cache Busting Script for GitHub Pages
 *
 * This script runs after the build to:
 * 1. Generate content hashes for WASM and data files
 * 2. Create a version manifest for cache validation
 *
 * IMPORTANT: We do NOT rename WASM files because:
 * - Emscripten generates minified JS with internal references to .data and .wasm files
 * - These references are embedded at compile time and hard to update via regex
 * - The app uses query string versioning (?v=hash) for cache busting instead
 */

const fs = require('fs-extra');
const path = require('path');
const crypto = require('crypto');

const BUILD_DIR = path.join(__dirname, '..', 'build');
const WASM_DIR = path.join(BUILD_DIR, 'wasm');

// Files to generate hashes for (but NOT rename)
// WASM files should NOT be renamed - Emscripten has internal cross-references
const HASH_ONLY_PATTERNS = [
  { dir: WASM_DIR, pattern: /^devilutionx\.(wasm|data|js)$/ },
];

// Files to actually rename with hashes (non-WASM files in build root)
// Currently empty - we're using query string versioning instead
const CACHE_BUST_PATTERNS = [];

/**
 * Generate content hash for a file
 */
function getFileHash(filePath, length = 8) {
  const content = fs.readFileSync(filePath);
  const hash = crypto.createHash('md5').update(content).digest('hex');
  return hash.substring(0, length);
}

/**
 * Get build timestamp hash
 */
function getBuildHash() {
  const timestamp = Date.now().toString();
  return crypto.createHash('md5').update(timestamp).digest('hex').substring(0, 8);
}

/**
 * Rename a file with its content hash
 */
function hashFileName(filePath) {
  const hash = getFileHash(filePath);
  const ext = path.extname(filePath);
  const base = path.basename(filePath, ext);
  const dir = path.dirname(filePath);
  const newName = `${base}.${hash}${ext}`;
  const newPath = path.join(dir, newName);

  fs.renameSync(filePath, newPath);

  return {
    original: path.basename(filePath),
    hashed: newName,
    hash,
  };
}

/**
 * Update JS file references to use hashed filenames
 */
function updateReferences(jsFilePath, mappings) {
  let content = fs.readFileSync(jsFilePath, 'utf8');
  let modified = false;

  for (const { original, hashed } of mappings) {
    // Handle various import/reference patterns
    const patterns = [
      // Direct string references
      new RegExp(`(['"\`])${escapeRegExp(original)}\\1`, 'g'),
      // Path references
      new RegExp(`(['"\`])([^'"]*/)${escapeRegExp(original)}\\1`, 'g'),
      // locateFile function returns
      new RegExp(`return\\s*(['"\`])([^'"]*/)${escapeRegExp(original)}\\1`, 'g'),
    ];

    for (const pattern of patterns) {
      const newContent = content.replace(pattern, (match, quote, prefix = '') => {
        modified = true;
        if (prefix) {
          return `${quote}${prefix}${hashed}${quote}`;
        }
        return `${quote}${hashed}${quote}`;
      });
      content = newContent;
    }
  }

  if (modified) {
    fs.writeFileSync(jsFilePath, content, 'utf8');
    return true;
  }
  return false;
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find all JS files in build directory
 */
function findJSFiles(dir) {
  const files = [];

  function walk(currentDir) {
    const items = fs.readdirSync(currentDir);
    for (const item of items) {
      const itemPath = path.join(currentDir, item);
      const stat = fs.statSync(itemPath);
      if (stat.isDirectory()) {
        walk(itemPath);
      } else if (item.endsWith('.js')) {
        files.push(itemPath);
      }
    }
  }

  walk(dir);
  return files;
}

/**
 * Create version manifest
 */
function createManifest(mappings, buildHash) {
  const manifest = {
    version: buildHash,
    buildTime: new Date().toISOString(),
    files: {},
  };

  for (const { original, hashed, hash } of mappings) {
    manifest.files[original] = {
      hashed,
      hash,
    };
  }

  const manifestPath = path.join(BUILD_DIR, 'asset-manifest.json');

  // Merge with existing manifest if it exists
  if (fs.existsSync(manifestPath)) {
    const existing = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    manifest.files = { ...existing.files, ...manifest.files };
    manifest.entrypoints = existing.entrypoints;
  }

  // Add cache bust info
  manifest.cacheBust = {
    version: buildHash,
    timestamp: Date.now(),
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  return manifest;
}

/**
 * Generate hash for a file without renaming it
 */
function getFileHashInfo(filePath) {
  const hash = getFileHash(filePath);
  const fileName = path.basename(filePath);
  return {
    original: fileName,
    hashed: fileName, // Same name - not renaming
    hash,
    path: filePath,
  };
}

/**
 * Main cache busting function
 */
async function cacheBust() {
  console.log('🔄 Starting cache busting...\n');

  const buildHash = getBuildHash();
  console.log(`📦 Build hash: ${buildHash}`);

  const allMappings = [];
  const hashOnlyMappings = [];

  // Process WASM files - hash only, no rename
  console.log('\n📊 Generating hashes for WASM files (no rename)...');
  for (const { dir, pattern } of HASH_ONLY_PATTERNS) {
    if (!fs.existsSync(dir)) {
      console.log(`⚠️  Directory not found: ${dir}`);
      continue;
    }

    const files = fs.readdirSync(dir);

    for (const file of files) {
      if (pattern.test(file)) {
        const filePath = path.join(dir, file);
        const info = getFileHashInfo(filePath);
        hashOnlyMappings.push(info);
        console.log(`   📄 ${file} → hash: ${info.hash}`);
      }
    }
  }

  // Process files to rename (currently none for WASM safety)
  for (const { dir, pattern } of CACHE_BUST_PATTERNS) {
    if (!fs.existsSync(dir)) {
      console.log(`⚠️  Directory not found: ${dir}`);
      continue;
    }

    const files = fs.readdirSync(dir);

    for (const file of files) {
      if (pattern.test(file)) {
        const filePath = path.join(dir, file);
        const mapping = hashFileName(filePath);
        allMappings.push(mapping);
        console.log(`✅ ${file} → ${mapping.hashed}`);
      }
    }
  }

  // Update references in JS files only if we renamed files
  if (allMappings.length > 0) {
    console.log('\n📝 Updating references in JavaScript files...');
    const jsFiles = findJSFiles(BUILD_DIR);
    let updatedCount = 0;

    for (const jsFile of jsFiles) {
      if (updateReferences(jsFile, allMappings)) {
        updatedCount++;
        console.log(`   Updated: ${path.relative(BUILD_DIR, jsFile)}`);
      }
    }

    console.log(`   Total files updated: ${updatedCount}`);
  }

  // Create manifest with both renamed and hash-only files
  console.log('\n📋 Creating version manifest...');
  const combinedMappings = [...allMappings, ...hashOnlyMappings];
  const manifest = createManifest(combinedMappings, buildHash);
  console.log(`   Manifest written with ${Object.keys(manifest.files).length} entries`);

  // Create a simple version file for easy cache checking
  const versionPath = path.join(BUILD_DIR, 'version.json');
  fs.writeFileSync(versionPath, JSON.stringify({
    version: buildHash,
    timestamp: Date.now(),
    buildTime: new Date().toISOString(),
    wasmHashes: hashOnlyMappings.reduce((acc, m) => {
      acc[m.original] = m.hash;
      return acc;
    }, {}),
  }, null, 2), 'utf8');
  console.log('   Version file written');

  console.log('\n✨ Cache busting complete!\n');
  console.log('ℹ️  Note: WASM files keep original names. Use ?v=hash query strings for versioning.');
}

// Run if called directly
if (require.main === module) {
  cacheBust().catch(err => {
    console.error('❌ Cache busting failed:', err);
    process.exit(1);
  });
}

module.exports = { cacheBust, getFileHash, getBuildHash };
