const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "avk6cRcwz_PDD51XqACvBSv25rzohWucN-jEKflyEaU";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE_URL}${path}`;
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  console.log(JSON.stringify(json, null, 2));
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(json)}`);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

async function main() {
  // Step 1: Create dimension "Marked"
  const dim = await api("POST", "/ledger/accountingDimensionName", {
    dimensionName: "Marked",
    active: true
  });
  const dimIndex = dim.dimensionIndex;
  console.log("dimensionIndex =", dimIndex);

  // Step 2: Create value "Offentlig" (linked to voucher)
  const valOffentlig = await api("POST", "/ledger/accountingDimensionValue", {
    dimensionIndex: dimIndex,
    displayName: "Offentlig",
    active: true,
    showInVoucherRegistration: true
  });
  const offentligId = valOffentlig.id;

  // Step 3: Create value "Bedrift"
  await api("POST", "/ledger/accountingDimensionValue", {
    dimensionIndex: dimIndex,
    displayName: "Bedrift",
    active: true,
    showInVoucherRegistration: true
  });

  // Step 4: GET accounts 6540 and 1920
  const accounts = await api("GET", "/ledger/account?number=6540,1920&fields=*");
  const acc6540 = accounts.find((a: any) => a.number === 6540);
  const acc1920 = accounts.find((a: any) => a.number === 1920);
  if (!acc6540 || !acc1920) throw new Error("Missing accounts");

  // Step 5: POST voucher with dimension linkage
  const dimField = `freeAccountingDimension${dimIndex}`;
  const today = new Date().toISOString().slice(0, 10);
  const voucher = await api("POST", "/ledger/voucher", {
    date: today,
    description: "Marked - Offentlig",
    voucherType: null,
    postings: [
      {
        row: 1,
        account: { id: acc6540.id },
        amount: 44100,
        amountCurrency: 44100,
        amountGross: 44100,
        amountGrossCurrency: 44100,
        [dimField]: { id: offentligId }
      },
      {
        row: 2,
        account: { id: acc1920.id },
        amount: -44100,
        amountCurrency: -44100,
        amountGross: -44100,
        amountGrossCurrency: -44100
      }
    ]
  });
  console.log("Voucher created, id =", voucher.id, "number =", voucher.number);

  // Step 6: Verification GET (free)
  const verify = await api("GET", `/ledger/voucher/${voucher.id}?fields=id,number,date,description,postings(row,account(number,name),amountGross,freeAccountingDimension1(*),freeAccountingDimension2(*),freeAccountingDimension3(*))`);
  console.log("Verification complete.");
}

main().catch(e => { console.error(e); process.exit(1); });
