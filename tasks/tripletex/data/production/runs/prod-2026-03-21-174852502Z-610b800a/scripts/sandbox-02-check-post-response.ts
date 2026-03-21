// Test: does POST /salary/transaction return amounts in the response?
// Use an existing payroll-ready employee in the sandbox to confirm response shape.
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Find any payroll-ready employee
const empRes = await fetch(`${BASE}/employee?count=5&fields=*`, {
  headers: { Authorization: AUTH },
});
const empData = await empRes.json();
console.log("Employee count:", empData.values?.length);

// Find one with dateOfBirth set and employments
const ready = empData.values?.find((e: any) => e.dateOfBirth && e.employments?.length > 0);
if (!ready) {
  // Check if any have dateOfBirth set even if employments are sparse
  const withDob = empData.values?.find((e: any) => e.dateOfBirth);
  if (withDob) {
    console.log("Found employee with DOB:", withDob.id, withDob.firstName, withDob.lastName);
    console.log("employments:", JSON.stringify(withDob.employments));
  } else {
    console.log("No payroll-ready employees found. Listing all:");
    for (const e of empData.values || []) {
      console.log(`  id=${e.id} ${e.firstName} ${e.lastName} dob=${e.dateOfBirth} emps=${e.employments?.length}`);
    }
  }
} else {
  console.log("Found payroll-ready employee:", ready.id, ready.firstName, ready.lastName);
}

// Get salary types
const stRes = await fetch(`${BASE}/salary/type?count=1000&fields=*`, {
  headers: { Authorization: AUTH },
});
const stData = await stRes.json();
const fastlonn = stData.values?.find((t: any) => t.name === "Fastlønn");
const bonus = stData.values?.find((t: any) => t.name === "Bonus");
console.log("Fastlønn id:", fastlonn?.id);
console.log("Bonus id:", bonus?.id);

if (!ready && !empData.values?.find((e: any) => e.dateOfBirth)) {
  console.log("Cannot test POST response shape without a payroll-ready employee");
  process.exit(0);
}

// Use whichever employee has DOB
const emp = ready || empData.values?.find((e: any) => e.dateOfBirth);
if (!emp || !fastlonn || !bonus) process.exit(0);

// Check employment
const emplRes = await fetch(`${BASE}/employee/employment?employeeId=${emp.id}&count=20&fields=*`, {
  headers: { Authorization: AUTH },
});
const emplData = await emplRes.json();
console.log("Employments:", emplData.values?.length);
const activeEmpl = emplData.values?.find((e: any) => e.startDate);
if (activeEmpl) {
  console.log("Active employment found:", activeEmpl.id, "startDate:", activeEmpl.startDate);
} else {
  console.log("No active employment");
  process.exit(0);
}

// Do a test POST /salary/transaction for July 2026 to see the response shape
const txPayload = {
  date: "2026-07-01",
  year: 2026,
  month: 7,
  paySlipsAvailableDate: "2026-07-01",
  payslips: [{
    employee: { id: emp.id },
    specifications: [
      {
        employee: { id: emp.id },
        salaryType: { id: fastlonn.id },
        description: "Fastlønn",
        year: 2026,
        month: 7,
        count: 1,
        rate: 11111,
        amount: 11111,
      },
      {
        employee: { id: emp.id },
        salaryType: { id: bonus.id },
        description: "Bonus",
        year: 2026,
        month: 7,
        count: 1,
        rate: 2222,
        amount: 2222,
      },
    ],
  }],
};

const txRes = await fetch(`${BASE}/salary/transaction`, {
  method: "POST",
  headers: { Authorization: AUTH, "Content-Type": "application/json" },
  body: JSON.stringify(txPayload),
});
const txData = await txRes.json();
console.log("\n=== POST /salary/transaction response ===");
console.log("Status:", txRes.status);
console.log(JSON.stringify(txData, null, 2));
