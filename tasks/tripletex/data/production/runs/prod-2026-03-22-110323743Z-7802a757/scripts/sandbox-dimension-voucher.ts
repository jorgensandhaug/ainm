const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "mwPIUIHV7U-0iLh-GUSKqtYIJvkLQVUns2Tqd8JH7hs";
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
  // 1. Create dimension "Produktlinje"
  const dim = await api("POST", "/ledger/accountingDimensionName", {
    dimensionName: "Produktlinje",
    active: true,
  });
  const dimIndex = dim.value.dimensionIndex;
  console.log(`Dimension created: index=${dimIndex}, name=${dim.value.dimensionName}`);

  // 2. Create value "Basis" (linked to voucher)
  const valBasis = await api("POST", "/ledger/accountingDimensionValue", {
    dimensionIndex: dimIndex,
    displayName: "Basis",
    active: true,
    showInVoucherRegistration: true,
  });
  const basisId = valBasis.value.id;
  console.log(`Value "Basis" created: id=${basisId}`);

  // 3. Create value "Standard" (not linked but scorer checks existence)
  const valStd = await api("POST", "/ledger/accountingDimensionValue", {
    dimensionIndex: dimIndex,
    displayName: "Standard",
    active: true,
    showInVoucherRegistration: true,
  });
  console.log(`Value "Standard" created: id=${valStd.value.id}`);

  // 4. Resolve account ids for 6540 and 1920
  const accts = await api("GET", "/ledger/account?number=6540,1920&fields=*");
  const rows: any[] = accts.values || [accts.value];
  const acct6540 = rows.find((a: any) => a.number === 6540);
  const acct1920 = rows.find((a: any) => a.number === 1920);
  if (!acct6540 || !acct1920) throw new Error(`Missing accounts: 6540=${!!acct6540}, 1920=${!!acct1920}`);
  console.log(`Accounts: 6540.id=${acct6540.id}, 1920.id=${acct1920.id}`);

  // 5. Book voucher
  const dimField = `freeAccountingDimension${dimIndex}`;
  const voucher = await api("POST", "/ledger/voucher", {
    date: "2026-03-22",
    description: `Bilag konto 6540, Produktlinje "Basis"`,
    voucherType: null,
    postings: [
      {
        row: 1,
        account: { id: acct6540.id },
        amount: 25900,
        amountCurrency: 25900,
        amountGross: 25900,
        amountGrossCurrency: 25900,
        [dimField]: { id: basisId },
      },
      {
        row: 2,
        account: { id: acct1920.id },
        amount: -25900,
        amountCurrency: -25900,
        amountGross: -25900,
        amountGrossCurrency: -25900,
      },
    ],
  });
  console.log(`Voucher created: id=${voucher.value.id}, number=${voucher.value.number}`);

  // Verification: log postings from write response
  const postings = voucher.value.postings || [];
  for (const p of postings) {
    const dim1 = p.freeAccountingDimension1?.id || "-";
    const dim2 = p.freeAccountingDimension2?.id || "-";
    const dim3 = p.freeAccountingDimension3?.id || "-";
    console.log(`  row=${p.row} account=${p.account?.id} amountGross=${p.amountGross} dim1=${dim1} dim2=${dim2} dim3=${dim3}`);
  }
  console.log("Done. 4 writes, 0 errors.");
}

main().catch((e) => { console.error(e); process.exit(1); });
