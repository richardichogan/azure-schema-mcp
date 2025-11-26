// Quick test script to verify authentication and basic functionality
import 'dotenv/config';
import { DefaultAzureCredential } from '@azure/identity';
import { LogsQueryClient } from '@azure/monitor-query';

async function testAuth() {
  console.log('Testing Azure Schema MCP Server Authentication...\n');
  
  // Check environment variables
  console.log('Environment Variables:');
  console.log(`  AZURE_TENANT_ID: ${process.env.AZURE_TENANT_ID ? '✓ Set' : '✗ Missing'}`);
  console.log(`  AZURE_WORKSPACE_ID: ${process.env.AZURE_WORKSPACE_ID ? '✓ Set' : '✗ Missing'}`);
  console.log();

  try {
    // Test authentication
    console.log('Testing DefaultAzureCredential...');
    const credential = new DefaultAzureCredential();
    const token = await credential.getToken('https://api.loganalytics.io/.default');
    console.log('✓ Authentication successful!');
    console.log(`  Token expires: ${new Date(token.expiresOnTimestamp).toLocaleString()}\n`);

    // Test Log Analytics query
    console.log('Testing Log Analytics connection...');
    const client = new LogsQueryClient(credential);
    const workspaceId = process.env.AZURE_WORKSPACE_ID;
    
    // Simple query to list available tables (using search command)
    const query = 'search * | distinct $table | take 10';
    console.log(`  Workspace ID: ${workspaceId}`);
    console.log(`  Query: ${query}\n`);
    
    const result = await client.queryWorkspace(workspaceId, query, { duration: 'PT1M' });
    
    if (result.tables && result.tables.length > 0) {
      console.log('✓ Query successful!');
      console.log(`  Found ${result.tables[0].rows.length} tables:\n`);
      result.tables[0].rows.forEach(row => {
        console.log(`    - ${row[0]}`);
      });
    }
    
    console.log('\n✓ All tests passed! Server is ready to use.');
    
  } catch (error) {
    console.error('✗ Error:', error.message);
    if (error.code) {
      console.error(`  Error code: ${error.code}`);
    }
    if (error.statusCode) {
      console.error(`  Status code: ${error.statusCode}`);
    }
    console.error('\nTroubleshooting:');
    console.error('  1. Make sure you are logged in: az login');
    console.error('  2. Verify workspace access: az monitor log-analytics workspace show --ids /subscriptions/<sub>/resourceGroups/<rg>/providers/Microsoft.OperationalInsights/workspaces/<name>');
    console.error('  3. Check .env file has correct AZURE_TENANT_ID and AZURE_WORKSPACE_ID');
    process.exit(1);
  }
}

testAuth();
