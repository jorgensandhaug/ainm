const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "pycEataYSPZBQkwZtmFgQaK0KgMG6CBpnuOWUhoyFE0";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const res = await fetch(url, {
    method,
    headers,
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

// Step 1: One decisive ledger read
const ledger = await api("GET", "/ledger/posting?dateFrom=2026-01-01&dateTo=2026-03-01&count=10000&fields=*,account(*)");
const postings: any[] = ledger.values ?? [];
console.log(`Postings returned: ${postings.length}`);

// Aggregate by expense account and month
const accMap = new Map<number, { name: string; jan: number; feb: number }>();

for (const p of postings) {
  const acc = p.account;
  if (!acc) continue;

  // Expense accounts: type OPERATING_EXPENSES, fallback to 4000-8999
  const isExpense = acc.type === "OPERATING_EXPENSES" ||
    (!acc.type && acc.number >= 4000 && acc.number <= 8999);
  if (!isExpense) continue;

  const date = new Date(p.date);
  const month = date.getMonth(); // 0=Jan, 1=Feb

  if (!accMap.has(acc.number)) {
    const displayName = acc.displayName || `${acc.number} ${acc.name}` || acc.name;
    accMap.set(acc.number, { name: displayName, jan: 0, feb: 0 });
  }
  const entry = accMap.get(acc.number)!;
  if (month === 0) entry.jan += p.amount;
  else if (month === 1) entry.feb += p.amount;
}

// Rank by increase (feb - jan) descending
const ranked = [...accMap.entries()]
  .map(([num, e]) => ({ number: num, name: e.name, increase: e.feb - e.jan }))
  .sort((a, b) => b.increase - a.increase);

console.log("\nExpense account increases (Feb - Jan):");
for (const r of ranked) {
  console.log(`  ${r.number} ${r.name}: +${r.increase}`);
}

const top3 = ranked.slice(0, 3);
console.log("\nTop 3:", top3.map(t => `${t.name} (+${t.increase})`).join(", "));

// Step 2: Get assignable project manager
const empRes = await api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*");
const managerId = empRes.values[0].id;
console.log(`Manager ID: ${managerId}`);

// Step 3: POST /project/list — batch create 3 internal projects with inline activities
const projectPayloads = top3.map(acc => ({
  name: acc.name,
  startDate: "2026-01-01",
  isInternal: true,
  projectManager: { id: managerId },
  projectActivities: [{
    startDate: "2026-01-01",
    activity: {
      name: acc.name,
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: false,
    },
  }],
}));

const created = await api("POST", "/project/list", projectPayloads);

console.log("\nCreated projects:");
for (const proj of (created.values ?? created)) {
  const pa = proj.projectActivities ?? [];
  console.log(`  Project id=${proj.id} name="${proj.name}" isInternal=${proj.isInternal} manager=${proj.projectManager?.id} activities=${pa.length}`);
  for (const a of pa) {
    console.log(`    Activity id=${a.id}`);
  }
}

console.log("\nDone. 3 API calls total.");
