// Test: exact format from correct-ledger-errors successful runs
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`${method} ${path.substring(0, 80)} -> ${res.status}`);
  if (!res.ok) {
    console.log(`  ERROR: ${text.substring(0, 800)}`);
    return null;
  }
  try { return JSON.parse(text); } catch { return text; }
}

async function main() {
  // Try the EXACT posting structure from correct-ledger-errors:
  // { row: N, account: { id: <id> }, amountGross: <n>, amountGrossCurrency: <n>, vatType: { id: 0 }, description: "..." }

  // Test with row starting from 1 instead of 0
  console.log("=== Test: row=1,2 instead of row=0,1 ===");
  const v1 = await api("POST", `/ledger/voucher?sendToLedger=true`, {
    date: TODAY,
    description: "Test voucher row 1-based",
    postings: [
      { row: 1, date: TODAY, account: { id: 424191163 }, amountGross: 50, amountGrossCurrency: 50, vatType: { id: 0 }, description: "debit 7100" },
      { row: 2, date: TODAY, account: { id: 424191165 }, amountGross: -50, amountGrossCurrency: -50, vatType: { id: 0 }, description: "credit 7140" },
    ],
  });
  if (v1?.value) console.log(`  SUCCESS: voucher id=${v1.value.id}`);

  // Try without row field at all
  console.log("\n=== Test: no row field ===");
  const v2 = await api("POST", `/ledger/voucher?sendToLedger=true`, {
    date: TODAY,
    description: "Test voucher no row",
    postings: [
      { date: TODAY, account: { id: 424191163 }, amountGross: 50, amountGrossCurrency: 50, vatType: { id: 0 }, description: "debit 7100" },
      { date: TODAY, account: { id: 424191165 }, amountGross: -50, amountGrossCurrency: -50, vatType: { id: 0 }, description: "credit 7140" },
    ],
  });
  if (v2?.value) console.log(`  SUCCESS: voucher id=${v2.value.id}`);

  // Try with a past date - maybe the current date is locked
  console.log("\n=== Test: past date (2026-02-15) ===");
  const v3 = await api("POST", `/ledger/voucher?sendToLedger=true`, {
    date: "2026-02-15",
    description: "Test voucher past date",
    postings: [
      { row: 0, date: "2026-02-15", account: { id: 424191163 }, amountGross: 50, amountGrossCurrency: 50, vatType: { id: 0 }, description: "debit 7100" },
      { row: 1, date: "2026-02-15", account: { id: 424191165 }, amountGross: -50, amountGrossCurrency: -50, vatType: { id: 0 }, description: "credit 7140" },
    ],
  });
  if (v3?.value) console.log(`  SUCCESS: voucher id=${v3.value.id}`);

  // Try with future date
  console.log("\n=== Test: future date (2026-03-25) ===");
  const v4 = await api("POST", `/ledger/voucher?sendToLedger=true`, {
    date: "2026-03-25",
    description: "Test voucher future date",
    postings: [
      { row: 0, date: "2026-03-25", account: { id: 424191163 }, amountGross: 50, amountGrossCurrency: 50, vatType: { id: 0 }, description: "debit 7100" },
      { row: 1, date: "2026-03-25", account: { id: 424191165 }, amountGross: -50, amountGrossCurrency: -50, vatType: { id: 0 }, description: "credit 7140" },
    ],
  });
  if (v4?.value) console.log(`  SUCCESS: voucher id=${v4.value.id}`);

  // Try without sendToLedger (maybe it's the default for this account)
  console.log("\n=== Test: without sendToLedger query param ===");
  const v5 = await api("POST", `/ledger/voucher`, {
    date: TODAY,
    description: "Test voucher no sendToLedger",
    postings: [
      { row: 0, date: TODAY, account: { id: 424191163 }, amountGross: 50, amountGrossCurrency: 50, vatType: { id: 0 }, description: "debit 7100" },
      { row: 1, date: TODAY, account: { id: 424191165 }, amountGross: -50, amountGrossCurrency: -50, vatType: { id: 0 }, description: "credit 7140" },
    ],
  });
  if (v5?.value) console.log(`  SUCCESS: voucher id=${v5.value.id}`);

  // Check current company settings - maybe accounting is locked
  console.log("\n=== Check company settings ===");
  const company = await api("GET", `/company/with/me?fields=*`);
  if (company?.value) {
    console.log(`Company: id=${company.value.id} name=${company.value.name}`);
    console.log(`Type: ${company.value.type}`);
  }
}

main().catch(console.error);
