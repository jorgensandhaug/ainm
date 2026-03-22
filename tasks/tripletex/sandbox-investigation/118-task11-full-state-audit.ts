/**
 * Task 11 deep state audit: Create a supplier invoice using direct POST /ledger/voucher,
 * then query EVERY possible endpoint to understand the full state.
 * This helps us understand what the scorer might be checking.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa("0:" + TOKEN)}`;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH };
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  const supplierName = "AuditTest Leverandør AS";
  const orgNumber = "987654329";
  const invoiceNumber = "INV-2026-AUDIT-1";
  const description = "konsulenttjenester";
  const gross = 12500;
  const net = 10000;
  const expenseAccount = 7140;
  const date = "2026-03-22";

  console.log("=== STEP 1: Create supplier ===");
  const supplierRes = await api("POST", "/supplier", {
    name: supplierName,
    organizationNumber: orgNumber,
  });
  if (!supplierRes.ok) { console.error("FAIL:", supplierRes.data); return; }
  const supplierId = supplierRes.data.value.id;
  const supplierLedgerAccountId = supplierRes.data.value.ledgerAccount.id;
  console.log(`Supplier: id=${supplierId}, ledgerAccount=${supplierLedgerAccountId}`);

  console.log("\n=== STEP 2: Get expense account ===");
  const acctRes = await api("GET", `/ledger/account?number=${expenseAccount}&isApplicableForSupplierInvoice=true&fields=*`);
  if (!acctRes.ok) { console.error("FAIL:", acctRes.data); return; }
  const expenseAccountId = acctRes.data.values[0].id;
  console.log(`Account ${expenseAccount}: id=${expenseAccountId}`);

  console.log("\n=== STEP 3: POST /ledger/voucher ===");
  const voucherRes = await api("POST", "/ledger/voucher", {
    date,
    description,
    voucherType: { name: "Leverandørfaktura" },
    postings: [
      {
        row: 1,
        date,
        description,
        account: { id: expenseAccountId },
        vatType: { id: 1 },
        currency: { id: 1 },
        amount: net,
        amountCurrency: net,
        amountGross: gross,
        amountGrossCurrency: gross,
      },
      {
        row: 2,
        date,
        description,
        account: { id: supplierLedgerAccountId },
        supplier: { id: supplierId },
        currency: { id: 1 },
        amount: -gross,
        amountCurrency: -gross,
        amountGross: -gross,
        amountGrossCurrency: -gross,
        invoiceNumber,
        termOfPayment: date,
      },
    ],
  });
  if (!voucherRes.ok) { console.error("FAIL:", voucherRes.data); return; }
  const voucherId = voucherRes.data.value.id;
  const voucherNumber = voucherRes.data.value.number;
  console.log(`Voucher: id=${voucherId}, number=${voucherNumber} (booked=${voucherNumber > 0})`);

  console.log("\n\n========================================");
  console.log("=== FULL STATE AUDIT ===");
  console.log("========================================\n");

  // 1. GET the voucher back
  console.log("--- GET /ledger/voucher/{id}?fields=* ---");
  const vGet = await api("GET", `/ledger/voucher/${voucherId}?fields=*`);
  console.log(`Status: ${vGet.status}`);
  if (vGet.ok) {
    const v = vGet.data.value;
    console.log(JSON.stringify({
      id: v.id,
      number: v.number,
      date: v.date,
      description: v.description,
      voucherType: v.voucherType,
      year: v.year,
      tempNumber: v.tempNumber,
      document: v.document,
      attachment: v.attachment,
      ediDocument: v.ediDocument,
      postingsCount: v.postings?.length,
    }, null, 2));
  }

  // 2. Check supplierInvoice search
  console.log("\n--- GET /supplierInvoice?voucherId={id}&fields=* ---");
  const siByVoucher = await api("GET", `/supplierInvoice?voucherId=${voucherId}&fields=*`);
  console.log(`Status: ${siByVoucher.status}`);
  if (siByVoucher.ok) {
    console.log(`Count: ${siByVoucher.data.count}`);
    if (siByVoucher.data.values?.length > 0) {
      console.log(JSON.stringify(siByVoucher.data.values[0], null, 2));
    } else {
      console.log("NO supplierInvoice entities found for this voucherId!");
    }
  } else {
    console.log("Error:", JSON.stringify(siByVoucher.data));
  }

  // 3. Search supplierInvoice by supplierId
  console.log("\n--- GET /supplierInvoice?supplierId={id}&fields=* ---");
  const siBySupplier = await api("GET", `/supplierInvoice?supplierId=${supplierId}&fields=*`);
  console.log(`Status: ${siBySupplier.status}`);
  if (siBySupplier.ok) {
    console.log(`Count: ${siBySupplier.data.count}`);
    for (const si of (siBySupplier.data.values || [])) {
      console.log(JSON.stringify({
        id: si.id,
        invoiceNumber: si.invoiceNumber,
        amount: si.amount,
        supplier: si.supplier,
        voucher: si.voucher,
      }, null, 2));
    }
  }

  // 4. Search ALL supplierInvoices (recent)
  console.log("\n--- GET /supplierInvoice?invoiceDateFrom={date}&fields=* ---");
  const siAll = await api("GET", `/supplierInvoice?invoiceDateFrom=${date}&fields=*`);
  console.log(`Status: ${siAll.status}`);
  if (siAll.ok) {
    console.log(`Count: ${siAll.data.count}`);
    for (const si of (siAll.data.values || [])) {
      console.log(JSON.stringify({
        id: si.id,
        invoiceNumber: si.invoiceNumber,
        amount: si.amount,
        supplier: si.supplier?.id,
        voucher: si.voucher?.id,
      }, null, 2));
    }
  }

  // 5. Check /incomingInvoice (beta)
  console.log("\n--- GET /incomingInvoice/search?invoiceNumber={num} ---");
  const iiSearch = await api("GET", `/incomingInvoice/search?invoiceNumber=${invoiceNumber}&fields=*`);
  console.log(`Status: ${iiSearch.status}, data: ${JSON.stringify(iiSearch.data).substring(0, 200)}`);

  // 6. Check ledger postings
  console.log("\n--- GET /ledger/posting?voucherId={id}&fields=* ---");
  const postings = await api("GET", `/ledger/posting?voucherId=${voucherId}&fields=*`);
  console.log(`Status: ${postings.status}`);
  if (postings.ok) {
    console.log(`Count: ${postings.data.count}`);
    for (const p of (postings.data.values || [])) {
      console.log(`  row=${p.row} acct=${p.account?.number} amount=${p.amount} amountGross=${p.amountGross} supplier=${p.supplier?.id || '-'} invoiceNum=${p.invoiceNumber || '-'} desc=${p.description}`);
    }
  }

  // 7. Check supplier readback
  console.log("\n--- GET /supplier/{id}?fields=* ---");
  const supGet = await api("GET", `/supplier/${supplierId}?fields=*`);
  console.log(`Status: ${supGet.status}`);
  if (supGet.ok) {
    const s = supGet.data.value;
    console.log(JSON.stringify({
      id: s.id,
      name: s.name,
      organizationNumber: s.organizationNumber,
      ledgerAccount: s.ledgerAccount,
      postalAddress: s.postalAddress,
      physicalAddress: s.physicalAddress,
      bankAccountPresentation: s.bankAccountPresentation,
    }, null, 2));
  }

  // 8. Check voucher by type/number
  console.log("\n--- GET /ledger/voucher?voucherType=Leverandørfaktura&number={num} ---");
  const vByNum = await api("GET", `/ledger/voucher?number=${voucherNumber}&fields=*`);
  console.log(`Status: ${vByNum.status}`);
  if (vByNum.ok) {
    console.log(`Count: ${vByNum.data.count}`);
  }

  // 9. Check if there's a document/attachment
  console.log("\n--- GET /ledger/voucher/{id}/pdf ---");
  const pdfRes = await api("GET", `/ledger/voucher/${voucherId}/pdf`);
  console.log(`Status: ${pdfRes.status}`);

  // 10. Check supplierInvoice with general search params
  console.log("\n--- GET /supplierInvoice?invoiceNumber={num}&fields=* ---");
  const siByInvNum = await api("GET", `/supplierInvoice?invoiceNumber=${invoiceNumber}&fields=*`);
  console.log(`Status: ${siByInvNum.status}`);
  if (siByInvNum.ok) {
    console.log(`Count: ${siByInvNum.data.count}`);
    if (siByInvNum.data.count > 0) {
      console.log(JSON.stringify(siByInvNum.data.values, null, 2));
    }
  }

  console.log("\n\n=== AUDIT COMPLETE ===");
}

main().catch(console.error);
