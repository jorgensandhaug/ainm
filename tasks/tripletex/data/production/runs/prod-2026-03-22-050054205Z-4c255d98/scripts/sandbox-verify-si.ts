// Verify supplierInvoice entity created by the E2E test

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa(`0:${TOKEN}`)}`;

async function main() {
  // Search for recent supplierInvoices
  const url = `${BASE}/supplierInvoice?invoiceDateFrom=2026-04-01&invoiceDateTo=2026-05-30&fields=*&count=5&sorting=invoiceDate,desc`;
  const res = await fetch(url, { headers: { Authorization: AUTH } });
  const json = await res.json();
  console.log(`GET /supplierInvoice → ${res.status}, count: ${json.values?.length}`);

  for (const si of json.values || []) {
    console.log("\n--- SupplierInvoice ---");
    console.log("  id:", si.id);
    console.log("  invoiceNumber:", si.invoiceNumber);
    console.log("  invoiceDate:", si.invoiceDate);
    console.log("  invoiceDueDate:", si.invoiceDueDate);
    console.log("  amount:", si.amount);
    console.log("  amountExcludingVat:", si.amountExcludingVat);
    console.log("  amountExcludingVatCurrency:", si.amountExcludingVatCurrency);
    console.log("  outstandingAmount:", si.outstandingAmount);
    console.log("  supplier:", si.supplier?.id, si.supplier?.name);
    console.log("  voucher:", si.voucher?.id, "number:", si.voucher?.number);
    console.log("  isApproved:", si.isApproved);
    console.log("  isCreditNote:", si.isCreditNote);
    console.log("  orderLines count:", si.orderLines?.length);
    if (si.orderLines?.length) {
      for (const ol of si.orderLines) {
        console.log("    orderLine:", ol.id, "description:", ol.description, "amount:", ol.amountExcludingVatCurrency, "vatType:", ol.vatType?.id);
      }
    }
  }
}

main().catch(console.error);
