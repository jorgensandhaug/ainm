// DEEP TEST: Do payslips actually get created correctly?
// The sandbox showed 0 payslips for employees that had salary transactions.
// Let's investigate: create a fresh salary transaction and immediately check the payslip.
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 600));
  return { status: res.status, data: json };
}

async function main() {
  // Employee 18592549 already has employment + details from earlier tests
  const empId = 18592549;
  const SALARY = 41750;
  const BONUS = 6750;

  // Get salary types
  const stRes = await api("GET", "/salary/type?count=1000&fields=*");
  const fastlonn = stRes.data?.values?.find((t: any) => t.name === "Fastlønn");
  const bonus = stRes.data?.values?.find((t: any) => t.name === "Bonus");
  console.log(`Fastlønn: ${fastlonn?.id}, Bonus: ${bonus?.id}`);

  // ====================================================
  // TEST 1: Create salary transaction for month 5 (unused)
  // ====================================================
  console.log("\n=== TEST 1: Create salary transaction (month 5) ===\n");
  const txRes = await api("POST", "/salary/transaction", {
    date: "2026-03-21",
    year: 2026,
    month: 5,
    paySlipsAvailableDate: "2026-03-21",
    payslips: [{
      employee: { id: empId },
      specifications: [
        { employee: { id: empId }, salaryType: { id: fastlonn?.id }, description: "Fastlønn", year: 2026, month: 5, count: 1, rate: SALARY, amount: SALARY },
        { employee: { id: empId }, salaryType: { id: bonus?.id }, description: "Bonus", year: 2026, month: 5, count: 1, rate: BONUS, amount: BONUS },
      ],
    }],
  });

  const txId = txRes.data?.value?.id;
  const payslipStubs = txRes.data?.value?.payslips || [];
  console.log("Transaction response:", JSON.stringify(txRes.data?.value, null, 2));

  if (!txId) {
    console.log("FAILED to create transaction");
    return;
  }

  // ====================================================
  // TEST 2: Read payslip immediately via stub ID
  // ====================================================
  console.log("\n=== TEST 2: Read payslip via stub ID ===\n");
  for (const ps of payslipStubs) {
    console.log(`Payslip stub: id=${ps.id} url=${ps.url}`);

    // Read with full expansion
    const psRes = await api("GET", `/salary/payslip/${ps.id}?fields=*,specifications(*,salaryType(*))`);
    const p = psRes.data?.value;
    console.log(`  grossAmount=${p?.grossAmount} netAmount=${p?.netAmount} amount=${p?.amount}`);
    console.log(`  year=${p?.year} month=${p?.month} date=${p?.date}`);
    console.log(`  specifications: ${p?.specifications?.length}`);
    for (const s of (p?.specifications || [])) {
      console.log(`    ${s.salaryType?.name}(${s.salaryType?.number}): amount=${s.amount} count=${s.count} rate=${s.rate}`);
    }
    console.log(`  FULL payslip:`, JSON.stringify(p, null, 2));
  }

  // ====================================================
  // TEST 3: Read transaction with full expansion
  // ====================================================
  console.log("\n=== TEST 3: Read transaction ===\n");
  const txDetail = await api("GET", `/salary/transaction/${txId}?fields=*`);
  console.log("Transaction detail:", JSON.stringify(txDetail.data?.value, null, 2));

  // ====================================================
  // TEST 4: Search for payslips by employee
  // ====================================================
  console.log("\n=== TEST 4: Search payslips by employee ===\n");
  const psSearch = await api("GET", `/salary/payslip?employeeId=${empId}&count=100&fields=*`);
  console.log(`Payslips for employee ${empId}: ${psSearch.data?.fullResultSize}`);
  for (const ps of (psSearch.data?.values || [])) {
    console.log(`  id=${ps.id} year=${ps.year} month=${ps.month} grossAmount=${ps.grossAmount} amount=${ps.amount}`);
  }

  // ====================================================
  // TEST 5: Search ALL payslips in the system
  // ====================================================
  console.log("\n=== TEST 5: ALL payslips ===\n");
  const allPs = await api("GET", "/salary/payslip?count=100&fields=*&sorting=id&order=desc");
  console.log(`All payslips: ${allPs.data?.fullResultSize}`);
  for (const ps of (allPs.data?.values || []).slice(0, 10)) {
    console.log(`  id=${ps.id} emp=${ps.employee?.id} year=${ps.year} month=${ps.month} grossAmount=${ps.grossAmount}`);
  }

  // ====================================================
  // TEST 6: Check ALL salary transactions
  // ====================================================
  console.log("\n=== TEST 6: ALL salary transactions ===\n");
  const allTx = await api("GET", "/salary/transaction?count=100&fields=*&sorting=id&order=desc");
  console.log(`All transactions: ${allTx.data?.fullResultSize}`);

  // ====================================================
  // TEST 7: Check if there's a ledger voucher created by the salary transaction
  // ====================================================
  console.log("\n=== TEST 7: Voucher from salary transaction ===\n");
  // Salary vouchers have voucherType=9744848 ("Lønnsbilag")
  const vRes = await api("GET", `/ledger/voucher?dateFrom=2026-03-21&dateTo=2026-03-22&count=20&fields=*&sorting=id&order=desc`);
  const salaryVouchers = (vRes.data?.values || []).filter((v: any) => v.voucherType?.id === 9744848);
  console.log(`Salary vouchers (Lønnsbilag): ${salaryVouchers.length}`);
  for (const v of salaryVouchers) {
    console.log(`  id=${v.id} number=${v.number} numberAsString="${v.numberAsString}" description="${v.description}"`);
    // Check postings
    const vpRes = await api("GET", `/ledger/voucher/${v.id}?fields=*,postings(*)`);
    for (const p of (vpRes.data?.value?.postings || [])) {
      console.log(`    posting: row=${p.row} acct=${p.account?.number} amount=${p.amount} description="${p.description}"`);
    }
  }

  // ====================================================
  // TEST 8: Try DELETE the transaction, does payslip disappear?
  // ====================================================
  console.log("\n=== TEST 8: Delete transaction, check payslip ===\n");
  const delRes = await api("DELETE", `/salary/transaction/${txId}`);
  console.log("Delete:", delRes.status);

  // Re-check payslips
  const psAfterDel = await api("GET", `/salary/payslip?employeeId=${empId}&count=100&fields=*`);
  console.log(`Payslips after delete: ${psAfterDel.data?.fullResultSize}`);
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
