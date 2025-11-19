import type { SchemaDiscovery } from './SchemaDiscovery.js';
import type { Config } from '../config.js';
import type { AuthManager } from '../auth/AuthManager.js';
import { LogsQueryClient } from '@azure/monitor-query';

export interface SDKCodeParams {
  tableName: string;
  framework?: 'react' | 'node' | 'inline';
  authType?: 'msal-browser' | 'default-credential';
}

export interface GraphSDKCodeParams {
  endpoint: string;
  framework?: 'react' | 'node' | 'inline';
  authType?: 'msal-browser' | 'default-credential';
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
}

export interface ExampleQueryParams {
  tableName: string;
  operation: 'simple_select' | 'filter' | 'aggregation' | 'parse_json' | 'mv_expand';
  timeRange?: string;
}

export interface WorkspaceInfo {
  [key: string]: unknown;
  workspaceId: string;
  workspaceName: string;
  hasData: boolean;
  rowCount?: number;
  dateRange?: {
    earliest: string;
    latest: string;
  };
  reason?: string;
}

export interface DetectTableResult {
  [key: string]: unknown;
  tableName: string;
  foundIn: WorkspaceInfo[];
  notFoundIn: WorkspaceInfo[];
}

export class CodeGeneration {
  private config: Config;
  private authManager: AuthManager;
  private schemaDiscovery: SchemaDiscovery;

  constructor(
    config: Config,
    authManager: AuthManager,
    schemaDiscovery: SchemaDiscovery
  ) {
    this.config = config;
    this.authManager = authManager;
    this.schemaDiscovery = schemaDiscovery;
  }

  /**
   * Generate SDK code for querying a table
   */
  async generateSDKCode(params: SDKCodeParams): Promise<string> {
    const { tableName, framework = 'inline', authType = 'msal-browser' } = params;

    // Get schema to include in comments
    const schema = await this.schemaDiscovery.getTableSchema(tableName);
    const columnList = schema.columns.slice(0, 5).map(c => c.name).join(', ');
    const hasMore = schema.columns.length > 5 ? `, ... (${schema.columns.length} total)` : '';

    if (framework === 'react' && authType === 'msal-browser') {
      return this.generateReactMSALCode(tableName, columnList, hasMore);
    } else if (framework === 'node' || authType === 'default-credential') {
      return this.generateNodeCode(tableName, columnList, hasMore);
    } else {
      return this.generateInlineCode(tableName, columnList, hasMore);
    }
  }

  private generateReactMSALCode(tableName: string, columnList: string, hasMore: string): string {
    return `// React component with MSAL authentication
import { LogsQueryClient } from '@azure/monitor-query';
import { AccessToken, TokenCredential } from '@azure/core-auth';
import { msalInstance } from '../config/azureConfig';

// Custom TokenCredential using MSAL
const credential = new (class implements TokenCredential {
  async getToken(scopes: string | string[]): Promise<AccessToken | null> {
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length === 0) {
      throw new Error('Not authenticated. Please sign in.');
    }
    
    const scopeArray = Array.isArray(scopes) ? scopes : [scopes];
    const response = await msalInstance.acquireTokenSilent({
      scopes: scopeArray,
      account: accounts[0],
    });
    
    return {
      token: response.accessToken,
      expiresOnTimestamp: response.expiresOn?.getTime() || 0,
    };
  }
})();

// Query function
async function query${tableName.replace(/[^a-zA-Z0-9]/g, '')}() {
  try {
    const client = new LogsQueryClient(credential);
    const workspaceId = '${this.config.workspaceId}';
    
    // Table columns: ${columnList}${hasMore}
    const query = \`
      ${tableName}
      | where TimeGenerated > ago(30d)
      | take 10
    \`;

    const result = await client.queryWorkspace(workspaceId, query, {
      duration: 'P30D' // ISO 8601 duration
    });

    if (result.status === 'Success' && result.tables.length > 0) {
      const table = result.tables[0];
      console.log(\`Retrieved \${table.rows.length} rows\`);
      
      // Access rows
      table.rows.forEach((row, index) => {
        console.log(\`Row \${index}:\`, row);
      });
      
      return table.rows;
    } else {
      console.error('Query failed or returned no results');
      return [];
    }
  } catch (error) {
    console.error('Query error:', error);
    throw error;
  }
}

// Usage in React component:
// const data = await query${tableName.replace(/[^a-zA-Z0-9]/g, '')}();`;
  }

