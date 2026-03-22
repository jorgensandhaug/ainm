const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "OF_X-Ov73SYt0Yyf2W552GMjcvKLR4RhnlLwlX6foYU";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.error(JSON.stringify(data)); process.exit(1); }
  return data;
}

async function main() {
  // 1. Create dimension "Prosjekttype"
  const dim = await api("POST", "/ledger/accountingDimensionName", {
    dimensionName: "Prosjekttype",
    active: true,
  });
  const dimIndex = dim.value.dimensionIndex;
  console.log(`Dimension created: id=${dim.value.id}, index=${dimIndex}, name=${dim.value.dimensionName}`);

  // 2. Create value "Eksternt" (prompt order: first)
  const v1 = await api("POST", "/ledger/accountingDimensionValue", {
    dimensionIndex: dimIndex,
    displayName: "Eksternt",
    active: true,
    showInVoucherRegistration: true,
  });
  console.log(`Value created: id=${v1.value.id}, name=${v1.value.displayName}`);

  // 3. Create value "Forskning" (prompt order: second — this is the scored link)
  const v2 = await api("POST", "/ledger/accountingDimensionValue", {
    dimensionIndex: dimIndex,
    displayName: "Forskning",
    active: true,
    showInVoucherRegistration: true,
  });
  console.log(`Value created: id=${v2.value.id}, name=${v2.value.displayName}`);
  const forsknId = v2.value.id;

  // 4. GET account IDs for 7140 and 1920
  const accts = await api("GET", "/ledger/account?number=7140,1920&fields=*");
  const target = accts.values.find((a: any) => a.number === 7140);
  const bank = accts.values.find((a: any) => a.number === 1920);
  if (!target || !bank) { console.error("Account not found", { target, bank }); process.exit(1); }
  console.log(`Accounts: target=${target.id} (${target.number}), bank=${bank.id} (${bank.number})`);

  // 5. Book voucher
  const dimField = `freeAccountingDimension${dimIndex}`;
  const voucher = await api("POST", "/ledger/voucher", {
    date: "2026-03-22",
    description: "Forskning",
    voucherType: null,
    postings: [
      {
        row: 1,
        account: { id: target.id },
        amount: 28850,
        amountCurrency: 28850,
        amountGross: 28850,
        amountGrossCurrency: 28850,
        [dimField]: { id: forsknId },
      },
      {
        row: 2,
        account: { id: bank.id },
        amount: -28850,
        amountCurrency: -28850,
        amountGross: -28850,
        amountGrossCurrency: -28850,
      },
    ],
  });
  console.log(`Voucher created: id=${voucher.value.id}, number=${voucher.value.number}`);
  console.log("Postings:", JSON.stringify(voucher.value.postings, null, 2));
}

main();
