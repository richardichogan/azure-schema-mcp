# Azure Schema MCP Server

An MCP (Model Context Protocol) server that provides AI assistants with the ability to discover Azure Log Analytics table schemas and Microsoft Graph API structures. This eliminates guesswork when writing KQL queries or calling APIs by allowing the AI to query actual column names and data types directly.

## Features

- **Table Schema Discovery**: Discover column names and types for any Log Analytics table
- **Query Testing**: Execute test KQL queries to see sample results
- **Table Listing**: List all available tables in your workspace
- **Graph API Introspection**: Discover properties of Microsoft Graph API endpoints
- **Intelligent Caching**: Two-layer caching (memory + disk) for fast responses
- **Device Code Authentication**: User-friendly authentication with automatic token management

## Prerequisites

- Node.js 18 or higher
- An Azure subscription with Log Analytics workspace
- Azure Active Directory tenant

## Installation

1. **Clone or download** this repository to a global location:
   ```powershell
   cd C:\Users\YourName\Development
   git clone <repository-url> azure-schema-mcp
   cd azure-schema-mcp
   ```

2. **Install dependencies**:
   ```powershell
   npm install
   ```

3. **Build the TypeScript code**:
   ```powershell
   npm run build
   ```

4. **Configure environment variables**:
   
   Copy `.env.example` to `.env`:
   ```powershell
   cp .env.example .env
   ```
   
   Edit `.env` and fill in your Azure details:
   ```env
   # Your Azure Active Directory tenant ID (GUID)
   AZURE_TENANT_ID=12345678-1234-1234-1234-123456789abc
   
   # Your Log Analytics workspace ID (GUID)
   AZURE_WORKSPACE_ID=87654321-4321-4321-4321-cba987654321
   
   # Optional: Cache directories (defaults shown below)
   TOKEN_CACHE_DIR=./.cache
   SCHEMA_CACHE_DIR=./.cache/schemas
   ```

## First-Time Authentication

The first time you use the MCP server, you'll need to authenticate with Azure:

1. When the server starts, you'll see a message like:
   ```
   ╔═══════════════════════════════════════════════════════════════╗
   ║                  AZURE AUTHENTICATION REQUIRED                 ║
   ╚═══════════════════════════════════════════════════════════════╝
   
     Please visit: https://microsoft.com/devicelogin
     And enter code: ABC123DEF
   ```

2. Open the URL in your browser
3. Enter the code shown
4. Sign in with your Azure credentials
5. Grant the requested permissions

The authentication token will be cached for ~90 days and automatically refreshed as needed.

## VS Code Integration

To use this MCP server with GitHub Copilot in VS Code:

1. Create or edit `.vscode/mcp.json` in any workspace:
   ```json
   {
     "servers": {
       "azure-schema-mcp": {
         "type": "stdio",
         "command": "node",
         "args": ["C:\\Users\\YourName\\Development\\azure-schema-mcp\\build\\index.js"],
         "env": {
           "NODE_ENV": "production"
         }
       }
     }
   }
   ```

2. Restart VS Code or reload the window

3. The AI assistant can now use the following tools:

## Available MCP Tools

### 1. `get_kql_table_schema`
Discover the schema of a Log Analytics table.

**Parameters:**
- `tableName` (string): Name of the table (e.g., "QualysHostDetectionV3_CL")

**Example:**
```
User: "What columns are in the SecurityAlert table?"
AI calls: get_kql_table_schema({ tableName: "SecurityAlert" })
```

**Returns:**
```json
{
  "tableName": "SecurityAlert",
  "columns": [
    { "name": "TimeGenerated", "type": "datetime", "ordinal": 0 },
    { "name": "AlertName", "type": "string", "ordinal": 1 },
    { "name": "Severity", "type": "string", "ordinal": 2 }
  ],
  "discoveredAt": "2025-11-19T10:30:00.000Z",
  "cached": false
}
```

### 2. `test_kql_query`
Execute a KQL query and return sample results.

**Parameters:**
- `query` (string): The KQL query to execute
- `maxRows` (number, optional): Maximum rows to return (default: 10)

**Example:**
```
User: "Show me sample data from SecurityAlert"
AI calls: test_kql_query({ 
  query: "SecurityAlert | project TimeGenerated, AlertName, Severity",
  maxRows: 5
})
```

### 3. `list_tables`
List all available tables in the Log Analytics workspace.

**Example:**
```
User: "What tables are available?"
AI calls: list_tables({})
```

**Returns:**
```json
{
  "tables": [
    "SecurityAlert",
    "SecurityEvent",
    "QualysHostDetectionV3_CL",
    "Heartbeat"
  ],
  "count": 4
}
```

### 4. `get_graph_api_schema`
Discover the structure of a Microsoft Graph API endpoint by fetching sample data.

**Parameters:**
- `endpoint` (string): Graph API endpoint path (e.g., "/security/alerts")
- `sampleSize` (number, optional): Number of sample records to fetch (default: 2)

