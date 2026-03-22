const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "HtQ1p0o-8mM8L5C6288VJZ6cGK7FLvN961BavHKe4Bc";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (r.status >= 400) { console.log(JSON.stringify(json, null, 2)); throw new Error(`${r.status}`); }
  return json;
}

async function main() {
  // 1. Create dimension "Prosjekttype"
  const dim = await api("POST", "/ledger/accountingDimensionName", {
    dimensionName: "Prosjekttype",
    active: true
  });
  const dimIndex = dim.value.dimensionIndex;
  console.log(`Dimension created: id=${dim.value.id}, index=${dimIndex}, name=${dim.value.dimensionName}`);

  // 2. Create value "Forskning"
  const v1 = await api("POST", "/ledger/accountingDimensionValue", {
    dimensionIndex: dimIndex,
    displayName: "Forskning",
    active: true,
    showInVoucherRegistration: true
  });
  const forskningId = v1.value.id;
  console.log(`Value created: id=${forskningId}, name=${v1.value.displayName}`);

  // 3. Create value "Utvikling"
  const v2 = await api("POST", "/ledger/accountingDimensionValue", {
    dimensionIndex: dimIndex,
    displayName: "Utvikling",
    active: true,
    showInVoucherRegistration: true
  });
  console.log(`Value created: id=${v2.value.id}, name=${v2.value.displayName}`);

  // 4. Get account IDs for 7000 and 1920
  const accts = await api("GET", "/ledger/account?number=7000,1920&fields=*");
  let acct7000: any, acct1920: any;
  for (const a of accts.values) {
    if (a.number === 7000) acct7000 = a;
    if (a.number === 1920) acct1920 = a;
  }
  if (!acct7000 || !acct1920) throw new Error("Account not found");
  console.log(`Account 7000: id=${acct7000.id}, Account 1920: id=${acct1920.id}`);

  // 5. Post voucher
  const dimField = `freeAccountingDimension${dimIndex}`;
  const voucher = await api("POST", "/ledger/voucher", {
    date: "2026-03-22",
    description: "Prosjekttype Forskning",
    voucherType: null,
    postings: [
      {
        row: 1,
        account: { id: acct7000.id },
        amount: 14550,
        amountCurrency: 14550,
        amountGross: 14550,
        amountGrossCurrency: 14550,
        [dimField]: { id: forskningId }
      },
      {
        row: 2,
        account: { id: acct1920.id },
        amount: -14550,
        amountCurrency: -14550,
        amountGross: -14550,
        amountGrossCurrency: -14550
      }
    ]
  });
  console.log(`Voucher created: id=${voucher.value.id}, number=${voucher.value.number}`);
  console.log("Done. 5 calls, 0 errors.");
}

main().catch(e => { console.error(e); process.exit(1); });
