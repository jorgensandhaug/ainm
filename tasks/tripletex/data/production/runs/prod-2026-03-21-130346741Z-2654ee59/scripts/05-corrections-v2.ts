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

const acct = (id: number, name: string) => ({ id, name });
const ACCT_1920 = acct(462989121, "Bankinnskudd");
const ACCT_2400 = acct(462989180, "Leverandørgjeld");
const ACCT_2710 = acct(462989202, "Inngående merverdiavgift, høy sats");
const ACCT_6540 = acct(462989391, "Inventar");
const ACCT_6590 = acct(462989397, "Annet driftsmateriale");
const ACCT_6860 = acct(462989412, "Møte, kurs, oppdatering o.l.");

const VAT_25 = { id: 1 };
const VAT_0  = { id: 0 };
const TODAY = "2026-03-21";

// CORRECTION 1: Wrong account 6540 → 6860, 1950 NOK gross
console.log("=== CORRECTION 1: Wrong account 6540 → 6860 ===");
const corr1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: TODAY,
  description: "Korreksjon: feil konto, fra 6540 til 6860",
  voucherType: null,
  postings: [
    {
      date: TODAY,
      row: 1,
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
      row: 2,
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
console.log("Correction 1 OK:", JSON.stringify({ id: corr1.id, number: corr1.number }));

// CORRECTION 2: Reverse duplicate voucher 608941216
console.log("\n=== CORRECTION 2: Reverse duplicate voucher ===");
const corr2 = await api("PUT", `/ledger/voucher/608941216/:reverse?date=${TODAY}`);
console.log("Correction 2 OK:", JSON.stringify({ id: corr2.id, number: corr2.number }));

// CORRECTION 3: Missing VAT line
// Original booked 14200 as gross (net=11360, VAT=2840) but 14200 is the NET amount
// Correct: net=14200, VAT=3550, total=17750
// Diff: 6590 +2840, 2710 +710, 2400 -3550
console.log("\n=== CORRECTION 3: Missing VAT line ===");
const corr3 = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: TODAY,
  description: "Korreksjon: manglende MVA-linje",
  voucherType: null,
  postings: [
    {
      date: TODAY,
      row: 1,
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
      row: 2,
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
      row: 3,
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
console.log("Correction 3 OK:", JSON.stringify({ id: corr3.id, number: corr3.number }));

// CORRECTION 4: Wrong amount on 6540 (10750 → 5500), difference=5250 gross
console.log("\n=== CORRECTION 4: Wrong amount 10750 → 5500 ===");
const corr4 = await api("POST", "/ledger/voucher?sendToLedger=true", {
  date: TODAY,
  description: "Korreksjon: feil beløp, 10750 rettet til 5500",
  voucherType: null,
  postings: [
    {
      date: TODAY,
      row: 1,
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
      row: 2,
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
console.log("Correction 4 OK:", JSON.stringify({ id: corr4.id, number: corr4.number }));

console.log("\n=== ALL CORRECTIONS COMPLETED ===");
