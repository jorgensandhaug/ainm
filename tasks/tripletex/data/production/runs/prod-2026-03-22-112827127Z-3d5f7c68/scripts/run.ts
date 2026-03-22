const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "_ppuyXz_Jdqam4662HJd7yRKsSMn3YAm4zI-QBy7z_s";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  const j = await r.json();
  if (!r.ok) { console.error("GET", path, r.status, JSON.stringify(j)); throw new Error(`GET ${path} ${r.status}`); }
  return j;
}

async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  console.log("POST", path, r.status, JSON.stringify(j, null, 2));
  if (!r.ok) throw new Error(`POST ${path} ${r.status}`);
  return j;
}

async function main() {
  // 1. Parallel: ledger postings + assignable project manager
  const [ledgerRes, empRes] = await Promise.all([
    get("/ledger/posting?dateFrom=2026-01-01&dateTo=2026-03-01&count=10000&fields=*,account(*)"),
    get("/employee?assignableProjectManagers=true&count=1&fields=*"),
  ]);

  const postings = ledgerRes.values;
  console.log(`Ledger postings: ${postings.length}`);

  const managerId = empRes.values[0].id;
  console.log(`Project manager id: ${managerId}`);

  // 2. Aggregate by expense account and month
  const acctMap: Record<number, { name: string; jan: number; feb: number }> = {};

  for (const p of postings) {
    const acct = p.account;
    if (!acct) continue;
    const num = acct.number;
    // Expense accounts: type OPERATING_EXPENSES or number 4000-8999
    const isExpense = acct.type === "OPERATING_EXPENSES" || (num >= 4000 && num <= 8999);
    if (!isExpense) continue;

    const date = p.date as string; // "YYYY-MM-DD"
    const month = parseInt(date.split("-")[1], 10);
    if (month !== 1 && month !== 2) continue;

    if (!acctMap[num]) {
      acctMap[num] = { name: acct.displayName || `${num} ${acct.name}` || `${num}`, jan: 0, feb: 0 };
    }
    if (month === 1) acctMap[num].jan += p.amount;
    else acctMap[num].feb += p.amount;
  }

  // 3. Rank by increase (feb - jan) descending
  const ranked = Object.entries(acctMap)
    .map(([num, d]) => ({ num: parseInt(num), name: d.name, jan: d.jan, feb: d.feb, increase: d.feb - d.jan }))
    .sort((a, b) => b.increase - a.increase);

  console.log("\nExpense account ranking (top 10):");
  for (const r of ranked.slice(0, 10)) {
    console.log(`  ${r.num} ${r.name}: Jan=${r.jan} Feb=${r.feb} Increase=${r.increase}`);
  }

  const top3 = ranked.slice(0, 3);
  console.log("\nTop 3 accounts with largest increase:");
  for (const t of top3) {
    console.log(`  ${t.num} ${t.name}: +${t.increase}`);
  }

  // 4. POST /project/list — batch create 3 internal projects with inline activities
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

  const createRes = await post("/project/list", projectPayload);

  // 5. Verification GET
  const verifyRes = await get("/project?isInternal=true&count=10&fields=*,projectActivities(*,activity(*)),projectManager(id,firstName,lastName)");
  console.log("\nVerification — internal projects:");
  for (const proj of verifyRes.values) {
    console.log(`  Project id=${proj.id} name="${proj.name}" isInternal=${proj.isInternal} manager=${JSON.stringify(proj.projectManager)}`);
    for (const pa of (proj.projectActivities || [])) {
      console.log(`    Activity id=${pa.id} name="${pa.activity?.name}" isChargeable=${pa.activity?.isChargeable}`);
    }
  }

  console.log("\nDone. 3 API calls + 1 verification GET.");
}

main().catch(e => { console.error(e); process.exit(1); });
