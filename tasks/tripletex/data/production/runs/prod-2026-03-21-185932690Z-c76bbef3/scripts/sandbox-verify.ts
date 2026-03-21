const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}/${path}`;
  const r = await fetch(url, { headers });
  const t = await r.text();
  console.log(`GET ${path} → ${r.status}`);
  if (!r.ok) { console.log(t.slice(0, 500)); return null; }
  return JSON.parse(t);
}

async function main() {
  // Verify the 5 parallel reads work and check data shape
  const [invoicesRes, paymentTypesRes, suppliersRes, supplierInvoicesRes, accountsRes] = await Promise.all([
    get("invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,customer(*)"),
    get("invoice/paymentType?count=1000&fields=*,debitAccount(*)"),
    get("supplier?count=1000&fields=*"),
    get("supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2031-01-01&count=1000&fields=*,supplier(*)"),
    get("ledger/account?number=2400,1920&fields=*"),
  ]);

  if (invoicesRes) {
    const invoices = invoicesRes.values || [];
    console.log(`\nInvoices (${invoices.length}):`);
    for (const inv of invoices) {
      console.log(`  id=${inv.id} num=${inv.invoiceNumber} customer=${inv.customer?.name} amount=${inv.amount} outstanding=${inv.amountOutstanding}`);
    }
  }

  if (paymentTypesRes) {
    const pts = paymentTypesRes.values || [];
    console.log(`\nPayment types (${pts.length}):`);
    for (const pt of pts) {
      console.log(`  id=${pt.id} desc="${pt.description}" debitAccount=${pt.debitAccount?.number}`);
    }
  }

  if (suppliersRes) {
    const sups = suppliersRes.values || [];
    console.log(`\nSuppliers (${sups.length}):`);
    for (const s of sups) {
      console.log(`  id=${s.id} name="${s.name}"`);
    }
  }

  if (supplierInvoicesRes) {
    const sis = supplierInvoicesRes.values || [];
    console.log(`\nSupplier invoices (${sis.length}):`);
    for (const si of sis) {
      console.log(`  id=${si.id} supplier=${si.supplier?.name} amount=${si.amount}`);
    }
  }

  if (accountsRes) {
    const accs = accountsRes.values || [];
    console.log(`\nAccounts (${accs.length}):`);
    for (const a of accs) {
      console.log(`  id=${a.id} number=${a.number} name="${a.name}"`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
