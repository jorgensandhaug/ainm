const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "YZMbT3_XmpGhyykqcGu7sD8WOLvW2m0FwglADRl2mdE";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const description = `AUTOMATION HANDOVER DOCUMENTATION — Q1-2026

1. AI MODEL
Claude Opus 4.6 (claude-opus-4-6), built by Anthropic. Deployed via Claude Code CLI agent harness.

2. CONFIGURATION
- Provider: claude (Anthropic API via proxy)
- Model: claude-opus-4-6
- Effort: high
- Backend: proxy (europe-west1 Cloud Functions)
- Runtime: TypeScript executed with Bun
- Hard budget: 300s per task

3. TOOLS AND FUNCTIONS
- File I/O: Read, Write, Edit, Glob, Grep (codebase search)
- Bash: shell command execution (used to run bun scripts)
- WebFetch: HTTP content retrieval
- WebSearch: web search for current information
- Agent: spawns sub-agents for parallel research
- LSP: language server protocol for code intelligence
- TodoWrite: task tracking
- AskUserQuestion: user interaction (disabled during scored runs)
- Notebook editing, cron scheduling, team coordination tools

4. DECISION-MAKING PROCESS PER TASK TYPE
Step 1: Match task to a trusted standard in ./trusted-standards/
Step 2: If exact match found, read the .md file, then write and execute TypeScript directly
Step 3: If no exact match, check ./task-playbooks/ for guidance
Step 4: Only consult ./openapi.json as last resort
Step 5: Write TypeScript script to run-specific scripts directory, execute with bun
Step 6: After every write (POST/PUT/DELETE), GET to verify resulting state
Step 7: Log all responses to stdout

Task types and their standard flows:
- Create Customer: POST /customer (1 call)
- Create Invoice: POST /invoice or POST /order then PUT /order/:invoice
- Supplier Invoice: importDocument + two-step booking
- Travel Expense: POST /travelExpense with per-diem (system rates, not manual)
- Receipt/Expense: POST /ledger/voucher with GROSS amounts (VAT included)
- Bank Reconciliation: 9-step flow with statement import, matching, close
- Year-End Closing: Phase 0 module activation, then journal entries 8700/2920
- Project Lifecycle: POST /project, POST /order, PUT /order/:invoice

5. SPECIAL LOGIC AND RULES
- NEVER use beta API endpoints (always return 403)
- Authenticate with Basic Auth, username=0, password=session token
- Reuse POST/PUT response bodies instead of follow-up GETs when possible
- Avoid all avoidable 4xx errors (each one hurts score)
- Norwegian per-diem rates: use system government rates, never override
- Receipt amounts are GROSS (VAT already included)
- importDocument is NOT idempotent — never retry on ambiguous failure
- Preserve Unicode in all text fields exactly as given
- Organization numbers and postal addresses are Norwegian unless explicitly stated otherwise
- Description fields on supplier invoices are immutable after creation
- Knowledge priority: trusted-standards > task-playbooks > openapi.json`;

async function main() {
  const res = await fetch(`${BASE}/customer`, {
    method: "POST",
    headers: {
      "Authorization": AUTH,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Automation Handover Q1-2026",
      organizationNumber: "987654321",
      description,
    }),
  });

  const data = await res.json();
  console.log("POST /customer status:", res.status);
  console.log("Response:", JSON.stringify(data, null, 2));

  if (!res.ok) {
    console.error("FAILED to create customer");
    process.exit(1);
  }

  console.log("\nCustomer created successfully:");
  console.log("  ID:", data.value?.id);
  console.log("  Name:", data.value?.name);
  console.log("  OrgNumber:", data.value?.organizationNumber);
  console.log("  Description length:", data.value?.description?.length, "chars");
}

main();
