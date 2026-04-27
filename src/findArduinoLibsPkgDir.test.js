/**
 * Unit tests for the findArduinoLibsPkgDir logic introduced in
 * src/intellisense.js (PR 1.3.21).
 *
 * Run with:  node src/findArduinoLibsPkgDir.test.js
 *
 * Because findArduinoLibsPkgDir is an internal async function inside an ES
 * module that depends on vscode, we reproduce the exact function body here
 * with injectable `fs` and `path` dependencies so it can be exercised
 * without the VS Code runtime.
 *
 * Correct path resolution order (per project convention):
 *   1. Primary:     <packagesDir>/framework-arduinoespressif32[...]/tools/esp32-arduino-libs
 *   2. Alternative: <packagesDir>/framework-arduinoespressif32-libs[...]  (extra/standalone pkg)
 */

'use strict';

const nodePath = require('path');

// ---------------------------------------------------------------------------
// Inline implementation — must stay in sync with src/intellisense.js
// ---------------------------------------------------------------------------

/**
 * @param {object} fs   - object with readdir(dir) and access(p) that return Promises
 * @param {object} path - object with join(...parts)
 */
function makeFindArduinoLibsPkgDir(fs, path) {
  return async function findArduinoLibsPkgDir(packagesDir) {
    try {
      const dirs = await fs.readdir(packagesDir);
      // Primary: framework-arduinoespressif32/tools/esp32-arduino-libs
      for (const d of dirs) {
        if (d.startsWith('framework-arduinoespressif32') && !d.includes('-libs')) {
          const primaryPath = path.join(packagesDir, d, 'tools', 'esp32-arduino-libs');
          try {
            await fs.access(primaryPath);
            return primaryPath;
          } catch {
            // Primary path doesn't exist, keep looking
          }
        }
      }
      // Alternative: framework-arduinoespressif32-libs standalone package
      for (const d of dirs) {
        if (d.startsWith('framework-arduinoespressif32-libs')) {
          return path.join(packagesDir, d);
        }
      }
    } catch {
      // packagesDir unreadable
    }
    return null;
  };
}

// ---------------------------------------------------------------------------
// Tiny async test harness
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

async function test(label, fn) {
  try {
    await fn();
    passed++;
  } catch (err) {
    failed++;
    console.error(`FAIL: ${label}`);
    console.error(`  ${err.message}`);
  }
}

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    throw new Error(
      `assertEqual failed\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`,
    );
  }
}

function assertNull(label, actual) {
  if (actual !== null) {
    throw new Error(`assertNull failed — got: ${JSON.stringify(actual)}`);
  }
}

// ---------------------------------------------------------------------------
// Helper: build mock fs for a given directory listing and accessible paths
// ---------------------------------------------------------------------------

function mockFs({ dirs, accessiblePaths = new Set() }) {
  return {
    readdir: async (dir) => dirs,
    access: async (p) => {
      if (!accessiblePaths.has(p)) {
        const err = new Error(`ENOENT: no such file or directory, access '${p}'`);
        err.code = 'ENOENT';
        throw err;
      }
    },
  };
}

function mockFsReaddirThrows() {
  return {
    readdir: async () => {
      throw Object.assign(new Error('ENOENT: packagesDir unreadable'), { code: 'ENOENT' });
    },
    access: async () => {},
  };
}

// Use posix path.join for predictable cross-platform results in these tests
const mockPath = { join: nodePath.posix.join };

