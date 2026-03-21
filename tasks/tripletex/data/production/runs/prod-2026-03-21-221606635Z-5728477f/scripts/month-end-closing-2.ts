const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "NbUTgSlHH5vWnUcvExTh9h9eV6d43BhzrJFJdSDtMLQ";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const accrualAmt = 9200;
const depAmt = Math.round((275800 / 36) * 100) / 100; // 7661.11
const salaryAmt = 45000;

// Known IDs from previous calls
const accounts: Record<number, number> = {
  1720: 474959522,
  2900: 474959640,
  5000: 474959730,
  6300: 474959799,
  1209: 475000685,
};

// Create missing 6030
const createRes = await fetch(`${BASE}/ledger/account`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({ number: 6030, name: "Avskr. maskiner og anlegg" }),
});
const createData = await createRes.json();
console.log("Create 6030:", createRes.status, JSON.stringify(createData));
if (!createRes.ok) {
  console.error("Failed to create 6030, aborting");
  process.exit(1);
}
accounts[6030] = createData.value.id;

// Combined voucher
const voucher = {
  date: "2026-03-31",
  description: "Månedsavslutning mars 2026",
  postings: [
    { row: 1, account: { id: accounts[6300] }, amountGross: accrualAmt, amountGrossCurrency: accrualAmt, description: "Periodisering forskuddsbetalt kostnad" },
    { row: 2, account: { id: accounts[1720] }, amountGross: -accrualAmt, amountGrossCurrency: -accrualAmt, description: "Forskuddsbetalt kostnad" },
    { row: 3, account: { id: accounts[6030] }, amountGross: depAmt, amountGrossCurrency: depAmt, description: "Avskrivning driftsmiddel" },
    { row: 4, account: { id: accounts[1209] }, amountGross: -depAmt, amountGrossCurrency: -depAmt, description: "Akk. avskrivning" },
    { row: 5, account: { id: accounts[5000] }, amountGross: salaryAmt, amountGrossCurrency: salaryAmt, description: "Lønn til ansatte" },
    { row: 6, account: { id: accounts[2900] }, amountGross: -salaryAmt, amountGrossCurrency: -salaryAmt, description: "Påløpt lønn" },
  ],
};

const voucherRes = await fetch(`${BASE}/ledger/voucher`, {
  method: "POST",
  headers: H,
  body: JSON.stringify(voucher),
});
const voucherData = await voucherRes.json();
console.log("Voucher:", voucherRes.status, JSON.stringify(voucherData));

if (!voucherRes.ok) {
  console.error("Voucher creation failed");
  process.exit(1);
}

console.log("Done. Voucher ID:", voucherData.value?.id);
console.log("Postings:", voucherData.value?.postings?.length);
