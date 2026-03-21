const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "bwakfiexSJJMVOIalo0uXwOJFPIJziTtQLeTWSdI9Ig";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.log(JSON.stringify(json).slice(0, 500)); throw new Error(`${r.status}`); }
  return json;
}

async function main() {
  // 1. Create dimension "Prosjekttype"
  const dimRes = await api("POST", "/ledger/accountingDimensionName", {
    dimensionName: "Prosjekttype",
    active: true,
  });
  const dimIndex = dimRes.value.dimensionIndex;
  console.log("dimensionIndex:", dimIndex);

  // 2. Create value "Utvikling" (prompt order: first)
  const v1 = await api("POST", "/ledger/accountingDimensionValue", {
    dimensionIndex: dimIndex,
    displayName: "Utvikling",
    active: true,
    showInVoucherRegistration: true,
  });
  console.log("Utvikling id:", v1.value.id);

  // 3. Create value "Internt" (prompt order: second — this is the scored one)
  const v2 = await api("POST", "/ledger/accountingDimensionValue", {
    dimensionIndex: dimIndex,
    displayName: "Internt",
    active: true,
    showInVoucherRegistration: true,
  });
  const interntId = v2.value.id;
  console.log("Internt id:", interntId);

  // 4. Resolve account ids for 7000 and 1920
  const accts = await api("GET", "/ledger/account?number=7000,1920&fields=*");
  const list: any[] = accts.values;
  const acct7000 = list.find((a: any) => a.number === 7000);
  const acct1920 = list.find((a: any) => a.number === 1920);
  if (!acct7000 || !acct1920) throw new Error("Account not found");
  console.log("7000 id:", acct7000.id, "1920 id:", acct1920.id);

  // 5. Post voucher
  const dimKey = `freeAccountingDimension${dimIndex}`;
  const today = new Date().toISOString().slice(0, 10);
  const voucher = await api("POST", "/ledger/voucher", {
    date: today,
    description: "Bilag konto 7000",
    voucherType: null,
    postings: [
      {
        row: 1,
        account: { id: acct7000.id },
        amount: 39700,
        amountCurrency: 39700,
        amountGross: 39700,
        amountGrossCurrency: 39700,
        [dimKey]: { id: interntId },
      },
      {
        row: 2,
        account: { id: acct1920.id },
        amount: -39700,
        amountCurrency: -39700,
        amountGross: -39700,
        amountGrossCurrency: -39700,
      },
    ],
  });
  console.log("Voucher id:", voucher.value.id, "number:", voucher.value.number);
  console.log("Done. 5 calls, 0 errors.");
}

main().catch((e) => { console.error(e); process.exit(1); });
