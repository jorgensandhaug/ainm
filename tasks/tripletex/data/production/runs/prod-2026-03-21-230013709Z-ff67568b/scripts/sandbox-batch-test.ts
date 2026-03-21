const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const RND = Math.random().toString(36).slice(2, 8);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} -> ${r.status}`);
  if (!r.ok) {
    console.error("  Error:", JSON.stringify(json).slice(0, 500));
  }
  return { status: r.status, ok: r.ok, data: json };
}

async function main() {
  // Get department
  const deptRes = await api("GET", "/department?isInactive=false&count=1&fields=*");
  const deptId = deptRes.data.values[0].id;
  console.log(`Dept: ${deptId}`);

  // Test 1: POST /employee/list with 2 employees
  console.log("\n=== Test 1: POST /employee/list ===");
  const empBatchRes = await api("POST", "/employee/list", [
    {
      firstName: "BatchTest1",
      lastName: `Test${RND}`,
      email: `batch1-${RND}@example.org`,
      dateOfBirth: "1985-01-15",
      userType: "NO_ACCESS",
      department: { id: deptId },
    },
    {
      firstName: "BatchTest2",
      lastName: `Test${RND}`,
      email: `batch2-${RND}@example.org`,
      dateOfBirth: "1987-06-20",
      userType: "NO_ACCESS",
      department: { id: deptId },
    },
  ]);
  if (empBatchRes.ok) {
    const emps = empBatchRes.data.values;
    console.log(`Created ${emps.length} employees: ${emps.map((e: any) => `${e.firstName}(${e.id})`).join(", ")}`);

    // Test 2: Create a project + activity, then test participant batch
    const custRes = await api("POST", "/customer", {
      name: `BatchTestCust ${RND}`,
    });
    const custId = custRes.data.value.id;

    const pmRes = await api("GET", "/employee?assignableProjectManagers=true&count=1&fields=id");
    const pmId = pmRes.data.values[0].id;

    const projRes = await api("POST", "/project", {
      name: `BatchTestProj ${RND}`,
      startDate: "2026-03-22",
      customer: { id: custId },
      projectManager: { id: pmId },
      isFixedPrice: true,
      fixedprice: 100000,
    });
    const projId = projRes.data.value.id;

    console.log("\n=== Test 2: POST /project/participant/list ===");
    const partBatchRes = await api("POST", "/project/participant/list", [
      {
        project: { id: projId },
        employee: { id: emps[0].id },
        adminAccess: true,
      },
      {
        project: { id: projId },
        employee: { id: emps[1].id },
        adminAccess: false,
      },
    ]);
    if (partBatchRes.ok) {
      const parts = partBatchRes.data.values;
      console.log(`Created ${parts.length} participants: ${parts.map((p: any) => `emp=${p.employee?.id} admin=${p.adminAccess}`).join(", ")}`);
    } else {
      console.log("Participant batch FAILED");
    }

    // Verify participants were created correctly
    console.log("\n=== Verify: readback participant adminAccess ===");
    const readback = await api("GET", `/project/participant?projectId=${projId}&fields=*`);
    if (readback.ok) {
      for (const p of readback.data.values) {
        console.log(`  Participant emp=${p.employee?.id} adminAccess=${p.adminAccess}`);
      }
    }
  } else {
    console.log("Employee batch FAILED");
  }
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
