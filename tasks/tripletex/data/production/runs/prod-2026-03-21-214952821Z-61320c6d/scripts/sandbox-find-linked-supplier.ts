// Find which supplier the importDocument-created supplierInvoice links to
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const VOUCHER_ID = 609180889;
const CREATED_SUPPLIER_ID = 108439395;

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { method, headers: { Authorization: "Basic " + btoa("0:" + TOKEN) } });
  const text = await r.text();
  console.log(`${method} ${path} → ${r.status}`);
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!r.ok) { console.log("ERROR:", JSON.stringify(json).slice(0, 500)); }
  return { ok: r.ok, status: r.status, data: json };
}

async function main() {
  // Search for supplierInvoice by voucherId
  console.log("=== Search supplierInvoice by voucherId ===");
  const res1 = await api("GET", `/supplierInvoice?invoiceDateFrom=2026-03-01&invoiceDateTo=2026-04-30&voucherId=${VOUCHER_ID}&fields=*,supplier(id,name,organizationNumber,postalAddress(*),bankAccountPresentation(*))`);
  if (res1.ok && res1.data?.values?.length > 0) {
    for (const si of res1.data.values) {
      console.log(`\nsupplierInvoice id=${si.id}:`);
      console.log(`  invoiceNumber: ${si.invoiceNumber}`);
      console.log(`  voucher.id: ${si.voucher?.id}`);
      console.log(`  supplier.id: ${si.supplier?.id}`);
      console.log(`  supplier.name: ${si.supplier?.name}`);
      console.log(`  supplier.organizationNumber: ${si.supplier?.organizationNumber}`);
      console.log(`  supplier.postalAddress.addressLine1: ${si.supplier?.postalAddress?.addressLine1 || '(empty)'}`);
      console.log(`  supplier.postalAddress.postalCode: ${si.supplier?.postalAddress?.postalCode || '(empty)'}`);
      console.log(`  supplier.postalAddress.city: ${si.supplier?.postalAddress?.city || '(empty)'}`);
      console.log(`  supplier.bank: ${JSON.stringify(si.supplier?.bankAccountPresentation?.map((b: any) => b.bban) || [])}`);

      if (si.supplier?.id === CREATED_SUPPLIER_ID) {
        console.log(`  RESULT: Linked to OUR supplier (${CREATED_SUPPLIER_ID})`);
      } else {
        console.log(`  RESULT: Linked to DIFFERENT supplier (${si.supplier?.id}) NOT our created one (${CREATED_SUPPLIER_ID})`);
      }
    }
  } else {
    console.log("No results by voucherId. Trying broader search...");
  }

  // Also try searching recent ones with from/to
  console.log("\n=== Last 5 supplier invoices ===");
  const res2 = await api("GET", `/supplierInvoice?invoiceDateFrom=2026-03-21&invoiceDateTo=2026-03-22&fields=id,invoiceNumber,voucher(id),supplier(id,name,organizationNumber)`);
  if (res2.ok && res2.data?.values) {
    console.log(`Total: ${res2.data.fullResultSize}`);
    for (const si of res2.data.values) {
      const match = si.voucher?.id === VOUCHER_ID ? " *** MATCH ***" : "";
      console.log(`  SI id=${si.id} inv=${si.invoiceNumber} voucher=${si.voucher?.id} supplier=${si.supplier?.id}/${si.supplier?.name}${match}`);
    }
  }

  // Try getting the voucher itself to see its supplier posting
  console.log("\n=== Voucher postings (supplier row shows linked supplier) ===");
  const res3 = await api("GET", `/ledger/voucher/${VOUCHER_ID}?fields=*`);
  if (res3.ok) {
    const v = res3.data.value;
    console.log(`Voucher id=${v.id} number=${v.number} version=${v.version}`);
    if (v.postings) {
      for (const p of v.postings) {
        console.log(`  row=${p.row} account=${p.account?.number} amount=${p.amount} amountGross=${p.amountGross} supplier=${p.supplier?.id}/${p.supplier?.name} invoiceNumber=${p.invoiceNumber}`);
      }
    }
  }
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
