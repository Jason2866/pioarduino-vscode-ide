/**
 * Copyright (c) 2017-present PlatformIO <contact@platformio.org>
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

import * as pioNodeHelpers from 'pioarduino-node-helpers';

import PIOHome from '../home';
import { PIO_CORE_VERSION_SPEC } from '../constants';
import PythonPrompt from './python-prompt';
import { extension } from '../main';
import path from 'path';
import vscode from 'vscode';

export default class InstallationManager {
  LOCK_TIMEOUT = 1 * 60 * 1000; // 1 minute
  LOCK_KEY = 'installer-lock';

  constructor(disableAutoUpdates = false) {
    const config = vscode.workspace.getConfiguration('platformio-ide');
    this.stages = [
      new pioNodeHelpers.installer.pioarduinoCoreStage(
        {
          getValue: (key) => extension.context.globalState.get(key),
          setValue: (key, value) => extension.context.globalState.update(key, value),
        },
        this.onDidStatusChange.bind(this),
        {
          pioCoreVersionSpec: PIO_CORE_VERSION_SPEC,
          useBuiltinPython: config.get('useBuiltinPython'),
          useBuiltinPIOCore: config.get('useBuiltinPIOCore'),
          useDevelopmentPIOCore: config.get('useDevelopmentPIOCore'),
          pythonPrompt: new PythonPrompt(),
          disableAutoUpdates: disableAutoUpdates,
          predownloadedPackageDir: path.join(
            extension.context.extensionPath,
            'assets',
            'predownloaded',
          ),
        },
      ),
    ];
  }

  onDidStatusChange() {
    // increase lock timeout on each stage update
    if (this.locked()) {
      this.lock();
    }
  }

  lock() {
    return extension.context.globalState.update(this.LOCK_KEY, new Date().getTime());
  }

  unlock() {
    return extension.context.globalState.update(this.LOCK_KEY, undefined);
  }

  locked() {
    const lockTime = extension.context.globalState.get(this.LOCK_KEY);
    if (!lockTime) {
      return false;
    }
    return new Date().getTime() - parseInt(lockTime) <= this.LOCK_TIMEOUT;
  }

  async check() {
    let result = true;
    for (const stage of this.stages) {
      try {
        if (!(await stage.check())) {
          result = false;
        }
      } catch (err) {
        // Check if this is a network-related error and we have a local installation
        if (this.isNetworkError(err) && (await this.hasLocalInstallation())) {
          console.warn(
            'Network error during check, but local installation found:',
            err,
          );
          continue; // Skip this stage, assume it's OK
        }
        result = false;
        console.warn(err);
      }
    }
    return result;
  }

  isNetworkError(error) {
    const networkErrorCodes = ['ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET'];
    const errorString = error.toString().toLowerCase();
    return (
      networkErrorCodes.some((code) => errorString.includes(code.toLowerCase())) ||
      errorString.includes('fetch') ||
      errorString.includes('network') ||
      errorString.includes('internet')
    );
  }

  async hasLocalInstallation() {
    try {
      // Try to check if PIO Core is locally available without network access
      const pioVersion = await pioNodeHelpers.core.getVersion();
      return pioVersion !== null;
    } catch (err) {
      return false;
    }
  }

  async install(progress) {
    const stageIncrementTotal = 100 / this.stages.length;
    // shutdown all PIO Home servers which block python.exe on Windows
    await PIOHome.shutdownAllServers();
    for (const stage of this.stages) {
      await stage.install((message, increment) => {
        progress.report({
          message,
          increment: stageIncrementTotal * (increment / 100),
        });
      });
    }
    progress.report({ message: 'Finished! Please restart VSCode.', increment: 100 });
  }

  destroy() {
    return this.stages.map((stage) => stage.destroy());
  }
}
