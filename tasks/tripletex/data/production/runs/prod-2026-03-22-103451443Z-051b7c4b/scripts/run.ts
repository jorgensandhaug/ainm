const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "vzCnXTpqACHugkwdd-apG5cVuvjh-KJ192xi85NusNo";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body !== undefined) opts.body = JSON.stringify(body);
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
    active: true,
  });
  const dimIndex = dim.value.dimensionIndex;
  console.log(`dimensionIndex=${dimIndex}`);

  // 2. Create only the linked value "Forskning"
  const val = await api("POST", "/ledger/accountingDimensionValue", {
    dimensionIndex: dimIndex,
    displayName: "Forskning",
    active: true,
    showInVoucherRegistration: true,
  });
  const valId = val.value.id;
  console.log(`value id=${valId}, displayName=${val.value.displayName}`);

  // 3. Resolve account IDs
  const accts = await api("GET", "/ledger/account?number=6590,1920&fields=*");
  const rows: any[] = accts.values;
  const target = rows.find((a: any) => a.number === 6590);
  const bank = rows.find((a: any) => a.number === 1920);
  if (!target || !bank) throw new Error(`Missing account: target=${!!target} bank=${!!bank}`);
  console.log(`target account id=${target.id}, bank account id=${bank.id}`);

  // 4. Book voucher
  const dimKey = `freeAccountingDimension${dimIndex}`;
  const amt = 10800;
  const voucher = await api("POST", "/ledger/voucher", {
    date: "2026-03-22",
    description: `Bilag konto 6590, Prosjekttype "Forskning"`,
    voucherType: null,
    postings: [
      {
        row: 1,
        account: { id: target.id },
        amount: amt,
        amountCurrency: amt,
        amountGross: amt,
        amountGrossCurrency: amt,
        [dimKey]: { id: valId },
      },
      {
        row: 2,
        account: { id: bank.id },
        amount: -amt,
        amountCurrency: -amt,
        amountGross: -amt,
        amountGrossCurrency: -amt,
      },
    ],
  });
  console.log(`Voucher id=${voucher.value.id} number=${voucher.value.number}`);
  console.log("Postings:", JSON.stringify(voucher.value.postings, null, 2));

  // 5. Verification GET (free)
  const verify = await api("GET", `/ledger/voucher/${voucher.value.id}?fields=id,number,date,description,postings(row,account(number,name),amountGross,freeAccountingDimension1(*),freeAccountingDimension2(*),freeAccountingDimension3(*))`);
  console.log("Verification:", JSON.stringify(verify.value, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
