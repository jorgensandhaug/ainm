const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa(`0:${TOKEN}`)}`;

async function main() {
  // Try with date range
  const url = `${BASE}/supplierInvoice?invoiceDateFrom=2026-04-28&invoiceDateTo=2026-04-30&fields=id,invoiceNumber,invoiceDate,invoiceDueDate,amount,amountExcludingVat,outstandingAmount,supplier,voucher,orderLines(*)&count=10`;
  const res = await fetch(url, { headers: { Authorization: AUTH } });
  const text = await res.text();
  console.log(`→ ${res.status}`);
  try {
    const json = JSON.parse(text);
    if (json.values) {
      console.log(`Found ${json.values.length} SIs`);
      for (const si of json.values) {
        console.log("\n  id:", si.id);
        console.log("  invoiceNumber:", si.invoiceNumber);
        console.log("  invoiceDate:", si.invoiceDate);
        console.log("  invoiceDueDate:", si.invoiceDueDate);
        console.log("  amount:", si.amount);
        console.log("  amountExcludingVat:", si.amountExcludingVat);
        console.log("  outstandingAmount:", si.outstandingAmount);
        console.log("  supplier:", si.supplier?.id);
        console.log("  voucher:", si.voucher?.id);
        if (si.orderLines?.length) {
          for (const ol of si.orderLines) {
            console.log("    orderLine:", ol.description, "amount:", ol.amountExcludingVatCurrency, "vatType:", ol.vatType?.id);
          }
        }
      }
    } else {
      console.log(text.slice(0, 500));
    }
  } catch { console.log(text.slice(0, 500)); }
}
main().catch(console.error);
