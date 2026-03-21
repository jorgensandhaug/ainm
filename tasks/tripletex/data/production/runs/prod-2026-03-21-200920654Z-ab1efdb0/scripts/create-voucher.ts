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
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`<<< ${res.status}`);
  if (!res.ok) console.log("ERROR:", JSON.stringify(data, null, 2));
  else console.log("OK:", JSON.stringify(data, null, 2).substring(0, 500));
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  // Already resolved: acc5000 id=374412502, acc1920 id=374412316

  // Try with voucherType null (manual voucher approach)
  const r = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-21",
    description: `Lønn mars 2026 - Fastlønn ${BASE_SALARY} + Bonus ${BONUS}`,
    voucherType: null,
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

  if (r.ok) {
    console.log(`\nVoucher created: id=${r.data.value?.id}, number=${r.data.value?.number}`);
  } else {
    console.log("\nvoucherType null failed, trying without voucherType field...");
    // Try without the field entirely
    const r2 = await api("POST", "/ledger/voucher?sendToLedger=true", {
      date: "2026-03-21",
      description: `Lønn mars 2026 - Fastlønn ${BASE_SALARY} + Bonus ${BONUS}`,
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
}

main().catch((e) => { console.error(e); process.exit(1); });
