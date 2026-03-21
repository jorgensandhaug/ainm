const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "0r7-jXj3st9ZjpYAfOo7uUtmgW592AonUfBg8gTj8z8";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`\n>>> ${method} ${url}`);
  if (body) console.log(JSON.stringify(body, null, 2));
  const r = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`<<< ${r.status}`);
  console.log(JSON.stringify(json, null, 2));
  if (!r.ok) throw new Error(`${method} ${path} => ${r.status}`);
  return json;
}

async function main() {
  // 1. Create dimension "Prosjekttype"
  const dim = await api("POST", "/ledger/accountingDimensionName", {
    dimensionName: "Prosjekttype",
    active: true,
  });
  const dimensionIndex = dim.value.dimensionIndex;
  console.log(`\n=== dimensionIndex: ${dimensionIndex}`);

  // 2. Create value "Forskning" (prompt order preserved)
  const v1 = await api("POST", "/ledger/accountingDimensionValue", {
    dimensionIndex,
    displayName: "Forskning",
    active: true,
    showInVoucherRegistration: true,
  });
  console.log(`=== Forskning id: ${v1.value.id}`);

  // 3. Create value "Internt"
  const v2 = await api("POST", "/ledger/accountingDimensionValue", {
    dimensionIndex,
    displayName: "Internt",
    active: true,
    showInVoucherRegistration: true,
  });
  const interntId = v2.value.id;
  console.log(`=== Internt id: ${interntId}`);

  // 4. Get account IDs for 7000 and 1920
  const accts = await api("GET", "/ledger/account?number=7000,1920&fields=*");
  const rows: any[] = accts.values;
  const acct7000 = rows.find((a: any) => a.number === 7000);
  const acct1920 = rows.find((a: any) => a.number === 1920);
  if (!acct7000) throw new Error("Account 7000 not found");
  if (!acct1920) {
    // fallback
    const bank = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
    throw new Error("1920 not found, fallback needed: " + JSON.stringify(bank.values?.map((a: any) => a.number)));
  }
  console.log(`=== acct7000 id: ${acct7000.id}, acct1920 id: ${acct1920.id}`);

  // 5. Book voucher: 32550 NOK on 7000 linked to "Internt", balanced by 1920
  const dimKey = `freeAccountingDimension${dimensionIndex}`;
  const today = new Date().toISOString().slice(0, 10);
  const voucher = await api("POST", "/ledger/voucher", {
    date: today,
    description: "Beleg Konto 7000 - Internt",
    voucherType: null,
    postings: [
      {
        account: { id: acct7000.id },
        amount: 32550,
        amountCurrency: 32550,
        amountGross: 32550,
        amountGrossCurrency: 32550,
        [dimKey]: { id: interntId },
      },
      {
        account: { id: acct1920.id },
        amount: -32550,
        amountCurrency: -32550,
        amountGross: -32550,
        amountGrossCurrency: -32550,
      },
    ],
  });

  console.log(`\n=== VOUCHER CREATED ===`);
  console.log(`Voucher id: ${voucher.value.id}`);
  console.log(`Voucher number: ${voucher.value.number}`);
  const postings = voucher.value.postings;
  for (const p of postings) {
    console.log(`  Posting: account ${p.account?.id}, amount ${p.amount}, ${dimKey}: ${p[dimKey]?.id ?? "none"}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
