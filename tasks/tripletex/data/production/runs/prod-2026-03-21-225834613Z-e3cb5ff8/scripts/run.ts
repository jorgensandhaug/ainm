const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "N3yWXtSor6O_V8YEeFhyLPuX1a_DuFkGlbmZSFfRpfY";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.log(JSON.stringify(data)); throw new Error(`${r.status}`); }
  return data;
}

async function main() {
  // 1. Create dimension "Region"
  const dim = await api("POST", "/ledger/accountingDimensionName", {
    dimensionName: "Region",
    active: true,
  });
  const dimIndex = dim.value.dimensionIndex;
  console.log(`dimensionIndex=${dimIndex}`);

  // 2. Create value "Midt-Norge"
  const v1 = await api("POST", "/ledger/accountingDimensionValue", {
    dimensionIndex: dimIndex,
    displayName: "Midt-Norge",
    active: true,
    showInVoucherRegistration: true,
  });
  const midtNorgeId = v1.value.id;
  console.log(`Midt-Norge id=${midtNorgeId}`);

  // 3. Create value "Vestlandet"
  const v2 = await api("POST", "/ledger/accountingDimensionValue", {
    dimensionIndex: dimIndex,
    displayName: "Vestlandet",
    active: true,
    showInVoucherRegistration: true,
  });
  console.log(`Vestlandet id=${v2.value.id}`);

  // 4. Resolve account ids for 7140 and 1920
  const accts = await api("GET", "/ledger/account?number=7140,1920&fields=*");
  const acct7140 = accts.values.find((a: any) => a.number === 7140);
  const acct1920 = accts.values.find((a: any) => a.number === 1920);
  if (!acct7140 || !acct1920) throw new Error("Account not found");
  console.log(`7140 id=${acct7140.id}, 1920 id=${acct1920.id}`);

  // 5. Post voucher
  const dimKey = `freeAccountingDimension${dimIndex}`;
  const today = new Date().toISOString().slice(0, 10);
  const voucher = await api("POST", "/ledger/voucher", {
    date: today,
    description: "Region Midt-Norge",
    voucherType: null,
    postings: [
      {
        row: 1,
        account: { id: acct7140.id },
        amount: 43750,
        amountCurrency: 43750,
        amountGross: 43750,
        amountGrossCurrency: 43750,
        [dimKey]: { id: midtNorgeId },
      },
      {
        row: 2,
        account: { id: acct1920.id },
        amount: -43750,
        amountCurrency: -43750,
        amountGross: -43750,
        amountGrossCurrency: -43750,
      },
    ],
  });
  console.log(`Voucher id=${voucher.value.id} number=${voucher.value.number}`);
  console.log("Done — 5 calls, 0 errors");
}

main().catch((e) => { console.error(e); process.exit(1); });
