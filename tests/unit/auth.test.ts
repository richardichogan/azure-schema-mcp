import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthManager } from '../../src/auth/AuthManager.js';
import type { Config } from '../../src/config.js';

describe('AuthManager', () => {
  let config: Config;
  let authManager: AuthManager;

  beforeEach(() => {
    config = {
      tenantId: 'test-tenant-id',
      workspaceId: 'test-workspace-id',
      tokenCacheDir: './.cache/test',
      schemaCacheDir: './.cache/test/schemas',
    };
    authManager = new AuthManager(config);
  });

  describe('Token Management', () => {
    it('should create AuthManager instance', () => {
      expect(authManager).toBeDefined();
      expect(authManager).toBeInstanceOf(AuthManager);
    });

    it('should have getToken method', () => {
      expect(authManager.getToken).toBeDefined();
      expect(typeof authManager.getToken).toBe('function');
    });

    it('should have getGraphToken method', () => {
      expect(authManager.getGraphToken).toBeDefined();
      expect(typeof authManager.getGraphToken).toBe('function');
    });

    it('should have refreshToken method', () => {
      expect(authManager.refreshToken).toBeDefined();
      expect(typeof authManager.refreshToken).toBe('function');
    });

    it('should have isTokenExpiringSoon method', () => {
      expect(authManager.isTokenExpiringSoon).toBeDefined();
      expect(typeof authManager.isTokenExpiringSoon).toBe('function');
    });
  });

  describe('Configuration', () => {
    it('should accept valid configuration', () => {
      expect(() => new AuthManager(config)).not.toThrow();
    });

    it('should handle missing tenant ID gracefully', () => {
      const invalidConfig = { ...config, tenantId: '' };
      // Should not throw on construction, only when getting tokens
      expect(() => new AuthManager(invalidConfig as Config)).not.toThrow();
    });
  });
});
