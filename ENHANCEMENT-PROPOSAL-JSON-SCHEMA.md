# Schema MCP Server Enhancement Request

**Date**: November 21, 2025  
**Context**: Debugging Microsoft Defender for Endpoint (MDE) integration with SecurityAlert table  
**Problem**: Case sensitivity bug and missing schema information for nested JSON Entities field
**Status**: Under review - Implementation to begin Monday

---

## Current Limitation

The schema MCP server provides table-level schema (column names, types) but **does not handle dynamic nested JSON fields** like `SecurityAlert.Entities`, which contains provider-specific structures (MDATP vs ASC) with different field names and value enumerations.

---

## Required Enhancements

### 1. JSON Field Schema Discovery

**Tool Name**: `analyze_json_field_schema`

**Purpose**: Extract schema from dynamic JSON columns by sampling actual data

**Input**:
```json
{
  "tableName": "SecurityAlert",
  "jsonFieldName": "Entities",
  "timeRange": "30d",
  "sampleSize": 100
}
```

**Output**:
```json
{
  "fieldName": "Entities",
  "baseType": "dynamic (array of objects)",
  "commonStructures": [
    {
      "entityType": "host",
      "frequency": 87,
      "fields": {
        "HostName": { "type": "string", "exampleValues": ["vmwindesktop01", "vmwinsvr01"] },
        "RiskScore": { 
          "type": "string", 
          "distinctValues": ["none", "low", "medium", "high"],
          "valueCounts": { "none": 45, "low": 20, "medium": 15, "high": 7 },
          "caseVariations": false,
          "note": "Always lowercase - use case-insensitive comparison"
        },
        "HealthStatus": { 
          "type": "string", 
          "distinctValues": ["active", "inactive", "unknown"],
          "note": "Always lowercase"
        },
        "MdatpDeviceId": { "type": "string (GUID)", "exampleValues": ["d2443edf8ba056fc14a3fc5934f5aa4c747ed6f5"] },
        "OSFamily": { "type": "string", "distinctValues": ["Windows", "Linux", "MacOS"] },
        "Type": { "type": "string", "constantValue": "host" }
      }
    },
    {
      "entityType": "ip",
      "frequency": 95,
      "fields": {
        "Address": { "type": "string (IP address)", "exampleValues": ["10.0.0.6", "151.101.22.172"] },
        "Type": { "type": "string", "constantValue": "ip" }
      }
    }
  ]
}
```

**Why This Helps**:
- Reveals exact case of field values (lowercase "none" not "None")
- Shows which fields exist for each entity type
- Provides value enumerations for comparison operations
- Prevents case sensitivity bugs

---

### 2. Provider-Specific Schema Differences

**Tool Name**: `compare_provider_schemas`

**Purpose**: Show how SecurityAlert Entities differ by ProviderName (MDATP vs ASC vs others)

**Input**:
```json
{
  "tableName": "SecurityAlert",
  "jsonFieldName": "Entities",
  "groupByField": "ProviderName",
  "entityTypeFilter": "host",
  "timeRange": "30d"
}
```

**Output**:
```json
{
  "providers": {
    "MDATP": {
      "description": "Microsoft Defender for Endpoint (desktops/workstations)",
      "recordCount": 45,
      "deviceTypes": ["Desktop", "Laptop", "Workstation"],
      "hostEntityFields": {
        "MdatpDeviceId": { "coverage": "100%", "type": "string (GUID)" },
        "RiskScore": { "coverage": "98%", "distinctValues": ["none", "low", "medium", "high"] },
        "HealthStatus": { "coverage": "100%", "distinctValues": ["active", "inactive"] },
        "OnboardingStatus": { "coverage": "100%", "distinctValues": ["onboarded", "canBeOnboarded"] },
        "ExposureLevel": { "coverage": "0%", "note": "Field does not exist in MDATP alerts" }
      }
    },
    "ASC": {
      "description": "Azure Security Center / Microsoft Defender for Cloud (servers)",
      "recordCount": 32,
      "deviceTypes": ["Server", "VM"],
      "hostEntityFields": {
        "MdatpDeviceId": { "coverage": "0%", "note": "ASC does not provide MdatpDeviceId" },
        "RiskScore": { "coverage": "60%", "distinctValues": ["none", "low", "medium"] },
        "HealthStatus": { "coverage": "85%", "distinctValues": ["active", "unknown"] },
        "AzureResourceId": { "coverage": "100%", "type": "string (ARM resource ID)" }
      }
    }
  },
  "warning": "MDATP and ASC have different field availability - check coverage before using fields"
}
```

