/**
 * Task 11 — Deep investigation of supplier invoice scoring.
 *
 * ALL scored task 11 runs are 0/8 (all 4 checks failing).
 * Even the direct POST /ledger/voucher approach scored 0/8.
 *
 * Key questions:
 * 1. Does POST /ledger/voucher with Leverandorfaktura create a supplierInvoice entity?
 * 2. What does the supplierInvoice look like after direct voucher?
 * 3. What does it look like after importDocument?
 * 4. What fields does the scorer likely check?
 * 5. Is the description preserved correctly?
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any, isForm = false) {
  const headers: Record<string, string> = { Authorization: AUTH };
  if (!isForm) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(body ? { body: isForm ? body : JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  if (res.status >= 400) console.error(`  ERR ${method} ${path} → ${res.status}`, JSON.stringify(data).slice(0, 300));
  else console.log(`  ${method} ${path} → ${res.status}`);
  return { status: res.status, data };
}

async function main() {
  console.log("=== Task 11: DEEP ANALYSIS ===\n");

  // ── Test data ──
  const supplierName = "Analyse Test AS";
  const orgNumber = "913175212";
  const invoiceNumber = "INV-ANALYSIS-001";
  const description = "kontortjenester";
  const gross = 50000;
  const net = 40000;
  const expenseAcctNum = 6300;
  const date = "2026-03-22";

  // ── Step 1: Create supplier ──
  console.log("── Creating supplier ──");
  const supRes = await api("POST", "/supplier", {
    name: supplierName,
    organizationNumber: orgNumber,
    postalAddress: { addressLine1: "Testveien 1", postalCode: "0001", city: "Oslo", country: { id: 161 } },
    physicalAddress: { addressLine1: "Testveien 1", postalCode: "0001", city: "Oslo", country: { id: 161 } },
  });

  let supplierId: number, supplierLedgerAccountId: number;
  if (supRes.status >= 400) {
    // Supplier might already exist
    console.log("  Supplier creation failed, looking up...");
    const lookup = await api("GET", `/supplier?organizationNumber=${orgNumber}&fields=*`);
    const s = lookup.data.values?.[0];
    supplierId = s.id;
    supplierLedgerAccountId = s.ledgerAccount.id;
  } else {
    supplierId = supRes.data.value.id;
    supplierLedgerAccountId = supRes.data.value.ledgerAccount.id;
  }
  console.log(`  supplierId=${supplierId}, ledgerAcctId=${supplierLedgerAccountId}\n`);

  // ── Step 2: Get expense account ──
  const acctRes = await api("GET", `/ledger/account?number=${expenseAcctNum}&isApplicableForSupplierInvoice=true&fields=*`);
  const expenseAccountId = acctRes.data.values[0].id;
  console.log(`  expenseAccountId=${expenseAccountId}\n`);

  // ── Step 3: Get voucher type ──
  const vtRes = await api("GET", `/ledger/voucherType?name=Leverandørfaktura&fields=*`);
  const voucherTypes = vtRes.data.values || [];
  console.log(`  Found ${voucherTypes.length} voucherType(s):`);
  for (const vt of voucherTypes) {
    console.log(`    id=${vt.id} name="${vt.name}"`);
  }
  const vtId = voucherTypes.find((v: any) => v.name === "Leverandørfaktura")?.id;
  console.log(`  Using voucherType id=${vtId}\n`);

  // ══════════════════════════════════════════
  // METHOD A: Direct POST /ledger/voucher
  // ══════════════════════════════════════════
  console.log("══════════════════════════════════════════");
  console.log("  METHOD A: Direct POST /ledger/voucher");
  console.log("══════════════════════════════════════════\n");

  const directRes = await api("POST", "/ledger/voucher", {
    date,
    description,
    voucherType: { id: vtId },
    postings: [
      {
        row: 1, date, description,
        account: { id: expenseAccountId },
        vatType: { id: 1 },
        currency: { id: 1 },
        amount: net, amountCurrency: net,
        amountGross: gross, amountGrossCurrency: gross,
      },
      {
        row: 2, date, description,
        account: { id: supplierLedgerAccountId },
        supplier: { id: supplierId },
        currency: { id: 1 },
        amount: -gross, amountCurrency: -gross,
        amountGross: -gross, amountGrossCurrency: -gross,
        invoiceNumber,
        termOfPayment: date,
      },
    ],
  });

  if (directRes.status >= 400) {
    console.log("FATAL: Direct voucher creation failed");
    return;
  }

  const directVoucher = directRes.data.value;
  console.log(`\n  Voucher id=${directVoucher.id}`);
  console.log(`  number=${directVoucher.number} (booked = ${directVoucher.number > 0})`);
  console.log(`  description="${directVoucher.description}"`);
  console.log(`  Postings (${directVoucher.postings?.length}):`);
  for (const p of directVoucher.postings || []) {
    console.log(`    row=${p.row} acct=${p.account?.number} amt=${p.amount} amtGross=${p.amountGross} vat=${p.vatType?.id} supp=${p.supplier?.id || '-'} inv=${p.invoiceNumber || '-'}`);
  }

  // ── Check if a supplierInvoice was created ──
  console.log("\n── Checking /supplierInvoice after direct voucher ──");
  const siSearchDirect = await api("GET", `/supplierInvoice?invoiceNumber=${invoiceNumber}&invoiceDateFrom=${date}&invoiceDateTo=2026-03-23&fields=*,voucher(*,postings(*)),supplier(*)&count=50`);
  const siListDirect = siSearchDirect.data.values || [];
  console.log(`  Found ${siListDirect.length} supplierInvoice(s)`);

  if (siListDirect.length > 0) {
    const si = siListDirect[0];
    console.log(`\n  SupplierInvoice state:`);
    console.log(`    id: ${si.id}`);
    console.log(`    invoiceNumber: "${si.invoiceNumber}"`);
    console.log(`    invoiceDate: ${si.invoiceDate}`);
    console.log(`    dueDate: ${si.dueDate}`);
    console.log(`    amount: ${si.amount}`);
    console.log(`    amountCurrency: ${si.amountCurrency}`);
    console.log(`    supplier.id: ${si.supplier?.id}`);
    console.log(`    supplier.name: "${si.supplier?.name}"`);
    console.log(`    voucher.id: ${si.voucher?.id}`);
    console.log(`    voucher.number: ${si.voucher?.number}`);
    console.log(`    voucher.description: "${si.voucher?.description}"`);
  }

  // ── Also check via voucher-based search ──
  console.log("\n── Checking /supplierInvoice by supplierId ──");
  const siBySupplier = await api("GET", `/supplierInvoice?supplierId=${supplierId}&invoiceDateFrom=${date}&invoiceDateTo=2026-03-23&fields=*&count=50`);
  const siBySupList = siBySupplier.data.values || [];
  console.log(`  Found ${siBySupList.length} supplierInvoice(s) by supplierId`);
  for (const si of siBySupList) {
    console.log(`    id=${si.id} invoiceNumber="${si.invoiceNumber}" amount=${si.amount} voucherId=${si.voucher?.id}`);
  }

  // ── Check voucher readback with full fields ──
  console.log("\n── Full voucher readback ──");
  const vReadback = await api("GET", `/ledger/voucher/${directVoucher.id}?fields=*,postings(*,account(*),vatType(*),supplier(*))`);
  if (vReadback.status < 400) {
    const v = vReadback.data.value;
    console.log(`  description: "${v.description}"`);
    console.log(`  date: ${v.date}`);
    console.log(`  number: ${v.number}`);
    console.log(`  voucherType: ${JSON.stringify(v.voucherType)}`);
    console.log(`  type: ${v.type}`);
    console.log(`  typeGroup: ${v.typeGroup}`);
    for (const p of v.postings || []) {
      console.log(`  row=${p.row}: acct=${p.account?.number}(${p.account?.name}) amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id}/${p.vatType?.name} supp=${p.supplier?.id||'-'} inv=${p.invoiceNumber||'-'} term=${p.termOfPayment||'-'} desc="${p.description}"`);
    }
  }

  // ══════════════════════════════════════════
  // Check what 'description' the scorer expects
  // ══════════════════════════════════════════
  console.log("\n══════════════════════════════════════════");
  console.log("  DESCRIPTION ANALYSIS");
  console.log("══════════════════════════════════════════");
  console.log(`  Prompt description: "${description}"`);
  console.log(`  Voucher description: "${directVoucher.description}"`);
  console.log(`  Match: ${description === directVoucher.description}`);

  // ── What does the scorer actually look at? Let's check ALL fields ──
  console.log("\n── Full voucher JSON (key fields) ──");
  const fullVoucher = vReadback.data?.value;
  if (fullVoucher) {
    const keys = Object.keys(fullVoucher).filter(k => k !== 'postings');
    for (const k of keys) {
      const val = fullVoucher[k];
      if (val !== null && val !== undefined && val !== "" && val !== 0) {
        console.log(`  ${k}: ${JSON.stringify(val)}`);
      }
    }
  }

  // ══════════════════════════════════════════
  // Cleanup: reverse the voucher
  // ══════════════════════════════════════════
  console.log("\n── Cleanup ──");
  await api("PUT", `/ledger/voucher/${directVoucher.id}/:reverse?date=2026-03-22`);

  console.log("\nDone.");
}

main().catch(e => { console.error(e); process.exit(1); });
