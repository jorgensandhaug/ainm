const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "9gXPQyymzUG65Kf044Y3EY1345G-RSmLgt1D9ZNmA7Q";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const FIELDS = "fields=*,employments(*)";

const payload = {
  firstName: "Hannah",
  lastName: "Becker",
  dateOfBirth: "1996-01-31",
  email: "hannah.becker@example.org",
  userType: "NO_ACCESS",
  employments: [{ startDate: "2026-07-15" }],
};

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const j = await r.json();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.log(JSON.stringify(j, null, 2));
  return { status: r.status, data: j };
}

async function run() {
  // Attempt 1: POST without department
  let res = await api("POST", `/employee?${FIELDS}`, payload);

  if (res.status === 201) {
    console.log("Created:", JSON.stringify(res.data.value, null, 2));
    return;
  }

  // Department repair branch
  if (res.status === 422) {
    const msgs = res.data.validationMessages || [];
    const needsDept = msgs.some((m: any) => m.field === "department.id");
    if (needsDept) {
      const deptRes = await api("GET", "/department?isInactive=false&count=1&fields=*");
      let deptId: number;
      if (deptRes.data.count > 0) {
        deptId = deptRes.data.values[0].id;
      } else {
        const newDept = await api("POST", "/department?fields=*", { name: "Avdeling" });
        deptId = newDept.data.value.id;
      }
      const withDept = { ...payload, department: { id: deptId } };
      res = await api("POST", `/employee?${FIELDS}`, withDept);

      if (res.status === 201) {
        console.log("Created:", JSON.stringify(res.data.value, null, 2));
        return;
      }

      // Division repair branch
      if (res.status === 422) {
        const msgs2 = res.data.validationMessages || [];
        const needsDiv = msgs2.some((m: any) => m.field === "employments.division.id");
        if (needsDiv) {
          const divRes = await api("GET", "/division?count=1&fields=*");
          const divId = divRes.data.values[0].id;
          const withDiv = {
            ...withDept,
            employments: [{ startDate: "2026-07-15", division: { id: divId } }],
          };
          res = await api("POST", `/employee?${FIELDS}`, withDiv);
          if (res.status === 201) {
            console.log("Created:", JSON.stringify(res.data.value, null, 2));
            return;
          }
        }
      }
    }
  }

  console.error("FAILED:", JSON.stringify(res.data, null, 2));
  process.exit(1);
}

run();
