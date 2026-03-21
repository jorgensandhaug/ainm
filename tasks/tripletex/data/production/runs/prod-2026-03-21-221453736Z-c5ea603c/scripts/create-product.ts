const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "9SlCC0t4ftzdHhXzfgobWSep-8BspEwTR08S54bpoz8";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/product`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Web Design",
    number: 3766,
    priceExcludingVatCurrency: 23950,
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
}
