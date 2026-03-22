const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "ecWfj_7MMDDZYasQFxBbEYLT5meinWJv2GMjwCE8fRI";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  if (!r.ok) {
    console.error(`${method} ${path} → ${r.status}`, JSON.stringify(json, null, 2));
    throw new Error(`${r.status}`);
  }
  return json;
}

// Step 1: parallel reads
const [postingsRes, employeeRes] = await Promise.all([
  api("GET", "/ledger/posting?dateFrom=2026-01-01&dateTo=2026-03-01&count=10000&fields=*,account(*)"),
  api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*"),
]);

const postings = postingsRes.values;
const managerId = employeeRes.values[0].id;
console.log(`Postings: ${postings.length}, Manager ID: ${managerId}`);

// Step 2: aggregate by expense account and month
const acctMap = new Map<number, { name: string; jan: number; feb: number }>();

for (const p of postings) {
  const acct = p.account;
  if (!acct) continue;
  // Filter expense accounts: OPERATING_EXPENSES type or fallback 4000-8999
  const isExpense = acct.type === "OPERATING_EXPENSES" || (acct.number >= 4000 && acct.number <= 8999);
  if (!isExpense) continue;

  const date = p.date as string;
  const month = parseInt(date.split("-")[1]);
  if (month !== 1 && month !== 2) continue;

  const id = acct.id as number;
  if (!acctMap.has(id)) {
    acctMap.set(id, { name: acct.displayName || `${acct.number} ${acct.name}`, jan: 0, feb: 0 });
  }
  const entry = acctMap.get(id)!;
  if (month === 1) entry.jan += p.amount;
  if (month === 2) entry.feb += p.amount;
}

// Rank by increase (feb - jan) descending
const ranked = [...acctMap.entries()]
  .map(([id, e]) => ({ id, ...e, increase: e.feb - e.jan }))
  .sort((a, b) => b.increase - a.increase);

console.log("\nTop expense accounts by increase:");
for (const r of ranked.slice(0, 5)) {
  console.log(`  ${r.name}: Jan=${r.jan}, Feb=${r.feb}, Increase=${r.increase}`);
}

const top3 = ranked.slice(0, 3);
const today = "2026-03-22";

// Step 3: batch create projects with inline activities
const projectPayload = top3.map(a => ({
  name: a.name,
  startDate: today,
  isInternal: true,
  projectManager: { id: managerId },
  projectActivities: [{
    startDate: today,
    activity: {
      name: a.name,
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: false,
    },
  }],
}));

const createRes = await api("POST", "/project/list", projectPayload);
console.log("\nCreated projects:");
for (const p of createRes.values) {
  console.log(`  Project ID=${p.id}, name="${p.name}", isInternal=${p.isInternal}, activities=${p.projectActivities?.length}`);
}

console.log("\nDone. 3 API calls, 0 errors.");
