const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function post(url: string, body: any) {
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await r.json();
  return { status: r.status, json };
}

async function run() {
  const ts = Date.now();

  // Get department
  const deptRes = await fetch(`${BASE}/department?isInactive=false&count=1&fields=id`, { headers: { Authorization: AUTH } });
  const deptJson = await deptRes.json();
  const deptId = deptJson.values?.[0]?.id;
  console.log("Dept ID:", deptId);

  // POST with dept — see full error
  const res = await post(`${BASE}/employee?fields=*,employments(*)`, {
    firstName: "SbTest" + ts,
    lastName: "WithDept",
    dateOfBirth: "1995-02-02",
    email: `wd${ts}@test.org`,
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{ startDate: "2026-08-01" }],
  });
  console.log("POST result:", res.status, JSON.stringify(res.json, null, 2));

  // If division needed, get division
  const msgs = res.json?.validationMessages || [];
  const needsDiv = msgs.some((m: any) => m.field === "employments.division.id");
  if (needsDiv) {
    console.log("\nDivision required. Fetching...");
    const divRes = await fetch(`${BASE}/division?count=1&fields=*`, { headers: { Authorization: AUTH } });
    const divJson = await divRes.json();
    console.log("Division:", JSON.stringify(divJson, null, 2));
    const divId = divJson.values?.[0]?.id;

    if (divId) {
      const res2 = await post(`${BASE}/employee?fields=*,employments(*)`, {
        firstName: "SbTest" + ts,
        lastName: "WithDeptDiv",
        dateOfBirth: "1995-02-02",
        email: `wdd${ts}@test.org`,
        userType: "NO_ACCESS",
        department: { id: deptId },
        employments: [{ startDate: "2026-08-01", division: { id: divId } }],
      });
      console.log("\nPOST with dept+div:", res2.status);
      if (res2.status === 201) {
        const v = res2.json.value;
        console.log("  employee:", v.id, v.firstName, v.lastName);
        console.log("  startDate:", v.employments?.[0]?.startDate);
      } else {
        console.log(JSON.stringify(res2.json, null, 2));
      }
    }
  }
}

run();
