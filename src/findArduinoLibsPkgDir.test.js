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
      // Primary: framework-arduinoespressif32-libs package
      for (const d of dirs) {
        if (d.startsWith('framework-arduinoespressif32-libs')) {
          return path.join(packagesDir, d);
        }
      }
      // Alternative: framework-arduinoespressif32/tools/esp32-arduino-libs
      for (const d of dirs) {
        if (d.startsWith('framework-arduinoespressif32') && !d.includes('-libs')) {
          const altPath = path.join(packagesDir, d, 'tools', 'esp32-arduino-libs');
          try {
            await fs.access(altPath);
            return altPath;
          } catch {
            // Alternative path doesn't exist
          }
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

// --- primary path (framework-arduinoespressif32-libs) ---

await test('Primary: exact match returns correct path', async () => {
  const dirs = ['framework-arduinoespressif32-libs'];
  const fs = mockFs({ dirs });
  const find = makeFindArduinoLibsPkgDir(fs, mockPath);
  const result = await find(PACKAGES_DIR);
  assertEqual(
    'result',
    result,
    `${PACKAGES_DIR}/framework-arduinoespressif32-libs`,
  );
});

await test('Primary: versioned package name is matched (startsWith)', async () => {
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

await test('Primary: takes precedence over alternative when both exist', async () => {
  const dirs = [
    'framework-arduinoespressif32-libs@1.0',
    'framework-arduinoespressif32@3.1.0',
  ];
  const altPath = `${PACKAGES_DIR}/framework-arduinoespressif32@3.1.0/tools/esp32-arduino-libs`;
  const fs = mockFs({ dirs, accessiblePaths: new Set([altPath]) });
  const find = makeFindArduinoLibsPkgDir(fs, mockPath);
  const result = await find(PACKAGES_DIR);
  // Must return the primary path, not the alternative
  assertEqual(
    'result',
    result,
    `${PACKAGES_DIR}/framework-arduinoespressif32-libs@1.0`,
  );
});

// --- alternative path (new in PR 1.3.21) ---

await test('Alternative: uses esp32-arduino-libs inside framework dir when primary absent', async () => {
  const dirs = ['framework-arduinoespressif32@3.1.0', 'tool-scons'];
  const altPath = `${PACKAGES_DIR}/framework-arduinoespressif32@3.1.0/tools/esp32-arduino-libs`;
  const fs = mockFs({ dirs, accessiblePaths: new Set([altPath]) });
  const find = makeFindArduinoLibsPkgDir(fs, mockPath);
  const result = await find(PACKAGES_DIR);
  assertEqual('result', result, altPath);
});

await test('Alternative: versioned framework dir without version suffix also matched', async () => {
  const dirs = ['framework-arduinoespressif32'];
  const altPath = `${PACKAGES_DIR}/framework-arduinoespressif32/tools/esp32-arduino-libs`;
  const fs = mockFs({ dirs, accessiblePaths: new Set([altPath]) });
  const find = makeFindArduinoLibsPkgDir(fs, mockPath);
  const result = await find(PACKAGES_DIR);
  assertEqual('result', result, altPath);
});

await test('Alternative: dir named "framework-arduinoespressif32-libs" is NOT used as alternative', async () => {
  // The alternative loop filters out dirs that include '-libs'.
  // A dir like "framework-arduinoespressif32-libs" should already be caught by
  // the primary loop; the alternative loop must not treat it as a base dir.
  const dirs = ['framework-arduinoespressif32-libs'];
  // Access would succeed for any constructed altPath — but the alternative
  // loop should never run for this entry.
  const fs = {
    readdir: async () => dirs,
    access: async () => {}, // unconditionally succeeds
  };
  const find = makeFindArduinoLibsPkgDir(fs, mockPath);
  const result = await find(PACKAGES_DIR);
  // Primary loop must have matched, returning the primary path
  assertEqual(
    'result',
    result,
    `${PACKAGES_DIR}/framework-arduinoespressif32-libs`,
  );
});

await test('Alternative: altPath not accessible → continues to next dir', async () => {
  // Two framework dirs; only the second has a valid esp32-arduino-libs subdir.
  const dirs = [
    'framework-arduinoespressif32@2.0.0',
    'framework-arduinoespressif32@3.1.0',
  ];
  const goodAltPath = `${PACKAGES_DIR}/framework-arduinoespressif32@3.1.0/tools/esp32-arduino-libs`;
  const fs = mockFs({ dirs, accessiblePaths: new Set([goodAltPath]) });
  const find = makeFindArduinoLibsPkgDir(fs, mockPath);
  const result = await find(PACKAGES_DIR);
  assertEqual('result', result, goodAltPath);
});

await test('Alternative: altPath not accessible for any dir → returns null', async () => {
  const dirs = ['framework-arduinoespressif32@3.1.0', 'tool-scons'];
  // No accessible altPath
  const fs = mockFs({ dirs, accessiblePaths: new Set() });
  const find = makeFindArduinoLibsPkgDir(fs, mockPath);
  const result = await find(PACKAGES_DIR);
  assertNull('result', result);
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

// --- regression / boundary tests ---

await test('Regression: dir "framework-arduinoespressif32-something" with -libs in name is excluded from alternative', async () => {
  // e.g. a hypothetical dir "framework-arduinoespressif32-libs-extra" must not
  // be used as a base for the alternative path lookup.
  const dirs = ['framework-arduinoespressif32-libs-extra'];
  const fs = {
    readdir: async () => dirs,
    access: async () => {}, // would succeed if reached
  };
  const find = makeFindArduinoLibsPkgDir(fs, mockPath);
  const result = await find(PACKAGES_DIR);
  // Primary does NOT match (no dir starts with 'framework-arduinoespressif32-libs' exactly... wait, it does)
  // "framework-arduinoespressif32-libs-extra".startsWith("framework-arduinoespressif32-libs") === true
  // So primary loop WILL match it. That is the expected behavior per the function.
  assertEqual(
    'result',
    result,
    `${PACKAGES_DIR}/framework-arduinoespressif32-libs-extra`,
  );
});

await test('Boundary: alternative uses exact tools/esp32-arduino-libs subpath', async () => {
  const dirs = ['framework-arduinoespressif32@3.0.0'];
  // Access succeeds ONLY for the exact expected path
  const expectedAltPath = `${PACKAGES_DIR}/framework-arduinoespressif32@3.0.0/tools/esp32-arduino-libs`;
  const accessedPaths = [];
  const fs = {
    readdir: async () => dirs,
    access: async (p) => {
      accessedPaths.push(p);
      if (p !== expectedAltPath) {
        throw new Error('ENOENT');
      }
    },
  };
  const find = makeFindArduinoLibsPkgDir(fs, mockPath);
  const result = await find(PACKAGES_DIR);
  // Verify the exact path that was checked
  assertEqual('accessedPath', accessedPaths[0], expectedAltPath);
  assertEqual('result', result, expectedAltPath);
});

await test('Boundary: multiple unrelated entries before the matching alternative', async () => {
  const dirs = [
    'tool-cmake',
    'tool-ninja',
    'toolchain-xtensa-esp-elf',
    'framework-arduinoespressif32@3.1.0',
  ];
  const altPath = `${PACKAGES_DIR}/framework-arduinoespressif32@3.1.0/tools/esp32-arduino-libs`;
  const fs = mockFs({ dirs, accessiblePaths: new Set([altPath]) });
  const find = makeFindArduinoLibsPkgDir(fs, mockPath);
  const result = await find(PACKAGES_DIR);
  assertEqual('result', result, altPath);
});

// ---------------------------------------------------------------------------
// Summary
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
