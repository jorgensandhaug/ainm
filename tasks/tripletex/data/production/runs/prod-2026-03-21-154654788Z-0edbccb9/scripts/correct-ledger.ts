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
  // Step 1: Get all needed account IDs
  const accounts: any[] = await api("GET", "/ledger/account?number=7300,7000,6590,6500,2710,7100&fields=id,number");
  const acctMap: Record<number, number> = {};
  for (const a of accounts) acctMap[a.number] = a.id;
  console.log("Account map:", acctMap);

  // Step 2: Get all vouchers for Jan-Feb 2026 with nested expansion
  const vouchers: any[] = await api("GET",
    "/ledger/voucher?dateFrom=2026-01-01&dateTo=2026-02-28&fields=id,date,description,postings(id,account(id,number),amount,amountGross,amountGrossCurrency,vatType(id),supplier(id),description)&count=1000"
  );
  console.log(`Found ${vouchers.length} vouchers`);

  // Analyze vouchers to find the 4 errors
  let wrongAcctCounterpart: { acctId: number; supplierId?: number } | null = null;
  let dupCounterpart: { acctId: number; supplierId?: number } | null = null;
  let missingVatCounterpart: { acctId: number; supplierId?: number } | null = null;
  let incorrectAmtCounterpart: { acctId: number; supplierId?: number } | null = null;

  // Track duplicate candidates for 6590/3300
  const dupCandidates: any[] = [];

  for (const v of vouchers) {
    if (!v.postings) continue;
    for (const p of v.postings) {
      const num = p.account?.number;
      const gross = p.amountGross;

      // Wrong account: 7300, 4500
      if (num === 7300 && Math.abs(gross) === 4500) {
        const counter = v.postings.find((pp: any) => pp.account?.number !== 7300 && pp.account?.number !== 2710);
        if (counter) {
          wrongAcctCounterpart = { acctId: counter.account.id, supplierId: counter.supplier?.id };
          console.log(`Found wrong account voucher ${v.id}: 7300/4500, counterpart ${counter.account.number}, supplier ${counter.supplier?.id}`);
        }
      }

      // Duplicate: 6590, 3300
      if (num === 6590 && Math.abs(gross) === 3300) {
        const counter = v.postings.find((pp: any) => pp.account?.number !== 6590 && pp.account?.number !== 2710);
        if (counter) {
          dupCandidates.push({ voucherId: v.id, counterAcctId: counter.account.id, counterAcctNum: counter.account.number, supplierId: counter.supplier?.id });
        }
      }

      // Missing VAT: 6500, 24750 (this is the net/excl-VAT amount, so amountGross could be 24750 if booked without VAT)
      if (num === 6500) {
        // Check if this voucher has no 2710 posting and the amount matches
        const has2710 = v.postings.some((pp: any) => pp.account?.number === 2710);
        if (!has2710 && (Math.abs(gross) === 24750 || Math.abs(p.amount) === 24750)) {
          const counter = v.postings.find((pp: any) => pp.account?.number !== 6500 && pp.account?.number !== 2710);
          if (counter) {
            missingVatCounterpart = { acctId: counter.account.id, supplierId: counter.supplier?.id };
            console.log(`Found missing VAT voucher ${v.id}: 6500/${gross}, no 2710, counterpart ${counter.account.number}, supplier ${counter.supplier?.id}`);
          }
        }
      }

      // Incorrect amount: 7100, 18800
      if (num === 7100 && Math.abs(gross) === 18800) {
        const counter = v.postings.find((pp: any) => pp.account?.number !== 7100 && pp.account?.number !== 2710);
        if (counter) {
          incorrectAmtCounterpart = { acctId: counter.account.id, supplierId: counter.supplier?.id };
          console.log(`Found incorrect amount voucher ${v.id}: 7100/18800, counterpart ${counter.account.number}, supplier ${counter.supplier?.id}`);
        }
      }
    }
  }

  // For duplicate, pick the counterpart from the first candidate (they should be identical)
  if (dupCandidates.length >= 2) {
    console.log(`Found ${dupCandidates.length} duplicate candidates for 6590/3300`);
    dupCounterpart = { acctId: dupCandidates[0].counterAcctId, supplierId: dupCandidates[0].supplierId };
    console.log(`Duplicate counterpart: acct ${dupCandidates[0].counterAcctNum}, supplier ${dupCandidates[0].supplierId}`);
  } else if (dupCandidates.length === 1) {
    // Even one match is fine — the task says it's a duplicate
    dupCounterpart = { acctId: dupCandidates[0].counterAcctId, supplierId: dupCandidates[0].supplierId };
    console.log(`Single duplicate candidate: acct ${dupCandidates[0].counterAcctNum}, supplier ${dupCandidates[0].supplierId}`);
  }

  // Build correction lines
  const postings: any[] = [];
  let row = 1;

  // 1. Wrong account reclassification: 7300 → 7000, 4500
  postings.push({
    row: row++,
    account: { id: acctMap[7300] },
    amountGross: -4500,
    amountGrossCurrency: -4500,
    vatType: { id: 1 },
    description: "Korreksjon: ompostering fra 7300"
  });
  postings.push({
    row: row++,
    account: { id: acctMap[7000] },
    amountGross: 4500,
    amountGrossCurrency: 4500,
    vatType: { id: 1 },
    description: "Korreksjon: ompostering til 7000"
  });

  // 2. Duplicate reversal: 6590, 3300
  const dupLine: any = {
    row: row++,
    account: { id: acctMap[6590] },
    amountGross: -3300,
    amountGrossCurrency: -3300,
    vatType: { id: 1 },
    description: "Korreksjon: reversering duplikat"
  };
  postings.push(dupLine);
  const dupCounterLine: any = {
    row: row++,
    account: { id: dupCounterpart!.acctId },
    amountGross: 3300,
    amountGrossCurrency: 3300,
    description: "Korreksjon: reversering duplikat"
  };
  if (dupCounterpart!.supplierId) dupCounterLine.supplier = { id: dupCounterpart!.supplierId };
  postings.push(dupCounterLine);

  // 3. Missing VAT: 6500, 24750 excl. VAT → add VAT 24750*0.25 = 6187.5
  const vatAmount = 24750 * 0.25; // 6187.5
  postings.push({
    row: row++,
    account: { id: acctMap[2710] },
    amountGross: vatAmount,
    amountGrossCurrency: vatAmount,
    description: "Korreksjon: manglende MVA"
  });
  const missingVatCounterLine: any = {
    row: row++,
    account: { id: missingVatCounterpart!.acctId },
    amountGross: -vatAmount,
    amountGrossCurrency: -vatAmount,
    description: "Korreksjon: manglende MVA"
  };
  if (missingVatCounterpart!.supplierId) missingVatCounterLine.supplier = { id: missingVatCounterpart!.supplierId };
  postings.push(missingVatCounterLine);

  // 4. Incorrect amount: 7100, 18800 recorded instead of 8550
  const diff = 18800 - 8550; // 10250
  postings.push({
    row: row++,
    account: { id: acctMap[7100] },
    amountGross: -diff,
    amountGrossCurrency: -diff,
    vatType: { id: 1 },
    description: "Korreksjon: feil beløp"
  });
  const incorrectCounterLine: any = {
    row: row++,
    account: { id: incorrectAmtCounterpart!.acctId },
    amountGross: diff,
    amountGrossCurrency: diff,
    description: "Korreksjon: feil beløp"
  };
  if (incorrectAmtCounterpart!.supplierId) incorrectCounterLine.supplier = { id: incorrectAmtCounterpart!.supplierId };
  postings.push(incorrectCounterLine);

  console.log("\nPosting corrective voucher with", postings.length, "lines");

  // Step 3: POST combined corrective voucher
  const result = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-02-28",
    description: "Korreksjonsbilag: retting av 4 feil i hovedbok jan-feb 2026",
    postings
  });

  console.log("\nCorrective voucher created:");
  console.log(JSON.stringify(result, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
