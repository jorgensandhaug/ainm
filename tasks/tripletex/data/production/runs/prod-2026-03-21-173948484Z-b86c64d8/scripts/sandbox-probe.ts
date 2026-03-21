const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`\n>>> ${method} ${url}`);
  if (body) console.log(JSON.stringify(body, null, 2));
  const r = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`<<< ${r.status}`);
  console.log(JSON.stringify(json, null, 2));
  return { status: r.status, json };
}

async function main() {
  // First, get an existing dimension value to use for testing
  // The sandbox has existing dimensions. Let's find one.
  const dimValues = await api("GET", "/ledger/accountingDimensionValue?from=0&count=5");
  if (dimValues.json.values?.length > 0) {
    const existingValueId = dimValues.json.values[0].id;
    const existingDimIndex = dimValues.json.values[0].dimensionIndex;
    console.log(`\n=== Using existing dimension value id=${existingValueId}, dimensionIndex=${existingDimIndex}`);

    // Get account IDs for test
    const accts = await api("GET", "/ledger/account?number=6300,1920&fields=id,number,name");
    const acct6300 = accts.json.values?.find((a: any) => a.number === 6300);
    const acct1920 = accts.json.values?.find((a: any) => a.number === 1920);
    if (!acct6300 || !acct1920) {
      console.log("Accounts not found, aborting");
      return;
    }
    console.log(`\n=== acct6300 id=${acct6300.id}, acct1920 id=${acct1920.id}`);

    const dimKey = `freeAccountingDimension${existingDimIndex}`;
    const today = new Date().toISOString().slice(0, 10);

    // TEST 1: Minimal posting without row, date, description, currency
    // (This is what the production run tried first)
    console.log("\n\n========== TEST 1: WITHOUT row/date/description/currency ==========");
    const t1 = await api("POST", "/ledger/voucher", {
      date: today,
      description: "Test 1 - no row/date/desc/currency",
      voucherType: null,
      postings: [
        {
          account: { id: acct6300.id },
          amount: 100,
          amountCurrency: 100,
          amountGross: 100,
          amountGrossCurrency: 100,
          [dimKey]: { id: existingValueId },
        },
        {
          account: { id: acct1920.id },
          amount: -100,
          amountCurrency: -100,
          amountGross: -100,
          amountGrossCurrency: -100,
        },
      ],
    });

    // TEST 2: With row only (1 and 2)
    console.log("\n\n========== TEST 2: WITH row only ==========");
    const t2 = await api("POST", "/ledger/voucher", {
      date: today,
      description: "Test 2 - row only",
      voucherType: null,
      postings: [
        {
          row: 1,
          account: { id: acct6300.id },
          amount: 100,
          amountCurrency: 100,
          amountGross: 100,
          amountGrossCurrency: 100,
          [dimKey]: { id: existingValueId },
        },
        {
          row: 2,
          account: { id: acct1920.id },
          amount: -100,
          amountCurrency: -100,
          amountGross: -100,
          amountGrossCurrency: -100,
        },
      ],
    });

    // TEST 3: With row and currency only
    console.log("\n\n========== TEST 3: WITH row + currency ==========");
    const t3 = await api("POST", "/ledger/voucher", {
      date: today,
      description: "Test 3 - row + currency",
      voucherType: null,
      postings: [
        {
          row: 1,
          account: { id: acct6300.id },
          currency: { id: 1 },
          amount: 100,
          amountCurrency: 100,
          amountGross: 100,
          amountGrossCurrency: 100,
          [dimKey]: { id: existingValueId },
        },
        {
          row: 2,
          account: { id: acct1920.id },
          currency: { id: 1 },
          amount: -100,
          amountCurrency: -100,
          amountGross: -100,
          amountGrossCurrency: -100,
        },
      ],
    });

    console.log("\n\n========== SUMMARY ==========");
    console.log(`Test 1 (no row/date/desc/currency): ${t1.status}`);
    console.log(`Test 2 (row only): ${t2.status}`);
    console.log(`Test 3 (row + currency): ${t3.status}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
