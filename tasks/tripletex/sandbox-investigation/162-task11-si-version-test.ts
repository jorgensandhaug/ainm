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

async function testVersion(label: string, gross: number) {
  const net = Math.round((gross * 100) / 125);

  const sRes = await api("POST", "/supplier", { name: `VerTest-${label}`, organizationNumber: "823456786" });
  const supplierId = sRes.data.value.id;
  const supplierLedger = sRes.data.value.ledgerAccount.id;
  const acctRes = await api("GET", "/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=*");
  const expAcctId = acctRes.data.values[0].id;

  const siRes = await api("POST", "/supplierInvoice", {
    invoiceNumber: `INV-VER-${label}`,
    invoiceDate: "2026-03-22",
    invoiceDueDate: "2026-04-21",
    supplier: { id: supplierId },
    amountCurrency: -gross,
    voucher: {
      date: "2026-03-22",
      description: `test ${label}`,
      postings: [
        { row: 1, date: "2026-03-22", description: `test ${label}`, account: { id: expAcctId }, vatType: { id: 1 }, amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross },
        { row: 2, date: "2026-03-22", description: `test ${label}`, account: { id: supplierLedger }, supplier: { id: supplierId }, amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross },
      ],
    },
  });
  if (!siRes.ok) { console.log(`  ${label}: SI FAIL`); return; }
  const voucherId = siRes.data.value.voucher.id;

  const getV = await api("GET", `/ledger/voucher/${voucherId}?fields=version,number,postings(*)`);
  const v = getV.data.value;
  console.log(`${label} (gross=${gross}): version=${v.version} number=${v.number}`);
  for (const p of v.postings || []) {
    console.log(`  row=${p.row} acct=${p.account?.id}(${p.account?.number}) amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.id}`);
  }

  // Try booking with version
  const putRes = await api("PUT", `/ledger/voucher/${voucherId}`, {
    version: v.version,
    voucherType: { name: "Leverandørfaktura" },
  });
  console.log(`  PUT book: ${putRes.status} ${putRes.ok ? `number=${putRes.data.value.number}` : putRes.data?.message}`);
}

async function testWithoutAmountCurrency(label: string, gross: number) {
  const net = Math.round((gross * 100) / 125);

  const sRes = await api("POST", "/supplier", { name: `NoAmt-${label}`, organizationNumber: "823456786" });
  const supplierId = sRes.data.value.id;
  const supplierLedger = sRes.data.value.ledgerAccount.id;
  const acctRes = await api("GET", "/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=*");
  const expAcctId = acctRes.data.values[0].id;

  // POST WITHOUT amountCurrency
  const siRes = await api("POST", "/supplierInvoice", {
    invoiceNumber: `INV-NOAMT-${label}`,
    invoiceDate: "2026-03-22",
    invoiceDueDate: "2026-04-21",
    supplier: { id: supplierId },
    voucher: {
      date: "2026-03-22",
      description: `noamt ${label}`,
      postings: [
        { row: 1, date: "2026-03-22", description: `noamt ${label}`, account: { id: expAcctId }, vatType: { id: 1 }, amount: net, amountCurrency: net, amountGross: gross, amountGrossCurrency: gross },
        { row: 2, date: "2026-03-22", description: `noamt ${label}`, account: { id: supplierLedger }, supplier: { id: supplierId }, amount: -gross, amountCurrency: -gross, amountGross: -gross, amountGrossCurrency: -gross },
      ],
    },
  });
  if (!siRes.ok) { console.log(`  ${label} (no amtCurrency): SI FAIL`); return; }
  const si = siRes.data.value;
  const voucherId = si.voucher.id;
  console.log(`${label} (no amtCurrency): SI amount=${si.amount} amountCurrency=${si.amountCurrency} outstandingAmount=${si.outstandingAmount}`);

  const getV = await api("GET", `/ledger/voucher/${voucherId}?fields=version,number`);
  console.log(`  version=${getV.data.value.version} number=${getV.data.value.number}`);
}

async function main() {
  // Test version with different amounts
  await testVersion("small", 12500);
  console.log();
  await testVersion("medium", 72350);
  console.log();
  await testVersion("large", 150000);
  console.log();

  // Test WITHOUT amountCurrency
  await testWithoutAmountCurrency("noamt", 12500);
}

main().catch(console.error);
