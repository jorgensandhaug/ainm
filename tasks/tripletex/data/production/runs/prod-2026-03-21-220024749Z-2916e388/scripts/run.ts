const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "hCMBZjsYc2KEc_TomtCYZRq_CN_7uYfgnPXEipWI-6w";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(BASE + path, { headers: H });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function post(path: string, body: any) {
  const r = await fetch(BASE + path, {
    method: "POST",
    headers: H,
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`POST ${path} → ${r.status} ${text}`);
  return JSON.parse(text);
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
const acctMap = new Map<number, { name: string; jan: number; feb: number }>();

for (const p of postings) {
  const acct = p.account;
  if (!acct) continue;
  // expense accounts: OPERATING_EXPENSES type or fallback 4000-8999
  const isExpense = acct.type === "OPERATING_EXPENSES" || (acct.number >= 4000 && acct.number <= 8999);
  if (!isExpense) continue;

  const date = p.date as string; // "YYYY-MM-DD"
  const month = parseInt(date.substring(5, 7));
  if (month !== 1 && month !== 2) continue;

  const id = acct.id as number;
  if (!acctMap.has(id)) {
    const displayName = acct.displayName || `${acct.number} ${acct.name}` || acct.name;
    acctMap.set(id, { name: displayName, jan: 0, feb: 0 });
  }
  const entry = acctMap.get(id)!;
  if (month === 1) entry.jan += p.amount;
  else entry.feb += p.amount;
}

// Step 3: rank by increase (feb - jan) descending
const ranked = [...acctMap.entries()]
  .map(([id, v]) => ({ id, ...v, increase: v.feb - v.jan }))
  .sort((a, b) => b.increase - a.increase);

console.log("Top expense increases:");
for (const r of ranked.slice(0, 5)) {
  console.log(`  ${r.name}: Jan=${r.jan}, Feb=${r.feb}, Δ=${r.increase}`);
}

const top3 = ranked.slice(0, 3);

// Step 4: batch create 3 internal projects with inline activities
const projectPayload = top3.map((a) => ({
  name: a.name,
  startDate: "2026-01-01",
  isInternal: true,
  projectManager: { id: managerId },
  projectActivities: [
    {
      startDate: "2026-01-01",
      activity: {
        name: a.name,
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: false,
      },
    },
  ],
}));

const result = await post("/project/list", projectPayload);

console.log("\nCreated projects:");
for (const p of result.values) {
  console.log(`  Project: ${p.name} (id=${p.id}, internal=${p.isInternal}, manager=${p.projectManager?.id})`);
  for (const pa of p.projectActivities || []) {
    console.log(`    Activity id=${pa.id}`);
  }
}

console.log("\nDone. 3 API calls, 0 errors expected.");
