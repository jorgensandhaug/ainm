const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "WJA8lf8ICQbxwVp-_tAS5KPHVSBKJqmKkTksmKMQtgI";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Content-Type": "application/json", Authorization: AUTH };

// Calculations
const accrualAmt = 11900;
const depAmt = Math.round((107950 / 72) * 100) / 100; // 1499.31
const salaryAmt = 45000;

console.log("Depreciation amount:", depAmt);

// Step 1: GET all needed accounts
const acctNums = "1700,6300,6010,1249,5000,2900";
const acctRes = await fetch(`${BASE}/ledger/account?number=${acctNums}&fields=id,number,name&count=100`, { headers: H });
const acctData = await acctRes.json();
console.log("Account lookup status:", acctRes.status);
console.log("Accounts found:", JSON.stringify(acctData.values?.map((a: any) => a.number)));

if (!acctRes.ok) {
  console.error("Account lookup failed:", JSON.stringify(acctData));
  process.exit(1);
}

// Build account map from found accounts
const acctMap: Record<number, number> = {};
for (const a of acctData.values || []) {
  acctMap[a.number] = a.id;
}

// Step 1b: Create missing accounts
const needed: { num: number; name: string }[] = [
  { num: 1700, name: "Forskuddsbetalt leiekostnad" },
  { num: 6300, name: "Leie lokale" },
  { num: 6010, name: "Avskrivning på transportmidler" },
  { num: 1249, name: "Akkumulert avskrivning transportmidler" },
  { num: 5000, name: "Lønn til ansatte" },
  { num: 2900, name: "Annen kortsiktig gjeld" },
];
const missing = needed.filter((n) => !acctMap[n.num]);
console.log("Missing accounts:", missing.map((m) => m.num));

if (missing.length > 0) {
  const createBody = missing.map((m) => ({ number: m.num, name: m.name }));
  const endpoint = missing.length === 1 ? "/ledger/account" : "/ledger/account/list";
  const body = missing.length === 1 ? createBody[0] : createBody;
  const createRes = await fetch(`${BASE}${endpoint}`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(body),
  });
  const createData = await createRes.json();
  console.log("Create accounts status:", createRes.status);
  if (!createRes.ok) {
    console.error("Create accounts failed:", JSON.stringify(createData));
    process.exit(1);
  }
  // Map created accounts
  if (missing.length === 1) {
    acctMap[createData.value.number] = createData.value.id;
  } else {
    for (const a of createData.values || []) {
      acctMap[a.number] = a.id;
    }
  }
}

console.log("Account map:", JSON.stringify(acctMap));

// Step 2: Post combined voucher
const voucher = {
  date: "2026-03-31",
  description: "Månedsavslutning mars 2026",
  postings: [
    { row: 1, account: { id: acctMap[6300] }, amountGross: accrualAmt, amountGrossCurrency: accrualAmt, description: "Periodisering forskuddsbetalt kostnad" },
    { row: 2, account: { id: acctMap[1700] }, amountGross: -accrualAmt, amountGrossCurrency: -accrualAmt, description: "Forskuddsbetalt leiekostnad" },
    { row: 3, account: { id: acctMap[6010] }, amountGross: depAmt, amountGrossCurrency: depAmt, description: "Avskrivning driftsmiddel" },
    { row: 4, account: { id: acctMap[1249] }, amountGross: -depAmt, amountGrossCurrency: -depAmt, description: "Akkumulert avskrivning" },
    { row: 5, account: { id: acctMap[5000] }, amountGross: salaryAmt, amountGrossCurrency: salaryAmt, description: "Lønn til ansatte" },
    { row: 6, account: { id: acctMap[2900] }, amountGross: -salaryAmt, amountGrossCurrency: -salaryAmt, description: "Påløpt lønn" },
  ],
};

const vRes = await fetch(`${BASE}/ledger/voucher`, {
  method: "POST",
  headers: H,
  body: JSON.stringify(voucher),
});
const vData = await vRes.json();
console.log("Voucher status:", vRes.status);
if (!vRes.ok) {
  console.error("Voucher failed:", JSON.stringify(vData));
} else {
  console.log("Voucher created, id:", vData.value?.id);
  console.log("Postings:", vData.value?.postings?.length);
}
