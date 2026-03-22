const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "-R4fEjYcN-Fm3oTl-bRdnUA0tmJesbdjp4QIT-hAKVw";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.error("ERROR:", JSON.stringify(data).slice(0, 500)); throw new Error(`${r.status}`); }
  return data;
}

// Step 1: parallel reads
const [postings, employees] = await Promise.all([
  api("GET", "/ledger/posting?dateFrom=2026-01-01&dateTo=2026-03-01&count=10000&fields=*,account(*)"),
  api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*"),
]);

const managerId = employees.values[0].id;
console.log("Manager ID:", managerId);

// Step 2: aggregate by expense account and month
const accountMonthly: Record<number, { name: string; jan: number; feb: number }> = {};

for (const p of postings.values) {
  const acc = p.account;
  if (!acc) continue;
  // Expense accounts: type OPERATING_EXPENSES or fallback 4000-8999
  const isExpense = acc.type === "OPERATING_EXPENSES" || (acc.number >= 4000 && acc.number <= 8999);
  if (!isExpense) continue;

  const date = p.date as string; // "YYYY-MM-DD"
  const month = parseInt(date.split("-")[1]);
  if (month !== 1 && month !== 2) continue;

  if (!accountMonthly[acc.number]) {
    accountMonthly[acc.number] = { name: acc.displayName || `${acc.number} ${acc.name}` || acc.name, jan: 0, feb: 0 };
  }

  if (month === 1) accountMonthly[acc.number].jan += p.amount;
  else accountMonthly[acc.number].feb += p.amount;
}

// Step 3: rank by increase (feb - jan)
const ranked = Object.entries(accountMonthly)
  .map(([num, d]) => ({ number: parseInt(num), name: d.name, jan: d.jan, feb: d.feb, increase: d.feb - d.jan }))
  .sort((a, b) => b.increase - a.increase)
  .slice(0, 3);

console.log("\nTop 3 expense accounts by increase (Jan→Feb):");
for (const r of ranked) {
  console.log(`  ${r.name}: Jan=${r.jan}, Feb=${r.feb}, Increase=${r.increase}`);
}

// Step 4: batch create projects with inline activities
const projectPayloads = ranked.map(r => ({
  name: r.name,
  startDate: "2026-01-01",
  isInternal: true,
  projectManager: { id: managerId },
  projectActivities: [{
    startDate: "2026-01-01",
    activity: {
      name: r.name,
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: false,
    },
  }],
}));

const created = await api("POST", "/project/list", projectPayloads);
console.log("\nCreated projects:");
for (const proj of created.values) {
  console.log(`  ID=${proj.id}, name="${proj.name}", isInternal=${proj.isInternal}, manager=${proj.projectManager?.id}`);
  if (proj.projectActivities) {
    for (const pa of proj.projectActivities) {
      console.log(`    Activity ID=${pa.id}`);
    }
  }
}

// Step 5: verification GET (free)
const verify = await api("GET", "/project?isInternal=true&count=10&fields=*,projectActivities(*,activity(*)),projectManager(id,firstName,lastName)");
console.log("\nVerification - internal projects:");
for (const proj of verify.values) {
  console.log(`  ID=${proj.id}, name="${proj.name}", isInternal=${proj.isInternal}, manager=${proj.projectManager?.firstName} ${proj.projectManager?.lastName}`);
  if (proj.projectActivities) {
    for (const pa of proj.projectActivities) {
      console.log(`    Activity: name="${pa.activity?.name}", isChargeable=${pa.activity?.isChargeable}`);
    }
  }
}

console.log("\nDone. 3 API calls (2 reads + 1 batch create) + 1 free verification GET.");
