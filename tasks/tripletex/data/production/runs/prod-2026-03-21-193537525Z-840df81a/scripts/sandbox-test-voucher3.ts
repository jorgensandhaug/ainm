// Test: can we create ANY voucher? Try with regular expense accounts
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
    const err = JSON.parse(text);
    console.log(`  ERR: ${err.validationMessages?.map((m: any) => `${m.field}: ${m.message}`).join("; ") || text.substring(0, 300)}`);
    return null;
  }
  try { return JSON.parse(text); } catch { return text; }
}

async function main() {
  // Try with accounts 7100 (kontorrekvisita) and 7140 (reisekostnad) which should be normal postable accounts
  // Account ids from sandbox: 7100=424191124, 7140=424191128
  // Let me look them up first

  // Get some regular expense account ids
  console.log("=== Looking up regular accounts ===");
  const accts = await api("GET", `/ledger/account?fields=id,number,name`);
  const allAccts = accts?.values || [];

  const find = (num: number) => allAccts.find((a: any) => a.number === num);
  const a7100 = find(7100);
  const a7140 = find(7140);
  const a4300 = find(4300);
  const a3000 = find(3000);
  const a8060 = find(8060);
  const a8160 = find(8160);
  const a1500 = find(1500);
  const a1920 = find(1920);

  console.log(`7100: id=${a7100?.id} ${a7100?.name}`);
  console.log(`7140: id=${a7140?.id} ${a7140?.name}`);
  console.log(`4300: id=${a4300?.id} ${a4300?.name}`);
  console.log(`3000: id=${a3000?.id} ${a3000?.name}`);
  console.log(`8060: id=${a8060?.id} ${a8060?.name}`);
  console.log(`1500: id=${a1500?.id} ${a1500?.name}`);
  console.log(`1920: id=${a1920?.id} ${a1920?.name}`);

  // Test 1: Two normal expense accounts (7100 ↔ 7140)
  console.log("\n--- Test 1: 7100 debit, 7140 credit ---");
  const v1 = await api("POST", `/ledger/voucher`, {
    date: TODAY,
    description: "Test basic voucher with expense accounts",
    postings: [
      { date: TODAY, account: { id: a7100?.id }, amount: 100, description: "test debit" },
      { date: TODAY, account: { id: a7140?.id }, amount: -100, description: "test credit" },
    ],
  });
  if (v1?.value) console.log(`  SUCCESS: voucher ${v1.value.id}`);

  // Test 2: Revenue vs expense (3000 ↔ 4300) - should be normal
  console.log("\n--- Test 2: 3000 credit, 4300 debit ---");
  const v2 = await api("POST", `/ledger/voucher`, {
    date: TODAY,
    description: "Test basic voucher revenue/expense",
    postings: [
      { date: TODAY, account: { id: a4300?.id }, amount: 100, description: "test debit" },
      { date: TODAY, account: { id: a3000?.id }, amount: -100, description: "test credit" },
    ],
  });
  if (v2?.value) console.log(`  SUCCESS: voucher ${v2.value.id}`);

  // Test 3: 8060 with a normal expense account
  console.log("\n--- Test 3: 8060 credit, 7100 debit ---");
  const v3 = await api("POST", `/ledger/voucher`, {
    date: TODAY,
    description: "Test agio with normal expense",
    postings: [
      { date: TODAY, account: { id: a7100?.id }, amount: 100, description: "test debit" },
      { date: TODAY, account: { id: a8060?.id }, amount: -100, description: "test credit" },
    ],
  });
  if (v3?.value) console.log(`  SUCCESS: voucher ${v3.value.id}`);

  // Test 4: 1500 with a normal expense account
  console.log("\n--- Test 4: 1500 debit, 7100 credit ---");
  const v4 = await api("POST", `/ledger/voucher`, {
    date: TODAY,
    description: "Test receivables with expense",
    postings: [
      { date: TODAY, account: { id: a1500?.id }, amount: 100, description: "test debit" },
      { date: TODAY, account: { id: a7100?.id }, amount: -100, description: "test credit" },
    ],
  });
  if (v4?.value) console.log(`  SUCCESS: voucher ${v4.value.id}`);
}

main().catch(console.error);
