import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env file
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface Config {
  tenantId: string;
  workspaceId: string;
  tokenCacheDir: string;
  schemaCacheDir: string;
}

export function loadConfig(): Config {
  const tenantId = process.env.AZURE_TENANT_ID;
  const workspaceId = process.env.AZURE_WORKSPACE_ID;

  if (!tenantId) {
    throw new Error('AZURE_TENANT_ID environment variable is required');
  }

  if (!workspaceId) {
    throw new Error('AZURE_WORKSPACE_ID environment variable is required');
  }

  return {
    tenantId,
    workspaceId,
    tokenCacheDir: process.env.TOKEN_CACHE_DIR || path.join(process.cwd(), '.cache'),
    schemaCacheDir: process.env.SCHEMA_CACHE_DIR || path.join(process.cwd(), '.cache', 'schemas'),
  };
}
