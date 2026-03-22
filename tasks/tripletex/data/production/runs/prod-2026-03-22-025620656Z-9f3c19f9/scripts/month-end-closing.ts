const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "nidBFlc-C5lrhDQzil_dIlgZsf5AbP6P7jhDk__hhDs";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Accounts needed: 1700 (prepaid), 6300 (expense contra), 6010 (dep expense), 1249 (accum dep), 5000 (salary exp), 2900 (salary liab)
const NEEDED = [1700, 6300, 6010, 1249, 5000, 2900];

// Calculations
const accrualAmt = 5450;
const depAmt = Math.round((156750 / 120) * 100) / 100; // 1306.25
const salaryAmt = 45000;

async function main() {
  // Call 1: GET all accounts
  const acctUrl = `${BASE}/ledger/account?number=${NEEDED.join(",")}&fields=id,number,name&count=100`;
  const acctRes = await fetch(acctUrl, { headers: H });
  if (!acctRes.ok) { console.error("GET accounts failed:", acctRes.status, await acctRes.text()); process.exit(1); }
  const acctData = await acctRes.json();
  const accounts: Record<number, number> = {};
  for (const a of acctData.values) accounts[a.number] = a.id;
  console.log("Accounts found:", Object.keys(accounts).map(Number).sort((a,b)=>a-b).join(","));

  // Check for missing accounts
  const missing = NEEDED.filter(n => !accounts[n]);
  if (missing.length > 0) {
    console.log("Missing accounts:", missing.join(","));
    const NAMES: Record<number, string> = {
      1029: "Akk. avskr. immaterielle eiendeler",
      1109: "Akk. avskr. bygninger",
      1209: "Akk. avskr. maskiner og anlegg",
      1249: "Andre transportmidler",
      6030: "Avskr. maskiner og anlegg",
    };
    const toCreate = missing.map(n => ({ number: n, name: NAMES[n] || `Account ${n}` }));
    const createUrl = missing.length === 1 ? `${BASE}/ledger/account` : `${BASE}/ledger/account/list`;
    const createBody = missing.length === 1 ? toCreate[0] : toCreate;
    const createRes = await fetch(createUrl, { method: "POST", headers: H, body: JSON.stringify(createBody) });
    if (!createRes.ok) { console.error("Create accounts failed:", createRes.status, await createRes.text()); process.exit(1); }
    const created = await createRes.json();
    if (missing.length === 1) {
      accounts[created.value.number] = created.value.id;
    } else {
      for (const a of created.values) accounts[a.number] = a.id;
    }
    console.log("Created missing accounts");
  }

  // Call 2 (or 3): POST combined voucher
  const voucher = {
    date: "2026-03-31",
    description: "Månedsavslutning mars 2026",
    postings: [
      { row: 1, account: { id: accounts[6300] }, amountGross: accrualAmt, amountGrossCurrency: accrualAmt, description: "Periodisering forskuddsbetalt kostnad" },
      { row: 2, account: { id: accounts[1700] }, amountGross: -accrualAmt, amountGrossCurrency: -accrualAmt, description: "Forskuddsbetalt kostnad" },
      { row: 3, account: { id: accounts[6010] }, amountGross: depAmt, amountGrossCurrency: depAmt, description: "Avskrivning driftsmiddel" },
      { row: 4, account: { id: accounts[1249] }, amountGross: -depAmt, amountGrossCurrency: -depAmt, description: "Akk. avskrivning" },
      { row: 5, account: { id: accounts[5000] }, amountGross: salaryAmt, amountGrossCurrency: salaryAmt, description: "Lønn til ansatte" },
      { row: 6, account: { id: accounts[2900] }, amountGross: -salaryAmt, amountGrossCurrency: -salaryAmt, description: "Påløpt lønn" },
    ],
  };

  const vRes = await fetch(`${BASE}/ledger/voucher`, { method: "POST", headers: H, body: JSON.stringify(voucher) });
  if (!vRes.ok) { console.error("POST voucher failed:", vRes.status, await vRes.text()); process.exit(1); }
  const vData = await vRes.json();
  console.log("Voucher created:", vData.value.id, "with", vData.value.postings?.length ?? 6, "postings");
  console.log("Accrual:", accrualAmt, "Depreciation:", depAmt, "Salary:", salaryAmt);
  console.log("Trial balance is zero by construction (balanced postings).");
}

main();
