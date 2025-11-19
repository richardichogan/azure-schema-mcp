/**
 * Test script for Azure Schema MCP Server tools
 * Run with: node test-tools.js
 */

import { spawn } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class MCPClient {
  constructor() {
    this.requestId = 1;
    this.responseHandlers = new Map();
  }

  async start() {
    const serverPath = join(__dirname, 'build', 'index.js');
    this.process = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: __dirname
    });

    this.process.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(line => line.trim());
      lines.forEach(line => {
        try {
          const message = JSON.parse(line);
          if (message.id && this.responseHandlers.has(message.id)) {
            const handler = this.responseHandlers.get(message.id);
            this.responseHandlers.delete(message.id);
            handler(message);
          }
        } catch (e) {
          // Ignore non-JSON lines (like startup messages)
        }
      });
    });

    this.process.stderr.on('data', (data) => {
      console.error('Server:', data.toString());
    });

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  async callTool(toolName, params) {
    return new Promise((resolve, reject) => {
      const id = this.requestId++;
      const request = {
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: params
        }
      };

      this.responseHandlers.set(id, (response) => {
        if (response.error) {
          reject(new Error(response.error.message));
        } else {
          resolve(response.result);
        }
      });

      this.process.stdin.write(JSON.stringify(request) + '\n');

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.responseHandlers.has(id)) {
          this.responseHandlers.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000);
    });
  }

  stop() {
    if (this.process) {
      this.process.kill();
    }
  }
}

async function runTests() {
  const client = new MCPClient();
  
  try {
    console.log('🚀 Starting MCP Server...\n');
    await client.start();

    // Test 1: Generate SDK Code
    console.log('📝 Test 1: Generate SDK Code for SecurityAlert');
    console.log('─'.repeat(60));
    const sdkCode = await client.callTool('generate_sdk_code', {
      tableName: 'SecurityAlert',
      framework: 'react',
      authType: 'msal-browser'
    });
    console.log('✅ Generated code snippet:');
    console.log(sdkCode.content[0].text.substring(0, 300) + '...\n');

    // Test 2: Generate Example Query
    console.log('📝 Test 2: Generate Example Query (aggregation)');
    console.log('─'.repeat(60));
    const exampleQuery = await client.callTool('generate_example_query', {
      tableName: 'SecurityAlert',
      operation: 'aggregation',
      timeRange: '7d'
    });
    console.log('✅ Generated query:');
    console.log(exampleQuery.content[0].text + '\n');

    // Test 3: Detect Table Workspace
    console.log('📝 Test 3: Detect Table Workspace');
    console.log('─'.repeat(60));
    const workspaceInfo = await client.callTool('detect_table_workspace', {
      tableName: 'SecurityAlert'
    });
    console.log('✅ Workspace detection result:');
    console.log(JSON.stringify(workspaceInfo.structuredContent, null, 2) + '\n');

    // Test 4: Get Table Schema (original tool)
    console.log('📝 Test 4: Get Table Schema (original tool)');
    console.log('─'.repeat(60));
    const schema = await client.callTool('get_kql_table_schema', {
      tableName: 'SecurityAlert'
    });
    console.log(`✅ Found ${schema.structuredContent.columns.length} columns\n`);

    console.log('🎉 All tests passed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    client.stop();
  }
}

runTests();
