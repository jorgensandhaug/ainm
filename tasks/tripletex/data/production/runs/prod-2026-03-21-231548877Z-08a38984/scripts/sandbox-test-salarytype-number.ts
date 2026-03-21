// Test salaryType: { number: 2000 } (actual number of Fastlønn)
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
  // Test with the actual number 2000 for Fastlønn
  console.log("=== Test: salaryType: { number: 2000 } ===");
  const test = await api("POST", "/salary/transaction?generateTaxDeduction=true", {
    date: "2026-11-20",
    year: 2026,
    month: 11,
    paySlipsAvailableDate: "2026-11-20",
    payslips: [{
      employee: { id: 18441996 },
      date: "2026-11-20",
      year: 2026,
      month: 11,
      specifications: [{
        employee: { id: 18441996 },
        salaryType: { number: 2000 },
        description: "Test Fastlønn by number 2000",
        year: 2026,
        month: 11,
        count: 1,
        rate: 10000,
        amount: 10000,
      }],
    }],
  });
  console.log("Result:", JSON.stringify(test.json).slice(0, 500));

  // Also test: can GET /ledger/account be skipped if we use account by number?
  // Already documented as failing, but let me confirm with the exact number
  console.log("\n=== Test: account: { number: 5000 } in voucher ===");
  const test2 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    voucherType: { name: "Lønnsbilag" },
    date: "2026-11-20",
    description: "Test account by number",
    postings: [
      { account: { number: 5000 }, description: "Test debit", amountGross: 1000, amountGrossCurrency: 1000, row: 1 },
      { account: { number: 1920 }, description: "Test credit", amountGross: -1000, amountGrossCurrency: -1000, row: 2 },
    ],
  });
  console.log("Result:", JSON.stringify(test2.json).slice(0, 500));
}

main().catch(console.error);
