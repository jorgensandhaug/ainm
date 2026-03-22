// Check if invoice postings have account IDs we could reuse for 1500/3400
// and whether we can combine GET /invoice + GET /ledger/account somehow

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  });
  const txt = await r.text();
  console.log(`${method} ${path} -> ${r.status}`);
  if (!r.ok) { console.log("ERROR:", txt); return null; }
  const json = JSON.parse(txt);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

async function main() {
  // Get invoices with postings expanded
  const invoices: any[] = await api("GET", "/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2026-03-22&count=5&sorting=-invoiceDate&fields=id,invoiceNumber,invoiceDueDate,amountCurrencyOutstanding,postings(account(id,number,name)),customer(id,name)") as any[];
  if (!invoices) return;

  console.log("\n--- Invoice postings with account details ---");
  for (const inv of invoices.slice(0, 2)) {
    console.log(`\nInvoice #${inv.invoiceNumber} id=${inv.id}:`);
    if (inv.postings) {
      for (const p of inv.postings) {
        console.log(`  account: number=${p.account?.number} id=${p.account?.id} name=${p.account?.name}`);
      }
    } else {
      console.log("  No postings field");
    }
  }

  // Check: can we do GET /ledger/account and GET /invoice/paymentType in a batch?
  // Tripletex doesn't have batch endpoints, so these must be separate.

  // Check: what if we use Promise.all to parallelize the 3 initial GETs?
  // This wouldn't reduce call count but could save time.
  // However, for scoring purposes, call count matters, not latency.

  console.log("\n--- Conclusion ---");
  console.log("The 3 initial GETs (invoice, paymentType, accounts) are all required and cannot be combined.");
  console.log("The 3 writes (voucher, invoice, payment) are sequential and cannot be parallelized.");
  console.log("6 calls remains the minimum.");
}

main().catch(e => { console.error(e); process.exit(1); });
