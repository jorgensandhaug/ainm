/**
 * Test if setting vendorInvoiceNumber on direct POST /ledger/voucher creates a supplierInvoice entity.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa("0:" + TOKEN)}`;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path.substring(0, 80)} → ${res.status}`);
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  const date = "2026-03-22";

  // Create supplier
  const sRes = await api("POST", "/supplier", { name: "VendorInvNum AS", organizationNumber: "823456786" });
  if (!sRes.ok) { console.error("Supplier fail:", sRes.data); return; }
  const supplierId = sRes.data.value.id;
  const supplierLedger = sRes.data.value.ledgerAccount.id;

  // Get expense account + voucherType
  const acctRes = await api("GET", "/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=*");
  const expAcctId = acctRes.data.values[0].id;
  const vtRes = await api("GET", "/ledger/voucherType?name=Leverand%C3%B8rfaktura&fields=*");
  const vtId = vtRes.data.values[0].id;

  // Test A: Direct POST with vendorInvoiceNumber
  console.log("\n=== Test A: POST with vendorInvoiceNumber ===");
  const postA = await api("POST", "/ledger/voucher?sendToLedger=false", {
    date,
    description: "kontortjenester",
    voucherType: { id: vtId },
    vendorInvoiceNumber: "INV-VIN-001",
    postings: [
      { row: 1, date, description: "kontortjenester", account: { id: expAcctId }, vatType: { id: 1 }, amount: 10000, amountCurrency: 10000, amountGross: 12500, amountGrossCurrency: 12500 },
      { row: 2, date, description: "kontortjenester", account: { id: supplierLedger }, supplier: { id: supplierId }, amount: -12500, amountCurrency: -12500, amountGross: -12500, amountGrossCurrency: -12500, invoiceNumber: "INV-VIN-001", termOfPayment: date },
    ],
  });
  if (!postA.ok) { console.error("POST A fail:", JSON.stringify(postA.data).substring(0, 500)); return; }
  const vIdA = postA.data.value.id;
  console.log(`  Voucher A: id=${vIdA} number=${postA.data.value.number} vendorInvoiceNumber=${postA.data.value.vendorInvoiceNumber}`);

  // Check supplierInvoice
  const siA = await api("GET", `/supplierInvoice?invoiceDateFrom=${date}&invoiceDateTo=2026-03-23&fields=*`);
  const matchA = siA.data.values?.find((si: any) => si.voucher?.id === vIdA);
  console.log(`  supplierInvoice for A: ${matchA ? `id=${matchA.id} invoiceNumber="${matchA.invoiceNumber}" supplier=${JSON.stringify(matchA.supplier)}` : 'NOT FOUND'}`);

  // Also check by voucherId query
  const siA2 = await api("GET", `/supplierInvoice?voucherId=${vIdA}&fields=*`);
  console.log(`  supplierInvoice by voucherId: count=${siA2.data.count || 0}`);

  // Test B: POST with vendorInvoiceNumber AND sendToLedger=true
  console.log("\n=== Test B: POST with vendorInvoiceNumber + sendToLedger=true ===");
  const postB = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date,
    description: "kontortjenester B",
    voucherType: { id: vtId },
    vendorInvoiceNumber: "INV-VIN-002",
    postings: [
      { row: 1, date, description: "kontortjenester B", account: { id: expAcctId }, vatType: { id: 1 }, amount: 10000, amountCurrency: 10000, amountGross: 12500, amountGrossCurrency: 12500 },
      { row: 2, date, description: "kontortjenester B", account: { id: supplierLedger }, supplier: { id: supplierId }, amount: -12500, amountCurrency: -12500, amountGross: -12500, amountGrossCurrency: -12500, invoiceNumber: "INV-VIN-002", termOfPayment: date },
    ],
  });
  if (!postB.ok) { console.error("POST B fail:", JSON.stringify(postB.data).substring(0, 500)); return; }
  const vIdB = postB.data.value.id;
  console.log(`  Voucher B: id=${vIdB} number=${postB.data.value.number}`);

  const siB = await api("GET", `/supplierInvoice?invoiceDateFrom=${date}&invoiceDateTo=2026-03-23&fields=*`);
  const matchB = siB.data.values?.find((si: any) => si.voucher?.id === vIdB);
  console.log(`  supplierInvoice for B: ${matchB ? `id=${matchB.id} invoiceNumber="${matchB.invoiceNumber}"` : 'NOT FOUND'}`);

  // Read back voucher A to check supplierVoucherType
  const vARead = await api("GET", `/ledger/voucher/${vIdA}?fields=*`);
  console.log(`\nVoucher A readback: supplierVoucherType=${vARead.data.value?.supplierVoucherType}`);
  console.log(`  vendorInvoiceNumber=${vARead.data.value?.vendorInvoiceNumber}`);

  // Print all supplierInvoices to see if any got created
  console.log("\n=== ALL recent supplierInvoices ===");
  const siAll = await api("GET", `/supplierInvoice?invoiceDateFrom=${date}&invoiceDateTo=2026-03-23&fields=*`);
  console.log(`  Total count: ${siAll.data.count || 0}`);
  for (const si of (siAll.data.values || [])) {
    console.log(`  SI id=${si.id} invoiceNumber="${si.invoiceNumber}" voucher.id=${si.voucher?.id} supplier=${JSON.stringify(si.supplier)}`);
  }
}

main().catch(console.error);
