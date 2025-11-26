import { DefaultAzureCredential, AccessToken } from '@azure/identity';
import { promises as fs } from 'fs';
import path from 'path';
import type { Config } from '../config.js';

interface CachedToken {
  token: string;
  expiresOn: number;
}

export class AuthManager {
  private config: Config;
  private credential: DefaultAzureCredential;
  private cachedToken: CachedToken | null = null;
  private tokenFilePath: string;

  constructor(config: Config) {
    this.config = config;
    this.tokenFilePath = path.join(config.tokenCacheDir, 'azure-token.json');

    // Use DefaultAzureCredential - tries multiple auth methods automatically:
    // 1. Environment variables (AZURE_CLIENT_ID, AZURE_CLIENT_SECRET, AZURE_TENANT_ID)
    // 2. Azure CLI (az login)
    // 3. Visual Studio Code
    // 4. Managed Identity (when running in Azure)
    this.credential = new DefaultAzureCredential({
      tenantId: config.tenantId,
    });
  }

  /**
   * Get an access token, using cached token if still valid or acquiring a new one
   */
  async getToken(scopes: string[] = ['https://api.loganalytics.io/.default']): Promise<string> {
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
    const tokenResponse = await this.credential.getToken(scopes);

    if (!tokenResponse) {
      throw new Error('Failed to acquire access token. Make sure you are authenticated with Azure CLI (run: az login)');
    }

    // Cache the token
    this.cachedToken = {
      token: tokenResponse.token,
      expiresOn: tokenResponse.expiresOnTimestamp,
    };

    // Save to disk
    await this.saveCachedToken();

    return tokenResponse.token;
  }

  /**
   * Get Microsoft Graph token
   */
  async getGraphToken(): Promise<string> {
    return this.getToken(['https://graph.microsoft.com/.default']);
  }

  /**
   * Force token refresh
   */
  async refreshToken(): Promise<string> {
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
