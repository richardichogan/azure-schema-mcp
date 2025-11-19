import { LogsQueryClient } from '@azure/monitor-query';
import { promises as fs } from 'fs';
import path from 'path';
import type { Config } from '../config.js';
import type { AuthManager } from '../auth/AuthManager.js';

interface TableColumn {
  name: string;
  type: string;
  ordinal: number;
}

interface TableSchema {
  [key: string]: unknown;
  tableName: string;
  columns: TableColumn[];
  discoveredAt: string;
  cached: boolean;
}

interface QueryResult {
  [key: string]: unknown;
  columns: Array<{ name: string; type: string }>;
  rows: any[][];
  rowCount: number;
}

interface GraphAPISchema {
  [key: string]: unknown;
  endpoint: string;
  properties: Record<string, { type: string; required: boolean }>;
  discoveredAt: string;
}

export class SchemaDiscovery {
  private config: Config;
  private authManager: AuthManager;
  private schemaCache: Map<string, TableSchema | GraphAPISchema> = new Map();

  constructor(config: Config, authManager: AuthManager) {
    this.config = config;
    this.authManager = authManager;
  }

  /**
   * Get schema for a KQL table
   */
  async getTableSchema(tableName: string): Promise<TableSchema> {
    // Check cache first
    const cacheKey = `table:${tableName}`;
    const cached = this.schemaCache.get(cacheKey);
    if (cached) {
      return { ...cached as TableSchema, cached: true };
    }

    // Try to load from disk
    const diskSchema = await this.loadSchemaFromDisk(cacheKey);
    if (diskSchema) {
      this.schemaCache.set(cacheKey, diskSchema);
      return { ...diskSchema as TableSchema, cached: true };
    }

    // Discover schema using getschema operator
    console.error(`Discovering schema for table: ${tableName}`);
    
    const token = await this.authManager.getToken();
    const client = new LogsQueryClient({
      getToken: async () => ({ token, expiresOnTimestamp: Date.now() + 3600000 }),
    });

    const query = `${tableName} | getschema`;
    const result = await client.queryWorkspace(
      this.config.workspaceId,
      query,
      { duration: 'PT1H' }
    );

    if (result.status !== 'Success' || !result.tables || result.tables.length === 0) {
      throw new Error(`Failed to get schema for table ${tableName}`);
    }

    const table = result.tables[0];
    const columns: TableColumn[] = table.rows.map((row: any, index: number) => ({
      name: String(row[0]),
      type: String(row[2]),
      ordinal: typeof row[1] === 'number' ? row[1] : index,
    }));

    const schema: TableSchema = {
      tableName,
      columns,
      discoveredAt: new Date().toISOString(),
      cached: false,
    };

    // Cache in memory and on disk
    this.schemaCache.set(cacheKey, schema);
    await this.saveSchemaToDisk(cacheKey, schema);

    console.error(`✓ Discovered ${columns.length} columns for ${tableName}\n`);
    return schema;
  }

  /**
   * Test a KQL query and return sample results
   */
  async testQuery(query: string, maxRows: number = 10): Promise<QueryResult> {
    const token = await this.authManager.getToken();
    const client = new LogsQueryClient({
      getToken: async () => ({ token, expiresOnTimestamp: Date.now() + 3600000 }),
    });

    // Add LIMIT if not present
    const limitedQuery = query.includes('take') || query.includes('limit')
      ? query
      : `${query} | take ${maxRows}`;

    const result = await client.queryWorkspace(
      this.config.workspaceId,
      limitedQuery,
      { duration: 'PT1H' }
    );

    if (result.status !== 'Success' || !result.tables || result.tables.length === 0) {
      throw new Error('Query failed or returned no results');
    }

    const table = result.tables[0];
    return {
      columns: table.columnDescriptors?.map((col: any) => ({
        name: col.name || 'unknown',
        type: col.type || 'unknown',
      })) || [],
      rows: table.rows || [],
      rowCount: table.rows?.length || 0,
    };
  }

