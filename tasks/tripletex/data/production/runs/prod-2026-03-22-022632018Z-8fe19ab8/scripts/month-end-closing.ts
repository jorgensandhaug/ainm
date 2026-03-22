const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "rMk8PsqTObJfCIA3bOhMw1u_ycONAr6EklI3rBLdjDY";
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
  if (!r.ok) { console.error(JSON.stringify(json, null, 2)); throw new Error(`${r.status}`); }
  return json;
}

async function main() {
  // All accounts needed: 1710, 6390, 6030, 1209, 5000, 2900
  const neededNumbers = [1710, 6390, 6030, 1209, 5000, 2900];
  const acctRes = await api("GET", `/ledger/account?number=${neededNumbers.join(",")}&fields=id,number,name&count=100`);
  const found = new Map<number, number>();
  for (const a of acctRes.values) found.set(a.number, a.id);
  console.log("Found accounts:", [...found.keys()]);

  // Detect missing accounts
  const missing = neededNumbers.filter(n => !found.has(n));
  console.log("Missing accounts:", missing);

  const nameMap: Record<number, string> = {
    1029: "Akk. avskr. immaterielle eiendeler",
    1109: "Akk. avskr. bygninger",
    1209: "Akk. avskr. maskiner og anlegg",
    6030: "Avskr. maskiner og anlegg",
  };

  if (missing.length === 1) {
    const n = missing[0];
    const created = await api("POST", "/ledger/account", { number: n, name: nameMap[n] || `Account ${n}` });
    found.set(n, created.value.id);
  } else if (missing.length > 1) {
    const batch = missing.map(n => ({ number: n, name: nameMap[n] || `Account ${n}` }));
    const created = await api("POST", "/ledger/account/list", batch);
    for (const a of created.values) found.set(a.number, a.id);
  }

  // Calculations
  const prepaidAmt = 4650;
  const depAmt = Math.round((242900 / 48) * 100) / 100; // 5060.42
  const salaryAmt = 45000;
  console.log(`Prepaid: ${prepaidAmt}, Depreciation: ${depAmt}, Salary: ${salaryAmt}`);

  // Combined voucher
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

  console.log("Voucher created:", voucher.value.id, "number:", voucher.value.number);
  console.log("Done. 3 calls, 0 errors expected.");
}

main().catch(e => { console.error(e); process.exit(1); });
