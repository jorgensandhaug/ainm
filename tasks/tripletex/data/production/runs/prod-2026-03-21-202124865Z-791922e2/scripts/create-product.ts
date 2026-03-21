const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "alwaXPhThKHggJ0xwSty2fExAN6xs9uAyztKHz-k7kk";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/product`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Datenberatung",
    number: 7855,
    priceExcludingVatCurrency: 41550,
  }),
});

const data = await res.json();
console.log("Status:", res.status);
console.log(JSON.stringify(data, null, 2));

if (res.status === 201) {
  const v = data.value;
  console.log("\n=== Verification ===");
  console.log("id:", v.id);
  console.log("name:", v.name);
  console.log("number:", v.number);
  console.log("priceExcludingVatCurrency:", v.priceExcludingVatCurrency);
  console.log("priceIncludingVatCurrency:", v.priceIncludingVatCurrency);
  console.log("vatType.id:", v.vatType?.id);
  console.log("vatType.percentage:", v.vatType?.percentage);
  const expected = 41550 * 1.25;
  console.log("expected incl VAT:", expected);
  console.log("match:", v.priceIncludingVatCurrency === expected);
}
