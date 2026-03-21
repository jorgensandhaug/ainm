// Sandbox verification: confirm POST /project/list with inline projectActivities
// and verify the created activities have the correct fields.
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
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
  console.log(`  -> ${res.status} ${res.ok ? "OK" : "ERROR"}`);
  if (!res.ok) {
    console.error(JSON.stringify(data, null, 2));
  }
  return { ok: res.ok, status: res.status, data };
}

// 1. Verify ledger posting read with account expansion
console.log("=== Step 1: Ledger posting read ===");
const ledger = await api("GET", "/ledger/posting?dateFrom=2026-01-01&dateTo=2026-03-01&count=10000&fields=*,account(*)");
if (ledger.ok) {
  const postings = ledger.data.values ?? [];
  console.log(`  Postings returned: ${postings.length}`);

  // Check if account data comes back
  if (postings.length > 0) {
    const sample = postings[0];
    console.log(`  Sample posting: date=${sample.date} amount=${sample.amount}`);
    console.log(`  Account: id=${sample.account?.id} number=${sample.account?.number} name=${sample.account?.name} displayName=${sample.account?.displayName} type=${sample.account?.type}`);
  }

  // Aggregate expense accounts
  const accMap = new Map<number, { name: string; jan: number; feb: number }>();
  for (const p of postings) {
    const acc = p.account;
    if (!acc) continue;
    const isExpense = acc.type === "OPERATING_EXPENSES" || (!acc.type && acc.number >= 4000 && acc.number <= 8999);
    if (!isExpense) continue;
    const date = new Date(p.date);
    const month = date.getMonth();
    if (!accMap.has(acc.number)) {
      const displayName = acc.displayName || `${acc.number} ${acc.name}` || acc.name;
      accMap.set(acc.number, { name: displayName, jan: 0, feb: 0 });
    }
    const entry = accMap.get(acc.number)!;
    if (month === 0) entry.jan += p.amount;
    else if (month === 1) entry.feb += p.amount;
  }

  const ranked = [...accMap.entries()]
    .map(([num, e]) => ({ number: num, name: e.name, increase: e.feb - e.jan }))
    .sort((a, b) => b.increase - a.increase);

  console.log("\n  Expense account increases:");
  for (const r of ranked) {
    console.log(`    ${r.number} ${r.name}: increase=${r.increase}`);
  }
}

// 2. Verify employee endpoint
console.log("\n=== Step 2: Get assignable project manager ===");
const emp = await api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*");
let managerId: number | null = null;
if (emp.ok && emp.data.values?.length > 0) {
  managerId = emp.data.values[0].id;
  console.log(`  Manager ID: ${managerId}`);
}

// 3. Test batch project create with inline activities
if (managerId) {
  console.log("\n=== Step 3: POST /project/list with inline activities ===");
  const ts = Date.now();
  const testProjects = [
    {
      name: `SandboxVerify-A-${ts}`,
      startDate: "2026-01-01",
      isInternal: true,
      projectManager: { id: managerId },
      projectActivities: [{
        startDate: "2026-01-01",
        activity: {
          name: `SandboxVerify-A-${ts}`,
          activityType: "PROJECT_SPECIFIC_ACTIVITY",
          isChargeable: false,
        },
      }],
    },
    {
      name: `SandboxVerify-B-${ts}`,
      startDate: "2026-01-01",
      isInternal: true,
      projectManager: { id: managerId },
      projectActivities: [{
        startDate: "2026-01-01",
        activity: {
          name: `SandboxVerify-B-${ts}`,
          activityType: "PROJECT_SPECIFIC_ACTIVITY",
          isChargeable: false,
        },
      }],
    },
  ];

  const created = await api("POST", "/project/list", testProjects);
  if (created.ok) {
    const projects = created.data.values ?? created.data;
    console.log(`  Created ${projects.length} projects`);
    for (const p of projects) {
      console.log(`    Project: id=${p.id} name="${p.name}" isInternal=${p.isInternal} manager=${p.projectManager?.id}`);
      const pas = p.projectActivities ?? [];
      console.log(`    Activities: ${pas.length}`);
      for (const pa of pas) {
        console.log(`      PA: id=${pa.id} activity.name="${pa.activity?.name}" (may be undefined in response)`);
      }
    }

    // Verify activities were created correctly via GET /activity
    console.log("\n=== Verification: GET /activity for created project activities ===");
    for (const p of projects) {
      const pas = p.projectActivities ?? [];
      for (const pa of pas) {
        const actRes = await api("GET", `/activity/${pa.activity?.id ?? pa.id}?fields=*`);
        if (actRes.ok) {
          const a = actRes.data.value;
          console.log(`    Activity id=${a.id} name="${a.name}" type=${a.activityType} chargeable=${a.isChargeable}`);
        }
      }
    }
  }
}

console.log("\n=== Sandbox verification complete ===");
