// Check which supplier the importDocument-created supplierInvoice is linked to
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// From the previous test run
const VOUCHER_ID = 609180889;
const CREATED_SUPPLIER_ID = 108439395;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH } };
  if (body) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`${method} ${path} → ${r.status}`);
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!r.ok) { console.log("ERROR:", JSON.stringify(json).slice(0, 800)); }
  return { ok: r.ok, status: r.status, data: json };
}

async function main() {
  // 1. Read the voucher to see its current state
  console.log("=== STEP 1: Read voucher ===");
  const voucherRes = await api("GET", `/ledger/voucher/${VOUCHER_ID}?fields=*`);
  if (voucherRes.ok) {
    const v = voucherRes.data.value;
    console.log(`Voucher id=${v.id} number=${v.number} version=${v.version}`);
    console.log(`Postings: ${v.postings?.length}`);
    if (v.postings) {
      for (const p of v.postings) {
        console.log(`  row=${p.row} account=${p.account?.number} amount=${p.amount} supplier=${p.supplier?.id}`);
      }
    }
  }

  // 2. Search supplierInvoice with proper date params
  console.log("\n=== STEP 2: Search supplierInvoice ===");
  const siRes = await api("GET", `/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&count=20&sorting=id&sortDirection=desc&fields=id,invoiceNumber,voucher(id),supplier(id,name,organizationNumber,postalAddress(*),bankAccountPresentation(*))`);
  if (siRes.ok && siRes.data?.values) {
    console.log(`Total supplier invoices: ${siRes.data.fullResultSize}`);
    for (const si of siRes.data.values) {
      const match = si.voucher?.id === VOUCHER_ID ? " *** MATCH ***" : "";
      console.log(`  SI id=${si.id} inv=${si.invoiceNumber} voucher=${si.voucher?.id} supplier=${si.supplier?.id}/${si.supplier?.name}${match}`);
      if (si.voucher?.id === VOUCHER_ID) {
        console.log(`    Linked supplier id: ${si.supplier?.id}`);
        console.log(`    Linked supplier name: ${si.supplier?.name}`);
        console.log(`    Linked supplier org: ${si.supplier?.organizationNumber}`);
        console.log(`    Linked supplier addr: ${si.supplier?.postalAddress?.addressLine1 || '(empty)'}`);
        console.log(`    Linked supplier bank: ${JSON.stringify(si.supplier?.bankAccountPresentation?.map((b: any) => b.bban) || [])}`);

        if (si.supplier?.id === CREATED_SUPPLIER_ID) {
          console.log(`\n    *** Invoice linked to OUR manually created supplier (${CREATED_SUPPLIER_ID}) ***`);
        } else {
          console.log(`\n    *** Invoice linked to DIFFERENT supplier (${si.supplier?.id}) - NOT our manually created one (${CREATED_SUPPLIER_ID}) ***`);
          console.log(`    *** This is the ROOT CAUSE of Check 5 failure! ***`);
        }
      }
    }
  }

  // 3. Also check: what happens to the supplierInvoice.supplier after we PUT postings with our supplier?
  // First, let's set postings on this voucher with our manually created supplier
  console.log("\n=== STEP 3: Resolve expense account 6300 ===");
  const acctRes = await api("GET", "/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*");
  const expenseAccountId = acctRes.data?.values?.[0]?.id;
  console.log("Expense account id:", expenseAccountId);

  console.log("\n=== STEP 4: PUT postings with OUR supplier id ===");
  const putRes = await api("PUT", `/ledger/voucher/${VOUCHER_ID}?sendToLedger=false`, {
    version: 1,
    postings: [
      {
        row: 1,
        account: { id: expenseAccountId },
        description: "Testtjenester",
        vatType: { id: 1 },
        amount: 20000,
        amountCurrency: 20000,
        amountGross: 25000,
        amountGrossCurrency: 25000
      },
      {
        row: 2,
        account: { id: 424190921 }, // supplierLedgerAccountId
        supplier: { id: CREATED_SUPPLIER_ID },
        description: "Testtjenester",
        amount: -25000,
        amountCurrency: -25000,
        amountGross: -25000,
        amountGrossCurrency: -25000,
        invoiceNumber: "INV-DUP-TEST-31309756",
        termOfPayment: "2026-04-21"
      }
    ]
  });
  if (putRes.ok) {
    console.log("PUT succeeded, version:", putRes.data.value.version);
  }

  // 5. Book the voucher
  console.log("\n=== STEP 5: Book the voucher ===");
  const bookRes = await api("PUT", `/ledger/voucher/${VOUCHER_ID}?sendToLedger=true`, {
    version: putRes.data?.value?.version
  });
  if (bookRes.ok) {
    console.log("Booked! number:", bookRes.data.value.number);
  }

  // 6. Re-check supplierInvoice — did the supplier link change?
  console.log("\n=== STEP 6: Re-check supplierInvoice after PUT+book ===");
  const siRes2 = await api("GET", `/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&count=20&sorting=id&sortDirection=desc&fields=id,invoiceNumber,voucher(id),supplier(id,name,organizationNumber,postalAddress(*),bankAccountPresentation(*))`);
  if (siRes2.ok && siRes2.data?.values) {
    for (const si of siRes2.data.values) {
      if (si.voucher?.id === VOUCHER_ID) {
        console.log(`\nAfter PUT+book, supplierInvoice id=${si.id}:`);
        console.log(`  Linked supplier id: ${si.supplier?.id}`);
        console.log(`  Linked supplier name: ${si.supplier?.name}`);
        console.log(`  Linked supplier org: ${si.supplier?.organizationNumber}`);
        console.log(`  Linked supplier addr: ${si.supplier?.postalAddress?.addressLine1 || '(empty)'}`);
        console.log(`  Linked supplier bank: ${JSON.stringify(si.supplier?.bankAccountPresentation?.map((b: any) => b.bban) || [])}`);

        if (si.supplier?.id === CREATED_SUPPLIER_ID) {
          console.log(`  *** Now linked to OUR supplier (${CREATED_SUPPLIER_ID}) ***`);
        } else {
          console.log(`  *** STILL linked to DIFFERENT supplier (${si.supplier?.id}) ***`);
        }
      }
    }
  }
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
