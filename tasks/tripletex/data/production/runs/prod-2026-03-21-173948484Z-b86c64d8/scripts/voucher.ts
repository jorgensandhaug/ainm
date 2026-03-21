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
  // Values from prior successful calls:
  // dimensionIndex = 1, Internt id = 18359
  // acct7000 id = 372638875, acct1920 id = 372638579

  const today = "2026-03-21";
  const voucher = await api("POST", "/ledger/voucher", {
    date: today,
    description: "Bilag konto 7000, Prosjekttype \"Internt\"",
    voucherType: null,
    postings: [
      {
        row: 1,
        date: today,
        description: "Prosjekttype \"Internt\"",
        account: { id: 372638875 },
        currency: { id: 1 },
        amount: 32550,
        amountCurrency: 32550,
        amountGross: 32550,
        amountGrossCurrency: 32550,
        freeAccountingDimension1: { id: 18359 },
      },
      {
        row: 2,
        date: today,
        description: "Prosjekttype \"Internt\"",
        account: { id: 372638579 },
        currency: { id: 1 },
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
    console.log(`  Posting: account ${p.account?.id}, amount ${p.amount}, freeAccountingDimension1: ${p.freeAccountingDimension1?.id ?? "none"}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
