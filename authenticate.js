// Simple script to trigger device code authentication
import 'dotenv/config';
import { AuthManager } from './build/auth/AuthManager.js';
import { loadConfig } from './build/config.js';

async function authenticate() {
  try {
    const config = loadConfig();
    const authManager = new AuthManager(config);
    
    console.log('Starting authentication...\n');
    const token = await authManager.getToken();
    console.log('\n✓ Authentication successful!');
    console.log('Token cached to .cache/azure-token.json');
    console.log('\nYou can now use the MCP server in VS Code.');
  } catch (error) {
    console.error('Authentication failed:', error.message);
    process.exit(1);
  }
}

authenticate();
