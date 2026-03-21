const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function run() {
  // Check the auto-created supplier 108417112 from the previous test
  console.log("=== Fetch auto-created supplier details ===");
  const supRes = await fetch(`${BASE}/supplier/108417112?fields=*`, { headers: H });
  const supData = await supRes.json();
  console.log("Supplier:", JSON.stringify(supData.value, null, 2));

  // Check if the auto-created supplier's address contains XML data
  const addr = supData.value?.postalAddress;
  console.log("\nPostal address details:");
  console.log("addressLine1:", addr?.addressLine1);
  console.log("postalCode:", addr?.postalCode);
  console.log("city:", addr?.city);

  // Check bank accounts
  console.log("\nbankAccountPresentation:", JSON.stringify(supData.value?.bankAccountPresentation));

  // Check if the import also created a supplierInvoice
  console.log("\n=== Check supplierInvoice for voucher 609136068 ===");
  const siRes = await fetch(`${BASE}/supplierInvoice?voucherId=609136068&fields=*`, { headers: H });
  const siData = await siRes.json();
  console.log("SupplierInvoice count:", siData.values?.length);
  if (siData.values?.length > 0) {
    const si = siData.values[0];
    console.log("supplierInvoice.id:", si.id);
    console.log("supplierInvoice.supplier.id:", si.supplier?.id);
    console.log("supplierInvoice.supplier:", JSON.stringify(si.supplier));
  }
}

run().catch(e => { console.error(e); process.exit(1); });
