/**
 * WASM Error Diagnostic Helper
 *
 * Provides actionable diagnostics for common WASM loading errors.
 * Used by the error display to help users understand and fix issues.
 */

// Known error patterns and their diagnostics
const ERROR_PATTERNS = [
  {
    pattern: /G\._DApi_Init is not a function|_DApi_Init is not a function/i,
    type: 'WASM_MISSING_EXPORT',
    title: 'WASM Missing Core Export',
    description: 'The WebAssembly module is missing the _DApi_Init function export.',
    cause: 'The WASM binary was compiled without the --custom-api flag.',
    severity: 'critical',
    solutions: [
      'Rebuild WASM with: cd wasm && ./build.sh --custom-api',
      'Use Docker: cd wasm && docker-compose -f docker-compose.build.yml up --build',
      'Download a pre-built WASM with correct exports',
    ],
  },
  {
    pattern: /G\._DApi_Render is not a function|_DApi_Render is not a function/i,
    type: 'WASM_MISSING_EXPORT',
    title: 'WASM Missing Render Export',
    description: 'The WebAssembly module is missing the _DApi_Render function export.',
    cause: 'The WASM binary was compiled without the --custom-api flag.',
    severity: 'critical',
    solutions: [
      'Rebuild WASM with: cd wasm && ./build.sh --custom-api',
    ],
  },
  {
    pattern: /G\._DApi_Key is not a function|_DApi_Key is not a function/i,
    type: 'WASM_MISSING_EXPORT',
    title: 'WASM Missing Input Export',
    description: 'The WebAssembly module is missing the _DApi_Key function export.',
    cause: 'The WASM binary was compiled without the --custom-api flag.',
    severity: 'critical',
    solutions: [
      'Rebuild WASM with: cd wasm && ./build.sh --custom-api',
    ],
  },
  {
    pattern: /Invalid MPQ/i,
    type: 'MPQ_INVALID',
    title: 'Invalid MPQ File',
    description: 'The spawn.mpq or diabdat.mpq file appears to be corrupted or invalid.',
    cause: 'The MPQ file may be incomplete, corrupted, or not a valid Diablo MPQ.',
    severity: 'high',
    solutions: [
      'Re-download the spawn.mpq file',
      'If using diabdat.mpq, ensure it\'s from a valid Diablo installation',
      'Check that the file wasn\'t truncated during download',
    ],
  },
  {
    pattern: /memory access out of bounds/i,
    type: 'WASM_MEMORY',
    title: 'WASM Memory Access Error',
    description: 'The game engine attempted to access memory outside its allocated region.',
    cause: 'This can occur due to corrupted game data or a bug in the engine.',
    severity: 'high',
    solutions: [
      'Refresh the page and try again',
      'Clear browser cache and reload',
      'If using a modified MPQ, verify its integrity',
    ],
  },
  {
    pattern: /CompileError.*wasm/i,
    type: 'WASM_COMPILE',
    title: 'WASM Compilation Failed',
    description: 'The browser failed to compile the WebAssembly module.',
    cause: 'The WASM file may be corrupted or your browser may not fully support WASM.',
    severity: 'critical',
    solutions: [
      'Try a different browser (Chrome, Firefox, Edge recommended)',
      'Update your browser to the latest version',
      'Re-download the WASM files',
    ],
  },
  {
    pattern: /LinkError.*wasm/i,
    type: 'WASM_LINK',
    title: 'WASM Linking Failed',
    description: 'The WebAssembly module failed to link its imports.',
    cause: 'The WASM expects imports that are not provided by the JavaScript loader.',
    severity: 'critical',
    solutions: [
      'This is likely a version mismatch between WASM and JS loader',
      'Rebuild both WASM and JS files together',
    ],
  },
  {
    pattern: /Failed to fetch|NetworkError|net::ERR/i,
    type: 'NETWORK',
    title: 'Network Error',
    description: 'Failed to download required game files.',
    cause: 'Network connectivity issue or server unavailable.',
    severity: 'medium',
    solutions: [
      'Check your internet connection',
      'Try refreshing the page',
      'If the issue persists, the server may be down',
    ],
  },
  {
    pattern: /out of memory|OOM/i,
    type: 'MEMORY',
    title: 'Out of Memory',
    description: 'The browser ran out of memory while loading the game.',
    cause: 'The game requires significant memory to run.',
    severity: 'high',
    solutions: [
      'Close other browser tabs',
      'Restart your browser',
      'Try a 64-bit browser if you\'re using 32-bit',
    ],
  },
];

/**
 * Analyze an error and return diagnostic information
 * @param {Error|string} error - The error to analyze
 * @returns {Object|null} Diagnostic information or null if unknown error
 */
export function diagnoseError(error) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorStack = error instanceof Error ? error.stack : null;

  for (const pattern of ERROR_PATTERNS) {
    if (pattern.pattern.test(errorMessage)) {
      return {
        ...pattern,
        originalError: errorMessage,
        stack: errorStack,
        diagnosed: true,
      };
    }
  }

  // Unknown error
  return {
    type: 'UNKNOWN',
    title: 'Unknown Error',
    description: errorMessage,
    cause: 'The cause of this error is unknown.',
    severity: 'medium',
    solutions: [
      'Try refreshing the page',
      'Check the browser console for more details',
      'Report this error on GitHub if it persists',
    ],
    originalError: errorMessage,
    stack: errorStack,
    diagnosed: false,
  };
}

/**
 * Check if an error is a known WASM export issue
 * @param {Error|string} error - The error to check
 * @returns {boolean} True if this is a known WASM export issue
 */
export function isWasmExportError(error) {
  const diagnosis = diagnoseError(error);
  return diagnosis?.type === 'WASM_MISSING_EXPORT';
}

/**
 * Check if an error is critical (game cannot continue)
 * @param {Error|string} error - The error to check
 * @returns {boolean} True if this is a critical error
 */
export function isCriticalError(error) {
  const diagnosis = diagnoseError(error);
  return diagnosis?.severity === 'critical';
}

/**
 * Get a user-friendly error message
 * @param {Error|string} error - The error to format
 * @returns {string} User-friendly error message
 */
export function getUserFriendlyMessage(error) {
  const diagnosis = diagnoseError(error);

  if (diagnosis.diagnosed) {
    return `${diagnosis.title}: ${diagnosis.description}`;
  }

  return diagnosis.originalError;
}

/**
 * Get fix suggestions for an error
 * @param {Error|string} error - The error to get suggestions for
 * @returns {string[]} Array of suggested fixes
 */
export function getFixSuggestions(error) {
  const diagnosis = diagnoseError(error);
  return diagnosis?.solutions || [];
}

/**
 * Format error for display
 * @param {Error|string} error - The error to format
 * @returns {Object} Formatted error for display
 */
export function formatErrorForDisplay(error) {
  const diagnosis = diagnoseError(error);

  return {
    title: diagnosis.title,
    message: diagnosis.description,
    cause: diagnosis.cause,
    severity: diagnosis.severity,
    solutions: diagnosis.solutions,
    type: diagnosis.type,
    technical: {
      error: diagnosis.originalError,
      stack: diagnosis.stack,
    },
    isDiagnosed: diagnosis.diagnosed,
  };
}

export default {
  diagnoseError,
  isWasmExportError,
  isCriticalError,
  getUserFriendlyMessage,
  getFixSuggestions,
  formatErrorForDisplay,
};
