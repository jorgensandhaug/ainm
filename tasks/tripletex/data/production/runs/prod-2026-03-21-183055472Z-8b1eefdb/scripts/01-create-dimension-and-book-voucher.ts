const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "GtrK3uymSRJTJdOHa6kekzXGOZ3mNJVfqEhV0LyUC9I";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const DATE = "2026-03-21";

async function api(method: string, path: string, body?: unknown) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: { "Content-Type": "application/json", Authorization: AUTH },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  if (!r.ok) {
    console.error(`${method} ${path} → ${r.status}`, JSON.stringify(json, null, 2));
    process.exit(1);
  }
  console.log(`${method} ${path} → ${r.status}`);
  return json;
}

// 1. Create dimension "Region"
const dimRes = await api("POST", "/ledger/accountingDimensionName", {
  dimensionName: "Region",
  active: true,
});
const dimIndex = dimRes.value.dimensionIndex;
console.log("dimensionIndex:", dimIndex, "dimensionName:", dimRes.value.dimensionName);

// 2. Create value "Sør-Norge"
const val1Res = await api("POST", "/ledger/accountingDimensionValue", {
  dimensionIndex: dimIndex,
  displayName: "Sør-Norge",
  active: true,
  showInVoucherRegistration: true,
});
const val1Id = val1Res.value.id;
console.log("value1 id:", val1Id, "displayName:", val1Res.value.displayName);

// 3. Create value "Midt-Norge"
const val2Res = await api("POST", "/ledger/accountingDimensionValue", {
  dimensionIndex: dimIndex,
  displayName: "Midt-Norge",
  active: true,
  showInVoucherRegistration: true,
});
console.log("value2 id:", val2Res.value.id, "displayName:", val2Res.value.displayName);

// Choose the scored value by displayName match
const scoredValueId = val1Res.value.displayName === "Sør-Norge" ? val1Id : val2Res.value.id;

// 4. Resolve accounts 6540 and 1920
const acctRes = await api("GET", "/ledger/account?number=6540,1920&fields=*");
const accounts = acctRes.values;
const acct6540 = accounts.find((a: any) => a.number === 6540);
const acct1920 = accounts.find((a: any) => a.number === 1920);
if (!acct6540 || !acct1920) {
  console.error("Missing account(s). Got:", accounts.map((a: any) => a.number));
  process.exit(1);
}
console.log("account 6540 id:", acct6540.id, "account 1920 id:", acct1920.id);

// 5. Create voucher
const dimField = `freeAccountingDimension${dimIndex}`;
const voucherRes = await api("POST", "/ledger/voucher", {
  date: DATE,
  description: `Bilag konto 6540, Region "Sør-Norge"`,
  voucherType: null,
  postings: [
    {
      row: 1,
      account: { id: acct6540.id },
      amount: 5150,
      amountCurrency: 5150,
      amountGross: 5150,
      amountGrossCurrency: 5150,
      [dimField]: { id: scoredValueId },
    },
    {
      row: 2,
      account: { id: acct1920.id },
      amount: -5150,
      amountCurrency: -5150,
      amountGross: -5150,
      amountGrossCurrency: -5150,
    },
  ],
});
console.log("voucher id:", voucherRes.value.id, "number:", voucherRes.value.number);
console.log("postings:", JSON.stringify(voucherRes.value.postings, null, 2));
