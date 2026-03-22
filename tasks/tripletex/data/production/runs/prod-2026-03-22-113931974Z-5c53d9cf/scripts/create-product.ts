const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "n2IiGUcMGmSKC_RKbeAIJuanlbdhT4u54DtRVYyDneA";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function main() {
  // POST /product — one-call path for standard 25% VAT
  const res = await fetch(`${BASE}/product`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: AUTH },
    body: JSON.stringify({
      name: "Mantenimiento",
      number: 4508,
      priceExcludingVatCurrency: 41500,
    }),
  });
  const data = await res.json();
  console.log("POST /product:", res.status, JSON.stringify(data, null, 2));

  if (res.status === 201) {
    const v = data.value;
    console.log("\n=== VERIFY FROM WRITE RESPONSE ===");
    console.log("id:", v.id);
    console.log("number:", v.number);
    console.log("name:", v.name);
    console.log("priceExcludingVatCurrency:", v.priceExcludingVatCurrency);
    console.log("priceIncludingVatCurrency:", v.priceIncludingVatCurrency);
    console.log("vatType:", JSON.stringify(v.vatType));

    // Verify: priceIncludingVat should be 41500 * 1.25 = 51875
    const expected = 41500 * 1.25;
    console.log("expected priceIncludingVatCurrency:", expected);
    console.log("match:", v.priceIncludingVatCurrency === expected);

    // GET /product/{id} for full verification log
    const gRes = await fetch(`${BASE}/product/${v.id}?fields=*,vatType(*)`, {
      headers: { Authorization: AUTH },
    });
    const gData = await gRes.json();
    console.log("\nGET /product/" + v.id + ":", gRes.status, JSON.stringify(gData, null, 2));
  }
}

main();