  private generateNodeCode(tableName: string, columnList: string, hasMore: string): string {
    return `// Node.js with DefaultAzureCredential
import { LogsQueryClient } from '@azure/monitor-query';
import { DefaultAzureCredential } from '@azure/identity';

// Initialize credential (uses Azure CLI, Managed Identity, etc.)
const credential = new DefaultAzureCredential();
const client = new LogsQueryClient(credential);

async function query${tableName.replace(/[^a-zA-Z0-9]/g, '')}() {
  try {
    const workspaceId = '${this.config.workspaceId}';
    
    // Table columns: ${columnList}${hasMore}
    const query = \`
      ${tableName}
      | where TimeGenerated > ago(30d)
      | take 10
    \`;

    const result = await client.queryWorkspace(workspaceId, query, {
      duration: 'P30D'
    });

    if (result.status === 'Success' && result.tables.length > 0) {
      const table = result.tables[0];
      console.log(\`Retrieved \${table.rows.length} rows\`);
      
      // Column descriptors
      const columns = table.columnDescriptors?.map(col => col.name) || [];
      console.log('Columns:', columns);
      
      // Process rows
      const records = table.rows.map((row, i) => {
        const record: any = {};
        columns.forEach((col, j) => {
          record[col] = row[j];
        });
        return record;
      });
      
      return records;
    } else {
      throw new Error('Query failed or returned no results');
    }
  } catch (error) {
    console.error('Query error:', error);
    throw error;
  }
}

// Run the query
query${tableName.replace(/[^a-zA-Z0-9]/g, '')}()
  .then(data => console.log('Data:', data))
  .catch(err => console.error('Error:', err));`;
  }

  private generateInlineCode(tableName: string, columnList: string, hasMore: string): string {
    return `// Inline query code (generic TokenCredential)
import { LogsQueryClient } from '@azure/monitor-query';

// Assuming you have a TokenCredential instance
async function query${tableName.replace(/[^a-zA-Z0-9]/g, '')}(credential: TokenCredential) {
  const client = new LogsQueryClient(credential);
  const workspaceId = '${this.config.workspaceId}';
  
  // Table columns: ${columnList}${hasMore}
  const query = \`
    ${tableName}
    | where TimeGenerated > ago(30d)
    | take 10
  \`;

  const result = await client.queryWorkspace(workspaceId, query, {
    duration: 'P30D'
  });

  if (result.status === 'Success' && result.tables.length > 0) {
    return result.tables[0].rows;
  }
  
  return [];
}`;
  }

  /**
   * Generate example KQL query
   */
  async generateExampleQuery(params: ExampleQueryParams): Promise<string> {
    const { tableName, operation, timeRange = '30d' } = params;
    const schema = await this.schemaDiscovery.getTableSchema(tableName);
    
    // Find common column types
    const timeColumn = schema.columns.find(c => c.type === 'datetime' && c.name.toLowerCase().includes('time'));
    const stringColumns = schema.columns.filter(c => c.type === 'string').slice(0, 3);
    const jsonColumns = schema.columns.filter(c => c.type === 'dynamic');

    switch (operation) {
      case 'simple_select':
        return this.generateSimpleSelect(tableName, timeRange, schema.columns.slice(0, 5).map(c => c.name));

      case 'filter':
        return this.generateFilterQuery(tableName, timeRange, stringColumns.map(c => c.name));

      case 'aggregation':
        return this.generateAggregationQuery(tableName, timeRange, stringColumns[0]?.name || 'Computer');

      case 'parse_json':
        if (jsonColumns.length === 0) {
          return `// No dynamic/JSON columns found in ${tableName}\n// Available columns: ${schema.columns.map(c => `${c.name} (${c.type})`).join(', ')}`;
        }
        return this.generateParseJsonQuery(tableName, timeRange, jsonColumns[0].name);

      case 'mv_expand':
        if (jsonColumns.length === 0) {
          return `// No dynamic/JSON array columns found in ${tableName}\n// This operation requires a column with JSON arrays`;
        }
        return this.generateMvExpandQuery(tableName, timeRange, jsonColumns[0].name);

      default:
        return `// Unknown operation: ${operation}`;
    }
  }

  private generateSimpleSelect(tableName: string, timeRange: string, columns: string[]): string {
    return `// Simple select - get latest records
${tableName}
| where TimeGenerated > ago(${timeRange})
| project ${columns.join(', ')}
| take 10`;
  }

  private generateFilterQuery(tableName: string, timeRange: string, columns: string[]): string {
    const filterCol = columns[0] || 'Computer';
    return `// Filter by specific criteria
${tableName}
| where TimeGenerated > ago(${timeRange})
| where isnotempty(${filterCol})
| where ${filterCol} contains "example" // Adjust filter condition
| take 100`;
  }

