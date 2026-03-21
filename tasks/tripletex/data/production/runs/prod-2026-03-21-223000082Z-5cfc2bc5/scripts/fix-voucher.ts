const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "uAOoKwP921jipemJ6vVRzG-079ho4YLneRcT9PX3bZg";
const AUTH = "Basic " + Buffer.from("0:" + TOKEN).toString("base64");
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const TOTAL = 50400; // 34950 + 15450

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (res.status >= 400) console.log(JSON.stringify(json, null, 2));
  return { status: res.status, data: json };
}

async function main() {
  // Account ids already known from prior call: 5000=377009363, 1920=377009177
  const a5000 = 377009363;
  const a1920 = 377009177;

  // Create correct voucher with all four amount fields
  const vRes = await api("POST", "/ledger/voucher?sendToLedger=true", {
    voucherType: null,
    date: "2026-03-21",
    description: "Lønn mars 2026 - Fastlønn 34950 + Bonus 15450",
    postings: [
      {
        account: { id: a5000 },
        amount: TOTAL,
        amountCurrency: TOTAL,
        amountGross: TOTAL,
        amountGrossCurrency: TOTAL,
        row: 1,
      },
      {
        account: { id: a1920 },
        amount: -TOTAL,
        amountCurrency: -TOTAL,
        amountGross: -TOTAL,
        amountGrossCurrency: -TOTAL,
        row: 2,
      },
    ],
  });
  console.log("Voucher:", JSON.stringify(vRes.data, null, 2));
}

main().catch(console.error);
