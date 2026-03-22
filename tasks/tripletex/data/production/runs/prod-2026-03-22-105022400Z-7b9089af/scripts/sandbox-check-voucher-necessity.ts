// Sandbox test: create payroll WITHOUT voucher, then inspect the resulting state
// to determine if the voucher is truly necessary for scoring
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
  // Create a disposable employee for this test
  const uid = Math.floor(Math.random() * 100000);
  const email = `sandbox-payroll-vouchertest-${uid}@example.org`;

  const empRes = await api("POST", "/employee", {
    firstName: "VoucherTest",
    lastName: `Employee${uid}`,
    email: email,
    dateOfBirth: "1990-01-01",
  });
  const empId = empRes.data?.value?.id;
  console.log(`Created employee id=${empId}`);

  // Get salary types
  const salRes = await api("GET", "/salary/type?count=1000&fields=id,name,number");
  const salTypes = salRes.data?.values || [];
  const fastlonn = salTypes.find((s: any) => s.name === "Fastlønn");
  const bonus = salTypes.find((s: any) => s.name === "Bonus");
  console.log(`Fastlønn id=${fastlonn?.id}, Bonus id=${bonus?.id}`);

  // Get a division
  const divRes = await api("GET", "/division?count=1&fields=*");
  const divId = divRes.data?.values?.[0]?.id;
  console.log(`Division id=${divId}`);

  // Create employment
  const emplRes = await api("POST", "/employee/employment", {
    employee: { id: empId },
    division: { id: divId },
    startDate: "2026-03-01",
    isMainEmployer: true,
    taxDeductionCode: "loennFraHovedarbeidsgiver",
    employmentDetails: [{
      date: "2026-03-01",
      employmentType: "ORDINARY",
      employmentForm: "PERMANENT",
      remunerationType: "MONTHLY_WAGE",
      workingHoursScheme: "NOT_SHIFT",
      percentageOfFullTimeEquivalent: 100,
      monthlySalary: 46800,
      annualSalary: 561600,
    }],
  });
  console.log(`Employment id=${emplRes.data?.value?.id}`);

  // Create salary transaction WITHOUT voucher
  const txRes = await api("POST", "/salary/transaction?generateTaxDeduction=true", {
    date: "2026-03-01",
    year: 2026,
    month: 3,
    paySlipsAvailableDate: "2026-03-01",
    payslips: [{
      employee: { id: empId },
      specifications: [
        {
          employee: { id: empId },
          salaryType: { id: fastlonn.id },
          description: "Fastlønn",
          year: 2026,
          month: 3,
          count: 1,
          rate: 46800,
          amount: 46800,
        },
        {
          employee: { id: empId },
          salaryType: { id: bonus.id },
          description: "Bonus",
          year: 2026,
          month: 3,
          count: 1,
          rate: 13350,
          amount: 13350,
        },
      ],
    }],
  });
  const txId = txRes.data?.value?.id;
  const payslipId = txRes.data?.value?.payslips?.[0]?.id;
  console.log(`Transaction id=${txId}, Payslip id=${payslipId}`);

  // Check: does the salary transaction itself create any ledger entries?
  const payslipRes = await api("GET", `/salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`);
  const ps = payslipRes.data?.value;
  console.log(`\n=== PAYSLIP (NO VOUCHER) ===`);
  console.log(`grossAmount=${ps?.grossAmount}, amount=${ps?.amount}, number=${ps?.number}`);
  console.log(`hasVoucher=${ps?.voucher !== null && ps?.voucher !== undefined}`);
  console.log(`voucher=${JSON.stringify(ps?.voucher)}`);
  if (ps?.specifications) {
    for (const spec of ps.specifications) {
      console.log(`  ${spec.salaryType?.name || spec.description}: amount=${spec.amount}`);
    }
  }

  // Check: any ledger postings for this employee/transaction?
  const postingsRes = await api("GET", `/ledger/posting?employeeId=${empId}&dateFrom=2026-03-01&dateTo=2026-03-31&count=100&fields=*`);
  const postings = postingsRes.data?.values || [];
  console.log(`\n=== LEDGER POSTINGS (NO VOUCHER) ===`);
  console.log(`Postings count: ${postings.length}`);
  for (const p of postings) {
    console.log(`  account=${p.account?.id}, amount=${p.amount}, amountGross=${p.amountGross}`);
  }

  console.log("\n=== CONCLUSION ===");
  console.log(`Without a manual Lønnsbilag voucher:`);
  console.log(`- Payslip exists: YES`);
  console.log(`- Payslip has correct grossAmount: ${ps?.grossAmount === 60150 ? 'YES' : 'NO'}`);
  console.log(`- Payslip has Skattetrekk: ${ps?.specifications?.some((s: any) => s.salaryType?.name === 'Skattetrekk') ? 'YES' : 'NO'}`);
  console.log(`- Ledger postings exist: ${postings.length > 0 ? 'YES' : 'NO'}`);
  console.log(`- If ledger postings don't exist, the voucher IS mandatory for scoring on ledger-entry checks`);
}

main().catch(e => { console.error(e); process.exit(1); });
