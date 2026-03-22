// Test: can we POST /ledger/voucher with account: { number: N, name: "dummy" }?
// The 422 was about account.name being null, maybe if we supply both number and name...

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  console.log(`${res.status} ${method} ${path}: ${text.substring(0, 800)}`);
  return { status: res.status, body: text };
}

async function main() {
  // Try with number + name
  const result = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-02-28",
    description: "Test account-by-number-and-name",
    postings: [
      { row: 1, account: { number: 6300, name: "Leie lokale" }, amountGross: 100, amountGrossCurrency: 100, description: "test debit" },
      { row: 2, account: { number: 1920, name: "Bankinnskudd" }, amountGross: -100, amountGrossCurrency: -100, description: "test credit" },
    ],
  });

  console.log(`\nResult: status=${result.status}`);
  if (result.status === 201 || result.status === 200) {
    console.log("SUCCESS: account: { number, name } works!");
  } else {
    console.log("FAILED: still requires account.id");
  }
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
