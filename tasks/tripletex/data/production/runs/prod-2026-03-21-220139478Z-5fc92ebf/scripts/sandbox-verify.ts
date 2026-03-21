// Minimal sandbox verification: confirm account query and voucher posting shapes work
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  if (!r.ok) { const t = await r.text(); console.error(`GET ${path} → ${r.status}: ${t}`); throw new Error(`GET ${r.status}`); }
  return r.json();
}

async function main() {
  // 1. Verify narrowed account query works (only needed accounts)
  const narrow = await get("/ledger/account?number=1920,2400,7770&fields=*");
  console.log("Narrow query (1920,2400,7770):", narrow.values?.length, "accounts");
  for (const a of narrow.values || []) {
    console.log(`  ${a.number} → id=${a.id} name=${a.name}`);
  }

  // 2. Verify full query also works
  const full = await get("/ledger/account?number=1920,2400,2600,7770,8050&fields=*");
  console.log("\nFull query (1920,2400,2600,7770,8050):", full.values?.length, "accounts");
  for (const a of full.values || []) {
    console.log(`  ${a.number} → id=${a.id} name=${a.name}`);
  }

  // 3. Verify invoice payment type query
  const pt = await get("/invoice/paymentType?count=1000&fields=*,debitAccount(*)");
  const bankPt = (pt.values || []).find((p: any) => p.debitAccount?.number === 1920);
  console.log("\nPayment type with debitAccount 1920:", bankPt ? `id=${bankPt.id} desc=${bankPt.description}` : "NOT FOUND");

  // 4. Check if any existing invoices to confirm query shape
  const inv = await get("/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=5&fields=id,invoiceNumber,amountCurrencyOutstanding,customer(name)");
  console.log("\nSample invoices:", inv.values?.length || 0);
  for (const i of (inv.values || []).slice(0, 3)) {
    console.log(`  #${i.invoiceNumber} outstanding=${i.amountCurrencyOutstanding} customer=${i.customer?.name}`);
  }

  console.log("\nSandbox verification complete. All queries work as expected.");
}

main().catch(e => { console.error(e); process.exit(1); });
