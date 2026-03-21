const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "TJsdRCG6ls63LHsuCI7CGCP7N2TwabN81DKSYyeIcnc";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const res = await fetch(url, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    console.error(`HTTP ${res.status}:`, JSON.stringify(data, null, 2));
    throw new Error(`HTTP ${res.status}`);
  }
  return data;
}

// Step 1: GET ledger postings Jan-Feb 2026
const ledger = await api("GET", "/ledger/posting?dateFrom=2026-01-01&dateTo=2026-03-01&count=10000&fields=*,account(*)");
const postings: any[] = ledger.values ?? [];
console.log(`Postings count: ${postings.length}, fullResultSize: ${ledger.fullResultSize}`);

// Step 2: Aggregate by expense account and month
const accountMap = new Map<number, { name: string; jan: number; feb: number }>();

for (const p of postings) {
  const acc = p.account;
  if (!acc) continue;
  // Filter expense accounts: type OPERATING_EXPENSES or fallback 4000-8999
  const isExpense = acc.type === "OPERATING_EXPENSES" || (acc.number >= 4000 && acc.number <= 8999);
  if (!isExpense) continue;

  const dateStr: string = p.date;
  const month = parseInt(dateStr.substring(5, 7), 10);
  if (month !== 1 && month !== 2) continue;

  const entry = accountMap.get(acc.id) ?? { name: acc.displayName || `${acc.number} ${acc.name}` || acc.name, jan: 0, feb: 0 };
  if (month === 1) entry.jan += p.amount;
  else entry.feb += p.amount;
  accountMap.set(acc.id, entry);
}

// Step 3: Rank by increase (feb - jan) descending
const ranked = [...accountMap.entries()]
  .map(([id, v]) => ({ id, name: v.name, increase: v.feb - v.jan, jan: v.jan, feb: v.feb }))
  .sort((a, b) => b.increase - a.increase)
  .slice(0, 3);

console.log("\nTop 3 expense accounts by increase:");
for (const r of ranked) {
  console.log(`  ${r.name}: Jan=${r.jan.toFixed(2)}, Feb=${r.feb.toFixed(2)}, Increase=${r.increase.toFixed(2)}`);
}

// Step 4: Get assignable project manager
const empRes = await api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*");
const managerId = empRes.values[0].id;
console.log(`\nProject manager id: ${managerId}`);

// Step 5: POST /project/list with 3 projects + inline activities
const today = "2026-03-21";
const projectPayload = ranked.map(r => ({
  name: r.name,
  startDate: today,
  isInternal: true,
  projectManager: { id: managerId },
  projectActivities: [{
    startDate: today,
    activity: {
      name: r.name,
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: false,
    },
  }],
}));

console.log("\nCreating projects:", JSON.stringify(projectPayload, null, 2));
const created = await api("POST", "/project/list", projectPayload);

console.log("\nCreated projects:");
for (const p of (created.values ?? created)) {
  console.log(`  Project id=${p.id}, name="${p.name}", isInternal=${p.isInternal}, manager=${p.projectManager?.id}`);
  for (const pa of (p.projectActivities ?? [])) {
    console.log(`    Activity id=${pa.id}, name="${pa.activity?.name}"`);
  }
}

console.log("\nDone. 3 API calls total.");
