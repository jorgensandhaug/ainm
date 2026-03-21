// Test: Can we post voucher with account number + name (no id)?
// This would eliminate the need for GET /ledger/account entirely.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const HEADERS = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: HEADERS };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) console.log(JSON.stringify(data, null, 2).substring(0, 800));
  return { status: res.status, data, ok: res.ok };
}

// Test: Voucher with account { number, name } but no id
console.log("=== Test: Voucher with number + name, no id ===");
const t1 = await api("POST", "/ledger/voucher", {
  date: "2025-12-31",
  description: "Test voucher with number+name",
  postings: [
    { row: 1, account: { number: 6010, name: "Avskrivninger" }, amountGross: 100, amountGrossCurrency: 100, description: "Test debit" },
    { row: 2, account: { number: 1700, name: "Forskuddsbetalt leiekostnad" }, amountGross: -100, amountGrossCurrency: -100, description: "Test credit" },
  ],
});
if (t1.ok) {
  console.log("SUCCESS! Account number+name works without id!");
  const v = t1.data.value;
  console.log("Voucher id:", v?.id, "number:", v?.number);
  console.log("Postings:", JSON.stringify(v?.postings, null, 2)?.substring(0, 800));
  // Clean up
  if (v?.id) {
    console.log("Reversing test voucher...");
    await api("PUT", `/ledger/voucher/${v.id}/:reverse`);
  }
}

// Test 2: What if name doesn't match? Does it create or fail?
console.log("\n=== Test 2: Wrong name for existing account ===");
const t2 = await api("POST", "/ledger/voucher", {
  date: "2025-12-31",
  description: "Test wrong name",
  postings: [
    { row: 1, account: { number: 6010, name: "Wrong Name" }, amountGross: 100, amountGrossCurrency: 100, description: "Test debit" },
    { row: 2, account: { number: 1700, name: "Wrong Name Too" }, amountGross: -100, amountGrossCurrency: -100, description: "Test credit" },
  ],
});
if (t2.ok) {
  console.log("SUCCESS even with wrong names!");
  const v2 = t2.data.value;
  console.log("Voucher id:", v2?.id);
  if (v2?.id) {
    await api("PUT", `/ledger/voucher/${v2.id}/:reverse`);
  }
}

// Test 3: Non-existing account with number + name (no id)
// Account 9998 probably doesn't exist - will Tripletex auto-create it?
console.log("\n=== Test 3: Non-existing account by number + name ===");
const t3 = await api("POST", "/ledger/voucher", {
  date: "2025-12-31",
  description: "Test non-existing account",
  postings: [
    { row: 1, account: { number: 9998, name: "Auto Test Account" }, amountGross: 100, amountGrossCurrency: 100, description: "Test debit" },
    { row: 2, account: { number: 1700, name: "Forskuddsbetalt leiekostnad" }, amountGross: -100, amountGrossCurrency: -100, description: "Test credit" },
  ],
});
if (t3.ok) {
  console.log("SUCCESS even with non-existing account! Auto-created?");
  const v3 = t3.data.value;
  // Check if account 9998 now exists
  const chk = await api("GET", "/ledger/account?number=9998&fields=id,number,name");
  console.log("Account 9998 now:", JSON.stringify(chk.data.values));
  // Clean up
  if (v3?.id) await api("PUT", `/ledger/voucher/${v3.id}/:reverse`);
  if (chk.data.values?.[0]?.id) await api("DELETE", `/ledger/account/${chk.data.values[0].id}`);
}

console.log("\nDone.");
