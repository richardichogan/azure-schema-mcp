import { describe, it, expect, beforeAll } from 'vitest';
import { DefaultAzureCredential } from '@azure/identity';
import { LogsQueryClient } from '@azure/monitor-query';
import { loadConfig } from '../../src/config.js';

/**
 * Integration tests for Azure connectivity
 * Requires: az login and valid .env configuration
 */
describe('Azure Connectivity', () => {
  let config: ReturnType<typeof loadConfig>;
  let credential: DefaultAzureCredential;
  let client: LogsQueryClient;

  beforeAll(() => {
    config = loadConfig();
    credential = new DefaultAzureCredential();
    client = new LogsQueryClient(credential);
  });

  describe('Authentication', () => {
    it('should authenticate with DefaultAzureCredential', async () => {
      const token = await credential.getToken('https://api.loganalytics.io/.default');
      
      expect(token).toBeDefined();
      expect(token.token).toBeDefined();
      expect(token.expiresOnTimestamp).toBeGreaterThan(Date.now());
    });

    it('should get Graph API token', async () => {
      const token = await credential.getToken('https://graph.microsoft.com/.default');
      
      expect(token).toBeDefined();
      expect(token.token).toBeDefined();
      expect(token.expiresOnTimestamp).toBeGreaterThan(Date.now());
    });
  });

  describe('Log Analytics Queries', () => {
    it('should execute simple search query', async () => {
      const query = 'search * | distinct $table | take 5';
      const result = await client.queryWorkspace(
        config.workspaceId,
        query,
        { duration: 'PT1M' }
      );

      expect(result).toBeDefined();
      expect(result.tables).toBeDefined();
      expect(result.tables.length).toBeGreaterThan(0);
    });

    it('should discover table schema using getschema', async () => {
      // First, get a table that exists
      const listQuery = 'search * | distinct $table | take 1';
      const listResult = await client.queryWorkspace(
        config.workspaceId,
        listQuery,
        { duration: 'PT1M' }
      );

      expect(listResult.tables[0].rows.length).toBeGreaterThan(0);
      const tableName = listResult.tables[0].rows[0][0];

      // Now get its schema
      const schemaQuery = `${tableName} | getschema | project ColumnName, DataType`;
      const schemaResult = await client.queryWorkspace(
        config.workspaceId,
        schemaQuery,
        { duration: 'PT1M' }
      );

      expect(schemaResult.tables).toBeDefined();
      expect(schemaResult.tables[0].rows.length).toBeGreaterThan(0);
    });

    it('should handle query timeout', async () => {
      const query = 'search * | take 1';
      const result = await client.queryWorkspace(
        config.workspaceId,
        query,
        { duration: 'PT1M' }
      );

      // Should complete within timeout
      expect(result).toBeDefined();
    }, 60000); // 60s timeout for this test
  });

  describe('Error Handling', () => {
    it('should handle invalid workspace ID gracefully', async () => {
      const invalidWorkspaceId = '00000000-0000-0000-0000-000000000000';
      const query = 'search * | take 1';

      await expect(
        client.queryWorkspace(invalidWorkspaceId, query, { duration: 'PT1M' })
      ).rejects.toThrow();
    });

    it('should handle invalid KQL syntax', async () => {
      const invalidQuery = 'INVALID KQL SYNTAX!!!';

      await expect(
        client.queryWorkspace(config.workspaceId, invalidQuery, { duration: 'PT1M' })
      ).rejects.toThrow();
    });

    it('should handle nonexistent table', async () => {
      const query = 'NonExistentTable_XYZ | take 1';

      await expect(
        client.queryWorkspace(config.workspaceId, query, { duration: 'PT1M' })
      ).rejects.toThrow();
    });
  });
});
