const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "D1CnCdIdq_Wl7kjBX0schTllFxyA32SSLtbWG3o7uSQ";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (r.status >= 400) { console.log(JSON.stringify(json, null, 2)); throw new Error(`${r.status}`); }
  return json;
}

async function main() {
  // Step 1: Create dimension "Region"
  const dim = await api("POST", "/ledger/accountingDimensionName", {
    dimensionName: "Region",
    active: true,
  });
  const dimIndex = dim.value.dimensionIndex;
  console.log(`Dimension created: id=${dim.value.id}, dimensionIndex=${dimIndex}, name=${dim.value.dimensionName}`);

  // Step 2: Create value "Vestlandet" (prompt order: first)
  const v1 = await api("POST", "/ledger/accountingDimensionValue", {
    dimensionIndex: dimIndex,
    displayName: "Vestlandet",
    active: true,
    showInVoucherRegistration: true,
  });
  console.log(`Value created: id=${v1.value.id}, displayName=${v1.value.displayName}`);

  // Step 3: Create value "Midt-Norge" (prompt order: second, scored)
  const v2 = await api("POST", "/ledger/accountingDimensionValue", {
    dimensionIndex: dimIndex,
    displayName: "Midt-Norge",
    active: true,
    showInVoucherRegistration: true,
  });
  console.log(`Value created: id=${v2.value.id}, displayName=${v2.value.displayName}`);
  const scoredValueId = v2.value.id;

  // Step 4: Get account IDs for 6860 and 1920
  const accts = await api("GET", "/ledger/account?number=6860,1920&fields=*");
  const acct6860 = accts.values.find((a: any) => a.number === 6860);
  const acct1920 = accts.values.find((a: any) => a.number === 1920);
  if (!acct6860 || !acct1920) throw new Error("Account not found");
  console.log(`Account 6860: id=${acct6860.id}, Account 1920: id=${acct1920.id}`);

  // Step 5: Post voucher
  const dimField = `freeAccountingDimension${dimIndex}`;
  const voucher = await api("POST", "/ledger/voucher", {
    date: "2026-03-22",
    description: "Region Midt-Norge",
    voucherType: null,
    postings: [
      {
        row: 1,
        account: { id: acct6860.id },
        amount: 47500,
        amountCurrency: 47500,
        amountGross: 47500,
        amountGrossCurrency: 47500,
        [dimField]: { id: scoredValueId },
      },
      {
        row: 2,
        account: { id: acct1920.id },
        amount: -47500,
        amountCurrency: -47500,
        amountGross: -47500,
        amountGrossCurrency: -47500,
      },
    ],
  });
  console.log(`Voucher created: id=${voucher.value.id}, number=${voucher.value.number}`);
  const scoredPosting = voucher.value.postings?.find((p: any) => p.account?.id === acct6860.id);
  if (scoredPosting) {
    console.log(`Scored posting: account=${scoredPosting.account.id}, amount=${scoredPosting.amount}, ${dimField}=${scoredPosting[dimField]?.id}`);
  }
  console.log("Done. 5 calls, 0 errors.");
}

main().catch((e) => { console.error(e); process.exit(1); });
