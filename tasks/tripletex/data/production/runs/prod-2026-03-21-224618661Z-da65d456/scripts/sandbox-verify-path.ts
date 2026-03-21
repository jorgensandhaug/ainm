// Sandbox verification: confirm the 3-call path still holds and no new 2-call shortcut exists
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  // Test 1: Can we get paymentType info embedded in invoice read?
  console.log("=== Test 1: fields=*,paymentType(*) on GET /invoice ===");
  const r1 = await fetch(`${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1&fields=*,paymentType(*)`, { headers: H });
  console.log("Status:", r1.status);
  if (!r1.ok) console.log("Body:", (await r1.text()).slice(0, 300));
  else {
    const data = await r1.json();
    if (data.values?.length > 0) {
      const inv = data.values[0];
      console.log("Has paymentType?", !!inv.paymentType);
      console.log("Keys:", Object.keys(inv).join(", "));
    }
  }

  // Test 2: Can we use fields=*,invoicePaymentType(*) ?
  console.log("\n=== Test 2: fields=*,invoicePaymentType(*) on GET /invoice ===");
  const r2 = await fetch(`${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1&fields=*,invoicePaymentType(*)`, { headers: H });
  console.log("Status:", r2.status);
  if (!r2.ok) console.log("Body:", (await r2.text()).slice(0, 300));

  // Test 3: Confirm standard payment type resolution still works
  console.log("\n=== Test 3: GET /invoice/paymentType standard resolution ===");
  const r3 = await fetch(`${BASE}/invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`, { headers: H });
  console.log("Status:", r3.status);
  if (r3.ok) {
    const pts = (await r3.json()).values;
    const betalt = pts.find((p: any) => p.description === "Betalt til bank");
    if (betalt) {
      console.log(`Found "Betalt til bank": id=${betalt.id}, debitAccount=${betalt.debitAccount?.number}`);
    } else {
      const bank19 = pts.find((p: any) => p.debitAccount?.number?.toString().startsWith("19"));
      console.log(`No "Betalt til bank", found 19xx: id=${bank19?.id}, debitAccount=${bank19?.debitAccount?.number}`);
    }
    console.log(`Total payment types: ${pts.length}`);
  }

  // Test 4: Try GET /invoice with default payment type fields
  console.log("\n=== Test 4: Check if invoice has any payment-related fields ===");
  const r4 = await fetch(`${BASE}/invoice?invoiceDateFrom=2020-01-01&invoiceDateTo=2030-12-31&count=1&fields=*,customer(*),orderLines(*)`, { headers: H });
  if (r4.ok) {
    const inv = (await r4.json()).values[0];
    const paymentKeys = Object.keys(inv).filter(k => k.toLowerCase().includes("payment") || k.toLowerCase().includes("pay"));
    console.log("Payment-related keys in invoice:", paymentKeys.join(", ") || "none");
  }
}

main();
