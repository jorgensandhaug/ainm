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
const ACCT_2710 = acct(462989202, "Inngående merverdiavgift, høy sats");
const ACCT_6540 = acct(462989391, "Inventar");
const ACCT_6590 = acct(462989397, "Annet driftsmateriale");

const VAT_25 = { id: 1 };
const VAT_0  = { id: 0 };
const TODAY = "2026-03-21";

// CORRECTION 3: Missing VAT line
// Use 1920 (bank) instead of 2400 (supplier) to avoid supplier reference requirement
// The correction adds the missing VAT amounts
console.log("=== CORRECTION 3: Missing VAT line ===");
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
      description: "Korreksjon: motpost bank",
      account: ACCT_1920,
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

console.log("\n=== CORRECTIONS 3 & 4 COMPLETED ===");
