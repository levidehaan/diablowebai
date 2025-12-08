import Worker from './game.worker.js';
import init_sound from './sound';
import load_spawn from './load_spawn';
import webrtc_open from './webrtc';
import { gameEventEmitter } from '../neural/GameEventEmitter';
import neuralGameController from '../neural/NeuralGameController';
import { CampaignPackageLoader, injectCampaignIntoFilesystem } from '../neural/CampaignPackage';

// Track the game worker for neural integration
let gameWorker = null;

function onRender(api, ctx, {bitmap, images, text, clip, belt}) {
  if (bitmap) {
    ctx.transferFromImageBitmap(bitmap);
  } else {
    for (let {x, y, w, h, data} of images) {
      const image = ctx.createImageData(w, h);
      image.data.set(data);
      ctx.putImageData(image, x, y);
    }
    if (text.length) {
      ctx.save();
      ctx.font = 'bold 13px Times New Roman';
      if (clip) {
        const {x0, y0, x1, y1} = clip;
        ctx.beginPath();
        ctx.rect(x0, y0, x1 - x0, y1 - y0);
        ctx.clip();
      }
      for (let {x, y, text: str, color} of text) {
        const r = ((color >> 16) & 0xFF);
        const g = ((color >> 8) & 0xFF);
        const b = (color & 0xFF);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fillText(str, x, y + 22);
      }
      ctx.restore();
    }
  }

  api.updateBelt(belt);
}

function testOffscreen() {
  return false;
  // This works but I couldn't see any performance difference, and support for 2D canvas in workers is very poor.
  // In this mode, instead of sending a batch of areas to draw back to the main thread, the worker does all drawing on its own and sends a complete bitmap object back.
  // However, this effectively clears the worker's canvas, so we need to redraw the whole frame every time, which defeats the performance gained from reduced copying.
  /*try {
    const canvas = document.createElement("canvas");
    const offscreen = canvas.transferControlToOffscreen();
    const context = offscreen.getContext("2d");
    return context != null;
  } catch (e) {
    return false;
  }*/
}

