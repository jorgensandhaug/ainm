const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "6gsryrbZIHb0dDw3N3SBoZpdG1yrXP1O5dMNMJezfeo";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  console.log(`${method} ${url}`);
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`  -> ${r.status}`);
  if (!r.ok) { console.log(`  ERROR: ${text}`); throw new Error(`${r.status} ${text}`); }
  if (!text) return null;
  const json = JSON.parse(text);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

async function main() {
  // Account IDs from previous calls:
  const acct: Record<number, number> = {
    1920: 465226808,
    2400: 465226867,
    2710: 465226889,
    6500: 465227074,
    6590: 465227084,
    7000: 465227104,
    7100: 465227109,
    7300: 465227117,
  };

  const postings: any[] = [];
  let row = 1;

  // 1. Wrong account reclassification: 7300 → 7000, 4500
  // 7xxx accounts may be locked to vatType 0, use vatType 0
  postings.push({
    row: row++,
    account: { id: acct[7300] },
    amountGross: -4500,
    amountGrossCurrency: -4500,
    vatType: { id: 0 },
    description: "Korreksjon: ompostering fra 7300"
  });
  postings.push({
    row: row++,
    account: { id: acct[7000] },
    amountGross: 4500,
    amountGrossCurrency: 4500,
    vatType: { id: 0 },
    description: "Korreksjon: ompostering til 7000"
  });

  // 2. Duplicate reversal: 6590/3300, counterpart 1920
  postings.push({
    row: row++,
    account: { id: acct[6590] },
    amountGross: -3300,
    amountGrossCurrency: -3300,
    vatType: { id: 1 },
    description: "Korreksjon: reversering duplikat"
  });
  postings.push({
    row: row++,
    account: { id: acct[1920] },
    amountGross: 3300,
    amountGrossCurrency: 3300,
    description: "Korreksjon: reversering duplikat"
  });

  // 3. Missing VAT (other branch): 6500/24750 booked as gross instead of net
  // Correction amount = 24750 * 0.25 = 6187.5
  const vatCorrection = 24750 * 0.25;
  postings.push({
    row: row++,
    account: { id: acct[6500] },
    amountGross: vatCorrection,
    amountGrossCurrency: vatCorrection,
    vatType: { id: 1 },
    description: "Korreksjon: manglende MVA"
  });
  postings.push({
    row: row++,
    account: { id: acct[2400] },
    amountGross: -vatCorrection,
    amountGrossCurrency: -vatCorrection,
    supplier: { id: 108369169 },
    description: "Korreksjon: leverandørgjeld MVA"
  });

  // 4. Incorrect amount: 7100, 18800 recorded instead of 8550
  // difference = 18800 - 8550 = 10250
  // 7100 is locked to vatType 0
  const diff = 18800 - 8550;
  postings.push({
    row: row++,
    account: { id: acct[7100] },
    amountGross: -diff,
    amountGrossCurrency: -diff,
    vatType: { id: 0 },
    description: "Korreksjon: feil beløp"
  });
  postings.push({
    row: row++,
    account: { id: acct[1920] },
    amountGross: diff,
    amountGrossCurrency: diff,
    description: "Korreksjon: feil beløp"
  });

  console.log("Posting corrective voucher with", postings.length, "lines");

  const result = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-02-28",
    description: "Korreksjonsbilag: retting av 4 feil i hovedbok jan-feb 2026",
    postings
  });

  console.log("\nCorrective voucher created:");
  console.log(JSON.stringify(result, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
