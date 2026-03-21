const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "xtk2IC-TUZC034x4yucY-W2t43DutsqWCvwX61fFZLk";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!res.ok) {
    console.error(`ERROR ${method} ${path} => ${res.status}`, JSON.stringify(json).slice(0, 1000));
    throw new Error(`${res.status}`);
  }
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

// Account references
const acct = (id: number, name: string) => ({ id, name });
const ACCT_1920 = acct(462989121, "Bankinnskudd");
const ACCT_2400 = acct(462989180, "Leverandørgjeld");
const ACCT_2710 = acct(462989202, "Inngående merverdiavgift, høy sats");
const ACCT_6540 = acct(462989391, "Inventar");
const ACCT_6590 = acct(462989397, "Annet driftsmateriale");
const ACCT_6860 = acct(462989412, "Møte, kurs, oppdatering o.l.");
const ACCT_7000 = acct(462989417, "Drivstoff, selskapets transportmidler");

const VAT_25 = { id: 1 };  // 25% MVA
const VAT_0  = { id: 0 };  // No VAT

const TODAY = "2026-03-21";

// ============================================================
// CORRECTION 1: Wrong account (6540 used instead of 6860, 1950 NOK gross)
// Reverse 6540 and record on 6860, both with 25% VAT (VAT effects cancel out)
// ============================================================
console.log("=== CORRECTION 1: Wrong account 6540 → 6860 ===");
const corr1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: TODAY,
  description: "Korreksjon: feil konto, fra 6540 til 6860",
  voucherType: null,
  postings: [
    {
      date: TODAY,
      description: "Korreksjon: tilbakeført fra feil konto 6540",
      account: ACCT_6540,
      amount: -1950,
      amountCurrency: -1950,
      amountGross: -1950,
      amountGrossCurrency: -1950,
      vatType: VAT_25,
    },
    {
      date: TODAY,
      description: "Korreksjon: riktig konto 6860",
      account: ACCT_6860,
      amount: 1950,
      amountCurrency: 1950,
      amountGross: 1950,
      amountGrossCurrency: 1950,
      vatType: VAT_25,
    },
  ],
});
console.log("Correction 1 result:", JSON.stringify(corr1, null, 2).slice(0, 500));

// ============================================================
// CORRECTION 2: Duplicate entry on 7000, 3650 NOK — reverse the voucher
// ============================================================
console.log("\n=== CORRECTION 2: Reverse duplicate voucher 608941216 ===");
const corr2 = await api("PUT", `/ledger/voucher/608941216/:reverse?date=${TODAY}`);
console.log("Correction 2 result:", JSON.stringify(corr2, null, 2).slice(0, 500));

// ============================================================
// CORRECTION 3: Missing VAT line
// Original: 6590 gross=14200 (treated as gross w/ 25% VAT → net=11360, VAT=2840)
// Correct:  6590 net=14200 (HT), VAT=3550, total=17750
// Difference: 6590 +2840, 2710 +710, 2400 -3550
// ============================================================
console.log("\n=== CORRECTION 3: Missing VAT line ===");
const corr3 = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: TODAY,
  description: "Korreksjon: manglende MVA-linje",
  voucherType: null,
  postings: [
    {
      date: TODAY,
      description: "Korreksjon: økt nettokostnad til 14200",
      account: ACCT_6590,
      amount: 2840,
      amountCurrency: 2840,
      amountGross: 2840,
      amountGrossCurrency: 2840,
      vatType: VAT_0,
    },
    {
      date: TODAY,
      description: "Korreksjon: manglende inngående MVA",
      account: ACCT_2710,
      amount: 710,
      amountCurrency: 710,
      amountGross: 710,
      amountGrossCurrency: 710,
      vatType: VAT_0,
    },
    {
      date: TODAY,
      description: "Korreksjon: økt leverandørgjeld inkl. MVA",
      account: ACCT_2400,
      amount: -3550,
      amountCurrency: -3550,
      amountGross: -3550,
      amountGrossCurrency: -3550,
      vatType: VAT_0,
    },
  ],
});
console.log("Correction 3 result:", JSON.stringify(corr3, null, 2).slice(0, 500));

// ============================================================
// CORRECTION 4: Wrong amount on 6540 (10750 recorded instead of 5500)
// Difference: 10750 - 5500 = 5250 gross overstated
// Reverse 5250 gross from 6540 (with 25% VAT) and credit back to 1920
// ============================================================
console.log("\n=== CORRECTION 4: Wrong amount 10750 → 5500 ===");
const corr4 = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: TODAY,
  description: "Korreksjon: feil beløp, 10750 rettet til 5500",
  voucherType: null,
  postings: [
    {
      date: TODAY,
      description: "Korreksjon: redusert beløp fra 10750 til 5500",
      account: ACCT_6540,
      amount: -5250,
      amountCurrency: -5250,
      amountGross: -5250,
      amountGrossCurrency: -5250,
      vatType: VAT_25,
    },
    {
      date: TODAY,
      description: "Korreksjon: tilbakeført til bank",
      account: ACCT_1920,
      amount: 5250,
      amountCurrency: 5250,
      amountGross: 5250,
      amountGrossCurrency: 5250,
      vatType: VAT_0,
    },
  ],
});
console.log("Correction 4 result:", JSON.stringify(corr4, null, 2).slice(0, 500));

console.log("\n=== ALL CORRECTIONS COMPLETED ===");
