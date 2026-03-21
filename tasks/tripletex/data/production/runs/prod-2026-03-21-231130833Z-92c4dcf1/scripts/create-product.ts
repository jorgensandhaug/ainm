const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "jl1FfQ2LBgogaMOgeAtfxQz3tXl5VBS7o3NaYuFg56U";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: GET outgoing VAT types to find 0%
const vatResp = await fetch(
  `${BASE}/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-22&fields=*`,
  { headers: H }
);
const vatData = await vatResp.json();
console.log("VAT status:", vatResp.status);
const vatTypes = vatData.values ?? vatData.fullResultSize ? vatData.values : [vatData.value];
const zeroVat = vatTypes.find((v: any) => v.percentage === 0);
if (!zeroVat) { console.error("No 0% OUTGOING vatType found"); process.exit(1); }
console.log("0% vatType id:", zeroVat.id, "name:", zeroVat.name);

// Step 2: POST /product
const product = {
  name: "Avis",
  number: 2061,
  priceExcludingVatCurrency: 4150,
  vatType: { id: zeroVat.id },
};
const prodResp = await fetch(`${BASE}/product`, {
  method: "POST",
  headers: H,
  body: JSON.stringify(product),
});
const prodData = await prodResp.json();
console.log("Product status:", prodResp.status);
console.log("Product:", JSON.stringify(prodData.value, null, 2));