async function do_load_game(api, audio, mpq, spawn, options = {}) {
  const fs = await api.fs;
  const { isModded = false } = options;

  if (spawn && !mpq) {
    await load_spawn(api, fs, { isModded });
  }

  let context = null, offscreen = false;
  if (testOffscreen()) {
    context = api.canvas.getContext("bitmaprenderer");
    offscreen = true;
  } else {
    context = api.canvas.getContext("2d", {alpha: false});
  }
  return await new Promise((resolve, reject) => {
    try {
      const worker = new Worker();

      let packetQueue = [];
      const webrtc = webrtc_open(data => {
        packetQueue.push(data);
      });

      worker.addEventListener("message", ({data}) => {
        switch (data.action) {
        case "loaded":
          console.log('[Loader] Game loaded signal received from worker');

          // Store worker reference for neural integration
          gameWorker = worker;

          // Initialize NeuralGameController with the worker
          // Note: WASM module is not directly accessible here, controller will
          // work through worker messages
          neuralGameController.initialize(null, worker).then(() => {
            console.log('[Loader] NeuralGameController initialized');
          }).catch(err => {
            console.warn('[Loader] NeuralGameController init failed:', err);
          });

          resolve((func, ...params) => worker.postMessage({action: "event", func, params}));
          break;
        case "render":
          onRender(api, context, data.batch);
          break;
        case "audio":
          audio[data.func](...data.params);
          break;
        case "audioBatch":
          for (let {func, params} of data.batch) {
            audio[func](...params);
          }
          break;
        case "fs":
          fs[data.func](...data.params);
          break;
        case "cursor":
          api.setCursorPos(data.x, data.y);
          break;
        case "keyboard":
          api.openKeyboard(data.rect);
          break;
        case "error":
          audio.stop_all();
          api.onError(data.error, data.stack);
          break;
        case "failed":
          reject({message: data.error, stack: data.stack});
          break;
        case "progress":
          api.onProgress({text: data.text, loaded: data.loaded, total: data.total});
          break;
        case "exit":
          api.onExit();
          break;
        case "current_save":
          api.setCurrentSave(data.name);
          break;
          case "packet":
          webrtc.send(data.buffer);
          break;
        case "packetBatch":
          for (let packet of data.batch) {
            webrtc.send(packet);
          }
          break;
        case "game_events":
          // Forward game events to the main thread event system
          if (data.events && data.events.length > 0) {
            gameEventEmitter.processBatch(data.events);
          }
          break;
        case "wasm_discovery":
          // WASM exports discovery - useful for debugging
          if (api.onWasmDiscovery) {
            api.onWasmDiscovery(data.exports, data.categories);
          }
          console.log('[Loader] WASM exports discovered:', data.exports?.length || 0);
          break;
        default:
        }
      });          
      const transfer= [];
      for (let [, file] of fs.files) {
        transfer.push(file.buffer);
      }
      worker.postMessage({action: "init", files: fs.files, mpq, spawn, offscreen}, transfer);
      setInterval(() => {
        if (packetQueue.length) {
          worker.postMessage({action: "packetBatch", batch: packetQueue}, packetQueue);
          packetQueue.length = 0;
        }
      }, 20);
      delete fs.files;
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Load and start the game
 * @param {Object} api - Game API
 * @param {ArrayBuffer} mpq - MPQ data (if loading directly)
 * @param {boolean} spawn - Whether to load spawn.mpq
 * @param {Object} options - Options
 * @param {boolean} options.isModded - If true, skip MPQ size validation
 */
export default function load_game(api, mpq, spawn, options = {}) {
  const audio = init_sound();
  return do_load_game(api, audio, mpq, spawn, options);
}

/**
 * Get the current game worker instance
 * @returns {Worker|null} The game worker if initialized
 */
export function getGameWorker() {
  return gameWorker;
}

/**
 * Trigger game start for neural systems
 * Call this after character selection when entering the game world
 */
export async function triggerNeuralGameStart() {
  if (neuralGameController) {
    await neuralGameController.onGameStart();
    console.log('[Loader] Neural game start triggered');
  }
}

/**
 * Load a campaign into the neural game controller
 * @param {Object} campaign - Campaign data from CampaignBuilder
 */
export async function loadCampaignForPlay(campaign) {
  if (neuralGameController) {
    await neuralGameController.loadCampaign(campaign);
    console.log('[Loader] Campaign loaded for play');
    return true;
  }
  return false;
}

/**
 * Load a campaign package (.dcpk file) and prepare it for play
 * @param {File|Blob|ArrayBuffer} packageSource - The campaign package file
 * @param {Object} api - Game API with filesystem access
 * @returns {Promise<Object>} The loaded campaign data
 */
export async function loadCampaignPackageForPlay(packageSource, api) {
  console.log('[Loader] Loading campaign package...');

  // Load the package
  const loader = new CampaignPackageLoader();
  const packageData = await loader.load(packageSource);

  console.log('[Loader] Package loaded:', {
    campaign: packageData.campaign?.name,
    dunFiles: packageData.dunFiles?.size || 0,
  });

  // Inject DUN files into the filesystem if available
  if (api?.fs) {
    const fs = await api.fs;
    if (fs.files) {
      const injectedCount = injectCampaignIntoFilesystem(fs.files, loader);
      console.log(`[Loader] Injected ${injectedCount} DUN files into filesystem`);
    }
  }

  // Convert to playable format and load into neural controller
  const playableFormat = loader.toPlayableFormat();

  if (neuralGameController) {
    await neuralGameController.loadCampaign(playableFormat);
    console.log('[Loader] Campaign loaded into NeuralGameController');
  }

  return {
    campaign: packageData.campaign,
    world: packageData.world,
    triggers: packageData.triggers,
    dunFiles: packageData.dunFiles,
    playableFormat,
  };
}

/**
 * Check if a campaign package is valid
 * @param {File|Blob} file - The file to check
 * @returns {boolean} True if file appears to be a valid campaign package
 */
export function isCampaignPackage(file) {
  if (!file || !file.name) return false;
  return file.name.toLowerCase().endsWith('.dcpk');
}
