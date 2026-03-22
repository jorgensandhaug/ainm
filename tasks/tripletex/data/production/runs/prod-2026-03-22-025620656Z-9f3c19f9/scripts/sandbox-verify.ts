const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const NEEDED = [1700, 6300, 6010, 1249, 5000, 2900];
const accrualAmt = 5450;
const depAmt = Math.round((156750 / 120) * 100) / 100; // 1306.25
const salaryAmt = 45000;

async function main() {
  // Verify accounts exist
  const acctRes = await fetch(`${BASE}/ledger/account?number=${NEEDED.join(",")}&fields=id,number,name&count=100`, { headers: H });
  const acctData = await acctRes.json();
  const accounts: Record<number, number> = {};
  for (const a of acctData.values) accounts[a.number] = a.id;
  console.log("Accounts found:", Object.keys(accounts).map(Number).sort((a,b)=>a-b).join(","));

  const missing = NEEDED.filter(n => !accounts[n]);
  if (missing.length > 0) {
    console.log("Missing accounts:", missing.join(","), "— UNEXPECTED for 6010→1249 variant");
    return;
  }
  console.log("All 6 accounts exist — 2-call path confirmed");

  // Create voucher
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
  if (!vRes.ok) { console.error("POST voucher failed:", vRes.status, await vRes.text()); return; }
  const vData = await vRes.json();
  const v = vData.value;
  console.log("Voucher created:", v.id, "postings:", v.postings?.length);

  // Verify postings
  let totalDebit = 0, totalCredit = 0;
  for (const p of v.postings || []) {
    const amt = p.amountGross || p.amount || 0;
    if (amt > 0) totalDebit += amt;
    else totalCredit += amt;
    console.log(`  Row ${p.row}: acct ${p.account?.number} amt=${amt} desc="${p.description}"`);
  }
  console.log(`Total debit: ${totalDebit}, credit: ${totalCredit}, balance: ${totalDebit + totalCredit}`);

  // Clean up - delete voucher
  const delRes = await fetch(`${BASE}/ledger/voucher/${v.id}`, { method: "DELETE", headers: H });
  console.log("Cleanup delete:", delRes.status);
}

main();
