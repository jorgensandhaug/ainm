const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "uh5IGfmd5keeo6Tb1k2uBPTUBYpKlnB2WtA2qJt0eMc";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${path} → ${r.status} ${await r.text()}`);
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
  // expense accounts: OPERATING_EXPENSES type or fallback 4000-8999
  const isExpense = acct.type === "OPERATING_EXPENSES" || (acct.number >= 4000 && acct.number <= 8999);
  if (!isExpense) continue;

  const date = p.date as string; // "YYYY-MM-DD"
  const month = parseInt(date.split("-")[1], 10);
  if (month !== 1 && month !== 2) continue;

  let entry = map.get(acct.id);
  if (!entry) {
    entry = { jan: 0, feb: 0, displayName: acct.displayName || `${acct.number} ${acct.name}`, number: acct.number, name: acct.name };
    map.set(acct.id, entry);
  }
  if (month === 1) entry.jan += p.amount;
  else entry.feb += p.amount;
}

// Step 3: rank by increase (feb - jan) descending
const ranked = [...map.entries()]
  .map(([id, e]) => ({ id, ...e, increase: e.feb - e.jan }))
  .sort((a, b) => b.increase - a.increase);

console.log("\nTop expense accounts by increase (Feb - Jan):");
for (const r of ranked.slice(0, 5)) {
  console.log(`  ${r.displayName}: Jan=${r.jan}, Feb=${r.feb}, Increase=${r.increase}`);
}

const top3 = ranked.slice(0, 3);

// Step 4: POST /project/list with inline projectActivities
const today = "2026-03-21";
const projectPayload = top3.map(a => ({
  name: a.displayName,
  startDate: today,
  isInternal: true,
  projectManager: { id: managerId },
  projectActivities: [{
    startDate: today,
    activity: {
      name: a.displayName,
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: false,
    },
  }],
}));

console.log("\nCreating projects:", JSON.stringify(projectPayload, null, 2));

const result = await post("/project/list", projectPayload);

// Step 5: verify from write response
console.log("\nCreated projects:");
for (const proj of result.values) {
  console.log(`  Project ID=${proj.id}, name="${proj.name}", isInternal=${proj.isInternal}, manager=${proj.projectManager?.id}`);
  for (const pa of (proj.projectActivities || [])) {
    console.log(`    Activity ID=${pa.id}`);
  }
}

console.log("\nDone. 3 API calls, 0 errors expected.");
