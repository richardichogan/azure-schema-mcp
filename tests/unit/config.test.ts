import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../../src/config.js';

describe('Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset modules and env
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should load configuration from environment variables', () => {
    process.env.AZURE_TENANT_ID = 'test-tenant';
    process.env.AZURE_WORKSPACE_ID = 'test-workspace';
    
    const config = loadConfig();
    
    expect(config).toBeDefined();
    expect(config.tenantId).toBe('test-tenant');
    expect(config.workspaceId).toBe('test-workspace');
  });

  it('should use default cache directories', () => {
    process.env.AZURE_TENANT_ID = 'test-tenant';
    process.env.AZURE_WORKSPACE_ID = 'test-workspace';
    
    const config = loadConfig();
    
    expect(config.tokenCacheDir).toContain('.cache');
    expect(config.schemaCacheDir).toContain('.cache');
  });

  it('should allow custom cache directories', () => {
    process.env.AZURE_TENANT_ID = 'test-tenant';
    process.env.AZURE_WORKSPACE_ID = 'test-workspace';
    process.env.TOKEN_CACHE_DIR = './custom/tokens';
    process.env.SCHEMA_CACHE_DIR = './custom/schemas';
    
    const config = loadConfig();
    
    expect(config.tokenCacheDir).toBe('./custom/tokens');
    expect(config.schemaCacheDir).toBe('./custom/schemas');
  });

  it('should throw error if tenant ID is missing', () => {
    delete process.env.AZURE_TENANT_ID;
    process.env.AZURE_WORKSPACE_ID = 'test-workspace';
    
    expect(() => loadConfig()).toThrow();
  });

  it('should throw error if workspace ID is missing', () => {
    process.env.AZURE_TENANT_ID = 'test-tenant';
    delete process.env.AZURE_WORKSPACE_ID;
    
    expect(() => loadConfig()).toThrow();
  });
});
