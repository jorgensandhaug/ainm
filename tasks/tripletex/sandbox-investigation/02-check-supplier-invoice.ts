// Check what supplierInvoice objects exist after our import flow
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method, headers: H });
  const data = await res.json();
  console.log(`${method} ${path} => ${res.status}`);
  return { status: res.status, data };
}

async function main() {
  // Search supplierInvoice with date range
  const siRes = await api("GET", "/supplierInvoice?invoiceDateFrom=2026-03-01&invoiceDateTo=2026-03-31&count=100&fields=*");

  console.log("Total supplierInvoice count:", siRes.data?.fullResultSize);

  if (siRes.data?.values?.length > 0) {
    for (const si of siRes.data.values.slice(-10)) {
      console.log("\n--- SupplierInvoice ---");
      console.log("  id:", si.id);
      console.log("  invoiceNumber:", si.invoiceNumber);
      console.log("  amount:", si.amount);
      console.log("  amountCurrency:", si.amountCurrency);
      console.log("  invoiceDate:", si.invoiceDate);
      console.log("  invoiceDueDate:", si.invoiceDueDate);
      console.log("  supplier:", si.supplier?.id, si.supplier?.url);
      console.log("  voucher:", si.voucher?.id);
      console.log("  isCreditNote:", si.isCreditNote);
      console.log("  paymentTypeId:", si.paymentTypeId);
      console.log("  amountRoundoff:", si.amountRoundoff);
      console.log("  currency:", si.currency?.id);
      // Check all keys
      const keys = Object.keys(si).filter(k => si[k] != null && si[k] !== "" && si[k] !== 0 && si[k] !== false);
      console.log("  non-null fields:", keys.join(", "));
    }
  }

  // Also check: what does sendToLedger=true vs false change?
  // Read a specific voucher to see its booking state
  const vRes = await api("GET", "/ledger/voucher/609088198?fields=*");
  console.log("\nVoucher 609088198 number:", vRes.data?.value?.number);
  console.log("Voucher numberAsString:", vRes.data?.value?.numberAsString);

  // Check the supplierInvoice linked to the voucher we just created
  const siByDate = await api("GET", "/supplierInvoice?invoiceDateFrom=2026-03-21&invoiceDateTo=2026-03-22&count=10&fields=*&sorting=id&order=desc");

  console.log("\n=== Latest supplierInvoices on 2026-03-21 ===");
  if (siByDate.data?.values?.length > 0) {
    for (const si of siByDate.data.values.slice(0, 5)) {
      console.log(`  id=${si.id} invoiceNumber="${si.invoiceNumber}" amount=${si.amount} voucher=${si.voucher?.id} supplier=${si.supplier?.id}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
