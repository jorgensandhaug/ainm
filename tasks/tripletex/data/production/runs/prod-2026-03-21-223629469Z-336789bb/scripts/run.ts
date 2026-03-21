const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "8HfR7Ty2B99LWbu-FL6MANHEn056SzA3BdXGYXAPMFg";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
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
    active: true,
  });
  const dimIndex = dim.value.dimensionIndex;
  console.log(`Dimension created: id=${dim.value.id}, dimensionIndex=${dimIndex}`);

  // 2. Create value "Internt" (scored value, create first per prompt order)
  const v1 = await api("POST", "/ledger/accountingDimensionValue", {
    dimensionIndex: dimIndex,
    displayName: "Internt",
    active: true,
    showInVoucherRegistration: true,
  });
  const internId = v1.value.id;
  console.log(`Value "Internt" created: id=${internId}`);

  // 3. Create value "Utvikling"
  const v2 = await api("POST", "/ledger/accountingDimensionValue", {
    dimensionIndex: dimIndex,
    displayName: "Utvikling",
    active: true,
    showInVoucherRegistration: true,
  });
  console.log(`Value "Utvikling" created: id=${v2.value.id}`);

  // 4. Get account IDs for 6340 and 1920
  const accts = await api("GET", "/ledger/account?number=6340,1920&fields=*");
  const rows: any[] = accts.values;
  const acct6340 = rows.find((a: any) => a.number === 6340);
  const acct1920 = rows.find((a: any) => a.number === 1920);
  if (!acct6340 || !acct1920) throw new Error("Account not found");
  console.log(`Account 6340 id=${acct6340.id}, Account 1920 id=${acct1920.id}`);

  // 5. Book voucher
  const dimField = `freeAccountingDimension${dimIndex}`;
  const today = new Date().toISOString().slice(0, 10);
  const voucher = await api("POST", "/ledger/voucher", {
    date: today,
    description: "Beleg Konto 6340 Prosjekttype Internt",
    voucherType: null,
    postings: [
      {
        row: 1,
        account: { id: acct6340.id },
        amount: 44500,
        amountCurrency: 44500,
        amountGross: 44500,
        amountGrossCurrency: 44500,
        [dimField]: { id: internId },
      },
      {
        row: 2,
        account: { id: acct1920.id },
        amount: -44500,
        amountCurrency: -44500,
        amountGross: -44500,
        amountGrossCurrency: -44500,
      },
    ],
  });
  console.log(`Voucher created: id=${voucher.value.id}, number=${voucher.value.number}`);
  const scoredPosting = voucher.value.postings?.find((p: any) => p.account?.id === acct6340.id);
  if (scoredPosting) {
    console.log(`Scored posting: account=${scoredPosting.account.id}, amount=${scoredPosting.amount}, ${dimField}=${scoredPosting[dimField]?.id}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
