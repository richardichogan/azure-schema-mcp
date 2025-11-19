import { DeviceCodeCredential, AccessToken } from '@azure/identity';
import { promises as fs } from 'fs';
import path from 'path';
import type { Config } from '../config.js';

interface CachedToken {
  token: string;
  expiresOn: number;
}

export class AuthManager {
  private config: Config;
  private credential: DeviceCodeCredential;
  private cachedToken: CachedToken | null = null;
  private tokenFilePath: string;

  constructor(config: Config) {
    this.config = config;
    this.tokenFilePath = path.join(config.tokenCacheDir, 'azure-token.json');

    // Create device code credential
    this.credential = new DeviceCodeCredential({
      tenantId: config.tenantId,
      clientId: '04b07795-8ddb-461a-bbee-02f9e1bf7b46', // Azure CLI client ID (public client)
      userPromptCallback: (info) => {
        console.error('\n╔═══════════════════════════════════════════════════════════════╗');
        console.error('║                  AZURE AUTHENTICATION REQUIRED                 ║');
        console.error('╚═══════════════════════════════════════════════════════════════╝\n');
        console.error(`  Please visit: ${info.verificationUri}`);
        console.error(`  And enter code: ${info.userCode}\n`);
        console.error('  Waiting for authentication...\n');
      },
    });
  }

  /**
   * Get an access token, using cached token if still valid or acquiring a new one
   * Note: Always requests both Log Analytics and Graph API scopes to avoid re-authentication
   */
  async getToken(scopes: string[] = ['https://api.loganalytics.io/.default', 'https://graph.microsoft.com/.default']): Promise<string> {
    // Check if cached token is still valid
    if (this.cachedToken && this.cachedToken.expiresOn > Date.now()) {
      return this.cachedToken.token;
    }

    // Try to load token from disk
    await this.loadCachedToken();
    if (this.cachedToken && this.cachedToken.expiresOn > Date.now()) {
      return this.cachedToken.token;
    }

    // Token expired or doesn't exist, get a new one
    console.error('Acquiring new access token...');
    const tokenResponse = await this.credential.getToken(scopes);

    if (!tokenResponse) {
      throw new Error('Failed to acquire access token');
    }

    // Cache the token
    this.cachedToken = {
      token: tokenResponse.token,
      expiresOn: tokenResponse.expiresOnTimestamp,
    };

    // Save to disk
    await this.saveCachedToken();

    console.error('✓ Token acquired and cached successfully\n');
    return tokenResponse.token;
  }

  /**
   * Get Microsoft Graph token (uses same token with both scopes)
   */
  async getGraphToken(): Promise<string> {
    return this.getToken();
  }

  /**
   * Force token refresh
   */
  async refreshToken(): Promise<string> {
    console.error('Forcing token refresh...');
    this.cachedToken = null;
    await this.deleteCachedToken();
    return this.getToken();
  }

  /**
   * Load cached token from disk
   */
  private async loadCachedToken(): Promise<void> {
    try {
      const data = await fs.readFile(this.tokenFilePath, 'utf-8');
      this.cachedToken = JSON.parse(data);
    } catch (error) {
      // Token file doesn't exist or is invalid, ignore
      this.cachedToken = null;
    }
  }

  /**
   * Save token to disk
   */
  private async saveCachedToken(): Promise<void> {
    if (!this.cachedToken) return;

    try {
      await fs.mkdir(this.config.tokenCacheDir, { recursive: true });
      await fs.writeFile(
        this.tokenFilePath,
        JSON.stringify(this.cachedToken, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('Warning: Failed to cache token to disk:', error);
    }
  }

  /**
   * Delete cached token
   */
  private async deleteCachedToken(): Promise<void> {
    try {
      await fs.unlink(this.tokenFilePath);
    } catch (error) {
      // Ignore errors
    }
  }

  /**
   * Check if token is expired or will expire soon (within 5 minutes)
   */
  isTokenExpiringSoon(): boolean {
    if (!this.cachedToken) return true;
    const fiveMinutes = 5 * 60 * 1000;
    return this.cachedToken.expiresOn < Date.now() + fiveMinutes;
  }
}
