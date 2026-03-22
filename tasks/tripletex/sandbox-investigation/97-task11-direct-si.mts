/**
 * Task 11: Test POST /supplierInvoice with voucher.postings
 * This is the approach that might work for scoring.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + Buffer.from("0:" + TOKEN).toString("base64");

async function api(method: string, path: string, body?: any, isFormData = false) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH, Accept: "application/json" };
  if (!isFormData && body) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`${method} ${path} => ${res.status}`);
    console.error(text.substring(0, 1000));
  } else {
    console.log(`${method} ${path} => ${res.status}`);
  }
  return { ok: res.ok, status: res.status, data: text ? JSON.parse(text) : null };
}

const uid = Date.now().toString(36);

async function main() {
  // First, create a supplier
  const { data: supplierData } = await api("POST", "/supplier", {
    name: `DirectSI-${uid}`,
    organizationNumber: "848657514",
  });
  const supplierId = supplierData.value.id;
  const supplierLedgerAccountId = supplierData.value.ledgerAccount.id;
  console.log(`Supplier: id=${supplierId}, ledger=${supplierLedgerAccountId}`);

  // Get expense account
  const { data: acctData } = await api("GET", "/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*");
  const expenseAccountId = acctData.values[0].id;
  console.log(`Expense account id=${expenseAccountId}`);

  const invoiceNumber = `INV-D-${uid}`;
  const date = "2026-03-22";
  const dueDate = "2026-04-22";
  const net = 40000;
  const gross = 50000;
  const vatAmt = 10000;

  // Try POST /supplierInvoice with voucher.postings
  console.log("\n=== TEST 1: POST /supplierInvoice with postings ===");
  const r1 = await api("POST", "/supplierInvoice", {
    invoiceNumber: invoiceNumber,
    invoiceDate: date,
    invoiceDueDate: dueDate,
    supplier: { id: supplierId },
    currency: { id: 1 },
    voucher: {
      date: date,
      description: `Faktura ${invoiceNumber}`,
      postings: [
        {
          row: 1,
          account: { id: expenseAccountId },
          vatType: { id: 1 },
          amount: net,
          amountCurrency: net,
          amountGross: gross,
          amountGrossCurrency: gross,
        },
        {
          row: 2,
          account: { id: supplierLedgerAccountId },
          supplier: { id: supplierId },
          amount: -gross,
          amountCurrency: -gross,
          amountGross: -gross,
          amountGrossCurrency: -gross,
          invoiceNumber: invoiceNumber,
          termOfPayment: dueDate,
        },
      ],
    },
  });

  if (r1.ok) {
    const si = r1.data.value;
    console.log(`  SI created: id=${si.id}`);
    console.log(`  invoiceNumber: ${si.invoiceNumber}`);
    console.log(`  amount: ${si.amount}`);
    console.log(`  amountCurrency: ${si.amountCurrency}`);
    console.log(`  voucher.id: ${si.voucher?.id}`);
    console.log(`  supplierVoucherType: ${si.supplierVoucherType}`);

    // Get full details
    const r1d = await api("GET", `/supplierInvoice/${si.id}?fields=*,voucher(*,postings(*)),supplier(*),orderLines(*)`);
    if (r1d.ok) {
      const d = r1d.data.value;
      console.log(`\n  --- Full details ---`);
      console.log(`  amount: ${d.amount}`);
      console.log(`  amountCurrency: ${d.amountCurrency}`);
      console.log(`  amountExcludingVat: ${d.amountExcludingVat}`);
      console.log(`  amountExcludingVatCurrency: ${d.amountExcludingVatCurrency}`);
      console.log(`  isCreditNote: ${d.isCreditNote}`);
      console.log(`  supplierVoucherType: ${d.supplierVoucherType}`);
      console.log(`  orderLines: ${d.orderLines?.length ?? 0}`);
      console.log(`  voucher.number: ${d.voucher?.number}`);
      console.log(`  voucher postings: ${d.voucher?.postings?.length ?? 0}`);
      if (d.voucher?.postings) {
        for (const p of d.voucher.postings) {
          console.log(`    posting: row=${p.row}, account.number=${p.account?.number}, amount=${p.amount}, amountGross=${p.amountGross}, supplier=${p.supplier?.id}, invoiceNumber=${p.invoiceNumber}`);
        }
      }

      // Now book it
      if (d.voucher?.id) {
        console.log(`\n  Booking voucher ${d.voucher.id}...`);
        const bookR = await api("PUT", `/ledger/voucher/${d.voucher.id}?sendToLedger=true`, {
          version: d.voucher.version,
        });
        if (bookR.ok) {
          console.log(`  Booked, number=${bookR.data.value.number}`);

          // Re-fetch SI
          const finalR = await api("GET", `/supplierInvoice/${si.id}?fields=*,voucher(*,postings(*)),supplier(*),orderLines(*)`);
          if (finalR.ok) {
            const f = finalR.data.value;
            console.log(`\n  --- After booking ---`);
            console.log(`  amount: ${f.amount}`);
            console.log(`  amountCurrency: ${f.amountCurrency}`);
            console.log(`  voucher.number: ${f.voucher?.number}`);
            console.log(`  orderLines: ${f.orderLines?.length ?? 0}`);
            console.log(`  outstandingAmount: ${f.outstandingAmount}`);
            console.log(`  FULL KEYS: ${Object.keys(f).join(', ')}`);
          }
        }
      }
    }
  }

  // Try TEST 2: POST /supplierInvoice with orderLines + voucher.postings
  console.log("\n\n=== TEST 2: POST /supplierInvoice with orderLines + postings ===");
  const inv2 = `INV-D2-${uid}`;
  const r2 = await api("POST", "/supplierInvoice", {
    invoiceNumber: inv2,
    invoiceDate: date,
    invoiceDueDate: dueDate,
    supplier: { id: supplierId },
    currency: { id: 1 },
    orderLines: [
      {
        description: "kontortjenester",
        count: 1,
        unitCostCurrency: net,
        vatType: { id: 1 },
      },
    ],
    voucher: {
      date: date,
      description: `Faktura ${inv2}`,
      postings: [
        {
          row: 1,
          account: { id: expenseAccountId },
          vatType: { id: 1 },
          amount: net,
          amountCurrency: net,
          amountGross: gross,
          amountGrossCurrency: gross,
        },
        {
          row: 2,
          account: { id: supplierLedgerAccountId },
          supplier: { id: supplierId },
          amount: -gross,
          amountCurrency: -gross,
          amountGross: -gross,
          amountGrossCurrency: -gross,
          invoiceNumber: inv2,
          termOfPayment: dueDate,
        },
      ],
    },
  });

  if (r2.ok) {
    const si2 = r2.data.value;
    console.log(`  SI created: id=${si2.id}, amount=${si2.amount}`);

    const r2d = await api("GET", `/supplierInvoice/${si2.id}?fields=*,voucher(*,postings(*)),orderLines(*)`);
    if (r2d.ok) {
      const d2 = r2d.data.value;
      console.log(`  amount: ${d2.amount}`);
      console.log(`  orderLines: ${d2.orderLines?.length ?? 0}`);
      if (d2.orderLines?.length > 0) {
        for (const ol of d2.orderLines) {
          console.log(`    orderLine: ${ol.description}, unitCostCurrency=${ol.unitCostCurrency}, amountExcludingVatCurrency=${ol.amountExcludingVatCurrency}, amountIncludingVatCurrency=${ol.amountIncludingVatCurrency}`);
        }
      }
      console.log(`  voucher postings: ${d2.voucher?.postings?.length ?? 0}`);
      if (d2.voucher?.postings) {
        for (const p of d2.voucher.postings) {
          console.log(`    posting: row=${p.row}, account=${p.account?.number}, amount=${p.amount}, amountGross=${p.amountGross}`);
        }
      }
    }
  }

  console.log("\n\n=== DONE ===");
}

main().catch(e => { console.error(e); process.exit(1); });
