const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "kyAB-FEAtP9RWx1BPbEX_HVCtIYX0sOAyoQc5Iirsck";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  const b = await r.text();
  console.log(`GET ${path} → ${r.status}`);
  if (!r.ok) { console.log(b); throw new Error(`GET failed ${r.status}`); }
  return JSON.parse(b);
}

async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const b = await r.text();
  console.log(`POST ${path} → ${r.status}`);
  if (!r.ok) { console.log(b); throw new Error(`POST failed ${r.status}`); }
  return JSON.parse(b);
}

// Accounts needed: 1700, 6300, 6020, 1029, 5000, 2900
const NEEDED = [1700, 6300, 6020, 1029, 5000, 2900];
const NAMES: Record<number, string> = {
  1700: "Forskuddsbetalt leiekostnad",
  6300: "Leie lokale",
  6020: "Avskr. immaterielle eiendeler",
  1029: "Akk. avskr. immaterielle eiendeler",
  5000: "Lønn til ansatte",
  2900: "Påløpt lønn",
};

// Step 1: lookup accounts
const acctResp = await get(`/ledger/account?number=${NEEDED.join(",")}&fields=id,number,name&count=100`);
const existing = new Map<number, number>();
for (const a of acctResp.values) {
  existing.set(a.number, a.id);
}
console.log("Existing accounts:", [...existing.keys()]);

// Step 1b: create missing
const missing = NEEDED.filter(n => !existing.has(n));
console.log("Missing accounts:", missing);

if (missing.length > 0) {
  const toCreate = missing.map(n => ({ number: n, name: NAMES[n] }));
  if (missing.length === 1) {
    const created = await post("/ledger/account", toCreate[0]);
    existing.set(created.value.number, created.value.id);
  } else {
    const created = await post("/ledger/account/list", toCreate);
    for (const a of created.values) {
      existing.set(a.number, a.id);
    }
  }
}

// Calculations
const accrualAmt = 8950;
const depAmt = Math.round((240050 / 60) * 100) / 100; // 4000.83
const salaryAmt = 45000;
console.log(`Depreciation: ${depAmt}`);

// Step 2: combined voucher
const voucher = await post("/ledger/voucher", {
  date: "2026-03-31",
  description: "Månedsavslutning mars 2026",
  postings: [
    { row: 1, account: { id: existing.get(6300) }, amountGross: accrualAmt, amountGrossCurrency: accrualAmt, description: "Periodisering forskuddsbetalt kostnad" },
    { row: 2, account: { id: existing.get(1700) }, amountGross: -accrualAmt, amountGrossCurrency: -accrualAmt, description: "Forskuddsbetalt kostnad" },
    { row: 3, account: { id: existing.get(6020) }, amountGross: depAmt, amountGrossCurrency: depAmt, description: "Avskrivning driftsmiddel" },
    { row: 4, account: { id: existing.get(1029) }, amountGross: -depAmt, amountGrossCurrency: -depAmt, description: "Akk. avskrivning" },
    { row: 5, account: { id: existing.get(5000) }, amountGross: salaryAmt, amountGrossCurrency: salaryAmt, description: "Lønn til ansatte" },
    { row: 6, account: { id: existing.get(2900) }, amountGross: -salaryAmt, amountGrossCurrency: -salaryAmt, description: "Påløpt lønn" },
  ],
});

console.log("Voucher created:", voucher.value.id);
console.log("Done.");
