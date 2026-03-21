const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "Mn2kmk1NJP5CSGxbbe3R19Ymf3Bru1EPeJD0EXpmtO0";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.log(text); throw new Error(`${r.status}`); }
  return JSON.parse(text);
}

async function main() {
  // 1. Create dimension "Marked"
  const dim = await api("POST", "/ledger/accountingDimensionName", {
    dimensionName: "Marked",
    active: true,
  });
  const dimIndex = dim.value.dimensionIndex;
  console.log("dimensionIndex:", dimIndex);

  // 2. Create value "Bedrift" (scored value — create first)
  const v1 = await api("POST", "/ledger/accountingDimensionValue", {
    dimensionIndex: dimIndex,
    displayName: "Bedrift",
    active: true,
    showInVoucherRegistration: true,
  });
  const bedriftId = v1.value.id;
  console.log("Bedrift id:", bedriftId);

  // 3. Create value "Privat"
  const v2 = await api("POST", "/ledger/accountingDimensionValue", {
    dimensionIndex: dimIndex,
    displayName: "Privat",
    active: true,
    showInVoucherRegistration: true,
  });
  console.log("Privat id:", v2.value.id);

  // 4. Resolve account IDs for 6590 and 1920
  const accts = await api("GET", "/ledger/account?number=6590,1920&fields=*");
  const acct6590 = accts.values.find((a: any) => a.number === 6590);
  const acct1920 = accts.values.find((a: any) => a.number === 1920);
  if (!acct6590 || !acct1920) throw new Error("Account not found");
  console.log("6590 id:", acct6590.id, "1920 id:", acct1920.id);

  // 5. Book voucher
  const dimKey = `freeAccountingDimension${dimIndex}`;
  const voucher = await api("POST", "/ledger/voucher", {
    date: new Date().toISOString().slice(0, 10),
    description: "Marked - Bedrift",
    voucherType: null,
    postings: [
      {
        row: 1,
        account: { id: acct6590.id },
        amount: 16750,
        amountCurrency: 16750,
        amountGross: 16750,
        amountGrossCurrency: 16750,
        [dimKey]: { id: bedriftId },
      },
      {
        row: 2,
        account: { id: acct1920.id },
        amount: -16750,
        amountCurrency: -16750,
        amountGross: -16750,
        amountGrossCurrency: -16750,
      },
    ],
  });
  console.log("Voucher id:", voucher.value.id, "number:", voucher.value.number);
  console.log("Postings:", JSON.stringify(voucher.value.postings, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
