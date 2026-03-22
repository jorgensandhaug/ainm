const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "D0l0k1IlGlneZTylKWO5bf86kV-q4lJ39_Ov2NGGaaM";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

const INVOICE_NO = "INV-2026-8735";
const GROSS = 8500;
const INV_DATE = "2026-03-22";
const DUE_DATE = "2026-04-21";
const DESCRIPTION = "office services";

// Already completed: supplier created (108589322), importDocument succeeded (voucher 609411039, version 1)
// Account 7100 locked to vatType 0 — post expense as gross without VAT split
const supplierId = 108589322;
const supplierLedgerAccountId = 499714754;
const expenseAccountId = 499714996;
const voucherId = 609411039;
const voucherVersion = 1;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!r.ok) {
    console.error(`${method} ${path} → ${r.status}`);
    console.error(JSON.stringify(json, null, 2));
    throw new Error(`${method} ${path} → ${r.status}`);
  }
  console.log(`${method} ${path} → ${r.status}`);
  return json;
}

async function main() {
  // Step 5: PUT postings (sendToLedger=false) — no vatType on 7100 (locked to 0)
  const putPostingsRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: voucherVersion,
    postings: [
      {
        row: 1,
        date: INV_DATE,
        description: DESCRIPTION,
        account: { id: expenseAccountId },
        amount: GROSS,
        amountCurrency: GROSS,
        amountGross: GROSS,
        amountGrossCurrency: GROSS,
      },
      {
        row: 2,
        date: INV_DATE,
        description: DESCRIPTION,
        account: { id: supplierLedgerAccountId },
        supplier: { id: supplierId },
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
        invoiceNumber: INVOICE_NO,
        termOfPayment: DUE_DATE,
      },
    ],
  });
  const postingsVersion = putPostingsRes.value.version;
  console.log(`PUT postings done, version=${postingsVersion}`);

  // Step 6: PUT book (sendToLedger=true)
  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
    version: postingsVersion,
    voucherType: { name: "Leverandørfaktura" },
  });
  console.log(`Booked: number=${bookRes.value.number}`);

  // Step 7: Verify voucher
  const vRes = await api("GET", `/ledger/voucher/${voucherId}?fields=*`);
  console.log(`Voucher verification:`);
  console.log(JSON.stringify(vRes.value, null, 2));

  // Step 8: Verify supplier
  const sRes = await api("GET", `/supplier/${supplierId}?fields=*`);
  console.log(`Supplier verification:`);
  console.log(JSON.stringify(sRes.value, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
