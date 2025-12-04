/**
 * MPQ Writer
 *
 * Creates modified MPQ archives by patching the original spawn.mpq
 * with AI-generated content. Uses simple uncompressed storage for
 * modified files to avoid compression complexity.
 *
 * Strategy:
 * 1. Copy original MPQ structure
 * 2. Replace/add modified files at the end
 * 3. Rebuild hash and block tables
 * 4. Output new MPQ
 */

import { encrypt, hash, path_name } from '../api/savefile';

// MPQ Header constants
const MPQ_MAGIC = 0x1A51504D;  // 'MPQ\x1A'
const MPQ_HEADER_SIZE = 32;
const HASH_ENTRY_SIZE = 16;
const BLOCK_ENTRY_SIZE = 16;

// Block flags
const Flags = {
  CompressPkWare: 0x00000100,
  CompressMulti: 0x00000200,
  Compressed: 0x0000FF00,
  Encrypted: 0x00010000,
  FixSeed: 0x00020000,
  PatchFile: 0x00100000,
  SingleUnit: 0x01000000,
  DummyFile: 0x02000000,
  SectorCrc: 0x04000000,
  Exists: 0x80000000,
};

/**
 * MPQ Writer class
 */
export class MPQWriter {
  constructor(originalBuffer = null) {
    this.originalBuffer = originalBuffer;
    this.modifiedFiles = new Map();  // path -> Uint8Array
    this.deletedFiles = new Set();   // paths to remove

    if (originalBuffer) {
      this.parseOriginal();
    }
  }

  /**
   * Parse original MPQ structure
   */
  parseOriginal() {
    const buffer = this.originalBuffer;
    const view = new DataView(buffer);

    // Verify magic
    if (view.getUint32(0, true) !== MPQ_MAGIC) {
      throw new Error('Invalid MPQ magic');
    }

    // Read header
    this.headerSize = view.getUint32(4, true);
    this.archiveSize = view.getUint32(8, true);
    this.formatVersion = view.getUint16(12, true);
    this.blockSizeShift = view.getUint16(14, true);
    this.hashTablePos = view.getUint32(16, true);
    this.blockTablePos = view.getUint32(20, true);
    this.hashTableSize = view.getUint32(24, true);
    this.blockTableSize = view.getUint32(28, true);

    this.blockSize = 512 << this.blockSizeShift;

    // Read and decrypt hash table
    const hashTableBytes = new Uint8Array(buffer, this.hashTablePos, this.hashTableSize * HASH_ENTRY_SIZE);
    this.hashTable = new Uint32Array(hashTableBytes.slice().buffer);
    this.decryptTable(this.hashTable, hash('(hash table)', 3));

    // Read and decrypt block table
    const blockTableBytes = new Uint8Array(buffer, this.blockTablePos, this.blockTableSize * BLOCK_ENTRY_SIZE);
    this.blockTable = new Uint32Array(blockTableBytes.slice().buffer);
    this.decryptTable(this.blockTable, hash('(block table)', 3));

    console.log(`[MPQWriter] Parsed MPQ: ${this.hashTableSize} hash entries, ${this.blockTableSize} blocks`);
  }

  /**
   * Decrypt a table (hash or block)
   */
  decryptTable(u32, key) {
    const hashtable = this.getHashTable();
    let seed = 0xEEEEEEEE;
    for (let i = 0; i < u32.length; ++i) {
      seed += hashtable[0x400 + (key & 0xFF)];
      u32[i] ^= seed + key;
      seed = (u32[i] + seed * 33 + 3) | 0;
      key = ((~key << 0x15) + 0x11111111) | (key >>> 0x0B);
    }
  }

  /**
   * Encrypt a table
   */
  encryptTable(u32, key) {
    const hashtable = this.getHashTable();
    let seed = 0xEEEEEEEE;
    for (let i = 0; i < u32.length; ++i) {
      seed += hashtable[0x400 + (key & 0xFF)];
      const orig = u32[i];
      u32[i] ^= seed + key;
      seed = (orig + seed * 33 + 3) | 0;
      key = ((~key << 0x15) + 0x11111111) | (key >>> 0x0B);
    }
  }

  /**
   * Get the precomputed hash table for encryption
   */
  getHashTable() {
    if (!MPQWriter._hashtable) {
      const hashtable = new Uint32Array(1280);
      let seed = 0x00100001;
      for (let i = 0; i < 256; i++) {
        for (let j = i; j < 1280; j += 256) {
          seed = (seed * 125 + 3) % 0x2AAAAB;
          const a = (seed & 0xFFFF) << 16;
          seed = (seed * 125 + 3) % 0x2AAAAB;
          const b = (seed & 0xFFFF);
          hashtable[j] = a | b;
        }
      }
      MPQWriter._hashtable = hashtable;
    }
    return MPQWriter._hashtable;
  }

