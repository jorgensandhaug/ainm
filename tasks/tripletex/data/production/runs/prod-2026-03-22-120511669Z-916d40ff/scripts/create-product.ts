const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "Th8pSQVrl4di2C6uORDL5JmZXzTkRxQVkowRpylblqQ";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE_URL}${path}`;
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  console.log(`${method} ${path} → ${r.status}`);
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(JSON.stringify(json, null, 2));
  if (!r.ok) throw new Error(`${r.status}: ${JSON.stringify(json)}`);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

async function main() {
  // Step 1: POST /product — one-call path for fresh-account standard 25%
  const product = await api("POST", "/product", {
    name: "Konsulenttimer",
    number: 9497,
    priceExcludingVatCurrency: 17300
  });

  console.log("\n=== Created Product ===");
  console.log("id:", product.id);
  console.log("number:", product.number);
  console.log("name:", product.name);
  console.log("priceExcludingVatCurrency:", product.priceExcludingVatCurrency);
  console.log("priceIncludingVatCurrency:", product.priceIncludingVatCurrency);
  console.log("vatType:", JSON.stringify(product.vatType));

  // Step 2: Verification GET (free)
  await api("GET", `/product/${product.id}?fields=*,vatType(*)`);
}

main().catch(e => { console.error(e); process.exit(1); });
