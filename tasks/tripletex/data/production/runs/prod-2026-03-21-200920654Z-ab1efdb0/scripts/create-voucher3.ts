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
  return { ok: res.ok, status: res.status, data };
}

async function main() {
  // Get all voucher types
  const vtRes = await api("GET", "/ledger/voucherType?count=100&fields=*");
  const types = vtRes.data.values || [];
  console.log("Voucher types:");
  for (const t of types) {
    console.log(`  id=${t.id} name="${t.name}"`);
  }

  // Find Lønnsbilag
  const lonnType = types.find((t: any) => t.name === "Lønnsbilag");
  // Also check for a general type we can use
  const manueltType = types.find((t: any) => t.name === "Manuelt bilag" || t.name === "Diverse");
  console.log(`\nLønnsbilag: ${lonnType ? `id=${lonnType.id}` : "NOT FOUND"}`);
  console.log(`Manuelt/Diverse: ${manueltType ? `id=${manueltType.id} name="${manueltType.name}"` : "NOT FOUND"}`);

  // Use Lønnsbilag if found, otherwise try the first available non-system type
  const useType = lonnType || manueltType;
  if (!useType) {
    console.log("No suitable voucher type found. Trying without type...");
  }

  const voucherTypeObj = useType ? { id: useType.id } : undefined;
  console.log(`\nUsing voucherType: ${JSON.stringify(voucherTypeObj)}`);

  const r = await api("POST", "/ledger/voucher?sendToLedger=true", {
    date: "2026-03-21",
    description: `Lønn mars 2026 - Fastlønn ${BASE_SALARY} + Bonus ${BONUS}`,
    ...(voucherTypeObj ? { voucherType: voucherTypeObj } : {}),
    postings: [
      {
        account: { id: 374412502 },
        amount: BASE_SALARY,
        amountCurrency: BASE_SALARY,
        amountGross: BASE_SALARY,
        amountGrossCurrency: BASE_SALARY,
        description: "Fastlønn mars 2026",
      },
      {
        account: { id: 374412502 },
        amount: BONUS,
        amountCurrency: BONUS,
        amountGross: BONUS,
        amountGrossCurrency: BONUS,
        description: "Bonus mars 2026",
      },
      {
        account: { id: 374412316 },
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
        description: `Lønn mars 2026 - total ${GROSS}`,
      },
    ],
  });

  console.log("\nResult:", JSON.stringify(r.data, null, 2).substring(0, 1500));
  if (r.ok) {
    console.log(`\nVoucher created: id=${r.data.value?.id}, number=${r.data.value?.number}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
