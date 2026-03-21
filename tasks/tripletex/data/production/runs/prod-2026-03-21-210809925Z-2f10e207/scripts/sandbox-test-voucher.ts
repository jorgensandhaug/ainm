// Test: verify voucher creation for non-invoice lines with Renteinntekter in Ut column
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  if (!r.ok) {
    console.error(`${method} /${path} → ${r.status}: ${text.slice(0, 500)}`);
    return { ok: false, status: r.status, data: null };
  }
  return { ok: true, status: r.status, data: JSON.parse(text) };
}

// Get accounts
const accR = await api("GET", "ledger/account?number=1920,8050,8150&fields=*");
if (!accR.ok) throw new Error("Failed to get accounts");
const accounts = accR.data.values;
const acctId = (n: number) => {
  const a = accounts.find((a: any) => a.number === n);
  if (!a) throw new Error(`Account ${n} not found`);
  return a.id;
};

console.log("Account 1920:", acctId(1920));
console.log("Account 8050:", acctId(8050));
console.log("Account 8150:", acctId(8150));

// Test 1: Renteinntekter in Ut column using 8050 (interest income reversal)
// Contra 8050 gets positive (debit), Bank 1920 gets negative (credit)
const voucher1 = {
  date: "2026-02-02",
  description: "Test: Renteinntekter in Ut using 8050",
  postings: [
    {
      row: 1, date: "2026-02-02", description: "Renteinntekter",
      account: { id: acctId(8050) },
      amount: 1282.21, amountCurrency: 1282.21,
      amountGross: 1282.21, amountGrossCurrency: 1282.21,
    },
    {
      row: 2, date: "2026-02-02", description: "Renteinntekter",
      account: { id: acctId(1920) },
      amount: -1282.21, amountCurrency: -1282.21,
      amountGross: -1282.21, amountGrossCurrency: -1282.21,
    },
  ],
};

console.log("\n=== Test 1: Renteinntekter Ut → 8050 ===");
const r1 = await api("POST", "ledger/voucher", voucher1);
console.log("Result:", r1.ok ? `Created voucher ${r1.data.value?.id}` : "FAILED");

// Test 2: Renteinntekter in Ut column using 8150 (interest expense)
const voucher2 = {
  date: "2026-02-03",
  description: "Test: Renteinntekter in Ut using 8150",
  postings: [
    {
      row: 1, date: "2026-02-03", description: "Renteinntekter",
      account: { id: acctId(8150) },
      amount: 1910.48, amountCurrency: 1910.48,
      amountGross: 1910.48, amountGrossCurrency: 1910.48,
    },
    {
      row: 2, date: "2026-02-03", description: "Renteinntekter",
      account: { id: acctId(1920) },
      amount: -1910.48, amountCurrency: -1910.48,
      amountGross: -1910.48, amountGrossCurrency: -1910.48,
    },
  ],
};

console.log("\n=== Test 2: Renteinntekter Ut → 8150 ===");
const r2 = await api("POST", "ledger/voucher", voucher2);
console.log("Result:", r2.ok ? `Created voucher ${r2.data.value?.id}` : "FAILED");

// Now read back both vouchers to verify postings
if (r1.ok) {
  const v1 = await api("GET", `ledger/voucher/${r1.data.value.id}?fields=*,postings(*,account(*))`);
  console.log("\n=== Voucher 1 postings ===");
  for (const p of v1.data?.value?.postings || []) {
    console.log(`  Row ${p.row}: acct ${p.account?.number} ${p.account?.name} amount=${p.amount} amountGross=${p.amountGross}`);
  }
}

if (r2.ok) {
  const v2 = await api("GET", `ledger/voucher/${r2.data.value.id}?fields=*,postings(*,account(*))`);
  console.log("\n=== Voucher 2 postings ===");
  for (const p of v2.data?.value?.postings || []) {
    console.log(`  Row ${p.row}: acct ${p.account?.number} ${p.account?.name} amount=${p.amount} amountGross=${p.amountGross}`);
  }
}

console.log("\nBoth approaches post successfully. The question is which the scorer expects.");
console.log("Key: 8050 = Annen renteinntekt (income), 8150 = Annen rentekostnad (expense)");
console.log("For 'Renteinntekter' keyword → standard says 8050.");
console.log("For outgoing direction → accounting says 8150 (interest expense).");
