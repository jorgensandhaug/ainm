const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "lqce0vKnllhUjX9rIDrCZAdfmk-4HpmX1NeqJTNwz8M";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const res = await fetch(url, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    console.error(`ERROR ${res.status}:`, JSON.stringify(json, null, 2));
    throw new Error(`${method} ${path} → ${res.status}`);
  }
  return json;
}

// Step 1: parallel reads
const [postingsRes, empRes] = await Promise.all([
  api("GET", "/ledger/posting?dateFrom=2026-01-01&dateTo=2026-03-01&count=10000&fields=*,account(*)"),
  api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*"),
]);

const postings: any[] = postingsRes.values;
const managerId: number = empRes.values[0].id;
console.log(`Manager ID: ${managerId}, Postings: ${postings.length}`);

// Step 2: aggregate by expense account and month
const accountMap = new Map<number, { name: string; jan: number; feb: number }>();

for (const p of postings) {
  const acc = p.account;
  if (!acc) continue;
  const num = acc.number;
  // expense accounts: OPERATING_EXPENSES type or 4000-8999 range
  const isExpense = acc.type === "OPERATING_EXPENSES" || (num >= 4000 && num <= 8999);
  if (!isExpense) continue;

  const date = p.date as string; // "YYYY-MM-DD"
  const month = date.substring(5, 7); // "01" or "02"
  if (month !== "01" && month !== "02") continue;

  if (!accountMap.has(num)) {
    accountMap.set(num, { name: acc.displayName || `${num} ${acc.name}` || acc.name, jan: 0, feb: 0 });
  }
  const entry = accountMap.get(num)!;
  if (month === "01") entry.jan += p.amount;
  else entry.feb += p.amount;
}

// Step 3: rank by increase (feb - jan) descending
const ranked = [...accountMap.entries()]
  .map(([num, e]) => ({ num, name: e.name, increase: e.feb - e.jan, jan: e.jan, feb: e.feb }))
  .sort((a, b) => b.increase - a.increase);

console.log("\nTop expense accounts by increase:");
for (const r of ranked.slice(0, 10)) {
  console.log(`  ${r.num} ${r.name}: Jan=${r.jan}, Feb=${r.feb}, Δ=${r.increase}`);
}

const top3 = ranked.slice(0, 3);
console.log(`\nSelected top 3: ${top3.map(t => `${t.num} ${t.name} (+${t.increase})`).join(", ")}`);

// Step 4: POST /project/list with inline activities
const projectPayloads = top3.map(t => ({
  name: t.name,
  startDate: "2026-01-01",
  isInternal: true,
  projectManager: { id: managerId },
  projectActivities: [
    {
      startDate: "2026-01-01",
      activity: {
        name: t.name,
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: false,
      },
    },
  ],
}));

console.log("\nCreating projects...");
const createRes = await api("POST", "/project/list", projectPayloads);

const created = createRes.values || [createRes.value];
for (const proj of created) {
  console.log(`  Project ${proj.id}: "${proj.name}" (internal=${proj.isInternal}, manager=${proj.projectManager?.id})`);
  if (proj.projectActivities) {
    for (const pa of proj.projectActivities) {
      console.log(`    Activity ${pa.id}`);
    }
  }
}

console.log("\nDone. 3 API calls, 0 errors.");
