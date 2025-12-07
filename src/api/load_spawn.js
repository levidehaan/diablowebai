import axios from 'axios';
import debugLogger, { LogCategory } from '../neural/DebugLogger';

const SpawnSizes = [50274091, 25830791];

export { SpawnSizes };

/**
 * Load spawn.mpq from filesystem or download from server
 * @param {Object} api - Game API with onProgress callback
 * @param {Object} fs - Virtual filesystem
 * @param {Object} options - Options
 * @param {boolean} options.isModded - If true, skip size validation (for modded MPQs)
 * @returns {Object} Filesystem reference
 */
export default async function load_spawn(api, fs, options = {}) {
  const { isModded = false } = options;

  debugLogger.logGameLoadStart({ isModded, hasFileInFS: fs.files.has('spawn.mpq') });

  let file = fs.files.get('spawn.mpq');

  // Only validate size for non-modded files
  // Modded MPQs will have different sizes and should be trusted
  if (file && !isModded && !SpawnSizes.includes(file.byteLength)) {
    console.warn('[load_spawn] Invalid spawn.mpq size, re-downloading...');
    debugLogger.warn(LogCategory.GAME_LOAD, 'Invalid spawn.mpq size, re-downloading', {
      actualSize: file.byteLength,
      expectedSizes: SpawnSizes,
    });
    fs.files.delete('spawn.mpq');
    await fs.delete('spawn.mpq');
    file = null;
  }

  // If modded, log that we're using the mod
  if (file && isModded) {
    console.log(`[load_spawn] Using modded spawn.mpq (${file.byteLength} bytes)`);
    debugLogger.logMpqSource('filesystem (MODDED)', file.byteLength, true);
    debugLogger.info(LogCategory.GAME_LOAD, '=== MODDED MPQ LOADED ===', {
      source: 'filesystem',
      size: file.byteLength,
      isModded: true,
      differentFromOriginal: !SpawnSizes.includes(file.byteLength),
    });
  } else if (file) {
    debugLogger.logMpqSource('filesystem (original)', file.byteLength, false);
    debugLogger.info(LogCategory.GAME_LOAD, 'Original spawn.mpq loaded from filesystem', {
      size: file.byteLength,
    });
  }

  if (!file) {
    debugLogger.info(LogCategory.GAME_LOAD, 'Downloading spawn.mpq from server...');
    const spawn = await axios.request({
      url: process.env.PUBLIC_URL + '/spawn.mpq',
      responseType: 'arraybuffer',
      onDownloadProgress: e => {
        if (api.onProgress) {
          api.onProgress({text: 'Downloading...', loaded: e.loaded, total: e.total || SpawnSizes[1]});
        }
      },
      headers: {
        'Cache-Control': 'max-age=31536000'
      }
    });
    if (!SpawnSizes.includes(spawn.data.byteLength)) {
      debugLogger.error(LogCategory.GAME_LOAD, 'Downloaded spawn.mpq has invalid size', {
        size: spawn.data.byteLength,
        expectedSizes: SpawnSizes,
      });
      throw Error("Invalid spawn.mpq size. Try clearing cache and refreshing the page.");
    }
    const data = new Uint8Array(spawn.data);
    fs.files.set('spawn.mpq', data);
    fs.update('spawn.mpq', data.slice());
    debugLogger.logMpqSource('downloaded from server', data.byteLength, false);
  }

  debugLogger.logGameLoadComplete();
  return fs;
}
