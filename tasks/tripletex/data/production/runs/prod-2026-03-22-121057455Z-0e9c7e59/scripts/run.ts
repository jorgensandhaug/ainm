const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "PzTIwLMJIablyvTQr8Jb5U1GixWwKfjt2RyG6XgQpNQ";
const HEADERS = {
  Authorization: "Basic " + btoa("0:" + TOKEN),
  "Content-Type": "application/json",
};

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: HEADERS };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  console.log(JSON.stringify(json, null, 2));
  if (!r.ok) throw new Error(`${r.status} ${method} ${path}: ${JSON.stringify(json)}`);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

// Step 1: parallel reads
const [postings, employees] = await Promise.all([
  api("GET", "/ledger/posting?dateFrom=2026-01-01&dateTo=2026-03-01&count=10000&fields=*,account(*)"),
  api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*"),
]);

const managerId = employees[0].id;
console.log("Manager ID:", managerId);

// Step 2: aggregate by expense account and month
const accMap: Record<number, { name: string; jan: number; feb: number }> = {};
for (const p of postings) {
  const acc = p.account;
  if (!acc) continue;
  const num = acc.number;
  if (num < 4000 || num > 8999) continue;
  const month = new Date(p.date).getMonth(); // 0=Jan, 1=Feb
  if (!accMap[num]) accMap[num] = { name: acc.displayName || `${num} ${acc.name}`, jan: 0, feb: 0 };
  if (month === 0) accMap[num].jan += p.amount;
  else if (month === 1) accMap[num].feb += p.amount;
}

// Step 3: rank by increase (feb - jan)
const ranked = Object.entries(accMap)
  .map(([num, d]) => ({ num: +num, name: d.name, increase: d.feb - d.jan }))
  .sort((a, b) => b.increase - a.increase);

console.log("Top 3 expense accounts by increase:");
const top3 = ranked.slice(0, 3);
for (const t of top3) console.log(`  ${t.name}: +${t.increase}`);

// Step 4: batch create projects with inline activities
const today = new Date().toISOString().slice(0, 10);
const projectPayload = top3.map((t) => ({
  name: t.name,
  startDate: today,
  isInternal: true,
  projectManager: { id: managerId },
  projectActivities: [
    {
      startDate: today,
      activity: {
        name: t.name,
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: false,
      },
    },
  ],
}));

const created = await api("POST", "/project/list", projectPayload);
console.log("Created projects:", created.length);

// Step 5: verification GET (free)
const verified = await api("GET", "/project?isInternal=true&count=10&fields=*,projectActivities(*,activity(*)),projectManager(id,firstName,lastName)");
for (const p of verified) {
  console.log(`Project: ${p.name}, isInternal: ${p.isInternal}, PM: ${p.projectManager?.id}`);
  for (const pa of (p.projectActivities || [])) {
    console.log(`  Activity: ${pa.activity?.name}, isChargeable: ${pa.activity?.isChargeable}`);
  }
}
