const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "a2LnOPbze9019-34_IszaHfE-8cUM1nr4i2yDETSxx0";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function main() {
  // Step 1: POST /supplier
  const supplierRes = await fetch(`${BASE}/supplier`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: "Oakwood Ltd",
      organizationNumber: "948453436",
      postalAddress: {
        addressLine1: "Parkveien 77",
        postalCode: "9008",
        city: "Tromsø",
        country: { id: 161 },
      },
      physicalAddress: {
        addressLine1: "Parkveien 77",
        postalCode: "9008",
        city: "Tromsø",
        country: { id: 161 },
      },
      bankAccountPresentation: [{ bban: "17062016817" }],
    }),
  });
  const supplier = await supplierRes.json();
  console.log("POST /supplier", supplierRes.status, JSON.stringify(supplier));
  if (!supplierRes.ok) throw new Error("Supplier creation failed");

  const supplierId = supplier.value.id;
  const supplierLedgerAccountId = supplier.value.ledgerAccount.id;

  // Step 2: GET /ledger/account for expense account 6340
  const acctRes = await fetch(
    `${BASE}/ledger/account?number=6340&isApplicableForSupplierInvoice=true&fields=*`,
    { headers: H }
  );
  const acct = await acctRes.json();
  console.log("GET /ledger/account", acctRes.status, JSON.stringify(acct));
  if (!acctRes.ok) throw new Error("Account lookup failed");

  const expenseAccountId = acct.values[0].id;

  // Step 3: POST /ledger/voucher
  const voucherRes = await fetch(`${BASE}/ledger/voucher`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      date: "2026-05-24",
      description: "Programvarelisens",
      voucherType: { name: "Leverandørfaktura" },
      postings: [
        {
          row: 1,
          date: "2026-05-24",
          description: "Programvarelisens",
          account: { id: expenseAccountId },
          vatType: { id: 1 },
          currency: { id: 1 },
          amount: 45400,
          amountCurrency: 45400,
          amountGross: 56750,
          amountGrossCurrency: 56750,
        },
        {
          row: 2,
          date: "2026-05-24",
          description: "Programvarelisens",
          account: { id: supplierLedgerAccountId },
          supplier: { id: supplierId },
          currency: { id: 1 },
          amount: -56750,
          amountCurrency: -56750,
          amountGross: -56750,
          amountGrossCurrency: -56750,
          invoiceNumber: "INV-2026-2823",
          termOfPayment: "2026-06-23",
        },
      ],
    }),
  });
  const voucher = await voucherRes.json();
  console.log("POST /ledger/voucher", voucherRes.status, JSON.stringify(voucher));
  if (!voucherRes.ok) throw new Error("Voucher creation failed");

  console.log(`Done. Voucher id=${voucher.value.id} number=${voucher.value.number}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
