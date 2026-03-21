const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "HcxA9PhVEqUf7qXSg7kKjR8ddvlB0_6uhAY2zmwUiGw";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const headers = {
  "Content-Type": "application/json",
  Authorization: AUTH,
};

async function post(path: string, body: any) {
  const url = `${BASE}${path}`;
  console.log(`POST ${url}`);
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  console.log(`Status: ${res.status}`);
  console.log(text);
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

async function get(path: string) {
  const url = `${BASE}${path}`;
  console.log(`GET ${url}`);
  const res = await fetch(url, { headers });
  const text = await res.text();
  console.log(`Status: ${res.status}`);
  console.log(text);
  return { status: res.status, data: text ? JSON.parse(text) : null };
}

const employeePayload = {
  firstName: "Geir",
  lastName: "Neset",
  dateOfBirth: "1997-06-24",
  email: "geir.neset@example.org",
  userType: "NO_ACCESS",
  employments: [
    {
      startDate: "2026-10-15",
    },
  ],
};

async function run() {
  // Step 1: POST /employee
  let result = await post("/employee", employeePayload);

  // Handle department.id repair branch
  if (
    result.status === 422 &&
    result.data?.validationMessages?.some(
      (m: any) => m.field === "department.id"
    )
  ) {
    console.log("Department required — resolving...");
    const deptRead = await get("/department?isInactive=false&count=1&fields=*");
    let deptId: number;
    if (deptRead.data?.values?.length > 0) {
      deptId = deptRead.data.values[0].id;
    } else {
      const deptCreate = await post("/department", { name: "Avdeling" });
      deptId = deptCreate.data.value.id;
    }

    const payload2 = { ...employeePayload, department: { id: deptId } };
    result = await post("/employee", payload2);

    // Handle division.id repair branch after department repair
    if (
      result.status === 422 &&
      result.data?.validationMessages?.some(
        (m: any) => m.field === "employments.division.id"
      )
    ) {
      console.log("Division required — resolving...");
      const divRead = await get("/division?count=1&fields=*");
      if (divRead.data?.values?.length > 0) {
        const divId = divRead.data.values[0].id;
        const payload3 = {
          ...payload2,
          employments: [
            {
              startDate: "2026-10-15",
              division: { id: divId },
            },
          ],
        };
        result = await post("/employee", payload3);
      }
    }
  }

  // Handle division.id repair branch (without department issue)
  if (
    result.status === 422 &&
    result.data?.validationMessages?.some(
      (m: any) => m.field === "employments.division.id"
    )
  ) {
    console.log("Division required — resolving...");
    const divRead = await get("/division?count=1&fields=*");
    if (divRead.data?.values?.length > 0) {
      const divId = divRead.data.values[0].id;
      const payload3 = {
        ...employeePayload,
        employments: [
          {
            startDate: "2026-10-15",
            division: { id: divId },
          },
        ],
      };
      result = await post("/employee", payload3);
    }
  }

  if (result.status !== 201) {
    console.error("Employee creation failed!");
    return;
  }

  const employeeId = result.data.value.id;
  console.log(`Employee created with id: ${employeeId}`);

  // Step 2: Verify employment startDate
  await get(`/employee/employment?employeeId=${employeeId}&fields=*`);
}

run().catch(console.error);