**Example:**
```
User: "What fields does the /security/alerts endpoint return?"
AI calls: get_graph_api_schema({ 
  endpoint: "/security/alerts",
  sampleSize: 2
})
```

### 5. `refresh_schema`
Force refresh of cached schema for a table or endpoint.

**Parameters:**
- `source` (string): Table name or API endpoint to refresh

**Example:**
```
User: "Refresh the schema cache for SecurityAlert"
AI calls: refresh_schema({ source: "SecurityAlert" })
```


### 6. `generate_sdk_code`
Generate working TypeScript/JavaScript code patterns for querying a table.

**Parameters:**
- `tableName` (string): Name of the table (e.g., "QualysHostDetectionV3_CL")
- `framework` (string, optional): "react", "node", or "inline" (default: "inline")
- `authType` (string, optional): "msal-browser" or "default-credential" (default: "msal-browser")

**Example:**
```
User: "Generate React code to query SecurityAlert"
AI calls: generate_sdk_code({ 
  tableName: "SecurityAlert",
  framework: "react",
  authType: "msal-browser"
})
```

**Returns:**
Complete working code including imports, authentication setup, query execution, and error handling.

### 7. `generate_example_query`
Generate KQL query examples based on table schema and operation type.

**Parameters:**
- `tableName` (string): Name of the table
- `operation` (string): "simple_select", "filter", "aggregation", "parse_json", or "mv_expand"
- `timeRange` (string, optional): Time range in KQL format (default: "30d")

**Example:**
```
User: "Show me how to parse JSON in QualysHostDetectionV3_CL"
AI calls: generate_example_query({ 
  tableName: "QualysHostDetectionV3_CL",
  operation: "parse_json"
})
```

**Returns:**
Working KQL query with comments explaining each operator.

### 8. `detect_table_workspace`
Test which workspace contains a table and return metadata.

**Parameters:**
- `tableName` (string): Name of the table to search for
- `workspaceIds` (array, optional): Array of workspace IDs to check

**Example:**
```
User: "Which workspace has QualysHostDetectionV3_CL?"
AI calls: detect_table_workspace({ 
  tableName: "QualysHostDetectionV3_CL"
})
```

**Returns:**
```json
{
  "tableName": "QualysHostDetectionV3_CL",
  "foundIn": [
    {
      "workspaceId": "6f6d3595-d0ef-4469-bc55-1ee067c3cc13",
      "workspaceName": "secondary",
      "hasData": true,
      "rowCount": 27,
      "dateRange": {
        "earliest": "2025-10-20T00:00:00Z",
        "latest": "2025-11-19T10:23:45Z"
      }
    }
  ],
  "notFoundIn": []
}
```

### 9. `find_working_query_examples`
Search the codebase for existing working queries (requires file system access).

**Parameters:**
- `tableName` (string): Name of the table to find examples for

**Note:** This tool currently returns a placeholder message indicating that file system access is needed. Future versions may integrate with VS Code's workspace API.

## How Token Management Works

The MCP server manages Azure authentication tokens automatically:

1. **Initial Authentication**: Uses device code flow (user-friendly, no client secrets needed)
2. **Token Caching**: Tokens are cached to `.cache/azure-token.json` (90-day lifetime)
3. **Automatic Refresh**: Tokens are checked before each request and refreshed if expiring within 5 minutes
4. **Re-authentication**: If a token expires, you'll see the device code prompt again

## Cache Directories

Schemas are cached in two layers:

- **Memory Cache**: Fast access during the current session
- **Disk Cache**: Persists between server restarts at `.cache/schemas/`

Cached files are named like:
- `table_SecurityAlert.json` (for table schemas)
- `api_security_alerts.json` (for API schemas)

You can safely delete the `.cache` directory to clear all caches.

## Development

Run in development mode with auto-reload:
```powershell
npm run dev
```

Clean build artifacts:
```powershell
npm run clean
```

## Troubleshooting

### Authentication Errors
If you see authentication errors:
1. Delete `.cache/azure-token.json`
2. Restart the MCP server
3. Complete the device code flow again

### "Table not found" Errors
Make sure:
- Your workspace ID is correct in `.env`
- The table name is spelled correctly (case-sensitive)
- You have read permissions on the workspace

### Type Errors During Build
The current build may show TypeScript warnings about index signatures. These are non-critical if the server runs correctly.

## Use Cases

This MCP server solves common pain points in AI-assisted Azure development:

❌ **Before:**
```
User: "Query SecurityAlert for high severity alerts"
AI: "SecurityAlert | where SeverityLevel == 'High'"  // Wrong column name!
Result: Error - column 'SeverityLevel' not found
```

✅ **After:**
```
User: "Query SecurityAlert for high severity alerts"
AI: [calls get_kql_table_schema("SecurityAlert")]
AI: "SecurityAlert | where AlertSeverity == 'High'"  // Correct column name!
Result: Success!
```

## License

MIT

## Contributing

Issues and pull requests welcome!

