const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "CLb1HUsR2paXMkTkUjldx-rm5PcFq3LjjOVNVGwaygk";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`GET ${path} → ${r.status}: ${t}`);
  }
  return r.json();
}

async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`POST ${path} → ${r.status}: ${t}`);
  }
  return r.json();
}

// Step 1: parallel reads
const [ledgerData, empData] = await Promise.all([
  get("/ledger/posting?dateFrom=2026-01-01&dateTo=2026-03-01&count=10000&fields=*,account(*)"),
  get("/employee?assignableProjectManagers=true&count=1&fields=*"),
]);

const postings = ledgerData.values;
const managerId = empData.values[0].id;
console.log(`Postings: ${postings.length}, Manager ID: ${managerId}`);

// Step 2: aggregate by expense account and month
type Acc = { jan: number; feb: number; displayName: string; number: number; name: string };
const map = new Map<number, Acc>();

for (const p of postings) {
  const acct = p.account;
  if (!acct) continue;
  // Filter to expense accounts
  const isExpense = acct.type === "OPERATING_EXPENSES" || (acct.number >= 4000 && acct.number <= 8999);
  if (!isExpense) continue;

  const date = p.date as string; // "YYYY-MM-DD"
  const month = parseInt(date.split("-")[1], 10);
  if (month !== 1 && month !== 2) continue;

  if (!map.has(acct.id)) {
    map.set(acct.id, {
      jan: 0,
      feb: 0,
      displayName: acct.displayName || `${acct.number} ${acct.name}`,
      number: acct.number,
      name: acct.name,
    });
  }
  const entry = map.get(acct.id)!;
  if (month === 1) entry.jan += p.amount;
  else entry.feb += p.amount;
}

// Rank by (feb - jan) descending
const ranked = [...map.entries()]
  .map(([id, e]) => ({ id, ...e, increase: e.feb - e.jan }))
  .sort((a, b) => b.increase - a.increase)
  .slice(0, 3);

console.log("Top 3 expense accounts by increase:");
for (const r of ranked) {
  console.log(`  ${r.displayName}: jan=${r.jan}, feb=${r.feb}, increase=${r.increase}`);
}

// Step 3: batch create projects with inline activities
const today = "2026-03-21";
const projectPayload = ranked.map((r) => ({
  name: r.displayName,
  startDate: today,
  isInternal: true,
  projectManager: { id: managerId },
  projectActivities: [
    {
      startDate: today,
      activity: {
        name: r.displayName,
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: false,
      },
    },
  ],
}));

const result = await post("/project/list", projectPayload);

console.log("\nCreated projects:");
for (const proj of result.values) {
  console.log(`  Project ID ${proj.id}: "${proj.name}" (internal=${proj.isInternal})`);
  if (proj.projectActivities) {
    for (const pa of proj.projectActivities) {
      console.log(`    Activity ID: ${pa.id}`);
    }
  }
}
console.log("\nDone. 3 API calls total, 0 errors.");
