const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa(`0:${TOKEN}`)}`;

async function run() {
  // Find existing supplier invoices to see all available fields
  console.log("=== All SI fields ===");
  const si = await fetch(`${BASE}/supplierInvoice?invoiceDateFrom=2025-01-01&invoiceDateTo=2027-12-31&fields=*&count=5`, {
    headers: { Authorization: AUTH }
  });
  const siData = await si.json();
  console.log("SI count:", siData.fullResultSize);
  if (siData.values?.length > 0) {
    // Print first one fully
    console.log("\nFull SI entity (first):", JSON.stringify(siData.values[0], null, 2));
    // Print just the keys
    console.log("\nAll SI keys:", Object.keys(siData.values[0]));
  }

  // Also check what orderLines look like with all fields
  if (siData.values?.length > 0) {
    const siId = siData.values[0].id;
    console.log("\n=== SI orderLines ===");
    // Try to get orderlines with full fields
    const olRes = await fetch(`${BASE}/supplierInvoice/${siId}?fields=id,orderLines(*)`, {
      headers: { Authorization: AUTH }
    });
    const olData = await olRes.json();
    console.log("OrderLines:", JSON.stringify(olData.value?.orderLines, null, 2));
  }

  // Check what the voucher looks like with full fields
  if (siData.values?.length > 0) {
    const voucherId = siData.values[0].voucher?.id;
    if (voucherId) {
      console.log("\n=== Voucher full fields ===");
      const vRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?fields=*`, {
        headers: { Authorization: AUTH }
      });
      const vData = await vRes.json();
      console.log("Voucher:", JSON.stringify(vData.value, null, 2));

      console.log("\n=== Postings full fields ===");
      const pRes = await fetch(`${BASE}/ledger/posting?voucherId=${voucherId}&fields=*`, {
        headers: { Authorization: AUTH }
      });
      const pData = await pRes.json();
      for (const p of pData.values || []) {
        console.log(`Posting row ${p.row}:`, JSON.stringify(p, null, 2));
      }
    }
  }
}

run().catch(e => { console.error("FATAL:", e); process.exit(1); });