const PACKAGES_DIR = '/home/.platformio/packages';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function main() {

// --- primary path (framework-arduinoespressif32/tools/esp32-arduino-libs) ---

await test('Primary: exact match returns correct tools/esp32-arduino-libs path', async () => {
  const dirs = ['framework-arduinoespressif32'];
  const primaryPath = `${PACKAGES_DIR}/framework-arduinoespressif32/tools/esp32-arduino-libs`;
  const fs = mockFs({ dirs, accessiblePaths: new Set([primaryPath]) });
  const find = makeFindArduinoLibsPkgDir(fs, mockPath);
  const result = await find(PACKAGES_DIR);
  assertEqual('result', result, primaryPath);
});

await test('Primary: versioned framework dir is matched (startsWith)', async () => {
  const dirs = ['framework-arduinoespressif32@3.1.0'];
  const primaryPath = `${PACKAGES_DIR}/framework-arduinoespressif32@3.1.0/tools/esp32-arduino-libs`;
  const fs = mockFs({ dirs, accessiblePaths: new Set([primaryPath]) });
  const find = makeFindArduinoLibsPkgDir(fs, mockPath);
  const result = await find(PACKAGES_DIR);
  assertEqual('result', result, primaryPath);
});

await test('Primary: takes precedence over alternative when both exist', async () => {
  const dirs = [
    'framework-arduinoespressif32@3.1.0',
    'framework-arduinoespressif32-libs@1.0',
  ];
  const primaryPath = `${PACKAGES_DIR}/framework-arduinoespressif32@3.1.0/tools/esp32-arduino-libs`;
  const fs = mockFs({ dirs, accessiblePaths: new Set([primaryPath]) });
  const find = makeFindArduinoLibsPkgDir(fs, mockPath);
  const result = await find(PACKAGES_DIR);
  // Must return the primary tools/ path, not the standalone -libs package
  assertEqual('result', result, primaryPath);
});

await test('Primary: uses exact tools/esp32-arduino-libs subpath', async () => {
  const dirs = ['framework-arduinoespressif32@3.0.0'];
  const expectedPath = `${PACKAGES_DIR}/framework-arduinoespressif32@3.0.0/tools/esp32-arduino-libs`;
  const accessedPaths = [];
  const fs = {
    readdir: async () => dirs,
    access: async (p) => {
      accessedPaths.push(p);
      if (p !== expectedPath) {
        throw new Error('ENOENT');
      }
    },
  };
  const find = makeFindArduinoLibsPkgDir(fs, mockPath);
  const result = await find(PACKAGES_DIR);
  // Verify the exact path that was checked
  assertEqual('accessedPath', accessedPaths[0], expectedPath);
  assertEqual('result', result, expectedPath);
});

await test('Primary: multiple unrelated entries before the matching framework dir', async () => {
  const dirs = [
    'tool-cmake',
    'tool-ninja',
    'toolchain-xtensa-esp-elf',
    'framework-arduinoespressif32@3.1.0',
  ];
  const primaryPath = `${PACKAGES_DIR}/framework-arduinoespressif32@3.1.0/tools/esp32-arduino-libs`;
  const fs = mockFs({ dirs, accessiblePaths: new Set([primaryPath]) });
  const find = makeFindArduinoLibsPkgDir(fs, mockPath);
  const result = await find(PACKAGES_DIR);
  assertEqual('result', result, primaryPath);
});

await test('Primary: tools/esp32-arduino-libs not accessible → falls through to alternative', async () => {
  const dirs = [
    'framework-arduinoespressif32@3.1.0',
    'framework-arduinoespressif32-libs@1.0',
  ];
  // No primary path accessible; only standalone -libs package present
  const fs = mockFs({ dirs, accessiblePaths: new Set() });
  const find = makeFindArduinoLibsPkgDir(fs, mockPath);
  const result = await find(PACKAGES_DIR);
  // Falls back to the standalone -libs package
  assertEqual('result', result, `${PACKAGES_DIR}/framework-arduinoespressif32-libs@1.0`);
});

await test('Primary: dir named "framework-arduinoespressif32-libs" is excluded from primary loop', async () => {
  // The primary loop filters out dirs that include '-libs'.
  // A dir like "framework-arduinoespressif32-libs" must not be used as a
  // base for the tools/ path lookup — it belongs to the alternative loop.
  const dirs = ['framework-arduinoespressif32-libs'];
  const fs = {
    readdir: async () => dirs,
    access: async () => {}, // unconditionally succeeds
  };
  const find = makeFindArduinoLibsPkgDir(fs, mockPath);
  const result = await find(PACKAGES_DIR);
  // Alternative loop must match, returning the standalone -libs path
  assertEqual(
    'result',
    result,
    `${PACKAGES_DIR}/framework-arduinoespressif32-libs`,
  );
});

// --- alternative path (framework-arduinoespressif32-libs standalone package) ---

await test('Alternative: standalone libs package used when primary tools/ path absent', async () => {
  const dirs = ['framework-arduinoespressif32-libs', 'tool-scons'];
  // No accessible tools/ path
  const fs = mockFs({ dirs, accessiblePaths: new Set() });
  const find = makeFindArduinoLibsPkgDir(fs, mockPath);
  const result = await find(PACKAGES_DIR);
  assertEqual('result', result, `${PACKAGES_DIR}/framework-arduinoespressif32-libs`);
});

await test('Alternative: versioned standalone libs package is matched (startsWith)', async () => {
  const dirs = ['framework-arduinoespressif32-libs@src-abc123'];
  const fs = mockFs({ dirs });
  const find = makeFindArduinoLibsPkgDir(fs, mockPath);
  const result = await find(PACKAGES_DIR);
  assertEqual(
    'result',
    result,
    `${PACKAGES_DIR}/framework-arduinoespressif32-libs@src-abc123`,
  );
});

await test('Alternative: primary tools/ inaccessible for any dir, then libs package matched', async () => {
  // Two framework dirs; neither has an accessible tools/ subdir.
  const dirs = [
    'framework-arduinoespressif32@2.0.0',
    'framework-arduinoespressif32@3.1.0',
    'framework-arduinoespressif32-libs@1.0',
  ];
  // No accessible primary paths
  const fs = mockFs({ dirs, accessiblePaths: new Set() });
  const find = makeFindArduinoLibsPkgDir(fs, mockPath);
  const result = await find(PACKAGES_DIR);
  assertEqual('result', result, `${PACKAGES_DIR}/framework-arduinoespressif32-libs@1.0`);
});

// --- null / error cases ---

await test('Returns null when packagesDir is unreadable', async () => {
  const fs = mockFsReaddirThrows();
  const find = makeFindArduinoLibsPkgDir(fs, mockPath);
  const result = await find(PACKAGES_DIR);
  assertNull('result', result);
});

await test('Returns null when no matching entries exist', async () => {
  const dirs = ['tool-scons', 'toolchain-xtensa-esp-elf'];
  const fs = mockFs({ dirs });
  const find = makeFindArduinoLibsPkgDir(fs, mockPath);
  const result = await find(PACKAGES_DIR);
  assertNull('result', result);
});

await test('Returns null for empty packagesDir', async () => {
  const fs = mockFs({ dirs: [] });
  const find = makeFindArduinoLibsPkgDir(fs, mockPath);
  const result = await find(PACKAGES_DIR);
  assertNull('result', result);
});

await test('Returns null when framework dir exists but tools/ path is inaccessible and no standalone libs pkg', async () => {
  const dirs = ['framework-arduinoespressif32@3.1.0', 'tool-scons'];
  // No accessible paths at all
  const fs = mockFs({ dirs, accessiblePaths: new Set() });
  const find = makeFindArduinoLibsPkgDir(fs, mockPath);
  const result = await find(PACKAGES_DIR);
  assertNull('result', result);
});

// --- regression / boundary tests ---

await test('Regression: multiple framework dirs, only second has accessible tools/ path', async () => {
  const dirs = [
    'framework-arduinoespressif32@2.0.0',
    'framework-arduinoespressif32@3.1.0',
  ];
  const goodPath = `${PACKAGES_DIR}/framework-arduinoespressif32@3.1.0/tools/esp32-arduino-libs`;
  const fs = mockFs({ dirs, accessiblePaths: new Set([goodPath]) });
  const find = makeFindArduinoLibsPkgDir(fs, mockPath);
  const result = await find(PACKAGES_DIR);
  assertEqual('result', result, goodPath);
});

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------

  process.stdout.write(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unexpected error in test runner:', err);
  process.exit(1);
});
