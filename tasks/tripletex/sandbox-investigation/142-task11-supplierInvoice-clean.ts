const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa("0:" + TOKEN)}`;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH, "Content-Type": "application/json" };
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path.substring(0, 80)} → ${res.status}`);
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  const date = "2026-03-22";
  const description = "kontortjenester";
  const gross = 12500;
  const net = 10000;

  // Create supplier
  const sRes = await api("POST", "/supplier", { name: "CleanSI AS", organizationNumber: "823456786" });
  const supplierId = sRes.data.value.id;
  const supplierLedger = sRes.data.value.ledgerAccount.id;

  // Get refs
  const acctRes = await api("GET", "/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=*");
  const expAcctId = acctRes.data.values[0].id;
  const vtRes = await api("GET", "/ledger/voucherType?name=Leverand%C3%B8rfaktura&fields=*");
  const vtId = vtRes.data.values[0].id;

  // POST /supplierInvoice — NO description field at SI level
  console.log("\n=== POST /supplierInvoice ===");
  const siRes = await api("POST", "/supplierInvoice", {
    invoiceDate: date,
    invoiceNumber: "INV-CLN-001",
    supplier: { id: supplierId },
    amount: gross,
    amountExcludingVat: net,
    currency: { id: 1 },
    voucher: {
      date,
      description,
      voucherType: { id: vtId },
      postings: [
        {
          row: 1, date, description,
          account: { id: expAcctId },
          vatType: { id: 1 },
          amount: net, amountCurrency: net,
          amountGross: gross, amountGrossCurrency: gross,
        },
        {
          row: 2, date, description,
          account: { id: supplierLedger },
          supplier: { id: supplierId },
          amount: -gross, amountCurrency: -gross,
          amountGross: -gross, amountGrossCurrency: -gross,
          invoiceNumber: "INV-CLN-001",
          termOfPayment: date,
        },
      ],
    },
  });
  if (!siRes.ok) { console.error("FAIL:", JSON.stringify(siRes.data, null, 2)); return; }

  const siId = siRes.data.value.id;
  const voucherId = siRes.data.value.voucher?.id;
  console.log(`  SI id=${siId} voucher=${voucherId}`);
  console.log(`  amount=${siRes.data.value.amount} amountExVat=${siRes.data.value.amountExcludingVat}`);

  // Pre-booking audit
  console.log("\n=== PRE-BOOKING AUDIT ===");
  await audit(siId, voucherId);

  // Book the voucher
  console.log("\n=== BOOK VOUCHER ===");
  // First read the voucher to get version
  const vRead = await api("GET", `/ledger/voucher/${voucherId}?fields=id,version,date,description,voucherType(id)`);
  const vData = vRead.data.value;
  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
    id: vData.id,
    version: vData.version,
    date: vData.date,
    description: vData.description,
    voucherType: vData.voucherType,
  });
  if (!bookRes.ok) {
    console.error("Book fail:", JSON.stringify(bookRes.data).substring(0, 500));
    // Try without the PUT — maybe there's a /sendToLedger action
    const book2 = await api("PUT", `/ledger/voucher/${voucherId}/sendToLedger`, {});
    console.log("  sendToLedger action:", book2.status, JSON.stringify(book2.data).substring(0, 300));
  }

  // Post-booking audit
  console.log("\n=== POST-BOOKING AUDIT ===");
  await audit(siId, voucherId);
}

async function audit(siId: number, voucherId: number) {
  // Read SI with expanded fields
  const si = await api("GET", `/supplierInvoice/${siId}?fields=id,invoiceNumber,invoiceDate,invoiceDueDate,supplier(id,name),amount,amountCurrency,amountExcludingVat,amountExcludingVatCurrency,currency(id,code),description,voucher(id,number,description),outstandingAmount,isCreditNote`);
  if (si.ok) {
    const s = si.data.value;
    console.log(`SI: id=${s.id} invoiceNum="${s.invoiceNumber}" date="${s.invoiceDate}" dueDate="${s.invoiceDueDate}"`);
    console.log(`  supplier: ${s.supplier?.id} "${s.supplier?.name}"`);
    console.log(`  amount=${s.amount} amountExVat=${s.amountExcludingVat} outstanding=${s.outstandingAmount}`);
    console.log(`  description="${s.description}"`);
    console.log(`  voucher: id=${s.voucher?.id} num=${s.voucher?.number} desc="${s.voucher?.description}"`);
  }

  // Read voucher with postings
  const v = await api("GET", `/ledger/voucher/${voucherId}?fields=id,number,description,date,voucherType(id,name),vendorInvoiceNumber,postings(row,date,description,account(id,number),amount,amountGross,amountCurrency,amountGrossCurrency,vatType(id,number,percentage),supplier(id,name),invoiceNumber,termOfPayment)`);
  if (v.ok) {
    const vd = v.data.value;
    console.log(`  Voucher: id=${vd.id} num=${vd.number} desc="${vd.description}" vendorInv="${vd.vendorInvoiceNumber}" type="${vd.voucherType?.name}"`);
    for (const p of (vd.postings || [])) {
      console.log(`    posting: row=${p.row} acct=${p.account?.number} amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.number}(${p.vatType?.percentage}%) supp="${p.supplier?.name||'-'}" inv="${p.invoiceNumber||'-'}" term="${p.termOfPayment||'-'}"`);
    }
  }
}

main().catch(console.error);
