// Check what side effects POST /salary/transaction creates
// Use the existing sandbox payroll transaction 6956975
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method, headers: H });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 400));
  return { status: res.status, data: json };
}

async function main() {
  // Check existing payslip from sandbox
  const psRes = await api("GET", "/salary/payslip?count=5&fields=*,specifications(*,salaryType(*))&sorting=id&order=desc");
  console.log("Payslips:", psRes.data?.fullResultSize);

  // Check existing salary transactions
  const txRes = await api("GET", "/salary/transaction?count=5&fields=*&sorting=id&order=desc");

  // If no payslips exist, check the production ones directly
  // Production payslip was 32628910 - but that's on the production company, not sandbox

  // Let me check what vouchers were created around the time payroll was run
  // In sandbox, transaction 6956975 was created around 2026-03-20
  // Let me check vouchers from that period
  const vRes = await api("GET", "/ledger/voucher?dateFrom=2026-03-20&dateTo=2026-03-22&count=50&fields=*&sorting=id&order=desc");
  console.log("\nVouchers from 2026-03-20 to 2026-03-22:", vRes.data?.fullResultSize);
  for (const v of (vRes.data?.values || []).slice(0, 10)) {
    console.log(`  id=${v.id} number=${v.number} date=${v.date} description="${v.description}" type=${v.voucherType?.id}`);
  }

  // Check voucher types
  const vtRes = await api("GET", "/ledger/voucherType?count=100&fields=*");
  console.log("\nVoucher types:");
  for (const vt of (vtRes.data?.values || [])) {
    console.log(`  id=${vt.id} name="${vt.name}" number=${vt.number}`);
  }

  // Check if there are any salary-related vouchers
  // Salary vouchers typically use voucherType "Lønn" or similar

  // Also check employee employment details for existing employees
  // Employee 18592549 was used in sandbox payroll proofs
  const empRes = await api("GET", "/employee/18592549?fields=*");
  if (empRes.status < 400) {
    console.log("\nEmployee 18592549:");
    console.log("  dateOfBirth:", empRes.data?.value?.dateOfBirth);
    console.log("  employments:", JSON.stringify(empRes.data?.value?.employments, null, 2).slice(0, 500));

    // Check employment details
    const emplRes = await api("GET", "/employee/employment?employeeId=18592549&count=10&fields=*");
    if (emplRes.status < 400) {
      for (const empl of (emplRes.data?.values || [])) {
        console.log(`\n  Employment id=${empl.id} startDate=${empl.startDate} division=${empl.division?.id}`);
        console.log("  employmentDetails:", JSON.stringify(empl.employmentDetails, null, 2).slice(0, 300));

        // Check employment details sub-resource
        const detRes = await api("GET", `/employee/employment/details?employmentId=${empl.id}&fields=*`);
        console.log("  details:", JSON.stringify(detRes.data?.values, null, 2).slice(0, 500));
      }
    }
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
