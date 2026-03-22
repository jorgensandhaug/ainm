const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "P3v9RtE7YS1rjPF8CstfaXl45P6eG9qPv1DpiQXQT2Q";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers });
  if (!r.ok) { console.error(`GET ${path} → ${r.status}`, await r.text()); throw new Error(`GET failed ${r.status}`); }
  return r.json();
}

async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) { console.error(`POST ${path} → ${r.status}`, text); throw new Error(`POST failed ${r.status}`); }
  return JSON.parse(text);
}

// Step 1: parallel reads
const [postingsRes, employeeRes] = await Promise.all([
  get("/ledger/posting?dateFrom=2026-01-01&dateTo=2026-03-01&count=10000&fields=*,account(*)"),
  get("/employee?assignableProjectManagers=true&count=1&fields=*"),
]);

const postings = postingsRes.values;
const managerId = employeeRes.values[0].id;
console.log(`Postings: ${postings.length}, Manager ID: ${managerId}`);

// Step 2: aggregate by expense account and month
const accountMap = new Map<number, { name: string; jan: number; feb: number }>();

for (const p of postings) {
  const acc = p.account;
  if (!acc) continue;
  // Filter to expense accounts
  const isExpense = acc.type === "OPERATING_EXPENSES" || (acc.number >= 4000 && acc.number <= 8999);
  if (!isExpense) continue;

  const month = new Date(p.date).getMonth(); // 0=Jan, 1=Feb
  if (month !== 0 && month !== 1) continue;

  const key = acc.number;
  if (!accountMap.has(key)) {
    accountMap.set(key, { name: acc.displayName || `${acc.number} ${acc.name}` || acc.name, jan: 0, feb: 0 });
  }
  const entry = accountMap.get(key)!;
  if (month === 0) entry.jan += p.amount;
  else entry.feb += p.amount;
}

// Step 3: rank by (feb - jan) descending
const ranked = [...accountMap.entries()]
  .map(([num, e]) => ({ num, name: e.name, jan: e.jan, feb: e.feb, increase: e.feb - e.jan }))
  .sort((a, b) => b.increase - a.increase);

console.log("\nTop expense account increases (Feb - Jan):");
for (const r of ranked.slice(0, 5)) {
  console.log(`  ${r.name}: Jan=${r.jan}, Feb=${r.feb}, Increase=${r.increase}`);
}

const top3 = ranked.slice(0, 3);

// Step 4: batch create projects with inline activities
const projectPayload = top3.map(t => ({
  name: t.name,
  startDate: "2026-01-01",
  isInternal: true,
  projectManager: { id: managerId },
  projectActivities: [{
    startDate: "2026-01-01",
    activity: {
      name: t.name,
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: false,
    },
  }],
}));

console.log("\nCreating projects:", JSON.stringify(projectPayload, null, 2));

const createRes = await post("/project/list", projectPayload);
const created = createRes.values || createRes;

console.log("\nCreated projects:");
for (const p of created) {
  console.log(`  Project ID=${p.id}, name="${p.name}", isInternal=${p.isInternal}, manager=${p.projectManager?.id}`);
  if (p.projectActivities) {
    for (const pa of p.projectActivities) {
      console.log(`    Activity ID=${pa.id}`);
    }
  }
}

// Step 5: free verification GET
const verifyRes = await get("/project?isInternal=true&count=10&fields=*,projectActivities(*,activity(*)),projectManager(id,firstName,lastName)");
console.log("\nVerification - internal projects:");
for (const p of verifyRes.values) {
  console.log(`  Project ID=${p.id}, name="${p.name}", isInternal=${p.isInternal}, manager=${p.projectManager?.id} ${p.projectManager?.firstName} ${p.projectManager?.lastName}`);
  if (p.projectActivities) {
    for (const pa of p.projectActivities) {
      console.log(`    Activity ID=${pa.id}, name="${pa.activity?.name}", isChargeable=${pa.activity?.isChargeable}`);
    }
  }
}

console.log("\nDone. 3 API calls + 1 free verification GET.");
