/**
 * Complete end-to-end POST /supplierInvoice pipeline for T11.
 * Flow: POST supplier → GET account → GET voucherType → POST supplierInvoice → GET voucher → PUT voucher (amounts + book)
 * Then full audit.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa("0:" + TOKEN)}`;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path.substring(0, 100)} → ${res.status}`);
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  // ─── PROMPT PARAMETERS ───
  const invoiceDate = "2026-03-22";
  const dueDate = "2026-04-21";
  const supplierName = "Kontorservice AS";
  const orgNumber = "823456786";
  const invoiceNumber = "F-2026-0142";
  const description = "kontortjenester mars 2026";
  const grossAmount = 12500; // incl. 25% VAT
  const netAmount = 10000;   // excl. VAT
  const accountNumber = 7140; // Reisekostnad/Kontorkostnad

  // ─── STEP 1: Create supplier ───
  console.log("=== STEP 1: Create supplier ===");
  const sRes = await api("POST", "/supplier", { name: supplierName, organizationNumber: orgNumber });
  if (!sRes.ok) { console.error("Supplier fail:", JSON.stringify(sRes.data).substring(0, 300)); return; }
  const supplierId = sRes.data.value.id;
  const supplierLedger = sRes.data.value.ledgerAccount.id;
  console.log(`  id=${supplierId} ledgerAcct=${supplierLedger}`);

  // ─── STEP 2: Get expense account ───
  console.log("\n=== STEP 2: Get expense account ===");
  const acctRes = await api("GET", `/ledger/account?number=${accountNumber}&isApplicableForSupplierInvoice=true&fields=id,number`);
  if (!acctRes.ok || !acctRes.data.values?.length) { console.error("Account not found"); return; }
  const expAcctId = acctRes.data.values[0].id;
  console.log(`  account ${accountNumber}: id=${expAcctId}`);

  // ─── STEP 3: Get voucherType ───
  console.log("\n=== STEP 3: Get voucherType ===");
  const vtRes = await api("GET", "/ledger/voucherType?name=Leverand%C3%B8rfaktura&fields=id,name");
  if (!vtRes.ok || !vtRes.data.values?.length) { console.error("VoucherType not found"); return; }
  const vtId = vtRes.data.values[0].id;
  console.log(`  Leverandørfaktura: id=${vtId}`);

  // ─── STEP 4: POST /supplierInvoice ───
  console.log("\n=== STEP 4: POST /supplierInvoice ===");
  const siRes = await api("POST", "/supplierInvoice", {
    invoiceDate,
    invoiceNumber,
    supplier: { id: supplierId },
    amount: grossAmount,
    amountExcludingVat: netAmount,
    currency: { id: 1 },
    voucher: {
      date: invoiceDate,
      description,
      voucherType: { id: vtId },
      postings: [
        {
          row: 1,
          date: invoiceDate,
          description,
          account: { id: expAcctId },
          vatType: { id: 1 },
          amount: netAmount,
          amountCurrency: netAmount,
          amountGross: grossAmount,
          amountGrossCurrency: grossAmount,
        },
        {
          row: 2,
          date: invoiceDate,
          description,
          account: { id: supplierLedger },
          supplier: { id: supplierId },
          amount: -grossAmount,
          amountCurrency: -grossAmount,
          amountGross: -grossAmount,
          amountGrossCurrency: -grossAmount,
          invoiceNumber,
          termOfPayment: dueDate,
        },
      ],
    },
  });
  if (!siRes.ok) { console.error("SI fail:", JSON.stringify(siRes.data, null, 2)); return; }
  const siId = siRes.data.value.id;
  const voucherId = siRes.data.value.voucher.id;
  console.log(`  supplierInvoice id=${siId} voucher id=${voucherId}`);

  // ─── STEP 5: GET voucher to read back version + posting IDs ───
  console.log("\n=== STEP 5: GET voucher for version ===");
  const vRead = await api("GET", `/ledger/voucher/${voucherId}?fields=id,version,date,voucherType(id),postings(id,version,row,date,account(id),vatType(id),supplier(id),invoiceNumber,termOfPayment)`);
  if (!vRead.ok) { console.error("Voucher read fail"); return; }
  const vd = vRead.data.value;
  console.log(`  version=${vd.version} postings=${vd.postings?.length}`);

  // ─── STEP 6: PUT voucher with amounts (omit description) → books automatically ───
  console.log("\n=== STEP 6: PUT voucher with amounts ===");
  const updatedPostings = vd.postings.map((p: any) => {
    // Expense posting (7140)
    if (p.account.id === expAcctId) {
      return {
        ...p,
        description,
        amount: netAmount,
        amountCurrency: netAmount,
        amountGross: grossAmount,
        amountGrossCurrency: grossAmount,
      };
    }
    // Supplier posting (2400)
    return {
      ...p,
      description,
      amount: -grossAmount,
      amountCurrency: -grossAmount,
      amountGross: -grossAmount,
      amountGrossCurrency: -grossAmount,
      invoiceNumber,
      termOfPayment: dueDate,
    };
  });

  const putRes = await api("PUT", `/ledger/voucher/${voucherId}`, {
    id: vd.id,
    version: vd.version,
    date: vd.date,
    voucherType: vd.voucherType,
    postings: updatedPostings,
  });
  if (!putRes.ok) { console.error("PUT fail:", JSON.stringify(putRes.data, null, 2)); return; }
  console.log(`  Booked! number=${putRes.data.value.number}`);

  // ─── FULL AUDIT ───
  console.log("\n" + "═".repeat(60));
  console.log("FULL AUDIT");
  console.log("═".repeat(60));

  // Read supplierInvoice
  const siAudit = await api("GET", `/supplierInvoice/${siId}?fields=id,invoiceNumber,invoiceDate,invoiceDueDate,supplier(id,name),amount,amountCurrency,amountExcludingVat,amountExcludingVatCurrency,currency(id,code),voucher(id,number),outstandingAmount,isCreditNote`);
  if (siAudit.ok) {
    const s = siAudit.data.value;
    console.log(`\nsupplierInvoice:`);
    console.log(`  id=${s.id}`);
    console.log(`  invoiceNumber="${s.invoiceNumber}"`);
    console.log(`  invoiceDate="${s.invoiceDate}" dueDate="${s.invoiceDueDate}"`);
    console.log(`  supplier: id=${s.supplier?.id} name="${s.supplier?.name}"`);
    console.log(`  amount=${s.amount} amountExVat=${s.amountExcludingVat}`);
    console.log(`  amountCurrency=${s.amountCurrency} amountExVatCurrency=${s.amountExcludingVatCurrency}`);
    console.log(`  outstanding=${s.outstandingAmount} isCreditNote=${s.isCreditNote}`);
    console.log(`  voucher: id=${s.voucher?.id} number=${s.voucher?.number}`);
  }

  // Read voucher with full postings
  const vAudit = await api("GET", `/ledger/voucher/${voucherId}?fields=id,number,date,description,voucherType(id,name),vendorInvoiceNumber,postings(row,date,description,account(id,number),amount,amountGross,amountCurrency,amountGrossCurrency,vatType(id,number,percentage),supplier(id,name),invoiceNumber,termOfPayment)`);
  if (vAudit.ok) {
    const v = vAudit.data.value;
    console.log(`\nvoucher:`);
    console.log(`  id=${v.id} number=${v.number}`);
    console.log(`  description="${v.description}"`);
    console.log(`  voucherType: "${v.voucherType?.name}"`);
    console.log(`  vendorInvoiceNumber: "${v.vendorInvoiceNumber}"`);
    console.log(`  postings:`);
    for (const p of (v.postings || [])) {
      console.log(`    row=${p.row} acct=${p.account?.number} amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.number}(${p.vatType?.percentage}%) supp="${p.supplier?.name||'-'}" inv="${p.invoiceNumber||'-'}" term="${p.termOfPayment||'-'}" desc="${p.description}"`);
    }
  }

  console.log("\n" + "═".repeat(60));
  console.log("SUMMARY");
  console.log("═".repeat(60));
  console.log(`Total API calls: 6 (POST supplier, GET account, GET voucherType, POST supplierInvoice, GET voucher, PUT voucher)`);
  console.log(`Result: supplierInvoice entity created + voucher booked with custom description`);
}

main().catch(console.error);
