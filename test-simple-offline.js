#!/usr/bin/env node

// Simple test for the offline functionality
const fs = require('fs');
const path = require('path');
const os = require('os');

async function testLocalPioInstallation() {
  try {
    const pioarduinoDir = path.join(os.homedir(), '.platformio');
    const penvDir = path.join(pioarduinoDir, 'penv');
    
    console.log('Checking:', pioarduinoDir);
    console.log('Penv dir:', penvDir);
    
    // Check if .platformio/penv directory exists
    try {
      await fs.promises.access(penvDir);
      console.log('✅ Found local pioarduino installation at:', penvDir);
      return true;
    } catch (err) {
      console.log('❌ No local pioarduino installation found');
      console.log('Error:', err.message);
      return false;
    }
    
  } catch (err) {
    console.error('Test failed:', err);
    return false;
  }
}

console.log('Testing local pioarduino installation check...');
testLocalPioInstallation().then(result => {
  console.log('Result:', result);
  
  if (result) {
    console.log('\n✅ SUCCESS: The offline check logic should work!');
    console.log('The extension should be able to detect existing pioarduino installation without network calls.');
  } else {
    console.log('\n❌ No existing installation found.');
    console.log('The extension would need to download pioarduino, which requires internet connection.');
  }
});
