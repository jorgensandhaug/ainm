// Test: can we skip GET /division and always omit division from employee payloads?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";
const RND = Math.floor(Math.random() * 100000);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Content-Type": "application/json", Authorization: AUTH },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (r.status >= 400) {
    console.log("ERROR:", JSON.stringify(json).slice(0, 500));
  }
  return { status: r.status, json };
}

async function main() {
  // First check if this sandbox HAS divisions
  const divRes = await api("GET", "/division?count=1&fields=*");
  console.log("Division exists:", divRes.json.values?.length > 0);
  if (divRes.json.values?.length > 0) {
    console.log("Division ID:", divRes.json.values[0].id);
  }

  // Get department (still needed)
  const deptRes = await api("GET", "/department?isInactive=false&count=1&fields=*");
  const deptId = deptRes.json.values?.[0]?.id;
  console.log("deptId:", deptId);

  // Test 1: Create employee WITHOUT division in employment
  const test1 = await api("POST", "/employee", {
    firstName: "NoDivTest",
    lastName: `Emp${RND}`,
    email: `nodiv${RND}@example.org`,
    dateOfBirth: "1990-01-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{ startDate: TODAY }],
  });
  console.log("Test 1 (no division):", test1.status === 201 ? "SUCCESS" : "FAILED");
  if (test1.status === 201) {
    console.log("Employee created without division, id:", test1.json.value.id);
  }

  // Test 2: Create employee WITH division (control)
  if (divRes.json.values?.length > 0) {
    const divId = divRes.json.values[0].id;
    const test2 = await api("POST", "/employee", {
      firstName: "WithDivTest",
      lastName: `Emp${RND}`,
      email: `withdiv${RND}@example.org`,
      dateOfBirth: "1990-06-20",
      userType: "NO_ACCESS",
      department: { id: deptId },
      employments: [{ startDate: TODAY, division: { id: divId } }],
    });
    console.log("Test 2 (with division):", test2.status === 201 ? "SUCCESS" : "FAILED");
    if (test2.status === 201) {
      console.log("Employee created with division, id:", test2.json.value.id);
    }
  }

  // Test 3: Can we also skip the department read by sending no department?
  const test3 = await api("POST", "/employee", {
    firstName: "NoDeptTest",
    lastName: `Emp${RND}`,
    email: `nodept${RND}@example.org`,
    dateOfBirth: "1990-03-10",
    userType: "NO_ACCESS",
    employments: [{ startDate: TODAY }],
  });
  console.log("Test 3 (no department):", test3.status === 201 ? "SUCCESS" : "FAILED");

  // Test 4: Can we create employee without employments at all?
  const test4 = await api("POST", "/employee", {
    firstName: "NoEmpTest",
    lastName: `Emp${RND}`,
    email: `noemp${RND}@example.org`,
    dateOfBirth: "1990-04-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
  });
  console.log("Test 4 (no employments):", test4.status === 201 ? "SUCCESS" : "FAILED");
  if (test4.status === 201) {
    console.log("Employee created without employments, id:", test4.json.value.id);
  }

  // Test 5: Can we combine the two ledger/account reads into one?
  // Current: GET /ledger/account?number=6590,2400 + GET /ledger/account?isBankAccount=true
  // Try: GET /ledger/account?number=6590,2400,1920&fields=* (1920 is common bank account)
  const accCombined = await api("GET", "/ledger/account?number=6590,2400,1920&fields=id,number,name,isBankAccount,bankAccountNumber");
  console.log("Combined account read:");
  for (const a of accCombined.json.values || []) {
    console.log(`  ${a.number}: id=${a.id}, isBankAccount=${a.isBankAccount}, bankAccountNumber=${a.bankAccountNumber}`);
  }

  // Also check what bank accounts exist
  const bankRes = await api("GET", "/ledger/account?isBankAccount=true&fields=id,number,name,bankAccountNumber");
  console.log("Bank accounts:");
  for (const a of bankRes.json.values || []) {
    console.log(`  ${a.number}: id=${a.id}, name=${a.name}, bankAccountNumber=${a.bankAccountNumber}`);
  }

  // Test 6: Can we move PM read to step 1 (parallel with dept+div+customer)?
  // Just verify PM read has no deps on dept/div/customer
  const pmRes = await api("GET", "/employee?assignableProjectManagers=true&count=1&fields=id,firstName,lastName");
  console.log("PM read (no deps):", pmRes.json.values?.[0]?.id);
}

main().catch(e => console.error("FATAL:", e.message));
