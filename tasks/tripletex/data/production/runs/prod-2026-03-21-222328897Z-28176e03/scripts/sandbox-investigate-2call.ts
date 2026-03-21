const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  // Test 1: Can we get payment types via /ledger/paymentType or similar?
  console.log("=== Test 1: GET /ledger/paymentType ===");
  const r1 = await fetch(`${BASE}/ledger/paymentType?count=10&fields=*`, { headers: H });
  console.log("Status:", r1.status);
  if (r1.ok) {
    const d = await r1.json();
    console.log("Found ledger paymentTypes:", d.values?.length, "sample:", JSON.stringify(d.values?.[0])?.slice(0, 200));
  } else {
    console.log("Body:", (await r1.text()).slice(0, 200));
  }

  // Test 2: Can we use /invoice with fields that include payment type info?
  console.log("\n=== Test 2: GET /invoice with currency(*) expansion ===");
  const r2 = await fetch(`${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1&fields=*,customer(*),orderLines(*),currency(*)`, { headers: H });
  console.log("Status:", r2.status);
  if (r2.ok) {
    const d = await r2.json();
    const inv = d.values?.[0];
    if (inv) {
      // Check if any payment-related fields exist
      const paymentFields = Object.keys(inv).filter(k => k.toLowerCase().includes('payment') || k.toLowerCase().includes('paymenttype'));
      console.log("Payment-related fields on invoice:", paymentFields);
    }
  }

  // Test 3: Try GET /invoice/paymentType with a minimal query to see if the structure can be predicted
  console.log("\n=== Test 3: GET /invoice/paymentType - check if there's always exactly one 'Betalt til bank' ===");
  const r3 = await fetch(`${BASE}/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`, { headers: H });
  if (r3.ok) {
    const d = await r3.json();
    const pts = d.values || [];
    const betaltTilBank = pts.filter((p: any) => p.description === "Betalt til bank");
    const bank19xx = pts.filter((p: any) => p.debitAccount && String(p.debitAccount.number).startsWith("19"));
    console.log(`Total payment types: ${pts.length}`);
    console.log(`"Betalt til bank" matches: ${betaltTilBank.length}, ids: ${betaltTilBank.map((p: any) => p.id)}`);
    console.log(`Debit 19xx matches: ${bank19xx.length}, ids: ${bank19xx.map((p: any) => p.id)}`);
    console.log("All types:", pts.map((p: any) => `${p.id}:${p.description}:${p.debitAccount?.number}`));
  }

  // Test 4: Try using /company/settings or /company to find default payment type
  console.log("\n=== Test 4: GET /company - check for default payment type ===");
  const r4 = await fetch(`${BASE}/company?fields=*`, { headers: H });
  console.log("Status:", r4.status);
  if (r4.ok) {
    const d = await r4.json();
    const v = d.value || d;
    const paymentFields = Object.entries(v).filter(([k]) => k.toLowerCase().includes('payment'));
    console.log("Payment-related company fields:", paymentFields);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