**Why This Helps**:
- Explains why desktops (MDATP) behave differently from servers (ASC)
- Shows which fields are provider-specific
- Prevents assumptions about field availability
- Reveals coverage gaps (ASC has no MdatpDeviceId)

---

### 3. KQL Query Validation with JSON Context

**Tool Name**: `validate_kql_with_json_context`

**Purpose**: Validate KQL queries that parse JSON fields and warn about common pitfalls

**Input**:
```kql
SecurityAlert
| where TimeGenerated > ago(30d)
| where ProviderName in ("MDATP", "ASC")
| extend EntitiesJson = parse_json(Entities)
| mv-expand Entity = EntitiesJson
| where Entity.Type == "host"
| project VMName = tostring(CompromisedEntity),
    RiskScore = tostring(Entity.RiskScore)
| where RiskScore != "None"  // <-- BUG: Should be "none" (lowercase)
```

**Output**:
```json
{
  "valid": true,
  "warnings": [
    {
      "line": 8,
      "severity": "HIGH",
      "message": "Case sensitivity issue: Entity.RiskScore returns lowercase values ('none', 'low', 'medium', 'high'), but you're comparing against 'None' (capital N). This will match ALL records including 'none' risk.",
      "suggestion": "Use case-insensitive comparison: tolower(RiskScore) != 'none' OR RiskScore !in ('none', 'None')",
      "affectedRecords": "~45 out of 77 records (58%) have RiskScore='none' and will match incorrectly"
    },
    {
      "line": 2,
      "severity": "MEDIUM",
      "message": "Provider 'ASC' has limited RiskScore coverage (60%). Consider handling null/empty values.",
      "suggestion": "Add: | where isnotempty(RiskScore)"
    }
  ],
  "suggestedQuery": "SecurityAlert\n| where TimeGenerated > ago(30d)\n| where ProviderName in (\"MDATP\", \"ASC\")\n| extend EntitiesJson = parse_json(Entities)\n| mv-expand Entity = EntitiesJson\n| where Entity.Type == \"host\"\n| project VMName = tostring(CompromisedEntity),\n    RiskScore = tolower(tostring(Entity.RiskScore))\n| where isnotempty(RiskScore) and RiskScore != 'none'"
}
```

**Why This Helps**:
- Catches case sensitivity bugs BEFORE execution
- Warns about field availability across providers
- Suggests fixes with corrected queries
- Saves query quota and debugging time

---

### 4. Sample Entity Data Retrieval

**Tool Name**: `get_sample_entities`

**Purpose**: Retrieve actual Entity JSON samples for inspection

**Input**:
```json
{
  "tableName": "SecurityAlert",
  "providerName": "MDATP",
  "entityType": "host",
  "limit": 5,
  "timeRange": "30d"
}
```

**Output**:
```json
{
  "samples": [
    {
      "ProviderName": "MDATP",
      "CompromisedEntity": "vmwindesktop01",
      "Entity": {
        "$id": "3",
        "Type": "host",
        "HostName": "vmwindesktop01",
        "RiskScore": "none",
        "HealthStatus": "active",
        "MdatpDeviceId": "d2443edf8ba056fc14a3fc5934f5aa4c747ed6f5",
        "OSFamily": "Windows",
        "OSVersion": "23H2",
        "OnboardingStatus": "onboarded",
        "LastIpAddress": { "Address": "10.0.0.6", "Type": "ip" }
      }
    },
    {
      "ProviderName": "MDATP",
      "CompromisedEntity": "vmwindesktop02",
      "Entity": {
        "$id": "5",
        "Type": "host",
        "HostName": "vmwindesktop02",
        "RiskScore": "high",
        "HealthStatus": "active",
        "MdatpDeviceId": "8f32ac4d9e76b1a052c8ef3d41a7e6f2b9c0d5e4",
        "OSFamily": "Windows",
        "OSVersion": "22H2"
      }
    }
  ],
  "observations": [
    "RiskScore is always lowercase ('none', 'high', not 'None' or 'High')",
    "All samples have MdatpDeviceId (MDATP provider always includes this)",
    "LastIpAddress is a nested object with Address and Type fields"
  ]
}
```

