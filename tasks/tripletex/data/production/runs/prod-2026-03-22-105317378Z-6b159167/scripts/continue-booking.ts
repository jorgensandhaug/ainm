const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "KBXKVQrMu7Ji6n8M38r2BpAd-6Gx8u1qnSUnLCtfMlg";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  console.log(JSON.stringify(json, null, 2));
  if (!r.ok) throw new Error(`${method} ${path} failed: ${r.status} ${text}`);
  return json;
}

const voucherId = 609407276;
const voucherVersion = 1;
const supplierId = 108586566;
const supplierLedgerAccountId = 499153428;
const expenseAccountId = 499153635;

const invoiceNumber = "INV-2026-6556";
const gross = 50750;
const net = 40600;
const invoiceDate = "2026-03-22";
const dueDate = "2026-04-21";
const description = "serviços de escritório";

async function main() {
  // Verify SI entity (with required date params)
  const siRes = await api("GET", `/supplierInvoice?voucherId=${voucherId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*`);
  console.log(`SupplierInvoice count: ${siRes.count}`);

  // PUT postings (sendToLedger=false)
  const putPostingsRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: voucherVersion,
    postings: [
      {
        row: 1,
        date: invoiceDate,
        description: description,
        account: { id: expenseAccountId },
        vatType: { id: 1 },
        amount: net,
        amountCurrency: net,
        amountGross: gross,
        amountGrossCurrency: gross,
      },
      {
        row: 2,
        date: invoiceDate,
        description: description,
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
  });
  const version2 = putPostingsRes.value.version;
  console.log(`After PUT postings, version: ${version2}`);

  // PUT book (sendToLedger=true)
  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
    version: version2,
    voucherType: { name: "Leverandørfaktura" },
  });
  console.log(`Booked voucher number: ${bookRes.value.number}`);

  // Verify voucher
  const voucherVerify = await api("GET", `/ledger/voucher/${voucherId}?fields=*`);
  console.log(`Voucher number: ${voucherVerify.value.number}, description: ${voucherVerify.value.description}`);

  // Verify supplier
  const supplierVerify = await api("GET", `/supplier/${supplierId}?fields=*`);
  console.log(`Supplier: ${supplierVerify.value.name}, org: ${supplierVerify.value.organizationNumber}`);

  console.log("\nDONE — supplier invoice registered and booked.");
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