  /**
   * Add or replace a file
   */
  setFile(path, data) {
    // Normalize path
    const normalPath = path.toLowerCase().replace(/\//g, '\\');
    this.modifiedFiles.set(normalPath, data instanceof Uint8Array ? data : new Uint8Array(data));
    this.deletedFiles.delete(normalPath);
    console.log(`[MPQWriter] Set file: ${normalPath} (${data.length} bytes)`);
  }

  /**
   * Delete a file
   */
  deleteFile(path) {
    const normalPath = path.toLowerCase().replace(/\//g, '\\');
    this.deletedFiles.add(normalPath);
    this.modifiedFiles.delete(normalPath);
  }

  /**
   * Check if a file is modified
   */
  isModified(path) {
    const normalPath = path.toLowerCase().replace(/\//g, '\\');
    return this.modifiedFiles.has(normalPath);
  }

  /**
   * Build the modified MPQ
   */
  build() {
    if (!this.originalBuffer) {
      throw new Error('No original MPQ loaded');
    }

    // Calculate new file entries
    const newFiles = [];
    for (const [path, data] of this.modifiedFiles) {
      newFiles.push({
        path,
        data,
        size: data.length,
      });
    }

    if (newFiles.length === 0) {
      console.log('[MPQWriter] No modifications, returning original');
      return new Uint8Array(this.originalBuffer);
    }

    // Find existing hash entries or create new ones
    const fileEntries = this.prepareFileEntries(newFiles);

    // Calculate sizes
    const dataStart = MPQ_HEADER_SIZE;
    let dataPos = dataStart;

    // Copy original file data (excluding modified files)
    const originalData = this.collectOriginalData(fileEntries);
    dataPos += originalData.length;

    // Add new file data
    for (const entry of fileEntries) {
      if (entry.isNew || entry.isModified) {
        entry.filePos = dataPos;
        dataPos += entry.data.length;
      }
    }

    // Calculate table positions
    const hashTablePos = dataPos;
    const blockTablePos = hashTablePos + this.hashTableSize * HASH_ENTRY_SIZE;
    const totalSize = blockTablePos + this.blockTableSize * BLOCK_ENTRY_SIZE;

    // Create output buffer
    const output = new Uint8Array(totalSize);
    const view = new DataView(output.buffer);

    // Write header
    view.setUint32(0, MPQ_MAGIC, true);
    view.setUint32(4, MPQ_HEADER_SIZE, true);
    view.setUint32(8, totalSize, true);
    view.setUint16(12, this.formatVersion, true);
    view.setUint16(14, this.blockSizeShift, true);
    view.setUint32(16, hashTablePos, true);
    view.setUint32(20, blockTablePos, true);
    view.setUint32(24, this.hashTableSize, true);
    view.setUint32(28, this.blockTableSize, true);

    // Write original file data
    output.set(originalData, dataStart);

    // Write new/modified file data
    for (const entry of fileEntries) {
      if (entry.isNew || entry.isModified) {
        output.set(entry.data, entry.filePos);
      }
    }

    // Build and write hash table
    const newHashTable = this.buildHashTable(fileEntries);
    const hashTableEncrypted = new Uint32Array(newHashTable.length);
    hashTableEncrypted.set(newHashTable);
    this.encryptTable(hashTableEncrypted, hash('(hash table)', 3));
    output.set(new Uint8Array(hashTableEncrypted.buffer), hashTablePos);

    // Build and write block table
    const newBlockTable = this.buildBlockTable(fileEntries);
    const blockTableEncrypted = new Uint32Array(newBlockTable.length);
    blockTableEncrypted.set(newBlockTable);
    this.encryptTable(blockTableEncrypted, hash('(block table)', 3));
    output.set(new Uint8Array(blockTableEncrypted.buffer), blockTablePos);

    console.log(`[MPQWriter] Built MPQ: ${totalSize} bytes, ${fileEntries.filter(e => e.isModified || e.isNew).length} modified files`);

    return output;
  }

  /**
   * Prepare file entries for building
   */
  prepareFileEntries(newFiles) {
    const entries = [];

    // Process modified files
    for (const file of newFiles) {
      const hashA = hash(file.path, 1);
      const hashB = hash(file.path, 2);
      const hashIndex = hash(file.path, 0) % this.hashTableSize;

      // Find existing entry or use first empty slot
      let blockIndex = -1;
      for (let i = 0; i < this.hashTableSize; i++) {
        const idx = (hashIndex + i) % this.hashTableSize;
        const entryHashA = this.hashTable[idx * 4];
        const entryHashB = this.hashTable[idx * 4 + 1];
        const entryBlock = this.hashTable[idx * 4 + 3];

        if (entryHashA === hashA && entryHashB === hashB && entryBlock !== 0xFFFFFFFF) {
          blockIndex = entryBlock;
          break;
        }
      }

      entries.push({
        path: file.path,
        data: file.data,
        hashA,
        hashB,
        hashIndex,
        blockIndex,
        isNew: blockIndex === -1,
        isModified: blockIndex !== -1,
        filePos: 0,  // Will be set later
        fileSize: file.data.length,
        cmpSize: file.data.length,  // Uncompressed
        flags: Flags.Exists | Flags.SingleUnit,  // Simple uncompressed file
      });
    }

    return entries;
  }

  /**
   * Collect original file data (excluding modified files)
   */
  collectOriginalData(modifiedEntries) {
    const modifiedBlocks = new Set(modifiedEntries.filter(e => !e.isNew).map(e => e.blockIndex));
    const chunks = [];
    let offset = MPQ_HEADER_SIZE;

    // Find the first block that isn't modified
    for (let i = 0; i < this.blockTableSize; i++) {
      if (modifiedBlocks.has(i)) continue;

      const filePos = this.blockTable[i * 4];
      const cmpSize = this.blockTable[i * 4 + 1];

      if (filePos < this.hashTablePos && cmpSize > 0) {
        // Copy this block's data
        const data = new Uint8Array(this.originalBuffer, filePos, cmpSize);
        chunks.push(data);
      }
    }

    // Combine chunks
    const totalSize = chunks.reduce((sum, c) => sum + c.length, 0);
    const result = new Uint8Array(totalSize);
    let pos = 0;
    for (const chunk of chunks) {
      result.set(chunk, pos);
      pos += chunk.length;
    }

    return result;
  }

  /**
   * Build new hash table
   */
  buildHashTable(fileEntries) {
    // Start with copy of original hash table
    const newTable = new Uint32Array(this.hashTableSize * 4);
    newTable.set(this.hashTable);

    // Update entries for modified files
    for (const entry of fileEntries) {
      if (entry.isNew) {
        // Find empty slot
        for (let i = 0; i < this.hashTableSize; i++) {
          const idx = (entry.hashIndex + i) % this.hashTableSize;
          if (newTable[idx * 4 + 3] === 0xFFFFFFFF || newTable[idx * 4 + 3] === 0xFFFFFFFE) {
            // Use next available block index
            entry.blockIndex = this.blockTableSize;
            newTable[idx * 4] = entry.hashA;
            newTable[idx * 4 + 1] = entry.hashB;
            newTable[idx * 4 + 2] = 0;  // Locale
            newTable[idx * 4 + 3] = entry.blockIndex;
            break;
          }
        }
      }
    }

    return newTable;
  }

  /**
   * Build new block table
   */
  buildBlockTable(fileEntries) {
    // Start with copy of original block table
    const newTable = new Uint32Array(this.blockTableSize * 4);
    newTable.set(this.blockTable);

    // Update entries for modified files
    for (const entry of fileEntries) {
      if (entry.blockIndex >= 0 && entry.blockIndex < this.blockTableSize) {
        newTable[entry.blockIndex * 4] = entry.filePos;
        newTable[entry.blockIndex * 4 + 1] = entry.cmpSize;
        newTable[entry.blockIndex * 4 + 2] = entry.fileSize;
        newTable[entry.blockIndex * 4 + 3] = entry.flags;
      }
    }

    return newTable;
  }

  /**
   * Export as downloadable file
   */
  exportAsDownload(filename = 'spawn_modded.mpq') {
    const data = this.build();
    const blob = new Blob([data], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
    console.log(`[MPQWriter] Exported: ${filename} (${data.length} bytes)`);

    return data;
  }

  /**
   * Get modification summary
   */
  getSummary() {
    return {
      modifiedCount: this.modifiedFiles.size,
      deletedCount: this.deletedFiles.size,
      files: Array.from(this.modifiedFiles.keys()),
      totalSize: Array.from(this.modifiedFiles.values()).reduce((sum, d) => sum + d.length, 0),
    };
  }
}

export default MPQWriter;
