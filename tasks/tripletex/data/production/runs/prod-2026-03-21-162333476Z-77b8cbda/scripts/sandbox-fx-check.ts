// Check: does currency(*) expansion affect amount vs amountCurrency for EUR invoices?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  console.log(`\n${method} ${url}`);
  const r = await fetch(url, { method, headers });
  const text = await r.text();
  console.log(`  -> ${r.status}`);
  if (!r.ok) return null;
  return JSON.parse(text);
}

async function main() {
  // Find EUR invoices WITHOUT currency(*) expansion
  console.log("=== EUR invoices WITHOUT currency(*) ===");
  const r1 = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2027-01-01&currency=EUR&fields=*&count=3");
  if (r1) {
    for (const inv of r1.values.slice(0, 3)) {
      console.log(`  ID=${inv.id} amount=${inv.amount} amountCurrency=${inv.amountCurrency} amountOutstanding=${inv.amountOutstanding} amountCurrencyOutstanding=${inv.amountCurrencyOutstanding} currency=${JSON.stringify(inv.currency)}`);
    }
  }

  // Find EUR invoices WITH currency(*) expansion
  console.log("\n=== EUR invoices WITH currency(*) ===");
  const r2 = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2027-01-01&currency=EUR&fields=*,currency(*)&count=3");
  if (r2) {
    for (const inv of r2.values.slice(0, 3)) {
      console.log(`  ID=${inv.id} amount=${inv.amount} amountCurrency=${inv.amountCurrency} amountOutstanding=${inv.amountOutstanding} amountCurrencyOutstanding=${inv.amountCurrencyOutstanding} currency.code=${inv.currency?.code}`);
    }
  }

  // Also check: does "Betalt til bank" reliably select the correct payment type?
  console.log("\n=== Payment type by description ===");
  const r3 = await api("GET", "/invoice/paymentType?fields=*,debitAccount(*)");
  if (r3) {
    const bank = r3.values.find((p: any) => p.description?.toLowerCase().includes("bank"));
    if (bank) {
      console.log(`Found "bank" payment type: ID=${bank.id} desc="${bank.description}" debitAccount.number=${bank.debitAccount?.number} debitAccount.isBankAccount=${bank.debitAccount?.isBankAccount}`);
    }
    // Also check all available
    for (const pt of r3.values) {
      console.log(`  ID=${pt.id} desc="${pt.description}" debitAccount.number=${pt.debitAccount?.number} isBankAccount=${pt.debitAccount?.isBankAccount}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
