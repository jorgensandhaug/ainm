// Test if salaryType: { name: "Fastlønn" } works inline
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (res.status >= 400) console.error("ERROR:", JSON.stringify(json).slice(0, 800));
  return { status: res.status, json };
}

async function main() {
  // Find an existing employee with employment in the sandbox
  const empRes = await api("GET", "/employee?count=5&fields=*");
  const employees = empRes.json.values || [];

  // Find one with dateOfBirth and employments
  let targetEmp: any = null;
  for (const e of employees) {
    if (e.dateOfBirth && e.employments && e.employments.length > 0) {
      targetEmp = e;
      break;
    }
  }

  if (!targetEmp) {
    console.log("No payroll-ready employee found, listing all:");
    for (const e of employees) {
      console.log(`  id=${e.id} ${e.firstName} ${e.lastName} dob=${e.dateOfBirth} emps=${e.employments?.length || 0}`);
    }
    // Use the first employee with dateOfBirth and try to find their employment
    targetEmp = employees.find((e: any) => e.dateOfBirth);
    if (!targetEmp) {
      console.log("No employee with dateOfBirth found");
      return;
    }

    // Check employment
    const emplRes = await api("GET", `/employee/employment?employeeId=${targetEmp.id}&count=20&fields=*`);
    console.log("Employments:", JSON.stringify(emplRes.json.values?.map((e: any) => ({ id: e.id, start: e.startDate, div: e.division?.id }))).slice(0, 500));
  }

  console.log(`Using employee: id=${targetEmp.id} ${targetEmp.firstName} ${targetEmp.lastName}`);

  // Also get the salary type IDs for comparison
  const stRes = await api("GET", "/salary/type?count=10&fields=*");
  const fastlonn = stRes.json.values?.find((s: any) => s.name === "Fastlønn" || s.number === 1);
  const bonus = stRes.json.values?.find((s: any) => s.name === "Bonus");
  console.log(`Fastlønn: id=${fastlonn?.id} name=${fastlonn?.name} number=${fastlonn?.number}`);
  console.log(`Bonus: id=${bonus?.id} name=${bonus?.name} number=${bonus?.number}`);

  // Test 1: salaryType by name
  console.log("\n=== Test 1: salaryType: { name: 'Fastlønn' } ===");
  const test1 = await api("POST", "/salary/transaction?generateTaxDeduction=true", {
    date: "2026-09-20",
    year: 2026,
    month: 9,
    paySlipsAvailableDate: "2026-09-20",
    payslips: [{
      employee: { id: targetEmp.id },
      date: "2026-09-20",
      year: 2026,
      month: 9,
      specifications: [{
        employee: { id: targetEmp.id },
        salaryType: { name: "Fastlønn" },
        description: "Test Fastlønn by name",
        year: 2026,
        month: 9,
        count: 1,
        rate: 10000,
        amount: 10000,
      }],
    }],
  });
  console.log("Result:", JSON.stringify(test1.json).slice(0, 500));

  // Test 2: If test 1 failed, try with both name and number
  if (test1.status >= 400) {
    console.log("\n=== Test 2: salaryType: { name: 'Fastlønn', number: 1 } ===");
    const test2 = await api("POST", "/salary/transaction?generateTaxDeduction=true", {
      date: "2026-10-20",
      year: 2026,
      month: 10,
      paySlipsAvailableDate: "2026-10-20",
      payslips: [{
        employee: { id: targetEmp.id },
        date: "2026-10-20",
        year: 2026,
        month: 10,
        specifications: [{
          employee: { id: targetEmp.id },
          salaryType: { name: "Fastlønn", number: 1 },
          description: "Test Fastlønn by name+number",
          year: 2026,
          month: 10,
          count: 1,
          rate: 10000,
          amount: 10000,
        }],
      }],
    });
    console.log("Result:", JSON.stringify(test2.json).slice(0, 500));
  }
}

main().catch(console.error);
