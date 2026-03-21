const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "6LgN2UwWwBNebsSYUgzUWa9myCXk1U5cxx24ItUrylg";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) {
    console.log(JSON.stringify(json, null, 2));
    throw new Error(`${r.status}`);
  }
  return json;
}

// Step 1: Create dimension "Prosjekttype"
const dimRes = await api("POST", "/ledger/accountingDimensionName", {
  dimensionName: "Prosjekttype",
  active: true,
});
const dimIndex = dimRes.value.dimensionIndex;
console.log(`dimensionIndex=${dimIndex}`);

// Step 2: Create value "Eksternt" (prompt order)
const val1Res = await api("POST", "/ledger/accountingDimensionValue", {
  dimensionIndex: dimIndex,
  displayName: "Eksternt",
  active: true,
  showInVoucherRegistration: true,
});
console.log(`Eksternt id=${val1Res.value.id}`);

// Step 3: Create value "Forskning" (prompt order)
const val2Res = await api("POST", "/ledger/accountingDimensionValue", {
  dimensionIndex: dimIndex,
  displayName: "Forskning",
  active: true,
  showInVoucherRegistration: true,
});
const forskningId = val2Res.value.id;
console.log(`Forskning id=${forskningId}`);

// Step 4: Resolve account IDs for 7140 and 1920
const acctRes = await api("GET", "/ledger/account?number=7140,1920&fields=*");
const accounts = acctRes.values;
const acct7140 = accounts.find((a: any) => a.number === 7140);
const acct1920 = accounts.find((a: any) => a.number === 1920);
if (!acct7140 || !acct1920) throw new Error("Account not found");
console.log(`7140 id=${acct7140.id}, 1920 id=${acct1920.id}`);

// Step 5: Book voucher
const today = new Date().toISOString().slice(0, 10);
const dimField = `freeAccountingDimension${dimIndex}`;

const voucherRes = await api("POST", "/ledger/voucher", {
  date: today,
  description: "Forskning",
  voucherType: null,
  postings: [
    {
      row: 1,
      account: { id: acct7140.id },
      amount: 28850,
      amountCurrency: 28850,
      amountGross: 28850,
      amountGrossCurrency: 28850,
      [dimField]: { id: forskningId },
    },
    {
      row: 2,
      account: { id: acct1920.id },
      amount: -28850,
      amountCurrency: -28850,
      amountGross: -28850,
      amountGrossCurrency: -28850,
    },
  ],
});
console.log(`Voucher id=${voucherRes.value.id} number=${voucherRes.value.number}`);
console.log("Done — 5 calls, 0 errors.");
