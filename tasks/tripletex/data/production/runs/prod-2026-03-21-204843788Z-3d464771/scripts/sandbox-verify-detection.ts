const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const json = await res.json();
  if (!res.ok) {
    console.error("ERROR", res.status, JSON.stringify(json).slice(0, 500));
    return null;
  }
  return json;
}

async function main() {
  // Get account IDs for lookup
  const acctRes = await api("GET", "/ledger/account?number=4500,6500,2710,2400&fields=id,number,vatType(id)");
  if (!acctRes) return;
  const acctIdToNumber: Record<number, number> = {};
  const acctNumberToId: Record<number, number> = {};
  for (const a of acctRes.values) {
    acctIdToNumber[a.id] = a.number;
    acctNumberToId[a.number] = a.id;
  }
  console.log("Account ID→Number mapping:", JSON.stringify(acctIdToNumber));

  // Get vouchers
  const vRes = await api("GET", "/ledger/voucher?dateFrom=2026-01-01&dateTo=2026-03-01&fields=id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)&count=1000");
  if (!vRes) return;

  // Test the multi-tier detection for 4500/22900
  console.log("\n=== Testing multi-tier missing-VAT detection for 4500/22900 ===");
  const promptAccount = 4500;
  const promptNetAmount = 22900;
  const promptAccountId = acctNumberToId[promptAccount];

  // Helper: get account number from posting (with account.id fallback)
  const getAcctNumber = (p: any) => p.account?.number ?? acctIdToNumber[p.account?.id];

  // TIER 1: amountGross match + no 2710
  console.log("\n--- TIER 1: amountGross match + no 2710 ---");
  const tier1: any[] = [];
  for (const v of vRes.values) {
    for (const p of v.postings) {
      const acctNum = getAcctNumber(p);
      if (acctNum === promptAccount && Math.abs(p.amountGross) === promptNetAmount) {
        const has2710 = v.postings.some((pp: any) => getAcctNumber(pp) === 2710);
        if (!has2710) {
          tier1.push({ voucherId: v.id, date: v.date, desc: v.description, gross: p.amountGross, net: p.amount, vatType: p.vatType?.id });
        }
      }
    }
  }
  console.log(`Found ${tier1.length} candidates:`);
  for (const c of tier1) console.log(`  v=${c.voucherId} | ${c.date} | "${c.desc}" | gross=${c.gross} | net=${c.net} | vatType=${c.vatType}`);

  // TIER 2: description keyword + no 2710
  console.log("\n--- TIER 2: description keyword + no 2710 ---");
  const tier2: any[] = [];
  for (const v of vRes.values) {
    const desc = (v.description || "").toLowerCase();
    if (!desc.includes("uten mva") && !desc.includes("without vat") && !desc.includes("ohne mwst") && !desc.includes("sin iva") && !desc.includes("sans tva")) continue;
    for (const p of v.postings) {
      const acctNum = getAcctNumber(p);
      if (acctNum === promptAccount) {
        const has2710 = v.postings.some((pp: any) => getAcctNumber(pp) === 2710);
        if (!has2710) {
          tier2.push({ voucherId: v.id, date: v.date, desc: v.description, gross: p.amountGross, net: p.amount, vatType: p.vatType?.id });
        }
      }
    }
  }
  console.log(`Found ${tier2.length} candidates:`);
  for (const c of tier2) console.log(`  v=${c.voucherId} | ${c.date} | "${c.desc}" | gross=${c.gross} | net=${c.net} | vatType=${c.vatType}`);

  // TIER 3: ANY voucher on prompt account with no 2710 (broadest search)
  console.log("\n--- TIER 3: ANY voucher on prompt account + no 2710 ---");
  const tier3: any[] = [];
  for (const v of vRes.values) {
    for (const p of v.postings) {
      const acctNum = getAcctNumber(p);
      if (acctNum === promptAccount) {
        const has2710 = v.postings.some((pp: any) => getAcctNumber(pp) === 2710);
        if (!has2710) {
          tier3.push({ voucherId: v.id, date: v.date, desc: v.description, gross: p.amountGross, net: p.amount, vatType: p.vatType?.id });
        }
      }
    }
  }
  console.log(`Found ${tier3.length} candidates:`);
  for (const c of tier3) console.log(`  v=${c.voucherId} | ${c.date} | "${c.desc}" | gross=${c.gross} | net=${c.net} | vatType=${c.vatType}`);

  // Also test for 6500/14100 (the run ee909d4d shape)
  console.log("\n\n=== Testing multi-tier missing-VAT detection for 6500/14100 ===");
  const promptAccount2 = 6500;
  const promptNetAmount2 = 14100;

  // TIER 1 for 6500/14100
  console.log("\n--- TIER 1: amountGross match + no 2710 ---");
  for (const v of vRes.values) {
    for (const p of v.postings) {
      const acctNum = getAcctNumber(p);
      if (acctNum === promptAccount2 && Math.abs(p.amountGross) === promptNetAmount2) {
        const has2710 = v.postings.some((pp: any) => getAcctNumber(pp) === 2710);
        console.log(`  v=${v.id} | ${v.date} | "${v.description}" | gross=${p.amountGross} | net=${p.amount} | vatType=${p.vatType?.id} | has2710=${has2710}`);
      }
    }
  }

  // Verify: does account.id work when account.number might be undefined?
  console.log("\n\n=== Verifying account.id fallback ===");
  // Check some postings to see if account.number is always present
  let missingNumberCount = 0;
  let totalPostings = 0;
  for (const v of vRes.values) {
    for (const p of v.postings) {
      totalPostings++;
      if (p.account?.id && !p.account?.number) {
        missingNumberCount++;
        console.log(`  MISSING number! v=${v.id}, acctId=${p.account.id}, resolved=${acctIdToNumber[p.account.id]}`);
      }
    }
  }
  console.log(`Checked ${totalPostings} postings: ${missingNumberCount} missing account.number`);
}

main().catch(e => console.error("FATAL:", e.message));
