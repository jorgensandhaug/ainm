// Try the known sandbox proof employee (id=18564428) with a fresh month
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
  if (r.status >= 400) console.log("  ERR:", JSON.stringify(json).substring(0, 300));
  return { status: r.status, data: json };
}

async function main() {
  // Check known sandbox employee
  const empRes = await api("GET", "/employee/18564428?fields=*");
  const emp = empRes.data?.value;
  if (!emp) { console.log("Employee not found"); return; }
  console.log(`Employee: id=${emp.id}, dob=${emp.dateOfBirth}`);

  const emplRes = await api("GET", `/employee/employment?employeeId=${emp.id}&count=5&fields=id,startDate,endDate`);
  const empls = emplRes.data?.values || [];
  console.log(`Employments: ${empls.map((e:any) => `${e.id}:${e.startDate}-${e.endDate}`).join(", ")}`);

  // Get salary type
  const salRes = await api("GET", "/salary/type?name=Fastlønn&count=1&fields=id,name");
  const fastlonn = salRes.data?.values?.[0];
  if (!fastlonn) { console.log("Fastlønn not found"); return; }

  // Use month 11 (November) to avoid conflicts
  const txRes = await api("POST", "/salary/transaction?generateTaxDeduction=true", {
    date: "2026-11-01",
    year: 2026,
    month: 11,
    paySlipsAvailableDate: "2026-11-01",
    payslips: [{
      employee: { id: emp.id },
      specifications: [{
        employee: { id: emp.id },
        salaryType: { id: fastlonn.id },
        description: "Fastlønn",
        year: 2026,
        month: 11,
        count: 1,
        rate: 46800,
        amount: 46800,
      }],
    }],
  });

  if (txRes.status >= 400) {
    console.log("Transaction failed");
    return;
  }

  const txId = txRes.data?.value?.id;
  const payslipId = txRes.data?.value?.payslips?.[0]?.id;
  console.log(`\nTransaction id=${txId}, Payslip id=${payslipId}`);

  // Check payslip state WITHOUT creating a voucher
  const psRes = await api("GET", `/salary/payslip/${payslipId}?fields=*,specifications(*,salaryType(*))`);
  const ps = psRes.data?.value;
  console.log(`\n=== PAYSLIP (NO VOUCHER) ===`);
  console.log(`grossAmount=${ps?.grossAmount}, net=${ps?.amount}`);
  console.log(`number=${ps?.number} (0=draft)`);
  console.log(`voucher=${JSON.stringify(ps?.voucher)}`);
  console.log(`compilation=${JSON.stringify(ps?.compilation)}`);
  if (ps?.specifications) {
    for (const spec of ps.specifications) {
      console.log(`  ${spec.salaryType?.name}: amount=${spec.amount}`);
    }
  }

  // Check ledger postings for November 2026
  const postRes = await api("GET", `/ledger/posting?dateFrom=2026-11-01&dateTo=2026-11-30&count=100&fields=amount,amountGross,account(number,name)`);
  const postings = postRes.data?.values || [];
  const salPosts = postings.filter((p: any) => [5000, 1920].includes(p.account?.number));
  console.log(`\nLedger postings in Nov 2026: total=${postings.length}, salary-related(5000/1920)=${salPosts.length}`);

  console.log(`\n=== RESULT ===`);
  console.log(`Without voucher: payslip number=${ps?.number}, ledger entries=${salPosts.length}`);
  console.log(`Voucher is ${salPosts.length === 0 ? 'MANDATORY' : 'NOT needed'} for ledger entries`);
}

main().catch(e => { console.error(e); process.exit(1); });
