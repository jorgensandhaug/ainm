// Verify Case B missing VAT correction: direct 2710 posting approach
// For the 0607a659 production scenario: 4500 / 14500 excl VAT / 2710 exists
// Original: 4500 gross=14500, vatType=1 → net=11600, 2710=2900, counterpart=-14500
// Correct: net=14500, VAT=3625, total=18125
// Correction: 2710 +725, 4500 +2900 (vatType=0), counterpart -3625

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const url = `${BASE}${path}`;
  console.log(`GET ${url}`);
  const r = await fetch(url, { headers });
  const body = await r.json();
  if (!r.ok) { console.error("GET failed:", r.status, JSON.stringify(body)); process.exit(1); }
  return body;
}

async function post(path: string, data: any) {
  const url = `${BASE}${path}`;
  console.log(`POST ${url}`);
  const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(data) });
  const body = await r.json();
  if (!r.ok) { console.error("POST failed:", r.status, JSON.stringify(body)); process.exit(1); }
  return body;
}

async function main() {
  // Step 1: Get account IDs for 4500, 2710, 2400, 1920
  const acctResp = await get("/ledger/account?number=4500,2710,2400,1920&fields=id,number");
  const acctMap: Record<number, number> = {};
  for (const a of acctResp.values) {
    acctMap[a.number] = a.id;
  }
  console.log("Account map:", acctMap);

  // Step 2: Create a test voucher that simulates the original error
  // 4500: gross=14500, vatType=1 (net=11600, VAT=2900)
  // 1920: gross=-14500 (counterpart)
  const setupResult = await post("/ledger/voucher?sendToLedger=true", {
    date: "2026-01-15",
    description: "Test setup: 4500/14500 with vatType=1 (net as gross error)",
    postings: [
      { row: 1, account: { id: acctMap[4500] }, amountGross: 14500, amountGrossCurrency: 14500, vatType: { id: 1 }, description: "Varekjøp test" },
      { row: 2, account: { id: acctMap[1920] }, amountGross: -14500, amountGrossCurrency: -14500, description: "Bank" },
    ]
  });
  console.log("\nSetup voucher created:", setupResult.value?.id);

  // Check what Tripletex generated
  const setupPostings = setupResult.value?.postings || [];
  for (const p of setupPostings) {
    console.log(`  acct=${p.account?.id} amount=${p.amount} gross=${p.amountGross} vatType=${p.vatType?.id} systemGenerated=${p.systemGenerated}`);
  }

  // Verify: original has 2710 posting (auto-generated)
  const has2710 = setupPostings.some((p: any) => p.account?.id === acctMap[2710]);
  console.log(`\nOriginal has 2710: ${has2710}`);

  // Find the original expense posting to get existing_net
  const expensePosting = setupPostings.find((p: any) => p.account?.id === acctMap[4500]);
  const existing_net = expensePosting?.amount; // net amount
  const existing_gross = expensePosting?.amountGross;
  console.log(`Original expense: net=${existing_net} gross=${existing_gross}`);

  const vat2710Posting = setupPostings.find((p: any) => p.account?.id === acctMap[2710]);
  const existing_2710 = vat2710Posting?.amount;
  console.log(`Original 2710: amount=${existing_2710}`);

  // Step 3: Apply Case B correction
  const net_amount = 14500; // the correct net (excl. VAT)
  const correct_vat = net_amount * 0.25; // 3625
  const vat_shortfall = correct_vat - existing_2710; // 3625 - 2900 = 725
  const expense_net_shortfall = net_amount - existing_net; // 14500 - 11600 = 2900
  const total_shortfall = vat_shortfall + expense_net_shortfall; // 725 + 2900 = 3625

  console.log(`\nCase B correction:`);
  console.log(`  correct_vat=${correct_vat} vat_shortfall=${vat_shortfall}`);
  console.log(`  expense_net_shortfall=${expense_net_shortfall}`);
  console.log(`  total_shortfall=${total_shortfall}`);

  const corrResult = await post("/ledger/voucher?sendToLedger=true", {
    date: "2026-02-28",
    description: "Case B correction: direct 2710 posting",
    postings: [
      { row: 1, account: { id: acctMap[2710] }, amountGross: vat_shortfall, amountGrossCurrency: vat_shortfall, description: "Korreksjon: manglende MVA" },
      { row: 2, account: { id: acctMap[4500] }, amountGross: expense_net_shortfall, amountGrossCurrency: expense_net_shortfall, vatType: { id: 0 }, description: "Korreksjon: manglende MVA" },
      { row: 3, account: { id: acctMap[1920] }, amountGross: -total_shortfall, amountGrossCurrency: -total_shortfall, description: "Korreksjon: manglende MVA" },
    ]
  });
  console.log("\nCase B correction voucher created:", corrResult.value?.id);

  const corrPostings = corrResult.value?.postings || [];
  for (const p of corrPostings) {
    console.log(`  acct=${p.account?.id} amount=${p.amount} gross=${p.amountGross} vatType=${p.vatType?.id} systemGenerated=${p.systemGenerated}`);
  }

  // Final verification: after correction
  console.log("\n=== Final state verification ===");
  console.log(`4500 net: ${existing_net} + ${expense_net_shortfall} = ${existing_net + expense_net_shortfall} (should be ${net_amount})`);
  console.log(`2710 VAT: ${existing_2710} + ${vat_shortfall} = ${existing_2710 + vat_shortfall} (should be ${correct_vat})`);
  console.log(`1920 counterpart: -14500 + -${total_shortfall} = ${-14500 - total_shortfall} (should be ${-(net_amount * 1.25)})`);
}

main().catch(e => { console.error(e); process.exit(1); });
