const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "htSxcehN_58s-g8mlfQi3c5QgSTOXKIzQdozCnSc6XI";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: H,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) {
    console.log(JSON.stringify(json, null, 2));
    throw new Error(`${method} ${path} failed ${res.status}`);
  }
  return json;
}

async function main() {
  // 1. Create dimension "Kostsenter"
  const dimRes = await api("POST", "/ledger/accountingDimensionName", {
    dimensionName: "Kostsenter",
    active: true,
  });
  const dimIndex = dimRes.value.dimensionIndex;
  console.log(`Dimension created: id=${dimRes.value.id}, dimensionIndex=${dimIndex}, name=${dimRes.value.dimensionName}`);

  // 2. Create value "IT" (prompt order: IT first)
  const itRes = await api("POST", "/ledger/accountingDimensionValue", {
    dimensionIndex: dimIndex,
    displayName: "IT",
    active: true,
    showInVoucherRegistration: true,
  });
  console.log(`Value IT created: id=${itRes.value.id}, displayName=${itRes.value.displayName}`);

  // 3. Create value "HR"
  const hrRes = await api("POST", "/ledger/accountingDimensionValue", {
    dimensionIndex: dimIndex,
    displayName: "HR",
    active: true,
    showInVoucherRegistration: true,
  });
  const hrValueId = hrRes.value.id;
  console.log(`Value HR created: id=${hrValueId}, displayName=${hrRes.value.displayName}`);

  // 4. GET accounts 6590 and 1920
  const acctRes = await api("GET", "/ledger/account?number=6590,1920&fields=*");
  const accounts = acctRes.values || acctRes.value;
  const acct6590 = accounts.find((a: any) => a.number === 6590);
  const acct1920 = accounts.find((a: any) => a.number === 1920);
  if (!acct6590 || !acct1920) throw new Error("Missing accounts");
  console.log(`Account 6590: id=${acct6590.id}, name=${acct6590.name}`);
  console.log(`Account 1920: id=${acct1920.id}, name=${acct1920.name}`);

  // 5. POST voucher — balanced two-line, HR dimension on scored posting
  const dimField = `freeAccountingDimension${dimIndex}`;
  const voucher = {
    date: "2026-03-21",
    description: "Kostsenter HR - 6590",
    voucherType: null,
    postings: [
      {
        row: 1,
        account: { id: acct6590.id },
        amount: 38100,
        amountCurrency: 38100,
        amountGross: 38100,
        amountGrossCurrency: 38100,
        [dimField]: { id: hrValueId },
      },
      {
        row: 2,
        account: { id: acct1920.id },
        amount: -38100,
        amountCurrency: -38100,
        amountGross: -38100,
        amountGrossCurrency: -38100,
      },
    ],
  };

  const vRes = await api("POST", "/ledger/voucher", voucher);
  console.log(`\nVoucher created: id=${vRes.value.id}, number=${vRes.value.number}`);
  const postings = vRes.value.postings;
  for (const p of postings) {
    const dimVal = p[dimField];
    console.log(`  row=${p.row} account=${p.account?.id} amount=${p.amount}${dimVal ? ` ${dimField}=${dimVal.id}` : ""}`);
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Dimension: ${dimRes.value.dimensionName} (index=${dimIndex})`);
  console.log(`Values: IT (id=${itRes.value.id}), HR (id=${hrValueId})`);
  console.log(`Voucher: id=${vRes.value.id}, number=${vRes.value.number}`);
  console.log(`Scored posting: account 6590 (id=${acct6590.id}), amount=38100, ${dimField}=${hrValueId}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
