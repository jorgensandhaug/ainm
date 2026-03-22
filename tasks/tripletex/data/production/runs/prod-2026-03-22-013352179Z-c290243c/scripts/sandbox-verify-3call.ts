// Verify complete 3-call path end-to-end:
// 1. POST /supplier
// 2. GET /ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=*
// 3. POST /ledger/voucher with voucherType: { name: "Leverandørfaktura" }

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

const DATE = "2026-03-22";
const DESCRIPTION = "services de bureau";
const INVOICE = "INV-2026-5683";
const GROSS = 75500;
const NET = GROSS / 1.25; // 60400

async function run() {
  console.log("=== 3-CALL PATH VERIFICATION ===\n");

  // Call 1: POST /supplier
  console.log("Call 1: POST /supplier");
  const suppRes = await fetch(`${BASE}/supplier`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      name: "Lumière 3Call SARL",
      organizationNumber: "999777555",
    }),
  });
  const suppData = await suppRes.json();
  if (!suppRes.ok) { console.error("FAIL:", suppRes.status, JSON.stringify(suppData)); return; }
  const suppId = suppData.value.id;
  const suppLedgerAccId = suppData.value.ledgerAccount.id;
  console.log(`  OK: supplier id=${suppId}, ledgerAccount=${suppLedgerAccId}`);

  // Call 2: GET /ledger/account
  console.log("Call 2: GET /ledger/account?number=7140");
  const accRes = await fetch(`${BASE}/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=*`, { headers });
  const accData = await accRes.json();
  if (!accRes.ok) { console.error("FAIL:", accRes.status, JSON.stringify(accData)); return; }
  const expenseAccId = accData.values[0].id;
  console.log(`  OK: expense account id=${expenseAccId}`);

  // Call 3: POST /ledger/voucher (using voucherType by name, NOT id)
  console.log("Call 3: POST /ledger/voucher (voucherType by name)");
  const voucherRes = await fetch(`${BASE}/ledger/voucher`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      date: DATE,
      description: DESCRIPTION,
      voucherType: { name: "Leverandørfaktura" },
      postings: [
        {
          row: 1,
          date: DATE,
          description: DESCRIPTION,
          account: { id: expenseAccId },
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
          account: { id: suppLedgerAccId },
          supplier: { id: suppId },
          currency: { id: 1 },
          amount: -GROSS,
          amountCurrency: -GROSS,
          amountGross: -GROSS,
          amountGrossCurrency: -GROSS,
          invoiceNumber: INVOICE,
          termOfPayment: DATE,
        },
      ],
    }),
  });
  const voucherData = await voucherRes.json();
  if (!voucherRes.ok) {
    console.error("FAIL:", voucherRes.status, JSON.stringify(voucherData));
    return;
  }
  console.log(`  OK: voucher id=${voucherData.value.id}, number=${voucherData.value.number} (booked=${voucherData.value.number > 0})`);
  console.log(`  Description: "${voucherData.value.description}"`);
  console.log(`  VoucherType: id=${voucherData.value.voucherType?.id}, name="${voucherData.value.voucherType?.name}"`);

  const postings = voucherData.value.postings;
  console.log(`  Postings (${postings.length}):`);
  for (const p of postings) {
    console.log(`    row=${p.row} account=${p.account?.id} amount=${p.amount} amountGross=${p.amountGross} vatType=${p.vatType?.id} systemGenerated=${p.systemGenerated} supplier=${p.supplier?.id || '-'}`);
  }

  console.log("\n=== RESULT: 3 API calls, 0 errors, voucher auto-booked ===");
}

run().catch(console.error);