**Why This Helps**:
- Immediate visual confirmation of data structure
- Shows actual values, not inferred schema
- Reveals nesting depth and object structures
- Provides copy-paste examples for testing

---

### 5. Field Value Distribution Analysis

**Tool Name**: `analyze_field_value_distribution`

**Purpose**: Get statistical distribution of values for comparison operations

**Input**:
```json
{
  "tableName": "SecurityAlert",
  "jsonFieldPath": "Entities[Entity.Type=='host'].RiskScore",
  "groupBy": "ProviderName",
  "timeRange": "30d"
}
```

**Output**:
```json
{
  "fieldPath": "Entity.RiskScore (where Entity.Type == 'host')",
  "totalRecords": 77,
  "byProvider": {
    "MDATP": {
      "recordCount": 45,
      "distribution": {
        "none": { "count": 28, "percentage": 62 },
        "low": { "count": 9, "percentage": 20 },
        "medium": { "count": 5, "percentage": 11 },
        "high": { "count": 3, "percentage": 7 }
      },
      "nullOrEmpty": 0
    },
    "ASC": {
      "recordCount": 32,
      "distribution": {
        "none": { "count": 17, "percentage": 53 },
        "low": { "count": 11, "percentage": 34 },
        "medium": { "count": 4, "percentage": 13 }
      },
      "nullOrEmpty": 0,
      "note": "ASC alerts do not have 'high' risk scores"
    }
  },
  "caseAnalysis": {
    "allLowercase": true,
    "mixedCase": false,
    "allUppercase": false,
    "note": "All values are lowercase. Use case-insensitive comparisons."
  }
}
```

**Why This Helps**:
- Shows exact distribution of values
- Confirms case consistency (all lowercase)
- Reveals provider differences (ASC has no "high" risk)
- Helps understand why badges might not appear (62% are "none")

---

## Implementation Priority

### Phase 1 (Critical - Solves Current Issue)
1. ✅ `analyze_json_field_schema` - Would have caught lowercase "none" immediately
2. ✅ `validate_kql_with_json_context` - Would have warned about case sensitivity

### Phase 2 (High Value)
3. ✅ `get_sample_entities` - Quick debugging aid
4. ✅ `analyze_field_value_distribution` - Understand data patterns

### Phase 3 (Advanced)
5. ✅ `compare_provider_schemas` - Explains cross-provider differences

---

## Review Assessment (November 21, 2025)

### Overall Rating: **Highly Valuable - Proceed with Caution**

**Strengths**:
- Addresses real debugging pain (case sensitivity bug)
- Well-structured phased approach
- Comprehensive tool designs with clear examples
- Prevents future bugs through validation
- Provider-aware (critical for enterprise Azure)

**Risks & Challenges**:
1. **Complexity vs Simplicity**: Current MCP is elegantly simple; enhancements add complexity
2. **Implementation Time**: "2-3 weeks for Phase 1" - CSS-Helper MCP took 3 days and failed
3. **Data Sampling Costs**: Querying 100 samples has Log Analytics costs
4. **Provider Knowledge Maintenance**: Hardcoded provider info becomes brittle
5. **KQL Validation Complexity**: Parsing KQL correctly is a significant undertaking

### Recommended Approach: **Incremental Implementation**

**Week 1**: `get_sample_entities` only
- Simplest to implement (just query + JSON response)
- Immediate visual value
- Tests MCP enhancement pattern
- **STOP if this struggles** - don't repeat CSS-Helper failure pattern

**Week 2**: `analyze_json_field_schema` (IF Week 1 succeeds)
- Reuses sample query logic
- Adds distinct value analysis
- Cache results aggressively

**Week 3-4**: `analyze_field_value_distribution` (IF Week 2 succeeds)
- Group by provider
- Calculate statistics

**Future**: `validate_kql_with_json_context`
- Requires KQL parser (complex)
- Consider alternative approaches first
- May be better as separate VSCode extension

