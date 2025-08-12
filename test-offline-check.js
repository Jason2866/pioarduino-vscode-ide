#!/usr/bin/env node

// Test script to verify offline installation check
const path = require('path');
const fs = require('fs');

// Add the current project to node path
process.env.NODE_PATH = path.join(__dirname, 'node_modules');
require('module').Module._initPaths();

console.log('Testing pioarduino-node-helpers offline installation check...');

async function testOfflineCheck() {
  try {
    const { installer } = require('pioarduino-node-helpers');
    
    console.log('pioarduino-node-helpers imported successfully');
    
    // Create a mock stage instance
    const stage = new installer.pioarduinoCoreStage({
      useBuiltinPIOCore: true,
      useBuiltinPython: true,
      disableAutoUpdates: false,
      pythonPrompt: {
        STATUS_TRY_AGAIN: 1,
        STATUS_ABORT: 2,
        STATUS_CUSTOMEXE: 3,
        prompt: async () => ({ status: 2 }) // Mock prompt that aborts
      }
    });
    
    console.log('pioarduinoCoreStage instance created');
    
    // Test the local installation check
    const hasLocalInstall = await stage.checkLocalPioInstallation();
    console.log('Local installation check result:', hasLocalInstall);
    
    // Test overall check (should not hang on network calls if local install exists)
    console.log('Starting full check...');
    const startTime = Date.now();
    
    try {
      const checkResult = await stage.check();
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log('Check completed in', duration, 'ms');
      console.log('Check result:', checkResult);
      
      if (duration < 5000) { // Should be fast if using local check
        console.log('✅ SUCCESS: Check completed quickly (likely using local installation)');
      } else {
        console.log('⚠️  WARNING: Check took longer than expected (may have attempted network calls)');
      }
      
    } catch (err) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log('Check failed after', duration, 'ms');
      console.log('Error:', err.message);
      
      if (duration < 5000) {
        console.log('✅ SUCCESS: Failed quickly (no hanging network calls)');
      } else {
        console.log('❌ FAILED: Took too long (likely hung on network calls)');
      }
    }
    
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
}

testOfflineCheck();