  private generateAggregationQuery(tableName: string, timeRange: string, groupByCol: string): string {
    return `// Count and aggregate by ${groupByCol}
${tableName}
| where TimeGenerated > ago(${timeRange})
| summarize 
    RecordCount = count(),
    FirstSeen = min(TimeGenerated),
    LastSeen = max(TimeGenerated)
  by ${groupByCol}
| order by RecordCount desc
| take 50`;
  }

  private generateParseJsonQuery(tableName: string, timeRange: string, jsonColumn: string): string {
    return `// Parse nested JSON from ${jsonColumn} column
${tableName}
| where TimeGenerated > ago(${timeRange})
| where isnotempty(${jsonColumn})
| extend 
    // Extract properties from JSON (adjust property names as needed)
    Property1 = tostring(${jsonColumn}.propertyName),
    Property2 = toint(${jsonColumn}.numericProperty)
| project TimeGenerated, ${jsonColumn}, Property1, Property2
| take 100`;
  }

  private generateMvExpandQuery(tableName: string, timeRange: string, arrayColumn: string): string {
    return `// Expand JSON array from ${arrayColumn} column
${tableName}
| where TimeGenerated > ago(${timeRange})
| where isnotempty(${arrayColumn})
| mv-expand Item = ${arrayColumn}
| extend 
    // Extract properties from each array item (adjust as needed)
    ItemId = tostring(Item.id),
    ItemName = tostring(Item.name),
    ItemValue = toint(Item.value)
| project TimeGenerated, ItemId, ItemName, ItemValue
| take 100`;
  }

