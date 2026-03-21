const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "lQeyCFl4-IRIuKNLuUuUwVgcn_r8oWBfyX_Saxdndd4";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!r.ok) {
    console.error(`${method} ${path} → ${r.status}`);
    console.error(JSON.stringify(json, null, 2));
    throw new Error(`${r.status}`);
  }
  console.log(`${method} ${path} → ${r.status}`);
  return json;
}

// Step 1: One decisive ledger read
const ledger = await api("GET", "/ledger/posting?dateFrom=2026-01-01&dateTo=2026-03-01&count=10000&fields=*,account(*)");
const postings: any[] = ledger.values;
console.log(`Postings fetched: ${postings.length}, fullResultSize: ${ledger.fullResultSize}`);

// Step 2: Aggregate by expense account and month
// Expense = account.type == OPERATING_EXPENSES, fallback 4000-8999
const byAcctMonth: Record<string, { jan: number; feb: number; name: string; number: number }> = {};

for (const p of postings) {
  const acct = p.account;
  if (!acct) continue;
  const isExpense = acct.type === "OPERATING_EXPENSES" ||
    (!acct.type && acct.number >= 4000 && acct.number <= 8999);
  if (!isExpense) continue;

  const d = new Date(p.date);
  const month = d.getMonth(); // 0=Jan, 1=Feb
  if (month !== 0 && month !== 1) continue;

  const key = String(acct.id);
  if (!byAcctMonth[key]) {
    byAcctMonth[key] = {
      jan: 0,
      feb: 0,
      name: acct.displayName || `${acct.number} ${acct.name}` || acct.name,
      number: acct.number,
    };
  }
  if (month === 0) byAcctMonth[key].jan += p.amount;
  else byAcctMonth[key].feb += p.amount;
}

// Step 3: Rank by (feb - jan) descending
const ranked = Object.entries(byAcctMonth)
  .map(([id, v]) => ({ id: Number(id), increase: v.feb - v.jan, ...v }))
  .sort((a, b) => b.increase - a.increase);

console.log("\nTop expense accounts by increase (feb - jan):");
for (const r of ranked.slice(0, 10)) {
  console.log(`  ${r.number} ${r.name}: jan=${r.jan}, feb=${r.feb}, increase=${r.increase}`);
}

const top3 = ranked.slice(0, 3);
console.log("\nSelected top 3:", top3.map(t => t.name));

// Step 4: Get assignable project manager
const empRes = await api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*");
const managerId = empRes.values[0].id;
console.log(`Project manager id: ${managerId}`);

// Step 5: POST /project/list with 3 internal projects
const projectPayloads = top3.map(t => ({
  name: t.name,
  startDate: "2026-01-01",
  isInternal: true,
  projectManager: { id: managerId },
}));

const projectRes = await api("POST", "/project/list", projectPayloads);
// projectRes could be fullResultSize+values or an array
const createdProjects = projectRes.values || projectRes;
console.log("\nCreated projects:");
for (const p of createdProjects) {
  console.log(`  id=${p.id}, name=${p.name}, isInternal=${p.isInternal}, manager=${p.projectManager?.id}`);
}

// Step 6: POST /project/projectActivity once per project
for (const proj of createdProjects) {
  const actRes = await api("POST", "/project/projectActivity", {
    project: { id: proj.id },
    startDate: "2026-01-01",
    activity: {
      name: proj.name,
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: false,
    },
  });
  const v = actRes.value || actRes;
  console.log(`  Activity created: id=${v.id}, project=${v.project?.id}, activity=${v.activity?.id || v.activity?.name}`);
}

console.log("\nDone.");
