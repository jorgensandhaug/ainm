// Test call reduction opportunities using existing sandbox employee
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (r.status >= 400) console.log(JSON.stringify(json, null, 2));
  return { status: r.status, data: json };
}

async function main() {
  // Use existing sandbox employee 18441996 (Simen Sandhaug, dob=1990-01-01)
  const empId = 18441996;

  // Check existing employment
  const emplRes = await api("GET", `/employee/employment?employeeId=${empId}&count=20&fields=*`);
  console.log(`Employment count: ${emplRes.data.count}`);
  if (emplRes.data.count > 0) {
    const empl = emplRes.data.values[0];
    console.log(`Employment: id=${empl.id}, startDate=${empl.startDate}, division=${empl.division?.id}`);
  }

  // Get salary types
  const stRes = await api("GET", "/salary/type?count=1000&fields=*");
  const fastlonn = stRes.data.values.find((t: any) => t.name === "Fastlønn");
  const bonus = stRes.data.values.find((t: any) => t.name === "Bonus");
  console.log(`Fastlønn id=${fastlonn.id} number=${fastlonn.number}, Bonus id=${bonus.id} number=${bonus.number}`);

  // Get voucherType
  const vtRes = await api("GET", "/ledger/voucherType?name=Lønnsbilag&count=1&fields=*");
  const voucherTypeId = vtRes.data.values[0].id;
  console.log(`Lønnsbilag voucherType id=${voucherTypeId}`);

  // Get accounts
  const accRes = await api("GET", "/ledger/account?number=5000,1920&count=10&fields=*");
  const acc5000 = accRes.data.values.find((a: any) => a.number === 5000);
  const acc1920 = accRes.data.values.find((a: any) => a.number === 1920);
  console.log(`Account 5000 id=${acc5000.id}, 1920 id=${acc1920.id}`);

  // ===== TEST 1: Parallel POST salary/transaction + POST voucher =====
  console.log("\n=== TEST 1: Parallel salary transaction + voucher (same month) ===");
  const m = 9; // Use Sep 2026 to avoid conflicts
  const t0 = Date.now();
  const [txResult, vResult] = await Promise.all([
    api("POST", "/salary/transaction?generateTaxDeduction=true", {
      date: `2026-0${m}-20`, year: 2026, month: m, paySlipsAvailableDate: `2026-0${m}-20`,
      payslips: [{
        employee: { id: empId }, date: `2026-0${m}-20`, year: 2026, month: m,
        specifications: [
          { employee: { id: empId }, salaryType: { id: fastlonn.id }, description: "Fastlønn", year: 2026, month: m, count: 1, rate: 25000, amount: 25000 },
          { employee: { id: empId }, salaryType: { id: bonus.id }, description: "Bonus", year: 2026, month: m, count: 1, rate: 10000, amount: 10000 },
        ],
      }],
    }),
    api("POST", "/ledger/voucher?sendToLedger=true", {
      voucherType: { id: voucherTypeId },
      date: `2026-0${m}-20`,
      description: `Lønn sep 2026 - Fastlønn 25000 + Bonus 10000`,
      postings: [
        { account: { id: acc5000.id }, amount: 25000, description: "Fastlønn", row: 1 },
        { account: { id: acc5000.id }, amount: 10000, description: "Bonus", row: 2 },
        { account: { id: acc1920.id }, amount: -35000, description: "Utbetalt lønn", row: 3 },
      ],
    }),
  ]);
  console.log(`Parallel time: ${Date.now() - t0}ms`);
  console.log(`Salary tx: ${txResult.status}${txResult.status === 201 ? ` id=${txResult.data.value.id}` : ""}`);
  console.log(`Voucher: ${vResult.status}${vResult.status === 201 ? ` id=${vResult.data.value.id} number=${vResult.data.value.number}` : ""}`);

  // ===== TEST 2: salaryType by number =====
  console.log("\n=== TEST 2: salaryType by number instead of id ===");
  const stByNum = await api("POST", "/salary/transaction?generateTaxDeduction=true", {
    date: "2026-10-20", year: 2026, month: 10, paySlipsAvailableDate: "2026-10-20",
    payslips: [{
      employee: { id: empId }, date: "2026-10-20", year: 2026, month: 10,
      specifications: [
        { employee: { id: empId }, salaryType: { number: fastlonn.number }, description: "Fastlønn", year: 2026, month: 10, count: 1, rate: 15000, amount: 15000 },
      ],
    }],
  });
  console.log(`salaryType by number: ${stByNum.status}`);
  if (stByNum.status === 201) console.log("SUCCESS - could eliminate GET /salary/type!");

  // ===== TEST 3: account by number in voucher =====
  console.log("\n=== TEST 3: account by number in voucher ===");
  const accByNum = await api("POST", "/ledger/voucher?sendToLedger=true", {
    voucherType: { id: voucherTypeId },
    date: "2026-10-20",
    description: "Test account by number",
    postings: [
      { account: { number: 5000 }, amount: 1000, description: "Test debit", row: 1 },
      { account: { number: 1920 }, amount: -1000, description: "Test credit", row: 2 },
    ],
  });
  console.log(`account by number: ${accByNum.status}`);
  if (accByNum.status === 201) console.log("SUCCESS - could eliminate GET /ledger/account!");

  // ===== TEST 4: voucherType by name =====
  console.log("\n=== TEST 4: voucherType by name in voucher ===");
  const vtByName = await api("POST", "/ledger/voucher?sendToLedger=true", {
    voucherType: { name: "Lønnsbilag" },
    date: "2026-11-20",
    description: "Test voucherType by name",
    postings: [
      { account: { id: acc5000.id }, amount: 500, description: "Test debit", row: 1 },
      { account: { id: acc1920.id }, amount: -500, description: "Test credit", row: 2 },
    ],
  });
  console.log(`voucherType by name: ${vtByName.status}`);
  if (vtByName.status === 201) console.log("SUCCESS - could eliminate GET /ledger/voucherType!");

  // ===== TEST 5: Can step 1 reads be parallelized with GET /employee? =====
  console.log("\n=== TEST 5: Parallel GET /employee + 3 reads ===");
  const t5 = Date.now();
  const [empR, stR, vtR, accR] = await Promise.all([
    api("GET", "/employee?id=18441996&count=10&fields=*"),
    api("GET", "/salary/type?count=1000&fields=*"),
    api("GET", "/ledger/voucherType?name=Lønnsbilag&count=1&fields=*"),
    api("GET", "/ledger/account?number=5000,1920&count=10&fields=*"),
  ]);
  console.log(`Parallel 4-read time: ${Date.now() - t5}ms`);
  console.log(`All 4 reads: emp=${empR.status}, st=${stR.status}, vt=${vtR.status}, acc=${accR.status}`);

  console.log("\n=== ALL TESTS COMPLETE ===");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
