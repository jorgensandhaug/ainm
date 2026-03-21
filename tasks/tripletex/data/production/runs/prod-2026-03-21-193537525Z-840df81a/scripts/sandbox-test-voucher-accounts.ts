// Test which accounts can be used in manual vouchers
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
  console.log(`${method} ${path.substring(0, 60)} -> ${res.status}`);
  if (!res.ok) {
    const err = JSON.parse(text);
    console.log(`  ERROR: ${err.validationMessages?.map((m: any) => m.message).join("; ") || text.substring(0, 200)}`);
    return null;
  }
  try { return JSON.parse(text); } catch { return text; }
}

async function tryVoucher(desc: string, debitAcctId: number, creditAcctId: number, amount: number) {
  console.log(`\n--- Test: ${desc} ---`);
  return await api("POST", `/ledger/voucher`, {
    date: TODAY,
    description: desc,
    postings: [
      {
        date: TODAY,
        account: { id: debitAcctId },
        amount: amount,
        description: "Debit side",
      },
      {
        date: TODAY,
        account: { id: creditAcctId },
        amount: -amount,
        description: "Credit side",
      },
    ],
  });
}

async function main() {
  // Account IDs from sandbox:
  // 424190862 = 1920 (bank - system-restricted)
  // 424191214 = 8060 (agio)
  // 424191226 = 8160 (disagio)
  // 424190765 = 1500 (Kundefordringer)

  // First, find correct account id for 1500
  const acctRes = await api("GET", `/ledger/account?numberFrom=1500&numberTo=1500&fields=id,number,name`);
  if (acctRes?.values) {
    for (const a of acctRes.values) {
      console.log(`Account 1500: id=${a.id} number=${a.number} name=${a.name}`);
    }
  }

  // Also check 1900 (cash)
  const acctRes2 = await api("GET", `/ledger/account?numberFrom=1900&numberTo=1900&fields=id,number,name`);
  if (acctRes2?.values) {
    for (const a of acctRes2.values) {
      console.log(`Account 1900: id=${a.id} number=${a.number} name=${a.name}`);
    }
  }

  // Try combinations:
  // Test 1: 1500 (customer receivables) debit, 8060 credit
  // Test 2: 8060 debit, 8160 credit (both FX accounts)
  // Test 3: 1900 (cash) debit, 8060 credit

  // Let me get the IDs first
  const allAccts = await api("GET", `/ledger/account?numberFrom=1500&numberTo=1920&fields=id,number,name`);
  if (allAccts?.values) {
    for (const a of allAccts.values) {
      if ([1500, 1900, 1910, 1920].includes(a.number)) {
        console.log(`Account ${a.number}: id=${a.id} name=${a.name}`);
      }
    }
  }

  // From the previous explore, we know:
  // 1920 id=424190862

  // Test 1: two non-bank revenue/expense accounts
  const v1 = await tryVoucher("Test: 8060 debit, 8160 credit", 424191214, 424191226, 100);
  if (v1?.value) console.log(`  SUCCESS: voucher id=${v1.value.id}`);

  // Test 2: 1500 debit, 8060 credit (if 1500 is accessible)
  // First find 1500 id from the earlier query
  const acct1500 = allAccts?.values?.find((a: any) => a.number === 1500);
  if (acct1500) {
    const v2 = await tryVoucher("Test: 1500 debit, 8060 credit", acct1500.id, 424191214, 100);
    if (v2?.value) console.log(`  SUCCESS: voucher id=${v2.value.id}`);
  }

  // Test 3: 1900 debit, 8060 credit
  const acct1900 = allAccts?.values?.find((a: any) => a.number === 1900);
  if (acct1900) {
    const v3 = await tryVoucher("Test: 1900 debit, 8060 credit", acct1900.id, 424191214, 100);
    if (v3?.value) console.log(`  SUCCESS: voucher id=${v3.value.id}`);
  }

  // Test 4: 1920 debit, 8060 credit (expect failure)
  const v4 = await tryVoucher("Test: 1920 debit, 8060 credit", 424190862, 424191214, 100);
  if (v4?.value) console.log(`  SUCCESS: voucher id=${v4.value.id}`);
}

main().catch(console.error);
