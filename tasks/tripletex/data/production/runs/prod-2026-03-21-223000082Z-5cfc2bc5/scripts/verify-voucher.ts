const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "uAOoKwP921jipemJ6vVRzG-079ho4YLneRcT9PX3bZg";
const AUTH = "Basic " + Buffer.from("0:" + TOKEN).toString("base64");
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  const res = await fetch(`${BASE}/ledger/voucher/609189408?fields=*,postings(*)`, { headers: H });
  const data = await res.json();
  console.log("Voucher:", JSON.stringify(data, null, 2));
}

main().catch(console.error);
