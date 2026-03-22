const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "Q7osXOTtrC85KqrVwtb8-FBBsVTQKwmvCLuIXz9zFSM";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.log(JSON.stringify(data, null, 2)); }
  return { status: r.status, data };
}

async function main() {
  // Step 1: GET one active department
  const deptRes = await api("GET", "/department?isInactive=false&count=1&fields=id");
  let deptId: number;
  if (deptRes.status === 200 && deptRes.data.count > 0) {
    deptId = deptRes.data.values[0].id;
    console.log("Department ID:", deptId);
  } else {
    // Create a minimal department
    const createDept = await api("POST", "/department?fields=id", { name: "Avdeling" });
    deptId = createDept.data.value.id;
    console.log("Created department ID:", deptId);
  }

  // Step 2: POST employee with nested employment
  const empRes = await api("POST", "/employee?fields=*,employments(*)", {
    firstName: "Bjørn",
    lastName: "Neset",
    dateOfBirth: "1996-02-21",
    email: "bjrn.neset@example.org",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [
      {
        startDate: "2026-06-16"
      }
    ]
  });

  if (empRes.status === 201) {
    const v = empRes.data.value;
    console.log("Employee created:", v.id, v.firstName, v.lastName);
    console.log("DOB:", v.dateOfBirth, "Email:", v.email);
    console.log("Employment startDate:", v.employments?.[0]?.startDate);
  } else if (empRes.status === 422) {
    // Check for division repair
    const msgs = empRes.data.validationMessages || [];
    const needsDivision = msgs.some((m: any) => m.field === "employments.division.id");
    if (needsDivision) {
      console.log("Division required — fetching...");
      const divRes = await api("GET", "/division?count=1&fields=id");
      const divId = divRes.data.values[0].id;
      const retry = await api("POST", "/employee?fields=*,employments(*)", {
        firstName: "Bjørn",
        lastName: "Neset",
        dateOfBirth: "1996-02-21",
        email: "bjrn.neset@example.org",
        userType: "NO_ACCESS",
        department: { id: deptId },
        employments: [
          {
            startDate: "2026-06-16",
            division: { id: divId }
          }
        ]
      });
      if (retry.status === 201) {
        const v = retry.data.value;
        console.log("Employee created (with division):", v.id, v.firstName, v.lastName);
        console.log("DOB:", v.dateOfBirth, "Email:", v.email);
        console.log("Employment startDate:", v.employments?.[0]?.startDate);
      }
    }
  }
}

main();
