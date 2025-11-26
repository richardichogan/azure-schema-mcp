import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';

/**
 * End-to-end tests for all MCP tools
 * Tests the full workflow: spawn server → call tool → verify result
 */
describe('MCP Tools End-to-End', () => {
  let serverProcess: ChildProcess;
  let requestId = 1;

  beforeAll(async () => {
    const serverPath = join(process.cwd(), 'build', 'index.js');
    serverProcess = spawn('node', [serverPath], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: process.cwd(),
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterAll(() => {
    if (serverProcess) {
      serverProcess.kill();
    }
  });

  const callTool = (name: string, args: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      const id = requestId++;
      const request = {
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name, arguments: args },
      };

      let buffer = '';
      const handler = (data: Buffer) => {
        buffer += data.toString();
        const lines = buffer.split('\n').filter(l => l.trim());
        
        for (const line of lines) {
          try {
            const msg = JSON.parse(line);
            if (msg.id === id) {
              serverProcess.stdout?.off('data', handler);
              msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
              return;
            }
          } catch {}
        }
      };

      serverProcess.stdout?.on('data', handler);
      serverProcess.stdin?.write(JSON.stringify(request) + '\n');

      setTimeout(() => {
        serverProcess.stdout?.off('data', handler);
        reject(new Error('Timeout'));
      }, 30000);
    });
  };

  describe('Schema Discovery Tools', () => {
    it('get_kql_table_schema: should discover table schema', async () => {
      const result = await callTool('get_kql_table_schema', {
        tableName: 'SecurityAlert',
      });

      expect(result.structuredContent).toBeDefined();
      expect(result.structuredContent.tableName).toBe('SecurityAlert');
      expect(result.structuredContent.columns).toBeInstanceOf(Array);
      expect(result.structuredContent.columns.length).toBeGreaterThan(0);
      expect(result.structuredContent.columns[0]).toHaveProperty('name');
      expect(result.structuredContent.columns[0]).toHaveProperty('type');
      expect(result.structuredContent.columns[0]).toHaveProperty('ordinal');
    });

    it('list_tables: should list available tables', async () => {
      const result = await callTool('list_tables', {});

      // Skip test if workspace doesn't support the query (known limitation)
      if (result.isError && result.content[0].text.includes('invalid properties')) {
        console.log('⚠️  Skipping: Workspace does not support union query for listing tables');
        return;
      }

      // Handle other errors
      if (result.isError) {
        console.log('Error from list_tables:', result.content[0].text);
        throw new Error(result.content[0].text);
      }

      expect(result.content).toBeDefined();
      expect(result.content[0].text).toBeDefined();
      
      // Parse the text content if structuredContent is not available
      const data = result.structuredContent || JSON.parse(result.content[0].text);
      expect(data.tables).toBeInstanceOf(Array);
      expect(data.tables.length).toBeGreaterThan(0);
      expect(data.count).toBe(data.tables.length);
    });
  });

  describe('Query Tools', () => {
    it('test_kql_query: should execute test query', async () => {
      const result = await callTool('test_kql_query', {
        query: 'search * | take 3',
        maxRows: 3,
      });

      expect(result.structuredContent).toBeDefined();
      expect(result.structuredContent.columns).toBeInstanceOf(Array);
      expect(result.structuredContent.rows).toBeInstanceOf(Array);
      expect(result.structuredContent.rowCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Code Generation Tools', () => {
    it('generate_sdk_code: should generate React code', async () => {
      const result = await callTool('generate_sdk_code', {
        tableName: 'SecurityAlert',
        framework: 'react',
        authType: 'msal-browser',
      });

      expect(result.content[0].text).toContain('React');
      expect(result.content[0].text).toContain('LogsQueryClient');
      expect(result.content[0].text).toContain('SecurityAlert');
      expect(result.content[0].text).toContain('msal');
    });

    it('generate_sdk_code: should generate Node.js code', async () => {
      const result = await callTool('generate_sdk_code', {
        tableName: 'SecurityAlert',
        framework: 'node',
        authType: 'default-credential',
      });

      expect(result.content[0].text).toContain('DefaultAzureCredential');
      expect(result.content[0].text).toContain('SecurityAlert');
    });

    it('generate_example_query: should generate simple select', async () => {
      const result = await callTool('generate_example_query', {
        tableName: 'SecurityAlert',
        operation: 'simple_select',
        timeRange: '30d',
      });

      expect(result.content[0].text).toContain('SecurityAlert');
      expect(result.content[0].text).toContain('ago(30d)');
      expect(result.content[0].text).toContain('project');
    });

    it('generate_example_query: should generate aggregation', async () => {
      const result = await callTool('generate_example_query', {
        tableName: 'SecurityAlert',
        operation: 'aggregation',
      });

      expect(result.content[0].text).toContain('SecurityAlert');
      expect(result.content[0].text).toContain('summarize');
      expect(result.content[0].text).toContain('count()');
    });
  });

  describe('Workspace Detection', () => {
    it('detect_table_workspace: should detect workspace for table', async () => {
      const result = await callTool('detect_table_workspace', {
        tableName: 'SecurityAlert',
      });

      expect(result.structuredContent).toBeDefined();
      expect(result.structuredContent.tableName).toBe('SecurityAlert');
      expect(result.structuredContent.foundIn).toBeInstanceOf(Array);
      expect(result.structuredContent.notFoundIn).toBeInstanceOf(Array);
    });
  });

  describe('Cache Management', () => {
    it('refresh_schema: should clear cached schema', async () => {
      // First get schema (will cache)
      await callTool('get_kql_table_schema', { tableName: 'SecurityAlert' });

      // Refresh cache
      const result = await callTool('refresh_schema', { source: 'SecurityAlert' });

      expect(result.content[0].text).toContain('refreshed');
    });
  });
});
