const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "BeNeRG-tobYADJI9AXdhFWgsGyIOj3Y09qItDcT8Q1w";
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

// Accounts needed: 1710, 6390, 6020, 1029, 5000, 2900
const acctNumbers = [1710, 6390, 6020, 1029, 5000, 2900];

// Step 1: GET all accounts
const { data: acctData } = await api("GET", `/ledger/account?number=${acctNumbers.join(",")}&fields=id,number,name&count=100`);
const existing = new Map<number, number>();
for (const a of acctData.values || []) {
  existing.set(a.number, a.id);
}
console.log("Existing accounts:", [...existing.keys()]);

// Step 2: Create missing accounts
const missingDefs: { number: number; name: string }[] = [];
if (!existing.has(1029)) missingDefs.push({ number: 1029, name: "Akk. avskr. immaterielle eiendeler" });
if (!existing.has(6390)) missingDefs.push({ number: 6390, name: "Annen kostnad lokaler" });
if (!existing.has(6020)) missingDefs.push({ number: 6020, name: "Avskr. immaterielle eiendeler" });
if (!existing.has(1710)) missingDefs.push({ number: 1710, name: "Forskuddsbetalte forsikringspremier" });
if (!existing.has(5000)) missingDefs.push({ number: 5000, name: "Lønn til ansatte" });
if (!existing.has(2900)) missingDefs.push({ number: 2900, name: "Påløpt lønn" });

if (missingDefs.length > 0) {
  console.log("Creating missing accounts:", missingDefs.map(m => m.number));
  if (missingDefs.length === 1) {
    const { data: created } = await api("POST", "/ledger/account", missingDefs[0]);
    existing.set(created.value.number, created.value.id);
  } else {
    const { data: created } = await api("POST", "/ledger/account/list", missingDefs);
    for (const a of created.values || []) {
      existing.set(a.number, a.id);
    }
  }
}

// Calculations
const prepaidAmt = 2450;
const depAmt = Math.round((111100 / 60) * 100) / 100; // 1851.67
const salaryAmt = 45000;

console.log("Depreciation amount:", depAmt);

// Step 3: POST combined voucher
const voucher = {
  date: "2026-03-31",
  description: "Månedsavslutning mars 2026",
  postings: [
    { row: 1, account: { id: existing.get(6390) }, amountGross: prepaidAmt, amountGrossCurrency: prepaidAmt, description: "Periodisering forskuddsbetalt kostnad" },
    { row: 2, account: { id: existing.get(1710) }, amountGross: -prepaidAmt, amountGrossCurrency: -prepaidAmt, description: "Forskuddsbetalt kostnad" },
    { row: 3, account: { id: existing.get(6020) }, amountGross: depAmt, amountGrossCurrency: depAmt, description: "Avskrivning driftsmiddel" },
    { row: 4, account: { id: existing.get(1029) }, amountGross: -depAmt, amountGrossCurrency: -depAmt, description: "Akk. avskrivning" },
    { row: 5, account: { id: existing.get(5000) }, amountGross: salaryAmt, amountGrossCurrency: salaryAmt, description: "Lønn til ansatte" },
    { row: 6, account: { id: existing.get(2900) }, amountGross: -salaryAmt, amountGrossCurrency: -salaryAmt, description: "Påløpt lønn" },
  ],
};

const { status, data: voucherResult } = await api("POST", "/ledger/voucher", voucher);
if (status === 201) {
  console.log("Voucher created successfully, id:", voucherResult.value?.id);
  console.log("Postings:", voucherResult.value?.postings?.length);
} else {
  console.log("Voucher creation failed");
}
