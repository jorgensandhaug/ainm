const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: h };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.log(text); return null; }
  if (!text) return null;
  const json = JSON.parse(text);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

async function main() {
  // Test 1: Can we use account: { number: 7360, name: "Representasjon, ikke fradragsberettiget" }?
  // This would save the GET /ledger/account call
  console.log("=== Test 1: account with number+name (no id) ===");
  const v1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-01-04",
    description: "Test account ref by number+name",
    postings: [
      {
        row: 1, date: "2026-01-04", description: "Test",
        account: { number: 7360, name: "Representasjon, ikke fradragsberettiget" },
        amount: 100, amountCurrency: 100, amountGross: 100, amountGrossCurrency: 100,
      },
      {
        row: 2, date: "2026-01-04", description: "Test",
        account: { number: 1920, name: "Bankinnskudd" },
        amount: -100, amountCurrency: -100, amountGross: -100, amountGrossCurrency: -100,
      },
    ],
  });
  if (v1) {
    console.log("SUCCESS! Voucher:", v1.id);
    console.log("Postings:", JSON.stringify(v1.postings?.map((p: any) => ({
      account: { id: p.account?.id, number: p.account?.number },
      amount: p.amount,
    }))));
  }

  // Test 2: Can we use account: { number: 7360 } with name omitted?
  console.log("\n=== Test 2: account with number only (no name, no id) ===");
  const v2 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-01-04",
    description: "Test account ref by number only",
    postings: [
      {
        row: 1, date: "2026-01-04", description: "Test",
        account: { number: 7360 },
        amount: 100, amountCurrency: 100, amountGross: 100, amountGrossCurrency: 100,
      },
      {
        row: 2, date: "2026-01-04", description: "Test",
        account: { number: 1920 },
        amount: -100, amountCurrency: -100, amountGross: -100, amountGrossCurrency: -100,
      },
    ],
  });
  if (v2) {
    console.log("SUCCESS! Voucher:", v2.id);
  }
}

main().catch(console.error);
