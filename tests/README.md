# Azure Schema MCP Server - Test Suite

Comprehensive test suite using Vitest for unit, integration, and end-to-end testing.

## Test Structure

```
tests/
├── unit/                   # Unit tests (fast, isolated)
│   ├── auth.test.ts       # AuthManager tests
│   └── config.test.ts     # Configuration loading tests
├── integration/           # Integration tests (require Azure)
│   ├── azure-connectivity.test.ts  # Azure API tests
│   └── mcp-server.test.ts         # MCP protocol tests
└── e2e/                   # End-to-end tests (full workflow)
    └── tools.test.ts      # All 10 MCP tools E2E tests
```

## Running Tests

### Prerequisites
- Azure CLI authenticated: `az login`
- Valid `.env` file with AZURE_TENANT_ID and AZURE_WORKSPACE_ID
- Built server: `npm run build`

### Quick Commands

```powershell
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test suite
npm test tests/unit          # Unit tests only
npm test tests/integration   # Integration tests only
npm test tests/e2e          # End-to-end tests only

# Run specific test file
npm test auth.test.ts

# Watch mode (re-run on changes)
npm run test:watch

# UI mode (interactive)
npm run test:ui
```

## Test Categories

### 1. Unit Tests (Fast, No Azure Required)
**Location:** `tests/unit/`
**Duration:** < 1 second
**Purpose:** Test individual components in isolation

- **auth.test.ts**: Tests AuthManager structure and methods
- **config.test.ts**: Tests configuration loading and validation

**Run:** `npm test tests/unit`

### 2. Integration Tests (Requires Azure)
**Location:** `tests/integration/`
**Duration:** 5-10 seconds
**Purpose:** Test Azure connectivity and MCP protocol

- **azure-connectivity.test.ts**: 
  - Authentication with DefaultAzureCredential
  - Log Analytics query execution
  - Error handling for invalid queries
  
- **mcp-server.test.ts**:
  - MCP server startup
  - Tool registration
  - Request/response protocol
  - Error handling

**Run:** `npm test tests/integration`

### 3. End-to-End Tests (Full Workflow)
**Location:** `tests/e2e/`
**Duration:** 30-60 seconds
**Purpose:** Test complete workflows with real server

- **tools.test.ts**: Tests all 10 MCP tools:
  1. get_kql_table_schema
  2. test_kql_query
  3. list_tables
  4. get_graph_api_schema
  5. refresh_schema
  6. generate_sdk_code
  7. generate_example_query
  8. detect_table_workspace
  9. find_working_query_examples
  10. generate_graph_sdk_code

**Run:** `npm test tests/e2e`

## Test Coverage

Generate coverage report:

```powershell
npm run test:coverage
```

Coverage reports are generated in:
- **Console**: Text summary
- **HTML**: `coverage/index.html` (open in browser)
- **JSON**: `coverage/coverage-final.json` (for CI/CD)

**Coverage Goals:**
- Functions: > 80%
- Branches: > 70%
- Lines: > 80%
- Statements: > 80%

## CI/CD Integration

The test suite is designed for CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Run Tests
  run: npm test -- --run
  env:
    AZURE_TENANT_ID: ${{ secrets.AZURE_TENANT_ID }}
    AZURE_WORKSPACE_ID: ${{ secrets.AZURE_WORKSPACE_ID }}
```

**Note:** Integration and E2E tests require Azure authentication. For CI/CD:
- Use service principal with environment variables
- Or run unit tests only: `npm test tests/unit`

## Test Development

### Adding New Tests

1. **Unit Test Template:**
```typescript
import { describe, it, expect } from 'vitest';

describe('MyComponent', () => {
  it('should do something', () => {
    expect(true).toBe(true);
  });
});
```

2. **Integration Test Template:**
```typescript
import { describe, it, expect, beforeAll } from 'vitest';

describe('MyIntegration', () => {
  beforeAll(async () => {
    // Setup
  });

  it('should integrate correctly', async () => {
    // Test with real Azure
  });
});
```

### Best Practices

1. **Keep unit tests fast** - No Azure calls, mock dependencies
2. **Use descriptive test names** - "should do X when Y"
3. **One assertion per test** - Makes failures clear
4. **Clean up after tests** - Use afterEach/afterAll
5. **Test error cases** - Don't just test happy paths

## Debugging Tests

### Run single test with verbose output:
```powershell
npm test -- --reporter=verbose auth.test.ts
```

### Debug in VS Code:
1. Set breakpoint in test file
2. Run "Debug Current Test File" (F5)
3. Step through code

### Common Issues

**"Cannot find module"**
- Run `npm run build` first
- Check import paths use `.js` extensions

**"Authentication failed"**
- Run `az login`
- Check `.env` file exists and is correct
- Verify Azure permissions

**"Timeout exceeded"**
- Increase timeout in vitest.config.ts
- Check network connectivity to Azure
- Verify workspace ID is correct

## Performance

**Test Execution Times (approximate):**
- Unit tests: < 1s
- Integration tests: 5-10s
- End-to-end tests: 30-60s
- **Total:** ~1 minute

**Parallel Execution:**
Vitest runs tests in parallel by default. To run serially:
```powershell
npm test -- --no-threads
```

## Continuous Testing

Run tests automatically on file changes:

```powershell
npm run test:watch
```

This is useful during development to catch regressions immediately.

## Test Reports

After running tests, view detailed reports:

1. **Console Output**: Summary in terminal
2. **HTML Coverage**: Open `coverage/index.html`
3. **UI Dashboard**: Run `npm run test:ui`

## Next Steps

- [ ] Add performance benchmarks
- [ ] Add mutation testing
- [ ] Add contract tests for MCP protocol
- [ ] Add load tests for concurrent requests
- [ ] Add snapshot tests for generated code
