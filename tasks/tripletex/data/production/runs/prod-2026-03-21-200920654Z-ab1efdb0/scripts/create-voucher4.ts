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
  console.log(JSON.stringify(data, null, 2).substring(0, 1500));
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  // Try with correct voucherType 8145240 (Lønnsbilag for this account) and explicit row values
  const r1 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-21",
    description: `Lønn mars 2026 - Fastlønn ${BASE_SALARY} + Bonus ${BONUS}`,
    voucherType: { id: 8145240 },
    postings: [
      {
        row: 1,
        account: { id: 374412502 },
        amount: BASE_SALARY,
        amountCurrency: BASE_SALARY,
        amountGross: BASE_SALARY,
        amountGrossCurrency: BASE_SALARY,
        description: "Fastlønn mars 2026",
      },
      {
        row: 2,
        account: { id: 374412502 },
        amount: BONUS,
        amountCurrency: BONUS,
        amountGross: BONUS,
        amountGrossCurrency: BONUS,
        description: "Bonus mars 2026",
      },
      {
        row: 3,
        account: { id: 374412316 },
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
        description: `Lønn mars 2026`,
      },
    ],
  });

  if (r1.ok) {
    console.log(`\nVoucher created: id=${r1.data.value?.id}, number=${r1.data.value?.number}`);
    return;
  }

  // If that still fails, try with a non-Lønnsbilag type - use Betaling (8145239) as a general-purpose type
  console.log("\nTrying Betaling type...");
  const r2 = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-21",
    description: `Lønn mars 2026 - Fastlønn ${BASE_SALARY} + Bonus ${BONUS}`,
    voucherType: { id: 8145239 },
    postings: [
      {
        account: { id: 374412502 },
        amount: GROSS,
        amountCurrency: GROSS,
        amountGross: GROSS,
        amountGrossCurrency: GROSS,
        description: `Lønn mars 2026`,
      },
      {
        account: { id: 374412316 },
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
        description: `Lønn mars 2026`,
      },
    ],
  });

  if (r2.ok) {
    console.log(`\nVoucher created: id=${r2.data.value?.id}, number=${r2.data.value?.number}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
