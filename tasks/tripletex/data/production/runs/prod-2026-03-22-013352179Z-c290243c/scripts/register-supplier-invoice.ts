const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "8O1bJDuAvYxNmBsCzR7m29cJ0_49wP_VyWPTZHiah14";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const DATE = "2026-03-22";
const DESCRIPTION = "services de bureau";
const INVOICE_NUMBER = "INV-2026-5683";
const GROSS = 75500;
const NET = GROSS / 1.25; // 60400

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function run() {
  // 1. POST /supplier
  const supplierRes = await fetch(`${BASE}/supplier`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Lumière SARL",
      organizationNumber: "904564184",
    }),
  });
  const supplierData = await supplierRes.json();
  if (!supplierRes.ok) {
    console.error("POST /supplier failed:", supplierRes.status, JSON.stringify(supplierData));
    return;
  }
  const supplierId = supplierData.value.id;
  const supplierLedgerAccountId = supplierData.value.ledgerAccount.id;
  console.log(`Supplier created: id=${supplierId}, ledgerAccount=${supplierLedgerAccountId}`);

  // 2. GET /ledger/account
  const accountRes = await fetch(
    `${BASE}/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=*`,
    { headers }
  );
  const accountData = await accountRes.json();
  if (!accountRes.ok) {
    console.error("GET /ledger/account failed:", accountRes.status, JSON.stringify(accountData));
    return;
  }
  const expenseAccountId = accountData.values[0].id;
  console.log(`Expense account 7140: id=${expenseAccountId}`);

  // 3. GET /ledger/voucherType
  const vtRes = await fetch(
    `${BASE}/ledger/voucherType?name=Leverand%C3%B8rfaktura&fields=*`,
    { headers }
  );
  const vtData = await vtRes.json();
  if (!vtRes.ok) {
    console.error("GET /ledger/voucherType failed:", vtRes.status, JSON.stringify(vtData));
    return;
  }
  const voucherTypeId = vtData.values[0].id;
  console.log(`VoucherType Leverandørfaktura: id=${voucherTypeId}`);

  // 4. POST /ledger/voucher
  const voucherPayload = {
    date: DATE,
    description: DESCRIPTION,
    voucherType: { id: voucherTypeId },
    postings: [
      {
        row: 1,
        date: DATE,
        description: DESCRIPTION,
        account: { id: expenseAccountId },
        vatType: { id: 1 },
        currency: { id: 1 },
        amount: NET,
        amountCurrency: NET,
        amountGross: GROSS,
        amountGrossCurrency: GROSS,
      },
      {
        row: 2,
        date: DATE,
        description: DESCRIPTION,
        account: { id: supplierLedgerAccountId },
        supplier: { id: supplierId },
        currency: { id: 1 },
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
        invoiceNumber: INVOICE_NUMBER,
        termOfPayment: DATE,
      },
    ],
  };

  const voucherRes = await fetch(`${BASE}/ledger/voucher`, {
    method: "POST",
    headers,
    body: JSON.stringify(voucherPayload),
  });
  const voucherData = await voucherRes.json();
  if (!voucherRes.ok) {
    console.error("POST /ledger/voucher failed:", voucherRes.status, JSON.stringify(voucherData));
    return;
  }
  console.log(`Voucher created: id=${voucherData.value.id}, number=${voucherData.value.number}`);
  console.log("Postings:", JSON.stringify(voucherData.value.postings, null, 2));
  console.log("DONE — 4 API calls, 0 errors");
}

run().catch(console.error);
