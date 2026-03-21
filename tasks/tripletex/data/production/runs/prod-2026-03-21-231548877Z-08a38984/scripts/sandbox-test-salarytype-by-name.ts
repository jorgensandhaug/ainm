// Test if salaryType: { name: "Fastlønn" } works inline in POST /salary/transaction
// If so, we can eliminate GET /salary/type (saving 1 call)
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
  // First, create a disposable employee for testing
  const empRes = await api("POST", "/employee", {
    firstName: "SalTypeTest",
    lastName: "ByName",
    email: `saltype-test-${Date.now()}@example.org`,
    dateOfBirth: "1990-01-01",
  });
  const empId = empRes.json.value.id;
  console.log(`Created test employee: ${empId}`);

  // Get an existing division
  const divRes = await api("GET", "/division?count=1&fields=*");
  const divId = divRes.json.values[0].id;
  console.log(`Division: ${divId}`);

  // Create employment with inline details
  await api("POST", "/employee/employment", {
    employee: { id: empId },
    startDate: "2026-03-01",
    isMainEmployer: true,
    taxDeductionCode: "loennFraHovedarbeidsgiver",
    division: { id: divId },
    employmentDetails: [{
      date: "2026-03-01",
      employmentType: "ORDINARY",
      employmentForm: "PERMANENT",
      remunerationType: "MONTHLY_WAGE",
      workingHoursScheme: "NOT_SHIFT",
      percentageOfFullTimeEquivalent: 100,
      monthlySalary: 30000,
      annualSalary: 360000,
    }],
  });

  // Test 1: salaryType by name
  console.log("\n=== Test 1: salaryType: { name: 'Fastlønn' } ===");
  const test1 = await api("POST", "/salary/transaction?generateTaxDeduction=true", {
    date: "2026-07-20",
    year: 2026,
    month: 7,
    paySlipsAvailableDate: "2026-07-20",
    payslips: [{
      employee: { id: empId },
      date: "2026-07-20",
      year: 2026,
      month: 7,
      specifications: [{
        employee: { id: empId },
        salaryType: { name: "Fastlønn" },
        description: "Test Fastlønn",
        year: 2026,
        month: 7,
        count: 1,
        rate: 30000,
        amount: 30000,
      }],
    }],
  });
  console.log("Result:", JSON.stringify(test1.json).slice(0, 500));

  // Test 2: salaryType by number (already known to fail, but verify)
  console.log("\n=== Test 2: salaryType: { number: 1 } ===");
  const test2 = await api("POST", "/salary/transaction?generateTaxDeduction=true", {
    date: "2026-08-20",
    year: 2026,
    month: 8,
    paySlipsAvailableDate: "2026-08-20",
    payslips: [{
      employee: { id: empId },
      date: "2026-08-20",
      year: 2026,
      month: 8,
      specifications: [{
        employee: { id: empId },
        salaryType: { number: 1 },
        description: "Test Fastlønn by number",
        year: 2026,
        month: 8,
        count: 1,
        rate: 30000,
        amount: 30000,
      }],
    }],
  });
  console.log("Result:", JSON.stringify(test2.json).slice(0, 500));

  // Test 3: Also test account by number in voucher (for documentation)
  console.log("\n=== Test 3: account: { number: 5000 } in voucher ===");
  const test3 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    voucherType: { name: "Lønnsbilag" },
    date: "2026-07-20",
    description: "Test account by number",
    postings: [
      { account: { number: 5000 }, description: "Test", amountGross: 1000, amountGrossCurrency: 1000, row: 1 },
      { account: { number: 1920 }, description: "Test", amountGross: -1000, amountGrossCurrency: -1000, row: 2 },
    ],
  });
  console.log("Result:", JSON.stringify(test3.json).slice(0, 500));
}

main().catch(console.error);
