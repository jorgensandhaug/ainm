/**
 * Task 30 — Test using EXACTLY what the prompt says:
 * 1. Activate modules first
 * 2. Use 8700/2920 for tax (what the prompt says)
 * 3. Check if 8700/2920 exist, what they look like
 * 4. Check what yearEnd looks like with these postings
 * 5. Compare with 8300/2500
 */
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, ok: res.ok };
}

async function main() {
  // 1. Check what accounts 8700 and 2920 actually are
  console.log("=== 1. Accounts 8700 and 2920 ===");
  const acctRes = await api("GET", "/ledger/account?number=8700,2920,8300,2500&fields=id,number,name,type");
  for (const a of (acctRes.data.values || [])) {
    console.log(`  ${a.number}: id=${a.id} "${a.name}" type=${a.type || '?'}`);
  }

  // 2. Check if 8700 and 2920 exist in a broader search
  console.log("\n=== 2. Accounts near 8700 and 2920 ===");
  const nearby8700 = await api("GET", "/ledger/account?numberFrom=8690&numberTo=8710&fields=id,number,name,type");
  for (const a of (nearby8700.data.values || [])) {
    console.log(`  ${a.number}: "${a.name}" type=${a.type || '?'}`);
  }
  const nearby2920 = await api("GET", "/ledger/account?numberFrom=2910&numberTo=2930&fields=id,number,name,type");
  for (const a of (nearby2920.data.values || [])) {
    console.log(`  ${a.number}: "${a.name}" type=${a.type || '?'}`);
  }

  // 3. Test posting to 8700/2920
  console.log("\n=== 3. Test posting to 8700/2920 ===");
  const accounts = acctRes.data.values || [];
  const acct8700 = accounts.find((a: any) => a.number === 8700);
  const acct2920 = accounts.find((a: any) => a.number === 2920);
  
  if (acct8700 && acct2920) {
    const testV = await api("POST", "/ledger/voucher", {
      date: "2025-12-31",
      description: "Test tax 8700/2920",
      postings: [
        { row: 1, account: { id: acct8700.id }, amountGross: 10000, amountGrossCurrency: 10000, description: "Skattekostnad test" },
        { row: 2, account: { id: acct2920.id }, amountGross: -10000, amountGrossCurrency: -10000, description: "Betalbar skatt test" },
      ],
    });
    console.log(`  POST voucher 8700/2920: ${testV.status}`);
    
    if (testV.ok) {
      const voucherId = testV.data.value.id;
      
      // Check yearEnd with this posting
      const ye = await api("GET", "/yearEnd?fields=taxCost,operatingExpense,extraordinaryCost,annualResult");
      console.log(`  yearEnd.taxCost: ${JSON.stringify(ye.data?.value?.taxCost?.sumAmount)}`);
      console.log(`  yearEnd.extraordinaryCost: ${JSON.stringify(ye.data?.value?.extraordinaryCost?.sumAmount || null)}`);
      console.log(`  yearEnd.annualResult: ${ye.data?.value?.annualResult}`);
      
      // Check where 8700 appears in yearEnd
      const yeFull = await api("GET", "/yearEnd?fields=*");
      if (yeFull.ok) {
        const d = yeFull.data.value;
        for (const [k, v] of Object.entries(d)) {
          if (typeof v === 'object' && v !== null) {
            const s = JSON.stringify(v);
            if (s.includes("8700") || s.includes("2920")) {
              console.log(`  yearEnd.${k} contains 8700/2920: ${s.slice(0, 500)}`);
            }
          }
        }
      }
      
      // Cleanup
      await api("DELETE", `/ledger/voucher/${voucherId}`);
      console.log(`  Cleaned up test voucher`);
    }
  } else {
    console.log(`  8700 exists: ${!!acct8700}, 2920 exists: ${!!acct2920}`);
    if (!acct8700) console.log("  WARNING: Account 8700 does not exist!");
    if (!acct2920) console.log("  WARNING: Account 2920 does not exist!");
  }

  // 4. Check: what does the yearEnd report grouping for operatingExpense actually include?
  console.log("\n=== 4. yearEnd operatingExpense groupings ===");
  const yeOp = await api("GET", "/yearEnd?fields=operatingExpense");
  if (yeOp.ok) {
    for (const post of (yeOp.data.value.operatingExpense?.posts || [])) {
      console.log(`  ${post.groupNumber}: "${post.name}" grouping=${post.grouping} amount=${post.sumAmount}`);
    }
  }

  // 5. Check yearEnd/annualAccounts groupings
  console.log("\n=== 5. annualAccounts groupings ===");
  const aaFull = await api("GET", "/yearEnd/annualAccounts?year=2025&fields=*");
  if (aaFull.ok) {
    const d = aaFull.data.value;
    // Show all subTotalLines with groupings
    for (const [k, v] of Object.entries(d)) {
      if (typeof v === 'object' && v !== null && (v as any).subTotalLines) {
        console.log(`\n  ${k}:`);
        for (const st of ((v as any).subTotalLines || [])) {
          console.log(`    "${st.name}" grouping=${st.grouping} closing=${st.closingBalance}`);
        }
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