  /**
   * Detect which workspace contains a table
   */
  async detectTableWorkspace(
    tableName: string,
    workspaceIds?: string[]
  ): Promise<DetectTableResult> {
    const workspacesToCheck = workspaceIds || [this.config.workspaceId];
    const foundIn: WorkspaceInfo[] = [];
    const notFoundIn: WorkspaceInfo[] = [];

    for (const workspaceId of workspacesToCheck) {
      try {
        const token = await this.authManager.getToken();
        const client = new LogsQueryClient({
          getToken: async () => ({ token, expiresOnTimestamp: Date.now() + 3600000 }),
        });

        // First check if table exists
        const existsQuery = `union withsource = TableName * | where TableName == "${tableName}" | take 1`;
        const existsResult = await client.queryWorkspace(workspaceId, existsQuery, {
          duration: 'PT1H',
        });

        if (
          existsResult.status !== 'Success' ||
          !existsResult.tables[0] ||
          existsResult.tables[0].rows.length === 0
        ) {
          notFoundIn.push({
            workspaceId,
            workspaceName: workspaceId === this.config.workspaceId ? 'primary' : 'secondary',
            hasData: false,
            reason: 'Table does not exist',
          });
          continue;
        }

        // Table exists, get metadata
        const metadataQuery = `${tableName}
| summarize 
    RowCount = count(),
    EarliestRecord = min(TimeGenerated),
    LatestRecord = max(TimeGenerated)`;

        const metadataResult = await client.queryWorkspace(workspaceId, metadataQuery, {
          duration: 'P90D',
        });

        if (metadataResult.status === 'Success' && metadataResult.tables[0]) {
          const row = metadataResult.tables[0].rows[0];
          const rowCount = row[0] as number;
          const earliest = row[1] as string;
          const latest = row[2] as string;

          foundIn.push({
            workspaceId,
            workspaceName: workspaceId === this.config.workspaceId ? 'primary' : 'secondary',
            hasData: rowCount > 0,
            rowCount,
            dateRange: {
              earliest,
              latest,
            },
          });
        }
      } catch (error) {
        notFoundIn.push({
          workspaceId,
          workspaceName: workspaceId === this.config.workspaceId ? 'primary' : 'secondary',
          hasData: false,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return {
      tableName,
      foundIn,
      notFoundIn,
    };
  }

  /**
   * Find working query examples in codebase (requires file system access)
   */
  async findWorkingQueryExamples(tableName: string, searchPaths?: string[]): Promise<any> {
    // This would require access to the file system to search through code
    // For now, return a placeholder that indicates this feature needs codebase access
    return {
      tableName,
      message: 'This feature requires file system access to search the codebase',
      suggestion: 'Use VS Code search or grep to find examples of: ' + tableName,
      examples: [],
    };
  }

  /**
   * Generate SDK code for Microsoft Graph API queries
   */
  async generateGraphSDKCode(params: GraphSDKCodeParams): Promise<string> {
    const { endpoint, framework = 'inline', authType = 'msal-browser', method = 'GET' } = params;

    // Get schema to include in comments if available
    let schemaInfo = '';
    try {
      const schema = await this.schemaDiscovery.getGraphAPISchema(endpoint, 2);
      const properties = Object.keys(schema.properties).slice(0, 5);
      schemaInfo = `Properties: ${properties.join(', ')}${Object.keys(schema.properties).length > 5 ? '...' : ''}`;
    } catch {
      schemaInfo = 'Schema discovery not available';
    }

    if (framework === 'react' && authType === 'msal-browser') {
      return this.generateReactGraphCode(endpoint, method, schemaInfo);
    } else if (framework === 'node' || authType === 'default-credential') {
      return this.generateNodeGraphCode(endpoint, method, schemaInfo);
    } else {
      return this.generateInlineGraphCode(endpoint, method, schemaInfo);
    }
  }

  private generateReactGraphCode(endpoint: string, method: string, schemaInfo: string): string {
    const functionName = endpoint.replace(/[^a-zA-Z0-9]/g, '').replace(/^/, 'query');
    
    return `// React component with MSAL authentication for Microsoft Graph
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { AccessToken, TokenCredential } from '@azure/core-auth';
import { msalInstance } from '../config/azureConfig';

// Custom TokenCredential using MSAL
const credential = new (class implements TokenCredential {
  async getToken(scopes: string | string[]): Promise<AccessToken | null> {
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length === 0) {
      throw new Error('Not authenticated. Please sign in.');
    }
    
    const scopeArray = Array.isArray(scopes) ? scopes : [scopes];
    const response = await msalInstance.acquireTokenSilent({
      scopes: scopeArray,
      account: accounts[0],
    });
    
    return {
      token: response.accessToken,
      expiresOnTimestamp: response.expiresOn?.getTime() || 0,
    };
  }
})();

// Create Graph client with authentication provider
const authProvider = new TokenCredentialAuthenticationProvider(credential, {
  scopes: ['https://graph.microsoft.com/.default']
});

const graphClient = Client.initWithMiddleware({ authProvider });

async function ${functionName}() {
  try {
    // ${schemaInfo}
    const response = await graphClient
      .api('${endpoint}')
      .${method.toLowerCase()}();
    
    console.log(\`Retrieved \${response.value?.length || 1} items\`);
    return response.value || response;
  } catch (error) {
    console.error('Graph API error:', error);
    throw error;
  }
}

// Usage in React component:
// const data = await ${functionName}();`;
  }

  private generateNodeGraphCode(endpoint: string, method: string, schemaInfo: string): string {
    const functionName = endpoint.replace(/[^a-zA-Z0-9]/g, '').replace(/^/, 'query');
    
    return `// Node.js with DefaultAzureCredential for Microsoft Graph
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import { DefaultAzureCredential } from '@azure/identity';

// Initialize credential and Graph client
const credential = new DefaultAzureCredential();
const authProvider = new TokenCredentialAuthenticationProvider(credential, {
  scopes: ['https://graph.microsoft.com/.default']
});

const graphClient = Client.initWithMiddleware({ authProvider });

async function ${functionName}() {
  try {
    // ${schemaInfo}
    const response = await graphClient
      .api('${endpoint}')
      .${method.toLowerCase()}();
    
    // Handle paginated results automatically
    if (response.value) {
      console.log(\`Retrieved \${response.value.length} items\`);
      
      // Optional: Get all pages
      let allItems = response.value;
      let iterator = graphClient
        .api('${endpoint}')
        .${method.toLowerCase()}();
      
      const pageIterator = await iterator;
      // Note: Use PageIterator from @microsoft/microsoft-graph-client for full pagination
      
      return allItems;
    }
    
    return response;
  } catch (error) {
    console.error('Graph API error:', error);
    throw error;
  }
}

// Run the query
${functionName}()
  .then(data => console.log('Data:', data))
  .catch(err => console.error('Error:', err));`;
  }

  private generateInlineGraphCode(endpoint: string, method: string, schemaInfo: string): string {
    const functionName = endpoint.replace(/[^a-zA-Z0-9]/g, '').replace(/^/, 'query');
    
    return `// Generic Microsoft Graph API query with TokenCredential
// ${schemaInfo}
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';
import type { TokenCredential } from '@azure/core-auth';

async function ${functionName}(credential: TokenCredential) {
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default']
  });

  const graphClient = Client.initWithMiddleware({ authProvider });

  const response = await graphClient
    .api('${endpoint}')
    .${method.toLowerCase()}();

  return response.value || response;
}`;
  }
}

