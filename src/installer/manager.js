/**
 * Copyright (c) 2017-present PlatformIO <contact@platformio.org>
 * All rights reserved.
 *
 * This source code is licensed under the license found in the LICENSE file in
 * the root directory of this source tree.
 */

// DON'T import pioNodeHelpers here - it causes immediate initialization!
// import * as pioNodeHelpers from 'pioarduino-node-helpers';

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
    console.info('=== InstallationManager constructor ===');
    const config = vscode.workspace.getConfiguration('platformio-ide');
    this.config = config;
    this.disableAutoUpdates = disableAutoUpdates;
    // Don't create stages immediately - only if needed
    this.stages = null;
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
    console.info('=== Starting installation check ===');
    console.info('InstallationManager.check() method called');

    // FIRST: Check for local pio installation - this must come BEFORE everything else
    console.info('Checking for local pio installation first...');
    const hasLocalPio = this.checkLocalPioInstallation();
    console.info('Local PIO check result:', hasLocalPio);

    if (hasLocalPio) {
      console.info('Found local pio installation - NO pioNodeHelpers will be called');
      return true;
    }

    console.info('No local pio found, checking internet connectivity...');
    const hasInternet = await this.checkInternetConnectivity();
    console.info('Internet connectivity:', hasInternet);

    if (!hasInternet) {
      console.warn('No internet and no local pio found - cannot proceed');
      return false;
    }

    console.info(
      'Internet available - creating stages and proceeding with normal checks...',
    );
    this.createStages();

    let result = true;
    for (const stage of this.stages) {
      try {
        console.info('Checking stage:', stage.constructor.name);
        if (!(await stage.check())) {
          console.info('Stage check failed');
          result = false;
        } else {
          console.info('Stage check passed');
        }
      } catch (err) {
        console.warn('Stage check threw error:', err);
        result = false;
      }
    }
    console.info('Overall check result:', result);
    return result;
  }

  createStages() {
    if (this.stages === null) {
      console.info('Creating pioNodeHelpers stages...');
      // Lazy load pioNodeHelpers ONLY when actually needed
      const pioNodeHelpers = require('pioarduino-node-helpers');
      this.stages = [
        new pioNodeHelpers.installer.pioarduinoCoreStage(
          {
            getValue: (key) => extension.context.globalState.get(key),
            setValue: (key, value) => extension.context.globalState.update(key, value),
          },
          this.onDidStatusChange.bind(this),
          {
            pioCoreVersionSpec: PIO_CORE_VERSION_SPEC,
            useBuiltinPython: this.config.get('useBuiltinPython'),
            useBuiltinPIOCore: this.config.get('useBuiltinPIOCore'),
            useDevelopmentPIOCore: this.config.get('useDevelopmentPIOCore'),
            pythonPrompt: new PythonPrompt(),
            disableAutoUpdates: this.disableAutoUpdates,
            predownloadedPackageDir: path.join(
              extension.context.extensionPath,
              'assets',
              'predownloaded',
            ),
          },
        ),
      ];
    }
  }

  async checkInternetConnectivity() {
    try {
      const { execSync } = require('child_process');
      if (process.platform === 'win32') {
        execSync('ping -n 1 8.8.8.8', { timeout: 3000 });
      } else {
        execSync('ping -c 1 8.8.8.8', { timeout: 3000 });
      }
      return true;
    } catch (err) {
      return false;
    }
  }

  checkLocalPioInstallation() {
    try {
      const os = require('os');
      const fs = require('fs');
      const path = require('path');

      const homeDir = os.homedir();
      console.info(`Checking home directory: ${homeDir}`);

      // Check for .platformio/penv
      const penvPath = path.join(homeDir, '.platformio', 'penv');
      console.info(`Checking for penv at: ${penvPath}`);
      if (fs.existsSync(penvPath)) {
        console.info('Found .platformio/penv directory');
        return true;
      }

      console.info('No local pio installation found');
      return false;
    } catch (err) {
      console.warn('Error checking local pio installation:', err);
      return false;
    }
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

  async install(progress) {
    this.createStages(); // Ensure stages exist
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
    if (this.stages) {
      return this.stages.map((stage) => stage.destroy());
    }
    return [];
  }
}
