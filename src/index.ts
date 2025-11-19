#!/usr/bin/env node

/**
 * Azure Schema MCP Server
 * 
 * MCP server that provides schema discovery tools for Azure Log Analytics
 * and Microsoft Graph APIs, using device code authentication with automatic
 * token refresh.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { AuthManager } from './auth/AuthManager.js';
import { SchemaDiscovery } from './services/SchemaDiscovery.js';
import { CodeGeneration } from './services/CodeGeneration.js';

import { loadConfig } from './config.js';

async function main() {
  // Load configuration
  const config = loadConfig();

  // Initialize authentication manager
  const authManager = new AuthManager(config);

  // Initialize schema discovery service
  const schemaDiscovery = new SchemaDiscovery(config, authManager);
  const codeGeneration = new CodeGeneration(config, authManager, schemaDiscovery);


  // Create MCP server
  const server = new McpServer({
    name: 'azure-schema-mcp',
    version: '1.0.0',
  });

  // Tool: Get KQL table schema
  server.registerTool(
    'get_kql_table_schema',
    {
      title: 'Get KQL Table Schema',
      description: 'Discover the schema of an Azure Log Analytics table using the getschema operator',
      inputSchema: {
        tableName: z.string().describe('Name of the Log Analytics table (e.g., "QualysHostDetectionV3_CL")'),
      },
      outputSchema: {
        tableName: z.string(),
        columns: z.array(z.object({
          name: z.string(),
          type: z.string(),
          ordinal: z.number(),
        })),
        discoveredAt: z.string(),
        cached: z.boolean(),
      },
    },
    async ({ tableName }) => {
      const schema = await schemaDiscovery.getTableSchema(tableName);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(schema, null, 2),
        }],
        structuredContent: schema,
      };
    }
  );

  // Tool: Test KQL query
  server.registerTool(
    'test_kql_query',
    {
      title: 'Test KQL Query',
      description: 'Execute a KQL query against Azure Log Analytics and return sample results',
      inputSchema: {
        query: z.string().describe('KQL query to execute'),
        maxRows: z.number().default(10).describe('Maximum number of rows to return (default: 10)'),
      },
      outputSchema: {
        columns: z.array(z.object({
          name: z.string(),
          type: z.string(),
        })),
        rows: z.array(z.array(z.any())),
        rowCount: z.number(),
      },
    },
    async ({ query, maxRows }) => {
      const result = await schemaDiscovery.testQuery(query, maxRows);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
        structuredContent: result,
      };
    }
  );

  // Tool: List available tables
  server.registerTool(
    'list_tables',
    {
      title: 'List Available Tables',
      description: 'List all available tables in the Azure Log Analytics workspace',
      inputSchema: {},
      outputSchema: {
        tables: z.array(z.string()),
        count: z.number(),
      },
    },
    async () => {
      const tables = await schemaDiscovery.listTables();
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ tables, count: tables.length }, null, 2),
        }],
        structuredContent: { tables, count: tables.length },
      };
    }
  );

  // Tool: Get Graph API schema
  server.registerTool(
    'get_graph_api_schema',
    {
      title: 'Get Graph API Schema',
      description: 'Introspect a Microsoft Graph API endpoint to discover its schema',
      inputSchema: {
        endpoint: z.string().describe('Graph API endpoint path (e.g., "/security/alerts")'),
        sampleSize: z.number().default(2).describe('Number of sample records to fetch (default: 2)'),
      },
      outputSchema: {
        endpoint: z.string(),
        properties: z.record(z.object({
          type: z.string(),
          required: z.boolean(),
        })),
        discoveredAt: z.string(),
      },
    },
    async ({ endpoint, sampleSize }) => {
      const schema = await schemaDiscovery.getGraphAPISchema(endpoint, sampleSize);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(schema, null, 2),
        }],
        structuredContent: schema,
      };
    }
  );

  // Tool: Refresh schema cache
  server.registerTool(
    'refresh_schema',
    {
      title: 'Refresh Schema Cache',
      description: 'Force refresh of cached schema for a table or API endpoint',
      inputSchema: {
        source: z.string().describe('Table name or API endpoint to refresh'),
      },
      outputSchema: {
        success: z.boolean(),
        source: z.string(),
        refreshedAt: z.string(),
      },
    },
    async ({ source }) => {
      const result = await schemaDiscovery.refreshSchema(source);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
        structuredContent: result,
      };
    }
  );


  // Tool: Generate SDK Code
  server.registerTool(
    'generate_sdk_code',
    {
      title: 'Generate SDK Code',
      description: 'Generate working TypeScript/JavaScript code to query an Azure Log Analytics table using the Azure Monitor Query SDK',
      inputSchema: {
        tableName: z.string().describe('Name of the table (e.g., "QualysHostDetectionV3_CL")'),
        framework: z.enum(['react', 'node', 'inline']).default('inline').describe('Framework: react (MSAL browser), node (DefaultAzureCredential), or inline (generic)'),
        authType: z.enum(['msal-browser', 'default-credential']).default('msal-browser').describe('Authentication type'),
      },
      outputSchema: {
        code: z.string(),
      },
    },
    async ({ tableName, framework, authType }) => {
      const code = await codeGeneration.generateSDKCode({ tableName, framework, authType });
      return {
        content: [{
          type: 'text',
          text: code,
        }],
        structuredContent: { code },
      };
    }
  );

  // Tool: Generate Example Query
  server.registerTool(
    'generate_example_query',
    {
      title: 'Generate Example Query',
      description: 'Generate working KQL query examples for a table based on its schema',
      inputSchema: {
        tableName: z.string().describe('Name of the table'),
        operation: z.enum(['simple_select', 'filter', 'aggregation', 'parse_json', 'mv_expand']).describe('Type of query operation'),
        timeRange: z.string().default('30d').describe('Time range in KQL format (default: 30d)'),
      },
      outputSchema: {
        query: z.string(),
      },
    },
    async ({ tableName, operation, timeRange }) => {
      const query = await codeGeneration.generateExampleQuery({ tableName, operation, timeRange });
      return {
        content: [{
          type: 'text',
          text: query,
        }],
        structuredContent: { query },
      };
    }
  );

  // Tool: Detect Table Workspace
  server.registerTool(
    'detect_table_workspace',
    {
      title: 'Detect Table Workspace',
      description: 'Test which workspace contains a specific table and return metadata about data availability',
      inputSchema: {
        tableName: z.string().describe('Name of the table to search for'),
        workspaceIds: z.array(z.string()).optional().describe('Array of workspace IDs to check (optional)'),
      },
      outputSchema: {
        tableName: z.string(),
        foundIn: z.array(z.object({
          workspaceId: z.string(),
          workspaceName: z.string(),
          hasData: z.boolean(),
          rowCount: z.number().optional(),
          dateRange: z.object({
            earliest: z.string(),
            latest: z.string(),
          }).optional(),
        })),
        notFoundIn: z.array(z.object({
          workspaceId: z.string(),
          workspaceName: z.string(),
          hasData: z.boolean(),
          reason: z.string().optional(),
        })),
      },
    },
    async ({ tableName, workspaceIds }) => {
      const result = await codeGeneration.detectTableWorkspace(tableName, workspaceIds);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
        structuredContent: result,
      };
    }
  );

  // Tool: Find Working Query Examples
  server.registerTool(
    'find_working_query_examples',
    {
      title: 'Find Working Query Examples',
      description: 'Search the codebase for existing working queries against a specific table',
      inputSchema: {
        tableName: z.string().describe('Name of the table to find examples for'),
      },
      outputSchema: {
        tableName: z.string(),
        message: z.string().optional(),
        suggestion: z.string().optional(),
        examples: z.array(z.any()),
      },
    },
    async ({ tableName }) => {
      const result = await codeGeneration.findWorkingQueryExamples(tableName);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
        structuredContent: result,
      };
    }
  );

  // Tool: Generate Graph SDK Code
  server.registerTool(
    'generate_graph_sdk_code',
    {
      title: 'Generate Graph SDK Code',
      description: 'Generate working TypeScript/JavaScript code to query Microsoft Graph API',
      inputSchema: {
        endpoint: z.string().describe('Graph API endpoint path (e.g., "/security/alerts")'),
        framework: z.enum(['react', 'node', 'inline']).default('inline').describe('Framework: react (MSAL browser), node (DefaultAzureCredential), or inline (generic)'),
        authType: z.enum(['msal-browser', 'default-credential']).default('msal-browser').describe('Authentication type'),
        method: z.enum(['GET', 'POST', 'PATCH', 'DELETE']).default('GET').describe('HTTP method'),
      },
      outputSchema: {
        code: z.string(),
      },
    },
    async ({ endpoint, framework, authType, method }) => {
      const code = await codeGeneration.generateGraphSDKCode({ endpoint, framework, authType, method });
      return {
        content: [{
          type: 'text',
          text: code,
        }],
        structuredContent: { code },
      };
    }
  );

  // Connect server to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('Azure Schema MCP Server running on stdio');
  console.error('Available tools: get_kql_table_schema, test_kql_query, list_tables, get_graph_api_schema, refresh_schema, generate_sdk_code, generate_example_query, detect_table_workspace, find_working_query_examples, generate_graph_sdk_code');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});




