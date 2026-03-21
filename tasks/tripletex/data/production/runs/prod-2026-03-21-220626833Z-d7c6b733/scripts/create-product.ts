const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "x_XyXmjXHyxnP1Ha6ijvvpPCtrWWFofbsOwlk9zrcBg";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/product`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Training Session",
    number: 7908,
    priceExcludingVatCurrency: 26250,
  }),
});

const data = await res.json();
console.log("Status:", res.status);
console.log(JSON.stringify(data, null, 2));

if (res.ok) {
  const v = data.value;
  console.log("\n--- Verification ---");
  console.log("id:", v.id);
  console.log("name:", v.name);
  console.log("number:", v.number);
  console.log("priceExcludingVatCurrency:", v.priceExcludingVatCurrency);
  console.log("priceIncludingVatCurrency:", v.priceIncludingVatCurrency);
  console.log("vatType.id:", v.vatType?.id, "percentage:", v.vatType?.percentage);
  const expectedIncl = 26250 * 1.25;
  console.log("expected inclVAT:", expectedIncl, "match:", v.priceIncludingVatCurrency === expectedIncl);
}
