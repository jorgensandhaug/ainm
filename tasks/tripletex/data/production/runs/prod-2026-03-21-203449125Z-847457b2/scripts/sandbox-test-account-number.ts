// Sandbox test: Can we skip GET /ledger/account by using account number directly in voucher?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.error("ERROR:", typeof json === 'string' ? json : JSON.stringify(json, null, 2));
  return { status: r.status, ok: r.ok, data: json };
}

async function main() {
  // Test 1: Can we use account: { number: 8160 } directly?
  console.log("=== Test 1: account: { number: 8160 } (no id) ===");
  const t1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-21",
    description: "Sandbox test - number only",
    postings: [
      { row: 1, date: "2026-03-21", account: { number: 8160 }, amountGross: 100, amountGrossCurrency: 100, vatType: { id: 0 }, description: "test" },
      { row: 2, date: "2026-03-21", account: { number: 1920 }, amountGross: -100, amountGrossCurrency: -100, vatType: { id: 0 }, description: "test" }
    ]
  });

  // Test 2: Can we use account: { number: 8160, name: "Valutatap (disagio)" }?
  console.log("\n=== Test 2: account: { number: 8160, name: 'Valutatap (disagio)' } ===");
  const t2 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-21",
    description: "Sandbox test - number+name",
    postings: [
      { row: 1, date: "2026-03-21", account: { number: 8160, name: "Valutatap (disagio)" }, amountGross: 100, amountGrossCurrency: 100, vatType: { id: 0 }, description: "test" },
      { row: 2, date: "2026-03-21", account: { number: 1920, name: "Bankinnskudd" }, amountGross: -100, amountGrossCurrency: -100, vatType: { id: 0 }, description: "test" }
    ]
  });

  // Test 3: What about combining the payment call and account lookup?
  // Check if PUT /invoice/:payment returns voucher details with account IDs we could reuse
  console.log("\n=== Test 3: Fetch all invoices to find an unpaid one ===");
  const invRes = await api("GET", "/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&fields=*,currency(*)");
  if (invRes.ok) {
    const invoices = invRes.data.values || [];
    const unpaid = invoices.filter((i: any) => i.amountOutstanding > 0);
    console.log(`Found ${invoices.length} total invoices, ${unpaid.length} unpaid`);
    if (unpaid.length > 0) {
      console.log(`First unpaid: id=${unpaid[0].id}, amount=${unpaid[0].amount}, amountCurrency=${unpaid[0].amountCurrency}, currency=${unpaid[0].currency?.code}, outstanding=${unpaid[0].amountOutstanding}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
