// Deep inspection of the supplierInvoice and orderLines to find what Check 5 might test
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// From the clean test: supplier 108440209, voucher 609183025
const VOUCHER_ID = 609183025;
const SUPPLIER_ID = 108440209;

async function api(path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { headers: { Authorization: AUTH } });
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!r.ok) console.log(`GET ${path} → ${r.status} ERROR:`, JSON.stringify(json).slice(0, 300));
  else console.log(`GET ${path} → ${r.status}`);
  return json;
}

async function main() {
  // 1. Full supplierInvoice with ALL sub-objects expanded
  console.log("=== supplierInvoice with all expansions ===");
  const si = await api(`/supplierInvoice?invoiceDateFrom=2026-06-01&invoiceDateTo=2026-07-31&voucherId=${VOUCHER_ID}&fields=*,orderLines(*),supplier(*),voucher(*),payments(*),currency(*)`);
  if (si.values?.length > 0) {
    console.log(JSON.stringify(si.values[0], null, 2));
  }

  // 2. Check the orderLines separately
  console.log("\n=== orderLine details ===");
  if (si.values?.[0]?.orderLines?.[0]?.id) {
    const olId = si.values[0].orderLines[0].id;
    const ol = await api(`/order/orderline/${olId}?fields=*`);
    if (ol.value) {
      console.log(JSON.stringify(ol.value, null, 2));
    }
  }

  // 3. Check voucher postings with full expansion
  console.log("\n=== voucher postings expanded ===");
  const v = await api(`/ledger/voucher/${VOUCHER_ID}?fields=*,postings(*)`);
  if (v.value?.postings) {
    for (const p of v.value.postings) {
      console.log(`\nrow=${p.row}:`);
      console.log(JSON.stringify(p, null, 2));
    }
  }

  // 4. Check the supplier with full detail
  console.log("\n=== supplier full ===");
  const s = await api(`/supplier/${SUPPLIER_ID}?fields=*,postalAddress(*),physicalAddress(*),bankAccountPresentation(*)`);
  if (s.value) {
    const v = s.value;
    // Log ALL fields
    for (const [key, val] of Object.entries(v)) {
      console.log(`  ${key}: ${JSON.stringify(val)}`);
    }
  }

  // 5. Check if the supplierInvoice has a `description` field that might be empty
  console.log("\n=== supplierInvoice description/comment field check ===");
  const si2 = await api(`/supplierInvoice?invoiceDateFrom=2026-06-01&invoiceDateTo=2026-07-31&voucherId=${VOUCHER_ID}&fields=id,invoiceNumber,invoiceDate,invoiceDueDate,kidOrReceiverReference,comment,amount,amountExcludingVat,outstandingAmount,isCreditNote,supplier(id,name),voucher(id,number,description)`);
  if (si2.values?.length > 0) {
    console.log(JSON.stringify(si2.values[0], null, 2));
  }
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
