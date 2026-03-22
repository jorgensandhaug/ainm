// Sandbox verification: check existing voucher data and test correction flow
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  console.log(`${res.status} ${method} ${path}`);
  if (!res.ok) { console.error(`  Error: ${text.substring(0, 300)}`); return null; }
  return JSON.parse(text);
}

async function main() {
  // Check what vouchers exist in sandbox for Jan-Feb 2026
  const vRes = await api("GET", `/ledger/voucher?dateFrom=2026-01-01&dateTo=2026-03-01&fields=id,number,date,description,reverseVoucher(id),postings(id,account(id,number),amountGross,amountGrossCurrency,vatType(id),supplier(id))&count=1000`);
  if (!vRes) return;

  const vouchers = vRes.values || [];
  console.log(`\nTotal vouchers in Jan-Feb 2026: ${vouchers.length}`);

  // Show all vouchers with their postings
  for (const v of vouchers.slice(0, 20)) {
    const reversed = v.reverseVoucher?.id ? " [REVERSED]" : "";
    console.log(`\nV#${v.number}(id=${v.id}) "${v.description}" date=${v.date}${reversed}`);
    for (const p of v.postings || []) {
      console.log(`  acct=${p.account?.number} gross=${p.amountGross} vat=${p.vatType?.id} supplier=${p.supplier?.id ?? "-"}`);
    }
  }

  // Test creating a simple correction voucher to verify the endpoint works
  console.log("\n--- Testing POST /ledger/voucher with sendToLedger ---");

  // First get account IDs for test accounts
  const acctRes = await api("GET", `/ledger/account?number=6300,7100&fields=id,number,vatType(id)`);
  if (!acctRes) return;

  const accounts: Record<number, number> = {};
  for (const a of acctRes.values) {
    accounts[a.number] = a.id;
    console.log(`Account ${a.number}: id=${a.id}, vatType=${a.vatType?.id}`);
  }

  // Create a balanced test correction voucher
  const testRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-02-28",
    description: "Sandbox test correction",
    postings: [
      { row: 1, account: { id: accounts[6300] }, amountGross: -100, amountGrossCurrency: -100, vatType: { id: 0 }, description: "Test debit reversal" },
      { row: 2, account: { id: accounts[7100] }, amountGross: 100, amountGrossCurrency: 100, vatType: { id: 0 }, description: "Test credit" },
    ],
  });

  if (testRes) {
    console.log(`\nTest voucher created: id=${testRes.value.id}, number=${testRes.value.number}`);
    for (const p of testRes.value.postings || []) {
      console.log(`  acct=${p.account?.number} gross=${p.amountGross} net=${p.amount} vat=${p.vatType?.id}`);
    }
  }

  console.log("\nSandbox verification complete.");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
