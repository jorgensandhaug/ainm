// Test if POST /ledger/voucher accepts account: { number, name } without ID
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const DATE = "2026-03-21";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const opts: RequestInit = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`  Status: ${r.status}`);
  if (!r.ok) console.log(`  Error: ${JSON.stringify(json)}`);
  return { status: r.status, ok: r.ok, data: json };
}

async function main() {
  // Test 1: account: { number, name } — standard account names
  console.log("=== Test 1: account with number + name (no ID) ===");
  const r1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: DATE,
    description: "Test agio by number+name",
    postings: [
      {
        row: 1, date: DATE,
        account: { number: 1920, name: "Bankinnskudd" },
        amountGross: 100, amountGrossCurrency: 100,
        vatType: { id: 0 },
        description: "Test debit"
      },
      {
        row: 2, date: DATE,
        account: { number: 8060, name: "Valutagevinst (agio)" },
        amountGross: -100, amountGrossCurrency: -100,
        vatType: { id: 0 },
        description: "Test credit"
      }
    ]
  });
  if (r1.ok) {
    console.log(`  SUCCESS! Voucher ID: ${r1.data.value?.id}`);
    // Verify the postings
    const postings = r1.data.value?.postings || [];
    for (const p of postings) {
      console.log(`  Posting: account=${p.account?.number} amount=${p.amountGross}`);
    }
  }

  // Test 2: account: { number, name } with empty string name
  console.log("\n=== Test 2: account with number + empty name ===");
  const r2 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: DATE,
    description: "Test agio empty name",
    postings: [
      {
        row: 1, date: DATE,
        account: { number: 1920, name: "" },
        amountGross: 75, amountGrossCurrency: 75,
        vatType: { id: 0 },
        description: "Test"
      },
      {
        row: 2, date: DATE,
        account: { number: 8060, name: "" },
        amountGross: -75, amountGrossCurrency: -75,
        vatType: { id: 0 },
        description: "Test"
      }
    ]
  });
  if (r2.ok) {
    console.log(`  SUCCESS with empty name! Voucher ID: ${r2.data.value?.id}`);
  }

  // Test 3: account: { number, name } with dummy name
  console.log("\n=== Test 3: account with number + dummy name ===");
  const r3 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: DATE,
    description: "Test agio dummy name",
    postings: [
      {
        row: 1, date: DATE,
        account: { number: 1920, name: "x" },
        amountGross: 25, amountGrossCurrency: 25,
        vatType: { id: 0 },
        description: "Test"
      },
      {
        row: 2, date: DATE,
        account: { number: 8060, name: "x" },
        amountGross: -25, amountGrossCurrency: -25,
        vatType: { id: 0 },
        description: "Test"
      }
    ]
  });
  if (r3.ok) {
    console.log(`  SUCCESS with dummy name! Voucher ID: ${r3.data.value?.id}`);
    const postings = r3.data.value?.postings || [];
    for (const p of postings) {
      console.log(`  Posting: account.id=${p.account?.id} account.number=${p.account?.number} amount=${p.amountGross}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
