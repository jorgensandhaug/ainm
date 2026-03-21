const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "wybI1vVJbm2aVwJPZtGVbuyuGFnyEEHG9amcdYDblyM";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const BASE_SALARY = 37850;
const BONUS = 9200;
const GROSS = BASE_SALARY + BONUS;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  console.log(`\n>>> ${method} ${path}`);
  if (body) console.log("BODY:", JSON.stringify(body, null, 2));
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`<<< ${res.status}`);
  console.log(JSON.stringify(data, null, 2).substring(0, 1000));
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  // Try with explicit row values starting from 1
  const r = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-21",
    description: `Lønn mars 2026 - Fastlønn ${BASE_SALARY} + Bonus ${BONUS}`,
    voucherType: { id: 9744848 },
    postings: [
      {
        row: 1,
        account: { id: 374412502 },
        amount: GROSS,
        amountCurrency: GROSS,
        amountGross: GROSS,
        amountGrossCurrency: GROSS,
        description: `Lønn mars 2026`,
      },
      {
        row: 2,
        account: { id: 374412316 },
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
        description: `Lønn mars 2026`,
      },
    ],
  });

  if (r.ok) {
    console.log(`\nVoucher created successfully!`);
    return;
  }

  // Try listing voucher types to find the right one
  console.log("\nListing voucher types...");
  const vtRes = await api("GET", "/ledger/voucherType?count=100&fields=*");
}

main().catch((e) => { console.error(e); process.exit(1); });
