const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.log("ERROR:", JSON.stringify(json).slice(0, 500)); }
  return { status: r.status, data: json };
}

// Account IDs from sandbox
const accounts: Record<number, number> = {
  1710: 424190839,
  6390: 424191121,
  6020: 424191104,
  1029: 462300947,
  5000: 424191048,
  2900: 424190958,
};

// Calculations
const prepaidAmt = 2450;
const depAmt = Math.round((111100 / 60) * 100) / 100; // 1851.67
const salaryAmt = 45000;

console.log("Depreciation amount:", depAmt);

// Combined voucher
const voucher = {
  date: "2026-03-31",
  description: "Månedsavslutning mars 2026",
  postings: [
    { row: 1, account: { id: accounts[6390] }, amountGross: prepaidAmt, amountGrossCurrency: prepaidAmt, description: "Periodisering forskuddsbetalt kostnad" },
    { row: 2, account: { id: accounts[1710] }, amountGross: -prepaidAmt, amountGrossCurrency: -prepaidAmt, description: "Forskuddsbetalt kostnad" },
    { row: 3, account: { id: accounts[6020] }, amountGross: depAmt, amountGrossCurrency: depAmt, description: "Avskrivning driftsmiddel" },
    { row: 4, account: { id: accounts[1029] }, amountGross: -depAmt, amountGrossCurrency: -depAmt, description: "Akk. avskrivning" },
    { row: 5, account: { id: accounts[5000] }, amountGross: salaryAmt, amountGrossCurrency: salaryAmt, description: "Lønn til ansatte" },
    { row: 6, account: { id: accounts[2900] }, amountGross: -salaryAmt, amountGrossCurrency: -salaryAmt, description: "Påløpt lønn" },
  ],
};

const { status, data: voucherResult } = await api("POST", "/ledger/voucher", voucher);
if (status === 201) {
  console.log("\nVoucher created successfully!");
  console.log("Voucher ID:", voucherResult.value?.id);
  console.log("Voucher number:", voucherResult.value?.number);
  console.log("Postings count:", voucherResult.value?.postings?.length);

  // Verify postings
  for (const p of voucherResult.value?.postings || []) {
    console.log(`  Row ${p.row}: account ${p.account?.number} (${p.account?.name}), amountGross=${p.amountGross}, desc="${p.description}"`);
  }
} else {
  console.log("Voucher creation failed");
}
