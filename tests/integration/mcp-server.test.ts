import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';

/**
 * Integration tests for the MCP server
 * These tests spawn the actual server process and communicate via stdio
 */
describe('MCP Server Integration', () => {
  let serverProcess: ChildProcess;
  let requestId = 1;

  beforeAll(async () => {
    // Start the server
    const serverPath = join(process.cwd(), 'build', 'index.js');
    serverProcess = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });

    // Wait for server to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  const sendRequest = (method: string, params: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      const id = requestId++;
      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      let responseData = '';
      const responseHandler = (data: Buffer) => {
        responseData += data.toString();
        try {
          const lines = responseData.split('\n').filter(line => line.trim());
          for (const line of lines) {
            try {
              const message = JSON.parse(line);
              if (message.id === id) {
                serverProcess.stdout?.off('data', responseHandler);
                // MCP errors come back as results with isError flag, not as error objects
                resolve(message.result || message.error);
                return;
              }
            } catch (e) {
              // Not valid JSON, keep accumulating
            }
          }
        } catch (e) {
          // Wait for more data
        }
      };

      serverProcess.stdout?.on('data', responseHandler);
      serverProcess.stdin?.write(JSON.stringify(request) + '\n');

      // Timeout after 30 seconds
      setTimeout(() => {
        serverProcess.stdout?.off('data', responseHandler);
        reject(new Error('Request timeout'));
      }, 30000);
    });
  };

  describe('Tool Registration', () => {
    it('should list all 10 registered tools', async () => {
      const result = await sendRequest('tools/list', {});
      
      expect(result).toBeDefined();
      expect(result.tools).toBeDefined();
      expect(result.tools.length).toBe(10);
      
      const toolNames = result.tools.map((t: any) => t.name);
      expect(toolNames).toContain('get_kql_table_schema');
      expect(toolNames).toContain('test_kql_query');
      expect(toolNames).toContain('list_tables');
      expect(toolNames).toContain('get_graph_api_schema');
      expect(toolNames).toContain('refresh_schema');
      expect(toolNames).toContain('generate_sdk_code');
      expect(toolNames).toContain('generate_example_query');
      expect(toolNames).toContain('detect_table_workspace');
      expect(toolNames).toContain('find_working_query_examples');
      expect(toolNames).toContain('generate_graph_sdk_code');
    }, 60000); // Increase timeout for server startup
  });

  describe('Code Generation Tools', () => {
    it('should generate SDK code', async () => {
      const result = await sendRequest('tools/call', {
        name: 'generate_sdk_code',
        arguments: {
          tableName: 'SecurityAlert',
          framework: 'inline',
          authType: 'default-credential',
        },
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('LogsQueryClient');
      expect(result.content[0].text).toContain('SecurityAlert');
    });

    it('should generate example queries', async () => {
      const result = await sendRequest('tools/call', {
        name: 'generate_example_query',
        arguments: {
          tableName: 'SecurityAlert',
          operation: 'simple_select',
          timeRange: '7d',
        },
      });

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('SecurityAlert');
      expect(result.content[0].text).toContain('ago(7d)');
    });
  });

  describe('Error Handling', () => {
    it('should return error for invalid tool name', async () => {
      const result = await sendRequest('tools/call', {
        name: 'nonexistent_tool',
        arguments: {},
      });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('not found');
    });

    it('should return error for missing required parameters', async () => {
      const result = await sendRequest('tools/call', {
        name: 'get_kql_table_schema',
        arguments: {}, // Missing tableName
      });
      
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Required');
    });
  });
});
