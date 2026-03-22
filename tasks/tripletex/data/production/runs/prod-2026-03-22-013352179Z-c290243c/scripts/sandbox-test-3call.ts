// Test: Can we achieve a 3-call path?
// Path: POST /supplier → GET /ledger/account → POST /ledger/voucher (with voucherType by name)
// Also test: Can we pass account with both number + name to skip GET entirely?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function run() {
  // First get the account id we know is correct
  const accRes = await fetch(`${BASE}/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=id,number,name`, { headers });
  const accData = await accRes.json();
  const accountId = accData.values[0].id;
  const accountName = accData.values[0].name;
  console.log(`Account 7140: id=${accountId}, name="${accountName}"`);

  // Create a test supplier
  const suppRes = await fetch(`${BASE}/supplier`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Test 3Call SARL", organizationNumber: "999888666" }),
  });
  const suppData = await suppRes.json();
  if (!suppRes.ok) { console.error("Supplier failed:", suppRes.status, JSON.stringify(suppData)); return; }
  const suppId = suppData.value.id;
  const suppLedgerAccId = suppData.value.ledgerAccount.id;
  console.log(`Supplier: id=${suppId}, ledgerAccount=${suppLedgerAccId}`);

  // Test D: account by number + name (wrong name)
  console.log("\nTest D: account: { number: 7140, name: 'wrong' }");
  const testDRes = await fetch(`${BASE}/ledger/voucher`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      date: "2026-03-22",
      description: "test d",
      voucherType: { name: "Leverandørfaktura" },
      postings: [
        {
          row: 1, date: "2026-03-22", description: "test d",
          account: { number: 7140, name: "wrong name" },
          vatType: { id: 1 }, currency: { id: 1 },
          amount: 5000, amountCurrency: 5000,
          amountGross: 6250, amountGrossCurrency: 6250,
        },
        {
          row: 2, date: "2026-03-22", description: "test d",
          account: { id: suppLedgerAccId },
          supplier: { id: suppId }, currency: { id: 1 },
          amount: -6250, amountCurrency: -6250,
          amountGross: -6250, amountGrossCurrency: -6250,
          invoiceNumber: "TEST-D", termOfPayment: "2026-03-22",
        },
      ],
    }),
  });
  const testDData = await testDRes.json();
  console.log(`Test D status: ${testDRes.status}`);
  if (!testDRes.ok) {
    console.log("Test D error:", JSON.stringify(testDData).substring(0, 500));
  } else {
    console.log("Test D SUCCESS! id:", testDData.value?.id, "number:", testDData.value?.number);
  }

  // Test E: account by number + correct name
  console.log(`\nTest E: account: { number: 7140, name: "${accountName}" }`);
  const testERes = await fetch(`${BASE}/ledger/voucher`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      date: "2026-03-22",
      description: "test e",
      voucherType: { name: "Leverandørfaktura" },
      postings: [
        {
          row: 1, date: "2026-03-22", description: "test e",
          account: { number: 7140, name: accountName },
          vatType: { id: 1 }, currency: { id: 1 },
          amount: 4000, amountCurrency: 4000,
          amountGross: 5000, amountGrossCurrency: 5000,
        },
        {
          row: 2, date: "2026-03-22", description: "test e",
          account: { id: suppLedgerAccId },
          supplier: { id: suppId }, currency: { id: 1 },
          amount: -5000, amountCurrency: -5000,
          amountGross: -5000, amountGrossCurrency: -5000,
          invoiceNumber: "TEST-E", termOfPayment: "2026-03-22",
        },
      ],
    }),
  });
  const testEData = await testERes.json();
  console.log(`Test E status: ${testERes.status}`);
  if (!testERes.ok) {
    console.log("Test E error:", JSON.stringify(testEData).substring(0, 500));
  } else {
    console.log("Test E SUCCESS! id:", testEData.value?.id, "number:", testEData.value?.number);
  }

  // Test F: supplier credit posting using account: { number: 2400, name: "Leverandørgjeld" } instead of id
  console.log(`\nTest F: Both accounts by number+name (no id at all), + voucherType by name`);
  const testFRes = await fetch(`${BASE}/ledger/voucher`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      date: "2026-03-22",
      description: "test f",
      voucherType: { name: "Leverandørfaktura" },
      postings: [
        {
          row: 1, date: "2026-03-22", description: "test f",
          account: { number: 7140, name: accountName },
          vatType: { id: 1 }, currency: { id: 1 },
          amount: 3000, amountCurrency: 3000,
          amountGross: 3750, amountGrossCurrency: 3750,
        },
        {
          row: 2, date: "2026-03-22", description: "test f",
          account: { number: 2400, name: "Leverandørgjeld" },
          supplier: { id: suppId }, currency: { id: 1 },
          amount: -3750, amountCurrency: -3750,
          amountGross: -3750, amountGrossCurrency: -3750,
          invoiceNumber: "TEST-F", termOfPayment: "2026-03-22",
        },
      ],
    }),
  });
  const testFData = await testFRes.json();
  console.log(`Test F status: ${testFRes.status}`);
  if (!testFRes.ok) {
    console.log("Test F error:", JSON.stringify(testFData).substring(0, 500));
  } else {
    console.log("Test F SUCCESS! id:", testFData.value?.id, "number:", testFData.value?.number);
    console.log("Postings:", JSON.stringify(testFData.value?.postings?.map((p: any) => ({
      row: p.row, account: p.account?.id, amount: p.amount, amountGross: p.amountGross
    })), null, 2));
  }

  // If Test F works, the 2-call path would be: POST /supplier → POST /ledger/voucher
  // (using voucherType by name, expense account by number+name, supplier account by number+name)
}

run().catch(console.error);
