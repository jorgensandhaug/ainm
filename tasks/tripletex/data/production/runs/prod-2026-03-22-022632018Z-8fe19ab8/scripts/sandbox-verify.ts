const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.error(JSON.stringify(json, null, 2)); }
  return { status: r.status, ok: r.ok, data: json };
}

async function main() {
  // Verify the exact production flow in sandbox
  // Step 1: Account lookup - all 6 accounts
  const neededNumbers = [1710, 6390, 6030, 1209, 5000, 2900];
  const acctRes = await api("GET", `/ledger/account?number=${neededNumbers.join(",")}&fields=id,number,name&count=100`);
  const found = new Map<number, number>();
  for (const a of acctRes.data.values) found.set(a.number, a.id);
  console.log("Found accounts:", [...found.entries()].map(([n, id]) => `${n}=${id}`));

  const missing = neededNumbers.filter(n => !found.has(n));
  console.log("Missing accounts:", missing);

  // In sandbox, 6030 and 1209 likely already exist from prior testing
  // Create any that are actually missing
  const nameMap: Record<number, string> = {
    1029: "Akk. avskr. immaterielle eiendeler",
    1109: "Akk. avskr. bygninger",
    1209: "Akk. avskr. maskiner og anlegg",
    6030: "Avskr. maskiner og anlegg",
  };

  if (missing.length === 1) {
    const n = missing[0];
    const created = await api("POST", "/ledger/account", { number: n, name: nameMap[n] || `Account ${n}` });
    if (created.ok) found.set(n, created.data.value.id);
  } else if (missing.length > 1) {
    const batch = missing.map(n => ({ number: n, name: nameMap[n] || `Account ${n}` }));
    const created = await api("POST", "/ledger/account/list", batch);
    if (created.ok) for (const a of created.data.values) found.set(a.number, a.id);
  }

  // Calculations
  const prepaidAmt = 4650;
  const depAmt = Math.round((242900 / 48) * 100) / 100; // 5060.42
  const salaryAmt = 45000;
  console.log(`Prepaid: ${prepaidAmt}, Depreciation: ${depAmt}, Salary: ${salaryAmt}`);

  // Step 2: Combined voucher
  const voucher = await api("POST", "/ledger/voucher", {
    date: "2026-03-31",
    description: "Månedsavslutning mars 2026",
    postings: [
      { row: 1, account: { id: found.get(6390) }, amountGross: prepaidAmt, amountGrossCurrency: prepaidAmt, description: "Periodisering forskuddsbetalt kostnad" },
      { row: 2, account: { id: found.get(1710) }, amountGross: -prepaidAmt, amountGrossCurrency: -prepaidAmt, description: "Forskuddsbetalt kostnad" },
      { row: 3, account: { id: found.get(6030) }, amountGross: depAmt, amountGrossCurrency: depAmt, description: "Avskrivning driftsmiddel" },
      { row: 4, account: { id: found.get(1209) }, amountGross: -depAmt, amountGrossCurrency: -depAmt, description: "Akk. avskrivning" },
      { row: 5, account: { id: found.get(5000) }, amountGross: salaryAmt, amountGrossCurrency: salaryAmt, description: "Lønn til ansatte" },
      { row: 6, account: { id: found.get(2900) }, amountGross: -salaryAmt, amountGrossCurrency: -salaryAmt, description: "Påløpt lønn" },
    ],
  });

  if (voucher.ok) {
    const v = voucher.data.value;
    console.log(`\nVoucher created: id=${v.id}, number=${v.number}, date=${v.date}`);
    console.log(`Description: ${v.description}`);
    console.log(`Postings (${v.postings.length}):`);
    for (const p of v.postings) {
      console.log(`  Row ${p.row}: account=${p.account?.number || p.account?.id} amountGross=${p.amountGross} desc="${p.description}"`);
    }

    // Verify balance sums to zero
    const totalDebit = v.postings.filter((p: any) => p.amountGross > 0).reduce((s: number, p: any) => s + p.amountGross, 0);
    const totalCredit = v.postings.filter((p: any) => p.amountGross < 0).reduce((s: number, p: any) => s + p.amountGross, 0);
    console.log(`\nTotal debit: ${totalDebit}, Total credit: ${totalCredit}, Sum: ${totalDebit + totalCredit}`);

    // Clean up - delete the sandbox voucher
    const delRes = await api("DELETE", `/ledger/voucher/${v.id}`);
    console.log(`Cleanup: DELETE voucher ${v.id} → ${delRes.status}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