### Critical Success Factors

**DO**:
- Test each tool completely before adding next
- Start with simplest implementation
- Reuse existing patterns (caching, auth, structure)
- Handle errors gracefully
- Document as you go

**DON'T**:
- Build all tools at once (CSS-Helper mistake)
- Use complex parsing until simple approach exhausted
- Hardcode provider knowledge (make it data-driven)
- Skip testing with actual parameters
- Over-engineer (YAGNI principle)

### Stop Conditions

After 3-4 failed attempts on any tool:
1. STOP current approach
2. Document what failed and why
3. Ask user for direction
4. Consider simpler alternatives

**Success Pattern** (Azure-Schema auth fix):
- Clear problem identification
- Known solution
- Surgical implementation
- Rigorous testing
- Quick completion (90 minutes)

**Failure Pattern** (CSS-Helper MCP):
- Unclear problem
- Trial-and-error solutions
- Scope creep
- Premature confidence
- Extended attempts (3 days, abandoned)

---

## How This Would Have Prevented The Bug

### The Actual Bug
```typescript
// Badge condition (Line 159)
{data.hasMDEData && data.mdeRiskScore && data.mdeRiskScore !== 'None' && (
  // Badge renders
)}
```

**Problem**: SecurityAlert returns `RiskScore: "none"` (lowercase), but code checks `!== 'None'` (capital N).  
**Result**: Even desktops with "none" risk pass the condition because "none" !== "None" is TRUE.

### How Schema MCP Would Have Prevented This

#### Step 1: Developer runs `analyze_json_field_schema`
```bash
> analyze_json_field_schema SecurityAlert Entities
```

**Output shows**:
```
RiskScore: string
  Distinct values: ["none", "low", "medium", "high"]
  Case: ALL LOWERCASE
  ⚠️  WARNING: Always lowercase - use .toLowerCase() in comparisons
```

Developer immediately sees: "Oh, it's lowercase 'none', not 'None'!"

#### Step 2: Developer validates KQL query
```bash
> validate_kql_with_json_context "... | where RiskScore != 'None'"
```

**Output warns**:
```
⚠️  Case sensitivity bug detected!
   Line: where RiskScore != 'None'
   Issue: Field returns lowercase values, comparing against capital 'None'
   Suggestion: where tolower(RiskScore) != 'none'
```

Query is fixed BEFORE execution.

---

## Success Criteria

After implementing these enhancements, a developer should be able to:

1. **Discover** JSON field schemas without manual data inspection
2. **Validate** queries before execution and catch common pitfalls
3. **Compare** provider differences to avoid cross-provider bugs
4. **Sample** actual data structures for reference
5. **Analyze** value distributions for condition logic

**Time Saved**: ~2 hours of debugging → 5 minutes of schema discovery

---

## Next Steps (Monday Reconvene)

1. **Review this document** with fresh perspective
2. **Decision**: Proceed with Phase 1A (get_sample_entities) or defer?
3. **If proceed**: Create branch, implement first tool only
4. **Test rigorously**: With actual SecurityAlert data
5. **Document results**: Success or failure, what was learned
6. **Decide next step**: Continue to Phase 1B or stop

---

## Related Issues

- Case sensitivity in KQL string comparisons
- Dynamic JSON schema discovery in Log Analytics
- Provider-specific field availability (MDATP vs ASC)
- TypeScript type inference from Sentinel data

---

## References

- Original bug report: ACRE MDE integration debugging session
- CSS-Helper MCP failure: 3 days, 8 attempts, abandoned (documented in VIBE-CODING-REFLECTIONS-NOV-2025.md)
- Azure-Schema auth fix: 90 minutes, 1 attempt, success (documented in VIBE-CODING-REFLECTIONS-NOV-2025.md)

---

**Status**: ⏸️ Paused for weekend - Resume Monday  
**Priority**: HIGH (would prevent common debugging issues)  
**Estimated Phase 1A**: 4-8 hours (if follows auth fix pattern)  
**Risk Level**: MEDIUM (manageable if incremental approach followed)

---

*Saved: November 21, 2025*  
*Next Review: Monday, November 24, 2025*
