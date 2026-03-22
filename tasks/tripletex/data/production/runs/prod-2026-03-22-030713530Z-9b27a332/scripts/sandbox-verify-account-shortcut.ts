// Test if we can skip GET /ledger/account by using account number directly in voucher postings
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function main() {
  // First, get a known supplier ID from the sandbox
  const suppRes = await fetch(`${BASE}/supplier?count=1&fields=id,name,ledgerAccount`, { headers: H });
  const supp = await suppRes.json();
  console.log("Supplier:", JSON.stringify(supp.values[0]));
  const suppId = supp.values[0].id;
  const suppLedgerAcctId = supp.values[0].ledgerAccount.id;

  // Try 1: account: { number: 6340 } directly in posting
  console.log("\n--- Test 1: account by number only ---");
  const t1 = await fetch(`${BASE}/ledger/voucher`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      date: "2026-03-22",
      description: "test account by number",
      voucherType: { name: "Leverandørfaktura" },
      postings: [
        { row: 1, date: "2026-03-22", description: "test", account: { number: 6340 }, vatType: { id: 1 }, currency: { id: 1 }, amount: 8000, amountCurrency: 8000, amountGross: 10000, amountGrossCurrency: 10000 },
        { row: 2, date: "2026-03-22", description: "test", account: { id: suppLedgerAcctId }, supplier: { id: suppId }, currency: { id: 1 }, amount: -10000, amountCurrency: -10000, amountGross: -10000, amountGrossCurrency: -10000 },
      ],
    }),
  });
  console.log("Status:", t1.status);
  const t1b = await t1.json();
  console.log("Response:", JSON.stringify(t1b).slice(0, 500));

  // Try 2: account: { number: 6340, name: "Lys, varme" }
  console.log("\n--- Test 2: account by number + name ---");
  const t2 = await fetch(`${BASE}/ledger/voucher`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      date: "2026-03-22",
      description: "test account by number+name",
      voucherType: { name: "Leverandørfaktura" },
      postings: [
        { row: 1, date: "2026-03-22", description: "test", account: { number: 6340, name: "Lys, varme" }, vatType: { id: 1 }, currency: { id: 1 }, amount: 8000, amountCurrency: 8000, amountGross: 10000, amountGrossCurrency: 10000 },
        { row: 2, date: "2026-03-22", description: "test", account: { id: suppLedgerAcctId }, supplier: { id: suppId }, currency: { id: 1 }, amount: -10000, amountCurrency: -10000, amountGross: -10000, amountGrossCurrency: -10000 },
      ],
    }),
  });
  console.log("Status:", t2.status);
  const t2b = await t2.json();
  console.log("Response:", JSON.stringify(t2b).slice(0, 500));
}

main().catch(e => { console.error(e); process.exit(1); });
