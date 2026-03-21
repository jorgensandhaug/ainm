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
  // From previous calls we know:
  // Account IDs:
  const acct = {
    2710: 465226889,
    6500: 465227074,
    6590: 465227084,
    7000: 465227104,
    7100: 465227109,
    7300: 465227117,
  };

  // From voucher discovery:
  // 1. Wrong account: voucher 609013200, 7300/4500, counterpart 1920
  // 2. Duplicate: voucher 609013203, 6590/3300, counterpart 1920 (desc "Kontorrekvisita duplikat")
  // 3. Missing VAT: voucher 609013207, 6500 gross=24750, counterpart 2400 supplier=108369169
  //    Has 2710=4950 but should be 6187.5 → "other branch" correction
  // 4. Incorrect amount: voucher 609013214, 7100/18800, counterpart 1920

  // Need 1920 and 2400 account IDs
  const extraAccounts: any[] = await api("GET", "/ledger/account?number=1920,2400&fields=id,number");
  const extraMap: Record<number, number> = {};
  for (const a of extraAccounts) extraMap[a.number] = a.id;
  console.log("Extra accounts:", extraMap);

  const postings: any[] = [];
  let row = 1;

  // 1. Wrong account reclassification: 7300 → 7000, 4500
  // Both sides vatType=1 so auto-VAT lines cancel out
  postings.push({
    row: row++,
    account: { id: acct[7300] },
    amountGross: -4500,
    amountGrossCurrency: -4500,
    vatType: { id: 1 },
    description: "Korreksjon: ompostering fra 7300"
  });
  postings.push({
    row: row++,
    account: { id: acct[7000] },
    amountGross: 4500,
    amountGrossCurrency: 4500,
    vatType: { id: 1 },
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
    account: { id: extraMap[1920] },
    amountGross: 3300,
    amountGrossCurrency: 3300,
    description: "Korreksjon: reversering duplikat"
  });

  // 3. Missing VAT (other branch): 6500/24750 booked as gross instead of net
  // Correction amount = 24750 * 0.25 = 6187.5
  // Use expense account with vatType=1, counterpart is 2400 with supplier
  const vatCorrection = 24750 * 0.25; // 6187.5
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
    account: { id: extraMap[2400] },
    amountGross: -vatCorrection,
    amountGrossCurrency: -vatCorrection,
    supplier: { id: 108369169 },
    description: "Korreksjon: leverandørgjeld MVA"
  });

  // 4. Incorrect amount: 7100, 18800 recorded instead of 8550
  // difference = 18800 - 8550 = 10250
  const diff = 18800 - 8550; // 10250
  postings.push({
    row: row++,
    account: { id: acct[7100] },
    amountGross: -diff,
    amountGrossCurrency: -diff,
    vatType: { id: 1 },
    description: "Korreksjon: feil beløp"
  });
  postings.push({
    row: row++,
    account: { id: extraMap[1920] },
    amountGross: diff,
    amountGrossCurrency: diff,
    description: "Korreksjon: feil beløp"
  });

  console.log("\nPosting corrective voucher with", postings.length, "lines");

  const result = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-02-28",
    description: "Korreksjonsbilag: retting av 4 feil i hovedbok jan-feb 2026",
    postings
  });

  console.log("\nCorrective voucher created:");
  console.log(JSON.stringify(result, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