  /**
   * List all available tables in the workspace
   */
  async listTables(): Promise<string[]> {
    const token = await this.authManager.getToken();
    const client = new LogsQueryClient({
      getToken: async () => ({ token, expiresOnTimestamp: Date.now() + 3600000 }),
    });

    // Query to get all tables
    const query = `union withsource = TableName * | distinct TableName | sort by TableName asc`;
    
    const result = await client.queryWorkspace(
      this.config.workspaceId,
      query,
      { duration: 'PT1H' }
    );

    if (result.status !== 'Success' || !result.tables || result.tables.length === 0) {
      throw new Error('Failed to list tables');
    }

    const table = result.tables[0];
    return table.rows.map((row: any) => String(row[0]));
  }

  /**
   * Get schema for a Microsoft Graph API endpoint
   */
  async getGraphAPISchema(endpoint: string, sampleSize: number = 2): Promise<GraphAPISchema> {
    const cacheKey = `api:${endpoint}`;
    const cached = this.schemaCache.get(cacheKey);
    if (cached) {
      return cached as GraphAPISchema;
    }

    // Try to load from disk
    const diskSchema = await this.loadSchemaFromDisk(cacheKey);
    if (diskSchema) {
      this.schemaCache.set(cacheKey, diskSchema);
      return diskSchema as GraphAPISchema;
    }

    // Fetch sample data from Graph API
    console.error(`Discovering schema for API endpoint: ${endpoint}`);
    
    const token = await this.authManager.getGraphToken();
    const url = `https://graph.microsoft.com/v1.0${endpoint}?$top=${sampleSize}`;
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Graph API request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const samples = data.value || [data];

    // Introspect structure
    const properties: Record<string, { type: string; required: boolean }> = {};
    
    if (samples.length > 0) {
      const firstSample = samples[0];
      for (const [key, value] of Object.entries(firstSample)) {
        const type = Array.isArray(value) ? 'array' : typeof value;
        const required = samples.every((s: any) => s[key] !== undefined && s[key] !== null);
        properties[key] = { type, required };
      }
    }

    const schema: GraphAPISchema = {
      endpoint,
      properties,
      discoveredAt: new Date().toISOString(),
    };

    // Cache in memory and on disk
    this.schemaCache.set(cacheKey, schema);
    await this.saveSchemaToDisk(cacheKey, schema);

    console.error(`✓ Discovered ${Object.keys(properties).length} properties for ${endpoint}\n`);
    return schema;
  }

  /**
   * Refresh schema (force re-discovery)
   */
  async refreshSchema(source: string): Promise<{ success: boolean; source: string; refreshedAt: string }> {
    // Determine if it's a table or API endpoint
    const isAPI = source.startsWith('/');
    const cacheKey = isAPI ? `api:${source}` : `table:${source}`;

    // Remove from caches
    this.schemaCache.delete(cacheKey);
    await this.deleteSchemaFromDisk(cacheKey);

    // Re-discover
    if (isAPI) {
      await this.getGraphAPISchema(source);
    } else {
      await this.getTableSchema(source);
    }

    return {
      success: true,
      source,
      refreshedAt: new Date().toISOString(),
    };
  }

  /**
   * Load schema from disk cache
   */
  private async loadSchemaFromDisk(cacheKey: string): Promise<TableSchema | GraphAPISchema | null> {
    try {
      const filename = cacheKey.replace(/[:/]/g, '_') + '.json';
      const filepath = path.join(this.config.schemaCacheDir, filename);
      const data = await fs.readFile(filepath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  /**
   * Save schema to disk cache
   */
  private async saveSchemaToDisk(cacheKey: string, schema: TableSchema | GraphAPISchema): Promise<void> {
    try {
      await fs.mkdir(this.config.schemaCacheDir, { recursive: true });
      const filename = cacheKey.replace(/[:/]/g, '_') + '.json';
      const filepath = path.join(this.config.schemaCacheDir, filename);
      await fs.writeFile(filepath, JSON.stringify(schema, null, 2), 'utf-8');
    } catch (error) {
      console.error('Warning: Failed to cache schema to disk:', error);
    }
  }

  /**
   * Delete schema from disk cache
   */
  private async deleteSchemaFromDisk(cacheKey: string): Promise<void> {
    try {
      const filename = cacheKey.replace(/[:/]/g, '_') + '.json';
      const filepath = path.join(this.config.schemaCacheDir, filename);
      await fs.unlink(filepath);
    } catch (error) {
      // Ignore errors
    }
  }
}
