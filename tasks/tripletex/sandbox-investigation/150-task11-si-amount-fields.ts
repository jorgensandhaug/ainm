const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa("0:" + TOKEN)}`;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  const date = "2026-03-22";
  const gross = 12500;
  const net = 10000;

  const sRes = await api("POST", "/supplier", { name: "AmtFields AS", organizationNumber: "823456786" });
  const supplierId = sRes.data.value.id;
  const supplierLedger = sRes.data.value.ledgerAccount.id;
  const acctRes = await api("GET", "/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=id");
  const expAcctId = acctRes.data.values[0].id;
  const vtRes = await api("GET", "/ledger/voucherType?name=Leverand%C3%B8rfaktura&fields=id");
  const vtId = vtRes.data.values[0].id;

  const postings = [
    { row: 1, date, description: "test", account: { id: expAcctId }, vatType: { id: 1 }, amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross },
    { row: 2, date, description: "test", account: { id: supplierLedger }, supplier: { id: supplierId }, amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross },
  ];
  const voucher = { date, description: "test", voucherType: { id: vtId }, postings };

  const tests: Array<{name: string, extra: any}> = [
    // Test which combo of amount fields gets persisted
    { name: "amtCurr-neg", extra: { amountCurrency: -gross } },
    { name: "amtCurr-pos", extra: { amountCurrency: gross } },
    { name: "amtExVatCurr-neg", extra: { amountExcludingVatCurrency: -net } },
    { name: "both-curr-neg", extra: { amountCurrency: -gross, amountExcludingVatCurrency: -net } },
    { name: "all-neg", extra: { amount: -gross, amountCurrency: -gross, amountExcludingVat: -net, amountExcludingVatCurrency: -net } },
    { name: "all-pos", extra: { amount: gross, amountCurrency: gross, amountExcludingVat: net, amountExcludingVatCurrency: net } },
    // Also test with invoiceDueDate
    { name: "full-neg+due", extra: { amountCurrency: -gross, amountExcludingVatCurrency: -net, invoiceDueDate: "2026-04-21" } },
    // Try with kidOrReceiverReference too
    { name: "full-neg+due+kid", extra: { amountCurrency: -gross, amountExcludingVatCurrency: -net, invoiceDueDate: "2026-04-21", kidOrReceiverReference: "12345" } },
  ];

  console.log("=== AMOUNT FIELD TESTS ===\n");
  for (let i = 0; i < tests.length; i++) {
    const t = tests[i];
    const payload = { invoiceDate: date, invoiceNumber: `AF-${i+1}`, supplier: { id: supplierId }, currency: { id: 1 }, voucher, ...t.extra };
    const res = await api("POST", "/supplierInvoice", payload);
    if (res.ok) {
      const v = res.data.value;
      // Read back with full fields
      const rb = await api("GET", `/supplierInvoice/${v.id}?fields=id,invoiceNumber,amount,amountCurrency,amountExcludingVat,amountExcludingVatCurrency,outstandingAmount,invoiceDueDate,kidOrReceiverReference`);
      if (rb.ok) {
        const s = rb.data.value;
        console.log(`✓ ${t.name}: amt=${s.amount} amtC=${s.amountCurrency} exVat=${s.amountExcludingVat} exVatC=${s.amountExcludingVatCurrency} out=${s.outstandingAmount} due=${s.invoiceDueDate} kid="${s.kidOrReceiverReference}"`);
      }
    } else {
      const msg = res.data?.validationMessages?.[0]?.message || res.data?.message || '';
      console.log(`✗ ${t.name}: ${res.status} — ${String(msg).substring(0, 120)}`);
    }
  }

  // Now do the GOLDEN test: full POST /supplierInvoice matching importDocument fields
  console.log("\n=== GOLDEN TEST ===");
  const golden = await api("POST", "/supplierInvoice", {
    invoiceDate: date,
    invoiceNumber: "GOLD-001",
    invoiceDueDate: "2026-04-21",
    supplier: { id: supplierId },
    currency: { id: 1 },
    amountCurrency: -gross,
    amountExcludingVatCurrency: -net,
    voucher: {
      date,
      description: "kontortjenester",
      voucherType: { id: vtId },
      postings,
    },
  });
  if (golden.ok) {
    const gId = golden.data.value.id;
    const gVid = golden.data.value.voucher.id;
    
    // Book the voucher
    const vRead = await api("GET", `/ledger/voucher/${gVid}?fields=id,version,date,voucherType(id),postings(id,version,row,date,account(id),vatType(id),supplier(id))`);
    const vd = vRead.data.value;
    const updPostings = vd.postings.map((p: any) => {
      if (p.account.id === expAcctId) return { ...p, description: "kontortjenester", amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross };
      return { ...p, description: "kontortjenester", amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross, invoiceNumber: "GOLD-001", termOfPayment: "2026-04-21" };
    });
    const book = await api("PUT", `/ledger/voucher/${gVid}`, { id: vd.id, version: vd.version, date: vd.date, voucherType: vd.voucherType, postings: updPostings });
    console.log(`Book: ${book.status} ${book.ok ? 'num=' + book.data.value?.number : JSON.stringify(book.data).substring(0, 200)}`);

    // Full readback
    const siRB = await api("GET", `/supplierInvoice/${gId}?fields=id,invoiceNumber,invoiceDate,invoiceDueDate,supplier(id,name),amount,amountCurrency,amountExcludingVat,amountExcludingVatCurrency,outstandingAmount,isCreditNote,kidOrReceiverReference,voucher(id,number),orderLines(id,count,amountExcludingVatCurrency,vatType(id,number))`);
    if (siRB.ok) {
      const s = siRB.data.value;
      console.log(`\nGOLDEN SI readback:`);
      console.log(`  invoiceNum="${s.invoiceNumber}" date="${s.invoiceDate}" dueDate="${s.invoiceDueDate}"`);
      console.log(`  supplier: ${s.supplier?.id} "${s.supplier?.name}"`);
      console.log(`  amount=${s.amount} amtCurrency=${s.amountCurrency} exVat=${s.amountExcludingVat} exVatCurrency=${s.amountExcludingVatCurrency}`);
      console.log(`  outstanding=${s.outstandingAmount} creditNote=${s.isCreditNote}`);
      console.log(`  voucher: id=${s.voucher?.id} num=${s.voucher?.number}`);
      console.log(`  orderLines: ${s.orderLines?.length || 0}`);
    }

    // Compare with importDocument baseline
    const vRB = await api("GET", `/ledger/voucher/${gVid}?fields=id,number,description,vendorInvoiceNumber,voucherType(name),postings(row,account(number),amount,amountGross,vatType(number,percentage),supplier(name),invoiceNumber,termOfPayment,description)`);
    if (vRB.ok) {
      const v = vRB.data.value;
      console.log(`\nGOLDEN Voucher readback:`);
      console.log(`  desc="${v.description}" vendorInv="${v.vendorInvoiceNumber}" type="${v.voucherType?.name}" num=${v.number}`);
      for (const p of v.postings || []) {
        console.log(`  posting: row=${p.row} acct=${p.account?.number} amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.number}(${p.vatType?.percentage}%) supp="${p.supplier?.name||'-'}" inv="${p.invoiceNumber||'-'}" term="${p.termOfPayment||'-'}" desc="${p.description}"`);
      }
    }
  } else {
    console.log("GOLDEN FAIL:", JSON.stringify(golden.data).substring(0, 500));
  }
}

main().catch(console.error);
