const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "aIfNL9CG4ZJOR53OU6ZTCPxMEaDyFE-1GZ0rukxD2Go";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  // Step 1: GET one active department
  const deptRes = await fetch(`${BASE}/department?isInactive=false&count=1&fields=id`, { headers: H });
  const deptData = await deptRes.json();
  console.log("GET /department", deptRes.status, JSON.stringify(deptData));
  const deptId = deptData.values?.[0]?.id;
  if (!deptId) throw new Error("No active department found");

  // Step 2: POST /employee with department at top level, employment with startDate only
  const body = {
    firstName: "Solveig",
    lastName: "Johansen",
    dateOfBirth: "1993-05-15",
    email: "solveig.johansen@example.org",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{ startDate: "2026-01-18" }],
  };

  const empRes = await fetch(`${BASE}/employee?fields=*,employments(*)`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(body),
  });
  const empData = await empRes.json();
  console.log("POST /employee", empRes.status, JSON.stringify(empData));

  if (empRes.status === 422) {
    // Check if division is required
    const msgs = empData.validationMessages || [];
    const needsDiv = msgs.some((m: any) => m.field === "employments.division.id");
    if (needsDiv) {
      console.log("Division required — fetching...");
      const divRes = await fetch(`${BASE}/division?count=1&fields=id`, { headers: H });
      const divData = await divRes.json();
      console.log("GET /division", divRes.status, JSON.stringify(divData));
      const divId = divData.values?.[0]?.id;
      if (!divId) throw new Error("No division found");

      body.employments = [{ startDate: "2026-01-18", division: { id: divId } } as any];
      const retryRes = await fetch(`${BASE}/employee?fields=*,employments(*)`, {
        method: "POST",
        headers: H,
        body: JSON.stringify(body),
      });
      const retryData = await retryRes.json();
      console.log("POST /employee (retry)", retryRes.status, JSON.stringify(retryData));
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
