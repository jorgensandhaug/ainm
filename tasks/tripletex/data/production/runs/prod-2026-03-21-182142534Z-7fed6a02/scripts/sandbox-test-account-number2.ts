// Test: can POST /ledger/voucher accept account: { number: ..., name: "..." } to create/resolve?
// Or does it need exact ID?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`Status: ${res.status}`);
  if (!res.ok) console.error("ERROR:", JSON.stringify(data, null, 2));
  return { ok: res.ok, status: res.status, data };
}

// Test: account with number + name
console.log("\n=== Test: POST voucher with account.number + account.name ===");
const test = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: "2026-03-20",
  description: "Sandbox test: account by number+name",
  postings: [
    { row: 1, account: { number: 6300, name: "Leie lokale" }, amountGross: 100, amountGrossCurrency: 100, vatType: { id: 0 }, description: "test debit" },
    { row: 2, account: { number: 1920, name: "Bankinnskudd" }, amountGross: -100, amountGrossCurrency: -100, description: "test credit" },
  ]
});

if (test.ok) {
  console.log("SUCCESS! Voucher ID:", test.data.value?.id);
  console.log("Posted accounts:", test.data.value?.postings?.map((p: any) => `${p.account?.id}`));
} else {
  console.log("FAILED — account by number+name doesn't work");
}
