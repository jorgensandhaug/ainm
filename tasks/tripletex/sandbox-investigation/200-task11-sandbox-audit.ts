/**
 * Task 11 sandbox audit: check what supplier invoices, suppliers, and vouchers
 * exist so we can understand the pollution and figure out cleanup.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body && !(body instanceof FormData)) opts.body = JSON.stringify(body);
  if (body instanceof FormData) { opts.body = body; opts.headers = { Authorization: AUTH }; }
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function main() {
  // 1. All supplier invoices
  console.log("=== ALL SUPPLIER INVOICES ===");
  const siRes = await api("GET", "/supplierInvoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2027-12-31&count=1000&fields=*,supplier(*),voucher(*)");
  const sis = siRes.data?.values || [];
  console.log(`Total supplier invoices: ${sis.length}`);
  for (const si of sis) {
    console.log(`  SI id=${si.id} inv#=${si.invoiceNumber} date=${si.invoiceDate} due=${si.invoiceDueDate}`);
    console.log(`    amount=${si.amount} excVat=${si.amountExcludingVat} outstanding=${si.outstandingAmount}`);
    console.log(`    kid=${si.kidOrReceiverReference} supplier=${si.supplier?.name} (id=${si.supplier?.id})`);
    console.log(`    voucher=${si.voucher?.id} voucherNum=${si.voucher?.number}`);
    console.log(`    isCreditNote=${si.isCreditNote}`);
  }

  // 2. All suppliers
  console.log("\n=== ALL SUPPLIERS ===");
  const supRes = await api("GET", "/supplier?count=1000&fields=*");
  const suppliers = supRes.data?.values || [];
  console.log(`Total suppliers: ${suppliers.length}`);
  for (const s of suppliers) {
    console.log(`  id=${s.id} name="${s.name}" org=${s.organizationNumber} ledgerAcct=${s.ledgerAccount?.id}`);
    console.log(`    postal=${JSON.stringify(s.postalAddress?.addressLine1)} phys=${JSON.stringify(s.physicalAddress?.addressLine1)}`);
    console.log(`    bank=${JSON.stringify(s.bankAccountPresentation?.map((b:any)=>b.bban))}`);
  }

  // 3. Recent 2026 vouchers of type Leverandørfaktura
  console.log("\n=== 2026 LEVERANDØRFAKTURA VOUCHERS ===");
  const vRes = await api("GET", "/ledger/voucher?dateFrom=2026-01-01&dateTo=2027-01-01&count=1000&fields=id,number,date,description,voucherType(*)");
  const vouchers = vRes.data?.values || [];
  const levVouchers = vouchers.filter((v: any) => v.voucherType?.name?.includes("Leverandør") || v.description?.includes("Faktura nummer"));
  console.log(`Total 2026 vouchers: ${vouchers.length}, Leverandør type: ${levVouchers.length}`);
  for (const v of levVouchers) {
    console.log(`  id=${v.id} num=${v.number} date=${v.date} desc="${v.description}" type=${v.voucherType?.name}`);
  }

  // 4. Check if we can DELETE supplier invoices
  console.log("\n=== TEST DELETE CAPABILITY ===");
  if (sis.length > 0) {
    const testSi = sis[sis.length - 1]; // last one
    console.log(`Testing DELETE /supplierInvoice/${testSi.id}...`);
    const delRes = await api("DELETE", `/supplierInvoice/${testSi.id}`);
    console.log(`  Result: ${delRes.status} ${JSON.stringify(delRes.data).slice(0, 200)}`);
  }

  // 5. Check if we can DELETE suppliers
  if (suppliers.length > 0) {
    const testSup = suppliers[suppliers.length - 1];
    console.log(`Testing DELETE /supplier/${testSup.id}...`);
    const delRes = await api("DELETE", `/supplier/${testSup.id}`);
    console.log(`  Result: ${delRes.status} ${JSON.stringify(delRes.data).slice(0, 200)}`);
  }

  // 6. Check if we can DELETE/reverse vouchers
  if (levVouchers.length > 0) {
    const testV = levVouchers[levVouchers.length - 1];
    console.log(`Testing DELETE /ledger/voucher/${testV.id}...`);
    const delRes = await api("DELETE", `/ledger/voucher/${testV.id}`);
    console.log(`  Result: ${delRes.status} ${JSON.stringify(delRes.data).slice(0, 200)}`);

    if (delRes.status >= 400 && testV.number > 0) {
      console.log(`Testing REVERSE /ledger/voucher/${testV.id}/:reverse...`);
      const revRes = await api("PUT", `/ledger/voucher/${testV.id}/:reverse?date=2026-03-22`);
      console.log(`  Result: ${revRes.status} ${JSON.stringify(revRes.data).slice(0, 200)}`);
    }
  }

  // 7. Check what the company org number is (for buyer in XML)
  console.log("\n=== COMPANY INFO ===");
  const compRes = await api("GET", "/company?fields=*");
  if (compRes.status < 400) {
    const c = compRes.data?.value;
    console.log(`  name: ${c?.name}`);
    console.log(`  orgNumber: ${c?.organizationNumber}`);
    console.log(`  type: ${c?.type}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
