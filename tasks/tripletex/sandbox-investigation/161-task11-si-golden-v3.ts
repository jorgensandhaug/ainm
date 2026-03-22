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
  const supplierName = "Lumière SARL";
  const orgNumber = "913175212";
  const invoiceNumber = "INV-GOLDEN-001";
  const description = "services de bureau";
  const invoiceDate = "2026-03-22";
  const dueDate = "2026-04-21";
  const gross = 72350;
  const net = Math.round((gross * 100) / 125);

  // CALL 1: POST /supplier
  const sRes = await api("POST", "/supplier", { name: supplierName, organizationNumber: orgNumber });
  const supplierId = sRes.data.value.id;
  const supplierLedger = sRes.data.value.ledgerAccount.id;

  // CALL 2: GET /ledger/account
  const acctRes = await api("GET", "/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=*");
  const expAcctId = acctRes.data.values[0].id;

  // CALL 3: POST /supplierInvoice
  const siRes = await api("POST", "/supplierInvoice", {
    invoiceNumber,
    invoiceDate,
    invoiceDueDate: dueDate,
    supplier: { id: supplierId },
    amountCurrency: -gross,
    voucher: {
      date: invoiceDate,
      description,
      postings: [
        { row: 1, date: invoiceDate, description, account: { id: expAcctId }, vatType: { id: 1 }, amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross },
        { row: 2, date: invoiceDate, description, account: { id: supplierLedger }, supplier: { id: supplierId }, amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross, invoiceNumber, termOfPayment: dueDate },
      ],
    },
  });
  if (!siRes.ok) { console.error("SI FAIL:", JSON.stringify(siRes.data, null, 2).substring(0, 500)); return; }
  const si = siRes.data.value;
  const voucherId = si.voucher.id;

  // CALL 4: GET voucher version
  const getV = await api("GET", `/ledger/voucher/${voucherId}?fields=version,voucherType(id)`);
  const version = getV.data.value.version;
  const vtId = getV.data.value.voucherType?.id;
  console.log(`  version=${version} vtId=${vtId}`);

  // CALL 5: PUT /ledger/voucher (book) — NO description
  const putRes = await api("PUT", `/ledger/voucher/${voucherId}`, {
    version,
    voucherType: { id: vtId },
  });
  if (!putRes.ok) { console.error("PUT FAIL:", JSON.stringify(putRes.data).substring(0, 300)); return; }
  const voucher = putRes.data.value;
  console.log(`  Booked: number=${voucher.number}`);

  // ============ AUDIT ============
  console.log("\n=== SUPPLIERINVOICE ===");
  const siRead = await api("GET", `/supplierInvoice/${si.id}?fields=*`);
  const s = siRead.data.value;
  console.log(`  id=${s.id} invoiceNumber="${s.invoiceNumber}" invoiceDate=${s.invoiceDate} invoiceDueDate=${s.invoiceDueDate}`);
  console.log(`  supplier=${JSON.stringify(s.supplier)}`);
  console.log(`  amount=${s.amount} amountCurrency=${s.amountCurrency} amountExcludingVat=${s.amountExcludingVat}`);
  console.log(`  outstandingAmount=${s.outstandingAmount}`);
  console.log(`  voucher=${JSON.stringify(s.voucher)}`);
  console.log(`  isCreditNote=${s.isCreditNote} paymentTypeId=${s.paymentTypeId}`);
  console.log(`  orderLines=${JSON.stringify(s.orderLines)}`);

  console.log("\n=== VOUCHER ===");
  const vRead = await api("GET", `/ledger/voucher/${voucherId}?fields=*`);
  const v = vRead.data.value;
  console.log(`  id=${v.id} number=${v.number} description="${v.description}" date=${v.date}`);
  console.log(`  voucherType=${JSON.stringify(v.voucherType)}`);
  console.log(`  vendorInvoiceNumber=${v.vendorInvoiceNumber}`);
  for (const p of v.postings || []) {
    console.log(`  posting: row=${p.row} acct=${p.account?.number} amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id}(${p.vatType?.number}) supplier=${p.supplier?.id||'-'} inv=${p.invoiceNumber||'-'} term=${p.termOfPayment||'-'}`);
  }

  // Check: does direct POST /ledger/voucher create a supplierInvoice?
  console.log("\n=== DIRECT VOUCHER COMPARISON ===");
  const sRes2 = await api("POST", "/supplier", { name: "DirectTest AS", organizationNumber: "823456001" });
  const sid2 = sRes2.data.value.id;
  const sled2 = sRes2.data.value.ledgerAccount.id;
  const directRes = await api("POST", "/ledger/voucher", {
    date: invoiceDate,
    description: "direct test",
    voucherType: { name: "Leverandørfaktura" },
    postings: [
      { row: 1, date: invoiceDate, description: "direct test", account: { id: expAcctId }, vatType: { id: 1 }, currency: { id: 1 }, amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross },
      { row: 2, date: invoiceDate, description: "direct test", account: { id: sled2 }, supplier: { id: sid2 }, currency: { id: 1 }, amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross, invoiceNumber: "INV-DIRECT-1", termOfPayment: dueDate },
    ],
  });
  if (directRes.ok) {
    const dv = directRes.data.value;
    console.log(`  Direct voucher: id=${dv.id} number=${dv.number} desc="${dv.description}"`);
    const directSI = await api("GET", `/supplierInvoice?voucherId=${dv.id}&fields=id,invoiceNumber,amount,amountCurrency`);
    console.log(`  supplierInvoice count: ${directSI.data.count || 0}`);
    if (directSI.data.values?.length) {
      console.log(`  SI: ${JSON.stringify(directSI.data.values[0])}`);
    } else {
      console.log(`  >>> DIRECT VOUCHER DOES NOT CREATE SI ENTITY <<<`);
    }
  }
}

main().catch(console.error);
