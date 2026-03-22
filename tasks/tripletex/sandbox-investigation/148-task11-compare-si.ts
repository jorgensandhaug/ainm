const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa("0:" + TOKEN)}`;

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  // Find ALL supplierInvoices from today
  const si = await api("GET", "/supplierInvoice?invoiceDateFrom=2026-03-22&invoiceDateTo=2026-03-23&fields=id,invoiceNumber,invoiceDate,invoiceDueDate,supplier(id,name),amount,amountCurrency,amountExcludingVat,amountExcludingVatCurrency,currency(id),voucher(id,number),outstandingAmount,isCreditNote,kidOrReceiverReference,orderLines(id,count,amountExcludingVatCurrency,vatType(id,number))");
  if (!si.ok) { console.log("SI query fail:", si.status, JSON.stringify(si.data).substring(0, 500)); return; }

  console.log(`Found ${si.data.count} supplierInvoices\n`);
  for (const s of si.data.values || []) {
    console.log(`SI id=${s.id} invoiceNum="${s.invoiceNumber}"`);
    console.log(`  supplier: ${s.supplier?.id} "${s.supplier?.name}"`);
    console.log(`  amount=${s.amount} amountExVat=${s.amountExcludingVat} outstanding=${s.outstandingAmount}`);
    console.log(`  amountCurrency=${s.amountCurrency} amountExVatCurrency=${s.amountExcludingVatCurrency}`);
    console.log(`  voucher: id=${s.voucher?.id} num=${s.voucher?.number}`);
    console.log(`  dueDate=${s.invoiceDueDate} kid="${s.kidOrReceiverReference}" creditNote=${s.isCreditNote}`);
    console.log(`  orderLines: ${s.orderLines?.length || 0}`);
    for (const ol of (s.orderLines || [])) {
      console.log(`    OL id=${ol.id} count=${ol.count} amtExVat=${ol.amountExcludingVatCurrency} vat=${ol.vatType?.id}(${ol.vatType?.number})`);
    }

    // Read voucher
    const v = await api("GET", `/ledger/voucher/${s.voucher?.id}?fields=id,number,description,date,voucherType(name),vendorInvoiceNumber`);
    if (v.ok) {
      console.log(`  voucher desc="${v.data.value.description}" vendorInv="${v.data.value.vendorInvoiceNumber}" type="${v.data.value.voucherType?.name}"`);
    }
    console.log();
  }
}

main().catch(console.error);
