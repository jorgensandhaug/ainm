const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "Zh2hJOKJXXuIe3APvrBzPma-L2GofmB614Z-urRBoIE";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.error("ERROR:", JSON.stringify(json).slice(0, 500)); throw new Error(`${r.status}`); }
  return json;
}

// Step 1: Fire both reads in parallel
const [postings, employees] = await Promise.all([
  api("GET", "/ledger/posting?dateFrom=2026-01-01&dateTo=2026-03-01&count=10000&fields=*,account(*)"),
  api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*"),
]);

const managerId = employees.values[0].id;
console.log("Manager ID:", managerId);

// Step 2: Aggregate expenses by account per month
type AccData = { number: number; name: string; displayName: string; jan: number; feb: number };
const accMap = new Map<number, AccData>();

for (const p of postings.values) {
  const acc = p.account;
  if (!acc) continue;
  // Filter to expense accounts
  const isExpense = acc.type === "OPERATING_EXPENSES" || (acc.number >= 4000 && acc.number <= 8999);
  if (!isExpense) continue;

  const date = new Date(p.date);
  const month = date.getMonth(); // 0=Jan, 1=Feb

  if (!accMap.has(acc.number)) {
    accMap.set(acc.number, { number: acc.number, name: acc.name, displayName: acc.displayName || `${acc.number} ${acc.name}`, jan: 0, feb: 0 });
  }
  const entry = accMap.get(acc.number)!;
  if (month === 0) entry.jan += p.amount;
  else if (month === 1) entry.feb += p.amount;
}

// Step 3: Rank by increase (feb - jan) descending
const ranked = [...accMap.values()]
  .map(a => ({ ...a, increase: a.feb - a.jan }))
  .sort((a, b) => b.increase - a.increase);

console.log("\nAll expense accounts ranked by increase:");
for (const a of ranked) {
  console.log(`  ${a.displayName}: Jan=${a.jan}, Feb=${a.feb}, Increase=${a.increase}`);
}

const top3 = ranked.slice(0, 3);
console.log("\nTop 3:");
for (const a of top3) {
  console.log(`  ${a.displayName}: +${a.increase}`);
}

// Step 4: Batch-create 3 internal projects with inline activities
const today = "2026-03-22";
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

const created = await api("POST", "/project/list", projectPayload);
console.log("\nCreated projects:");
for (const proj of created.values) {
  console.log(`  Project ID=${proj.id}, name="${proj.name}", isInternal=${proj.isInternal}`);
  if (proj.projectActivities) {
    for (const pa of proj.projectActivities) {
      console.log(`    Activity ID=${pa.id}`);
    }
  }
}

// Step 5: Verification (GETs are free)
const verify = await api("GET", "/project?isInternal=true&count=10&fields=*,projectActivities(*,activity(*)),projectManager(id,firstName,lastName)");
console.log("\nVerification - internal projects:");
for (const proj of verify.values) {
  console.log(`  Project ID=${proj.id}, name="${proj.name}", isInternal=${proj.isInternal}, manager=${proj.projectManager?.id}`);
  if (proj.projectActivities) {
    for (const pa of proj.projectActivities) {
      console.log(`    Activity: name="${pa.activity?.name}", isChargeable=${pa.activity?.isChargeable}`);
    }
  }
}

console.log("\nDone. 3 API calls + 1 free verification GET.");
