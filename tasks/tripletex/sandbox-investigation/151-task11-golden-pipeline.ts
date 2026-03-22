/**
 * GOLDEN PIPELINE: POST /supplierInvoice with all correct fields.
 * Then book voucher via PUT without description.
 * Then full state comparison with importDocument.
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
  // ─── PROMPT PARAMS ───
  const invoiceDate = "2026-03-22";
  const dueDate = "2026-04-21";
  const supplierName = "Kontorservice AS";
  const orgNumber = "823456786";
  const invoiceNumber = "F-2026-0142";
  const description = "kontortjenester mars 2026";
  const grossAmount = 12500;
  const netAmount = 10000;
  const accountNumber = 7140;

  // ─── STEP 1: Create supplier ───
  console.log("STEP 1: Create supplier");
  const sRes = await api("POST", "/supplier", { name: supplierName, organizationNumber: orgNumber });
  if (!sRes.ok) { console.error("Fail:", JSON.stringify(sRes.data).substring(0, 300)); return; }
  const supplierId = sRes.data.value.id;
  const supplierLedger = sRes.data.value.ledgerAccount.id;

  // ─── STEP 2: Get refs ───
  console.log("\nSTEP 2: Get account + voucherType");
  const acctRes = await api("GET", `/ledger/account?number=${accountNumber}&isApplicableForSupplierInvoice=true&fields=id`);
  const expAcctId = acctRes.data.values[0].id;
  const vtRes = await api("GET", "/ledger/voucherType?name=Leverand%C3%B8rfaktura&fields=id");
  const vtId = vtRes.data.values[0].id;

  // ─── STEP 3: POST /supplierInvoice ───
  console.log("\nSTEP 3: POST /supplierInvoice");
  const siRes = await api("POST", "/supplierInvoice", {
    invoiceDate,
    invoiceNumber,
    invoiceDueDate: dueDate,
    supplier: { id: supplierId },
    currency: { id: 1 },
    amountCurrency: -grossAmount,  // NEGATIVE — this is the key field
    voucher: {
      date: invoiceDate,
      description,  // Custom description from prompt
      voucherType: { id: vtId },
      postings: [
        {
          row: 1, date: invoiceDate, description,
          account: { id: expAcctId },
          vatType: { id: 1 },
          amount: netAmount, amountCurrency: netAmount,
          amountGross: grossAmount, amountGrossCurrency: grossAmount,
        },
        {
          row: 2, date: invoiceDate, description,
          account: { id: supplierLedger },
          supplier: { id: supplierId },
          amount: -grossAmount, amountCurrency: -grossAmount,
          amountGross: -grossAmount, amountGrossCurrency: -grossAmount,
          invoiceNumber, termOfPayment: dueDate,
        },
      ],
    },
  });
  if (!siRes.ok) { console.error("SI Fail:", JSON.stringify(siRes.data, null, 2)); return; }
  const siId = siRes.data.value.id;
  const voucherId = siRes.data.value.voucher.id;
  console.log(`  SI id=${siId} voucher=${voucherId}`);

  // ─── STEP 4: Book voucher (PUT without description) ───
  console.log("\nSTEP 4: Book voucher");
  const vRead = await api("GET", `/ledger/voucher/${voucherId}?fields=id,version,date,voucherType(id),postings(id,version,row,date,account(id),vatType(id),supplier(id),amount,amountGross,amountCurrency,amountGrossCurrency,invoiceNumber,termOfPayment)`);
  const vd = vRead.data.value;
  console.log(`  Pre-book: version=${vd.version} postings=${vd.postings?.length}`);
  for (const p of vd.postings || []) {
    console.log(`    row=${p.row} acct=${p.account?.id} amt=${p.amount} gross=${p.amountGross}`);
  }

  // Check if postings already have amounts (they should from amountCurrency)
  const needAmounts = vd.postings.some((p: any) => p.amount === 0);
  let updatedPostings;
  if (needAmounts) {
    console.log("  → Postings need amounts, setting them");
    updatedPostings = vd.postings.map((p: any) => {
      if (p.account.id === expAcctId) return { ...p, description, amount: netAmount, amountCurrency: netAmount, amountGross: grossAmount, amountGrossCurrency: grossAmount };
      return { ...p, description, amount: -grossAmount, amountCurrency: -grossAmount, amountGross: -grossAmount, amountGrossCurrency: -grossAmount, invoiceNumber, termOfPayment: dueDate };
    });
  } else {
    console.log("  → Postings already have amounts");
    updatedPostings = vd.postings;
  }

  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}`, {
    id: vd.id,
    version: vd.version,
    date: vd.date,
    voucherType: vd.voucherType,
    postings: updatedPostings,
  });
  if (!bookRes.ok) {
    console.error("Book fail:", JSON.stringify(bookRes.data, null, 2).substring(0, 500));
    // Try without postings — just bare PUT to trigger booking
    console.log("\n  → Retry: PUT without postings");
    const bookRes2 = await api("PUT", `/ledger/voucher/${voucherId}`, {
      id: vd.id, version: vd.version, date: vd.date, voucherType: vd.voucherType,
    });
    if (!bookRes2.ok) {
      console.error("  Book2 fail:", JSON.stringify(bookRes2.data).substring(0, 500));
    } else {
      console.log(`  Booked! num=${bookRes2.data.value?.number}`);
    }
  } else {
    console.log(`  Booked! num=${bookRes.data.value?.number}`);
  }

  // ─── FULL AUDIT ───
  console.log("\n" + "═".repeat(60));
  console.log("FULL STATE AUDIT");
  console.log("═".repeat(60));

  const siRB = await api("GET", `/supplierInvoice/${siId}?fields=id,invoiceNumber,invoiceDate,invoiceDueDate,supplier(id,name),amount,amountCurrency,amountExcludingVat,amountExcludingVatCurrency,outstandingAmount,isCreditNote,kidOrReceiverReference,voucher(id,number),orderLines(id,count,amountExcludingVatCurrency,vatType(id,number))`);
  if (siRB.ok) {
    const s = siRB.data.value;
    console.log(`\nsupplierInvoice:`);
    console.log(`  invoiceNumber = "${s.invoiceNumber}"`);
    console.log(`  invoiceDate = "${s.invoiceDate}"`);
    console.log(`  invoiceDueDate = "${s.invoiceDueDate}"`);
    console.log(`  supplier = {id: ${s.supplier?.id}, name: "${s.supplier?.name}"}`);
    console.log(`  amount = ${s.amount}`);
    console.log(`  amountCurrency = ${s.amountCurrency}`);
    console.log(`  amountExcludingVat = ${s.amountExcludingVat}`);
    console.log(`  amountExcludingVatCurrency = ${s.amountExcludingVatCurrency}`);
    console.log(`  outstandingAmount = ${s.outstandingAmount}`);
    console.log(`  isCreditNote = ${s.isCreditNote}`);
    console.log(`  voucher = {id: ${s.voucher?.id}, num: ${s.voucher?.number}}`);
    console.log(`  orderLines = ${s.orderLines?.length || 0}`);
  }

  const vRB = await api("GET", `/ledger/voucher/${voucherId}?fields=id,number,description,vendorInvoiceNumber,voucherType(name),postings(row,account(number),amount,amountGross,vatType(number,percentage),supplier(name),invoiceNumber,termOfPayment,description)`);
  if (vRB.ok) {
    const v = vRB.data.value;
    console.log(`\nvoucher:`);
    console.log(`  number = ${v.number}`);
    console.log(`  description = "${v.description}"`);
    console.log(`  vendorInvoiceNumber = "${v.vendorInvoiceNumber}"`);
    console.log(`  voucherType = "${v.voucherType?.name}"`);
    for (const p of v.postings || []) {
      console.log(`  posting: row=${p.row} acct=${p.account?.number} amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.number}(${p.vatType?.percentage}%) supp="${p.supplier?.name||'-'}" inv="${p.invoiceNumber||'-'}" term="${p.termOfPayment||'-'}" desc="${p.description}"`);
    }
  }

  // Print comparison summary
  console.log("\n" + "═".repeat(60));
  console.log("COMPARISON: POST /supplierInvoice vs importDocument");
  console.log("═".repeat(60));
  console.log("                    POST /supplierInvoice   importDocument");
  console.log("amount              0 (read-only)           -12500");
  console.log("amountCurrency      -12500 ✓                -12500");
  console.log("amountExVat         0 (read-only)           -10000");
  console.log("amountExVatCurrency 0 (read-only)           -10000");
  console.log("outstandingAmount   12500 ✓                 12500");
  console.log("invoiceDueDate      2026-04-21 ✓            2026-03-22 (from XML)");
  console.log("orderLines          0                       1");
  console.log("voucher.description custom ✓                immutable ✗");
  console.log("supplier linked     ✓                       ✓");
}

main().catch(console.error);
