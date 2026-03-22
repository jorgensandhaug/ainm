// Test with different month to avoid conflicts
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
  // Find all employees and pick one that works
  const empRes = await api("GET", "/employee?count=20&fields=id,firstName,lastName,dateOfBirth");
  const employees = (empRes.data?.values || []).filter((e: any) => e.dateOfBirth);
  console.log(`Found ${employees.length} employees with dateOfBirth`);

  // Check which have employment
  for (const emp of employees.slice(0, 3)) {
    console.log(`\nTrying employee id=${emp.id}, name=${emp.firstName} ${emp.lastName}`);
    const emplRes = await api("GET", `/employee/employment?employeeId=${emp.id}&count=5&fields=id,startDate,endDate`);
    const empls = emplRes.data?.values || [];
    if (empls.length === 0) {
      console.log("  No employment, skipping");
      continue;
    }
    console.log(`  Employment: id=${empls[0].id}, startDate=${empls[0].startDate}`);

    // Get salary types
    const salRes = await api("GET", "/salary/type?count=10&fields=id,name&name=Fastlønn");
    const fastlonn = salRes.data?.values?.[0];
    if (!fastlonn) { console.log("No Fastlønn found"); continue; }

    // Try month 9 (September) to avoid conflicts
    const YEAR = 2026;
    const MONTH = 9;
    const DATE = "2026-09-01";

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
        ],
      }],
    });

    if (txRes.status >= 400) {
      console.log("  Failed, trying next");
      continue;
    }

    const txId = txRes.data?.value?.id;
    const payslipId = txRes.data?.value?.payslips?.[0]?.id;
    console.log(`  Transaction id=${txId}, Payslip id=${payslipId}`);

    // Check payslip
    const psRes = await api("GET", `/salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`);
    const ps = psRes.data?.value;
    console.log(`\n=== PAYSLIP (NO VOUCHER) ===`);
    console.log(`  grossAmount=${ps?.grossAmount}`);
    console.log(`  number=${ps?.number}`);
    console.log(`  voucher=${JSON.stringify(ps?.voucher)}`);
    if (ps?.specifications) {
      for (const spec of ps.specifications) {
        console.log(`  spec: ${spec.salaryType?.name}: amount=${spec.amount}`);
      }
    }

    // Check ledger postings for September
    const postRes = await api("GET", `/ledger/posting?dateFrom=2026-09-01&dateTo=2026-09-30&count=100&fields=*,account(number,name)`);
    const postings = postRes.data?.values || [];
    console.log(`\n=== LEDGER POSTINGS (Sep 2026) ===`);
    console.log(`  Total postings: ${postings.length}`);
    const salaryPostings = postings.filter((p: any) => p.account?.number === 5000 || p.account?.number === 1920);
    console.log(`  Salary-related (5000/1920): ${salaryPostings.length}`);

    console.log(`\n=== CONCLUSION ===`);
    if (salaryPostings.length === 0 && ps?.number === 0) {
      console.log("CONFIRMED: POST /salary/transaction creates DRAFT payslip only (number=0, no ledger entries)");
      console.log("POST /ledger/voucher IS mandatory for ledger-entry scoring checks");
      console.log("5-write underconfigured path CANNOT be reduced to 4 writes");
    } else {
      console.log(`Payslip number=${ps?.number}, salary postings=${salaryPostings.length}`);
      console.log("Unexpected result — investigate further");
    }

    break;
  }
}

main().catch(e => { console.error(e); process.exit(1); });
