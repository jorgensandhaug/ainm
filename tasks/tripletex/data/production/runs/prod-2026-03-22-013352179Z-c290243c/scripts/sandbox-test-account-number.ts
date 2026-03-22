// Test: Can we use account number directly in postings instead of resolving account id?
// Test: Can we hardcode voucherType id? What is its id in sandbox?
// Test: Can we skip GET /ledger/account by using account number in postings?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function run() {
  // 1. Check voucherType id for Leverandørfaktura in sandbox
  const vtRes = await fetch(`${BASE}/ledger/voucherType?name=Leverand%C3%B8rfaktura&fields=*`, { headers });
  const vtData = await vtRes.json();
  console.log("VoucherType in sandbox:", JSON.stringify(vtData.values?.map((v: any) => ({ id: v.id, name: v.name })), null, 2));

  // 2. Get account 7140 id for reference
  const accRes = await fetch(`${BASE}/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=id,number,name`, { headers });
  const accData = await accRes.json();
  console.log("Account 7140 in sandbox:", JSON.stringify(accData.values?.[0], null, 2));
  const accountId = accData.values?.[0]?.id;

  // 3. Create a test supplier
  const suppRes = await fetch(`${BASE}/supplier`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Test Account Number SARL", organizationNumber: "999888777" }),
  });
  const suppData = await suppRes.json();
  if (!suppRes.ok) {
    console.error("Supplier create failed:", suppRes.status, JSON.stringify(suppData));
    return;
  }
  const suppId = suppData.value.id;
  const suppLedgerAccId = suppData.value.ledgerAccount.id;
  console.log(`Supplier created: id=${suppId}, ledgerAccount=${suppLedgerAccId}`);

  // 4. Try POST /ledger/voucher using account: { number: 7140 } instead of { id: ... }
  const voucherTypeId = vtData.values[0].id;
  console.log(`\nTest A: Using account: { number: 7140 } (no id)`);
  const testARes = await fetch(`${BASE}/ledger/voucher`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      date: "2026-03-22",
      description: "test account number",
      voucherType: { id: voucherTypeId },
      postings: [
        {
          row: 1, date: "2026-03-22", description: "test",
          account: { number: 7140 },  // <-- using number instead of id
          vatType: { id: 1 }, currency: { id: 1 },
          amount: 10000, amountCurrency: 10000,
          amountGross: 12500, amountGrossCurrency: 12500,
        },
        {
          row: 2, date: "2026-03-22", description: "test",
          account: { id: suppLedgerAccId },
          supplier: { id: suppId }, currency: { id: 1 },
          amount: -12500, amountCurrency: -12500,
          amountGross: -12500, amountGrossCurrency: -12500,
          invoiceNumber: "TEST-001", termOfPayment: "2026-03-22",
        },
      ],
    }),
  });
  const testAData = await testARes.json();
  console.log(`Test A status: ${testARes.status}`);
  if (!testARes.ok) {
    console.log("Test A error:", JSON.stringify(testAData).substring(0, 500));
  } else {
    console.log("Test A SUCCESS! Voucher id:", testAData.value?.id, "number:", testAData.value?.number);
    // Check what account was used
    const debitPosting = testAData.value?.postings?.find((p: any) => p.row === 1);
    console.log("Debit posting account id:", debitPosting?.account?.id);
  }

  // 5. Try using voucherType: { name: "Leverandørfaktura" } instead of { id: ... }
  console.log(`\nTest B: Using voucherType: { name: "Leverandørfaktura" } (no id)`);
  const testBRes = await fetch(`${BASE}/ledger/voucher`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      date: "2026-03-22",
      description: "test vouchertype name",
      voucherType: { name: "Leverandørfaktura" },  // <-- using name instead of id
      postings: [
        {
          row: 1, date: "2026-03-22", description: "test",
          account: { id: accountId },
          vatType: { id: 1 }, currency: { id: 1 },
          amount: 8000, amountCurrency: 8000,
          amountGross: 10000, amountGrossCurrency: 10000,
        },
        {
          row: 2, date: "2026-03-22", description: "test",
          account: { id: suppLedgerAccId },
          supplier: { id: suppId }, currency: { id: 1 },
          amount: -10000, amountCurrency: -10000,
          amountGross: -10000, amountGrossCurrency: -10000,
          invoiceNumber: "TEST-002", termOfPayment: "2026-03-22",
        },
      ],
    }),
  });
  const testBData = await testBRes.json();
  console.log(`Test B status: ${testBRes.status}`);
  if (!testBRes.ok) {
    console.log("Test B error:", JSON.stringify(testBData).substring(0, 500));
  } else {
    console.log("Test B SUCCESS! Voucher id:", testBData.value?.id, "number:", testBData.value?.number);
  }

  // 6. Try using supplier ledger account by number (2400 typically) instead of by id
  console.log(`\nTest C: What is the supplier ledger account number?`);
  const suppAccRes = await fetch(`${BASE}/ledger/account/${suppLedgerAccId}?fields=*`, { headers });
  const suppAccData = await suppAccRes.json();
  console.log("Supplier ledger account:", suppAccData.value?.number, suppAccData.value?.name);
}

run().catch(console.error);
