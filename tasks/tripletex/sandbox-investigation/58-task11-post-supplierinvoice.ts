// Test POST /supplierInvoice directly — skip importDocument entirely
// Also test PUT /supplierInvoice/{id} to fix fields
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} => ${res.status}`);
  if (res.status >= 400) console.log("  ERR:", JSON.stringify(json, null, 2).slice(0, 800));
  return { status: res.status, data: json };
}

async function main() {
  const date = "2026-03-21";
  const orgNr = "987654325";
  const invoiceNr = "INV-POST-SI-001";
  const gross = 42100;
  const net = 33680;
  const vat = 8420;
  const desc = "kontortjenester";

  // Step 1: Create supplier
  console.log("=== Step 1: POST /supplier ===");
  const supRes = await api("POST", "/supplier", { name: "PostSI Test AS", organizationNumber: orgNr });
  const supplierId = supRes.data.value.id;
  console.log(`  supplierId=${supplierId}`);

  // Step 2: Get account
  const acctRes = await api("GET", "/ledger/account?number=6540&isApplicableForSupplierInvoice=true&fields=*");
  const expenseAcctId = acctRes.data.values[0].id;

  // Step 3: Try POST /supplierInvoice with various field combos
  console.log("\n=== Test A: POST /supplierInvoice (minimal) ===");
  const testA = await api("POST", "/supplierInvoice", {
    invoiceNumber: invoiceNr,
    invoiceDate: date,
    invoiceDueDate: date,
    supplier: { id: supplierId },
    amount: gross,
    amountExcludingVat: net,
  });

  console.log("\n=== Test B: POST /supplierInvoice (with currency) ===");
  const testB = await api("POST", "/supplierInvoice", {
    invoiceNumber: invoiceNr + "-B",
    invoiceDate: date,
    invoiceDueDate: date,
    supplier: { id: supplierId },
    amount: gross,
    amountCurrency: gross,
    amountExcludingVat: net,
    amountExcludingVatCurrency: net,
    currency: { id: 1 },
    isCreditNote: false,
  });

  console.log("\n=== Test C: POST /supplierInvoice (with voucher ref) ===");
  // First create a manual voucher
  const vRes = await api("POST", "/ledger/voucher?sendToLedger=false", {
    date: date,
    description: desc,
    postings: [
      {
        row: 1, date, description: desc,
        account: { id: expenseAcctId },
        vatType: { id: 1 },
        amountGross: gross, amountGrossCurrency: gross,
      },
      {
        row: 2, date, description: desc,
        account: { id: supRes.data.value.ledgerAccount.id },
        supplier: { id: supplierId },
        amount: -gross, amountCurrency: -gross,
        amountGross: -gross, amountGrossCurrency: -gross,
        invoiceNumber: invoiceNr + "-C",
        termOfPayment: date,
      },
    ],
  });
  if (vRes.status === 201) {
    const voucherId = vRes.data.value.id;
    console.log(`  Created voucher ${voucherId}`);

    const testC = await api("POST", "/supplierInvoice", {
      invoiceNumber: invoiceNr + "-C",
      invoiceDate: date,
      invoiceDueDate: date,
      supplier: { id: supplierId },
      voucher: { id: voucherId },
      amount: gross,
      amountExcludingVat: net,
      currency: { id: 1 },
    });
  }

  // Step 4: Try PUT /supplierInvoice on an existing one from importDocument
  console.log("\n=== Test D: Check existing supplierInvoice from previous test ===");
  // Use the supplierInvoice ID from our deep verify test (id=2147641368)
  const getExisting = await api("GET", "/supplierInvoice/2147641368?fields=*");
  if (getExisting.status === 200) {
    const si = getExisting.data.value;
    console.log(`  SI id=${si.id} ver=${si.version} inv=${si.invoiceNumber}`);

    console.log("\n=== Test E: PUT /supplierInvoice/{id} (try to update fields) ===");
    const putSI = await api("PUT", `/supplierInvoice/${si.id}`, {
      id: si.id,
      version: si.version,
      invoiceNumber: si.invoiceNumber,
      invoiceDate: si.invoiceDate,
      invoiceDueDate: si.invoiceDueDate,
      supplier: { id: si.supplier.id },
      voucher: { id: si.voucher.id },
      amount: si.amount,
      amountCurrency: si.amountCurrency,
      amountExcludingVat: si.amountExcludingVat,
      amountExcludingVatCurrency: si.amountExcludingVatCurrency,
      currency: si.currency,
      isCreditNote: false,
    });
  }

  // Step 5: Check OpenAPI for supplierInvoice endpoints
  console.log("\n=== Test F: Try other supplierInvoice endpoints ===");
  // Try /supplierInvoice/:register
  const testF1 = await api("POST", "/supplierInvoice/:register", {
    invoiceNumber: invoiceNr + "-F",
    invoiceDate: date,
    supplier: { id: supplierId },
    amount: gross,
  });

  // Try /supplierInvoice/:createInvoice
  const testF2 = await api("POST", "/supplierInvoice/:createInvoice", {
    invoiceNumber: invoiceNr + "-G",
    invoiceDate: date,
    supplier: { id: supplierId },
    amount: gross,
  });

  // Try PATCH
  const testF3 = await api("PATCH", "/supplierInvoice/2147641368", {
    invoiceNumber: "INV-DEEP-001-PATCHED",
  });
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
