// Test: create salary transaction (no voucher) with existing sandbox employee
// to determine if POST /salary/transaction alone creates ledger entries
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: h };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (r.status >= 400) console.log("ERROR:", JSON.stringify(json, null, 2));
  return { status: r.status, data: json };
}

async function main() {
  // Use known sandbox employee from previous proofs (id=18564428)
  // or find one that has employment
  const empRes = await api("GET", "/employee?count=5&fields=*");
  const employees = empRes.data?.values || [];

  // Find an employee with dateOfBirth and employments
  let emp = employees.find((e: any) => e.dateOfBirth && e.employments?.length > 0);
  if (!emp) {
    // Try a known id
    const knownRes = await api("GET", "/employee/18564428?fields=*");
    if (knownRes.status === 200) emp = knownRes.data?.value;
  }

  if (!emp) {
    console.log("No payroll-ready employee found in sandbox");
    return;
  }

  console.log(`Using employee: id=${emp.id}, name=${emp.firstName} ${emp.lastName}, dob=${emp.dateOfBirth}`);

  // Check employment
  const emplRes = await api("GET", `/employee/employment?employeeId=${emp.id}&count=5&fields=*`);
  const empls = emplRes.data?.values || [];
  console.log(`Employments: ${empls.length}`);
  if (empls.length > 0) {
    console.log(`  First: id=${empls[0].id}, startDate=${empls[0].startDate}, division=${empls[0].division?.id}`);
  }

  // Get salary types
  const salRes = await api("GET", "/salary/type?count=1000&fields=id,name");
  const salTypes = salRes.data?.values || [];
  const fastlonn = salTypes.find((s: any) => s.name === "Fastlønn");
  const bonus = salTypes.find((s: any) => s.name === "Bonus");
  console.log(`Fastlønn id=${fastlonn?.id}, Bonus id=${bonus?.id}`);

  // Use month 6 (June) to avoid conflicts with previous tests in March
  const YEAR = 2026;
  const MONTH = 6;
  const DATE = "2026-06-01";

  // Create salary transaction WITHOUT voucher
  const txRes = await api("POST", "/salary/transaction?generateTaxDeduction=true", {
    date: DATE,
    year: YEAR,
    month: MONTH,
    paySlipsAvailableDate: DATE,
    payslips: [{
      employee: { id: emp.id },
      specifications: [
        {
          employee: { id: emp.id },
          salaryType: { id: fastlonn.id },
          description: "Fastlønn",
          year: YEAR,
          month: MONTH,
          count: 1,
          rate: 46800,
          amount: 46800,
        },
        {
          employee: { id: emp.id },
          salaryType: { id: bonus.id },
          description: "Bonus",
          year: YEAR,
          month: MONTH,
          count: 1,
          rate: 13350,
          amount: 13350,
        },
      ],
    }],
  });

  if (txRes.status >= 400) {
    console.log("Salary transaction failed — trying different employee or period");
    return;
  }

  const txId = txRes.data?.value?.id;
  const payslipId = txRes.data?.value?.payslips?.[0]?.id;
  console.log(`Transaction id=${txId}, Payslip id=${payslipId}`);

  // Verify payslip
  const payslipRes = await api("GET", `/salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`);
  const ps = payslipRes.data?.value;
  console.log(`\n=== PAYSLIP STATE (NO VOUCHER CREATED) ===`);
  console.log(`grossAmount=${ps?.grossAmount}`);
  console.log(`amount=${ps?.amount} (net)`);
  console.log(`number=${ps?.number}`);
  console.log(`voucher=${JSON.stringify(ps?.voucher)}`);
  if (ps?.specifications) {
    for (const spec of ps.specifications) {
      console.log(`  ${spec.salaryType?.name}: amount=${spec.amount}`);
    }
  }

  // Check: does the payslip reference any voucher?
  console.log(`\n=== LEDGER IMPACT CHECK ===`);
  console.log(`Payslip voucher reference: ${ps?.voucher ? 'EXISTS' : 'NONE'}`);
  console.log(`Payslip number: ${ps?.number} (0 = draft, >0 = finalized)`);

  // Check: are there any ledger postings?
  const postingsRes = await api("GET", `/ledger/posting?dateFrom=2026-06-01&dateTo=2026-06-30&count=100&fields=*,account(number,name)`);
  const postings = postingsRes.data?.values || [];
  const salaryPostings = postings.filter((p: any) =>
    p.account?.number === 5000 || p.account?.number === 1920
  );
  console.log(`Salary-related ledger postings (5000/1920) in June: ${salaryPostings.length}`);
  for (const p of salaryPostings) {
    console.log(`  account ${p.account?.number}: amount=${p.amount}, amountGross=${p.amountGross}`);
  }

  console.log(`\n=== CONCLUSION ===`);
  if (salaryPostings.length === 0) {
    console.log("POST /salary/transaction does NOT create ledger entries.");
    console.log("A separate POST /ledger/voucher IS mandatory for ledger-entry scoring checks.");
    console.log("The 5-write path cannot be reduced to 4 writes.");
  } else {
    console.log("POST /salary/transaction DOES create ledger entries!");
    console.log("POST /ledger/voucher may be UNNECESSARY — potential 4-write path!");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
