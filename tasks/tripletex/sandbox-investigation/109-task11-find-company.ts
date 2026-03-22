/**
 * Find the sandbox company details to use the correct org number in EHF XML.
 */
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${res.status}`);
  return { status: res.status, data };
}

async function main() {
  // Try various company endpoints
  const endpoints = [
    "/company/1?fields=*",
    "/company?fields=*",
    "/token/session/>whoAmI",
    "/token/session/%3EwhoAmI",
  ];

  for (const ep of endpoints) {
    const res = await api("GET", ep);
    if (res.status < 400) {
      console.log(JSON.stringify(res.data, null, 2).slice(0, 1000));
    }
  }

  // Check existing invoices for the company org number
  console.log("\n── Checking existing supplier invoices ──");
  const siRes = await api("GET", "/supplierInvoice?invoiceDateFrom=2025-01-01&invoiceDateTo=2026-12-31&count=5&fields=*,voucher(id,description),supplier(id,name,organizationNumber)");
  if (siRes.status < 400) {
    const sis = siRes.data.values || [];
    console.log(`Found ${sis.length} supplier invoice(s):`);
    for (const si of sis) {
      console.log(`  id=${si.id} invNum="${si.invoiceNumber}" amount=${si.amount} supplier="${si.supplier?.name}" orgNum="${si.supplier?.organizationNumber}" voucher=${si.voucher?.id} desc="${si.voucher?.description}"`);
    }
  }

  // Check existing vouchers of type Leverandorfaktura
  console.log("\n── Checking existing leverandorfaktura vouchers ──");
  const vRes = await api("GET", "/ledger/voucher?dateFrom=2025-01-01&dateTo=2026-12-31&typeOfVoucher=supplierInvoice&count=5&fields=*,postings(*,account(*),supplier(*))");
  if (vRes.status < 400) {
    console.log(`Found ${vRes.data.values?.length || 0} supplier invoice voucher(s)`);
    for (const v of (vRes.data.values || []).slice(0, 3)) {
      console.log(`\n  id=${v.id} number=${v.number} date=${v.date} desc="${v.description}"`);
      for (const p of v.postings || []) {
        console.log(`    row=${p.row} acct=${p.account?.number} amt=${p.amount} supp=${p.supplier?.name || '-'}`);
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
