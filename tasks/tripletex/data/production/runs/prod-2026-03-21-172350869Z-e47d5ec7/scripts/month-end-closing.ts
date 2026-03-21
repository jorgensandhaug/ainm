const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "VJykIEcXWkHIRe5kD8szsRz9wyDkBiQujUMEpEDIEds";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const headers = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) {
    console.error(text);
    throw new Error(`${res.status} ${text}`);
  }
  if (!text) return null;
  const json = JSON.parse(text);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

// --- Constants ---
const accrualAmt = 11900;
const depAmt = Math.round((107950 / 72) * 100) / 100; // 1499.31
const salaryAmt = 45000;

console.log("Depreciation amount:", depAmt);

// All accounts needed
const accountNumbers = [1700, 6300, 6010, 1249, 5000, 2900];

// Step 1: Lookup accounts
const accounts: any[] = await api("GET", `/ledger/account?number=${accountNumbers.join(",")}&fields=id,number,name&count=100`);
console.log("Found accounts:", accounts.map((a: any) => `${a.number}:${a.id}`).join(", "));

const accountMap = new Map<number, number>();
for (const a of accounts) accountMap.set(a.number, a.id);

// Check missing
const missing = accountNumbers.filter(n => !accountMap.has(n));
console.log("Missing accounts:", missing);

// Step 2: Create missing accounts
if (missing.length > 0) {
  const nameMap: Record<number, string> = {
    1249: "Akk. avskr. transportmidler",
    1109: "Akk. avskr. bygninger",
    1209: "Akk. avskr. maskiner og anlegg",
    1029: "Akk. avskr. immaterielle eiendeler",
    6010: "Avskr. transportmidler",
    6020: "Avskr. immaterielle eiendeler",
    6300: "Leie lokale",
  };

  const toCreate = missing.map(n => ({ number: n, name: nameMap[n] || `Account ${n}` }));

  if (toCreate.length === 1) {
    const created: any = await api("POST", "/ledger/account", toCreate[0]);
    accountMap.set(created.number, created.id);
    console.log("Created account:", created.number, created.id);
  } else {
    const created: any[] = await api("POST", "/ledger/account/list", toCreate);
    for (const a of created) {
      accountMap.set(a.number, a.id);
      console.log("Created account:", a.number, a.id);
    }
  }
}

// Step 3: Post combined voucher
const id = (n: number) => accountMap.get(n)!;

const voucher = {
  date: "2026-03-31",
  description: "Månedsavslutning mars 2026",
  postings: [
    { row: 1, account: { id: id(6300) }, amountGross: accrualAmt, amountGrossCurrency: accrualAmt, description: "Periodisering forskuddsbetalt kostnad" },
    { row: 2, account: { id: id(1700) }, amountGross: -accrualAmt, amountGrossCurrency: -accrualAmt, description: "Forskuddsbetalt kostnad" },
    { row: 3, account: { id: id(6010) }, amountGross: depAmt, amountGrossCurrency: depAmt, description: "Avskrivning driftsmiddel" },
    { row: 4, account: { id: id(1249) }, amountGross: -depAmt, amountGrossCurrency: -depAmt, description: "Akk. avskrivning" },
    { row: 5, account: { id: id(5000) }, amountGross: salaryAmt, amountGrossCurrency: salaryAmt, description: "Lønn til ansatte" },
    { row: 6, account: { id: id(2900) }, amountGross: -salaryAmt, amountGrossCurrency: -salaryAmt, description: "Påløpt lønn" },
  ],
};

const result = await api("POST", "/ledger/voucher", voucher);
console.log("Voucher created:", JSON.stringify(result, null, 2));
console.log("Done. All entries posted in combined voucher.");
