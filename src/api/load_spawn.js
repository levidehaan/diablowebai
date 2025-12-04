import axios from 'axios';

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

  let file = fs.files.get('spawn.mpq');

  // Only validate size for non-modded files
  // Modded MPQs will have different sizes and should be trusted
  if (file && !isModded && !SpawnSizes.includes(file.byteLength)) {
    console.warn('[load_spawn] Invalid spawn.mpq size, re-downloading...');
    fs.files.delete('spawn.mpq');
    await fs.delete('spawn.mpq');
    file = null;
  }

  // If modded, log that we're using the mod
  if (file && isModded) {
    console.log(`[load_spawn] Using modded spawn.mpq (${file.byteLength} bytes)`);
  }

  if (!file) {
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
      throw Error("Invalid spawn.mpq size. Try clearing cache and refreshing the page.");
    }
    const data = new Uint8Array(spawn.data);
    fs.files.set('spawn.mpq', data);
    fs.update('spawn.mpq', data.slice());
  }
  return fs;
}
