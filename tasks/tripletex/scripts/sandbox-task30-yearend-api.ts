// Explore the /yearEnd API — maybe this is what we should use instead of manual vouchers

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) {
    console.log("  ERROR:", JSON.stringify(data).slice(0, 500));
  }
  return { ok: res.ok, data, status: res.status };
}

async function main() {
  // 1. Check /yearEnd
  console.log("=== GET /yearEnd ===");
  const ye = await api("GET", "/yearEnd");
  if (ye.ok) {
    console.log(JSON.stringify(ye.data, null, 2).slice(0, 2000));
  }

  // 2. Check all /yearEnd sub-endpoints from openapi
  const paths = [
    "/yearEnd/penneo/session",
    "/yearEnd/penneo/casefiles",
    "/yearEnd/penneo/recipients",
  ];
  for (const p of paths) {
    console.log(`\n=== GET ${p} ===`);
    await api("GET", p);
  }

  // 3. Look for simplified year-end endpoints
  console.log("\n=== Explore simplified year-end ===");
  await api("GET", "/yearEnd/simplified");
  await api("GET", "/yearEnd/annualAccounts");
  await api("GET", "/yearEnd/closingBalance");
  await api("GET", "/yearEnd/report");

  // 4. Look for /ledger/closeGroup or /ledger/close endpoints
  console.log("\n=== Explore ledger closing ===");
  await api("GET", "/ledger/closeGroup");
  await api("GET", "/ledger/close");
  await api("GET", "/ledger/posting/closeGroup");

  // 5. Check if there's a specific prepaid/accrual endpoint
  console.log("\n=== Explore accrual/prepaid endpoints ===");
  await api("GET", "/ledger/voucher?voucherType=Periodisering&dateFrom=2025-01-01&dateTo=2025-12-31&fields=id,date,description,voucherType&count=10");

  // 6. Look at what the balance on 1700 actually IS in the sandbox
  console.log("\n=== Balance on 1700 ===");
  const bs1700 = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2026-01-01&accountNumberFrom=1700&accountNumberTo=1700&fields=*,account(id,number,name)&count=10");
  if (bs1700.ok) {
    for (const row of bs1700.data?.values || []) {
      console.log(`  ${row.account?.number}: balanceIn=${row.balanceIn} balanceChange=${row.balanceChange} balanceOut=${row.balanceOut}`);
    }
  }

  // 7. Check what the OPENING balance on 1700 is (before any test reversals)
  console.log("\n=== Opening balance (just Jan 1) on 1700 ===");
  const ob1700 = await api("GET", "/balanceSheet?dateFrom=2025-01-01&dateTo=2025-01-02&accountNumberFrom=1700&accountNumberTo=1700&fields=*,account(id,number,name)&count=10");
  if (ob1700.ok) {
    for (const row of ob1700.data?.values || []) {
      console.log(`  ${row.account?.number}: balanceIn=${row.balanceIn} balanceChange=${row.balanceChange} balanceOut=${row.balanceOut}`);
    }
  }

  // 8. Check all the 1700-range postings to understand what's there
  console.log("\n=== All 1700 postings in 2025 ===");
  const p1700 = await api("GET", "/ledger/posting?accountNumberFrom=1700&accountNumberTo=1700&dateFrom=2025-01-01&dateTo=2025-12-31&fields=id,date,amount,description,voucher(id,date,description,number)&count=100");
  if (p1700.ok) {
    for (const p of p1700.data?.values || []) {
      console.log(`  date=${p.date} amount=${p.amount} desc="${p.description}" voucher="${p.voucher?.description}" #${p.voucher?.number}`);
    }
  }

  // 9. Let's also look if there's a "periodisering" or "accrual" module
  console.log("\n=== Check /accrual or /periodisering ===");
  await api("GET", "/accrual");
  await api("GET", "/periodisering");

  // 10. Check what the posting amortization fields do
  console.log("\n=== Check postings with amortization account set ===");
  const amortPostings = await api("GET", "/ledger/posting?dateFrom=2025-12-31&dateTo=2025-12-31&fields=id,date,amount,description,amortizationAccount(id,number,name),amortizationStartDate,amortizationEndDate,account(number,name)&count=100");
  if (amortPostings.ok) {
    for (const p of amortPostings.data?.values || []) {
      if (p.amortizationAccount) {
        console.log(`  date=${p.date} acct=${p.account?.number} amount=${p.amount} amortAcct=${p.amortizationAccount?.number} from=${p.amortizationStartDate} to=${p.amortizationEndDate}`);
      }
    }
  }
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
