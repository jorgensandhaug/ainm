const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "LpgJdu3kEssLbofWoif-r9y2W_ltEEsaoFLEYKsWzlA";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: GET outgoing VAT types to resolve 0% id
const vatRes = await fetch(`${BASE}/ledger/vatType?typeOfVat=OUTGOING&fields=*`, { headers: H });
const vatData = await vatRes.json();
console.log("VAT status:", vatRes.status);
const vatRows = vatData.values ?? [vatData.value];
const zeroVat = vatRows.find((v: any) => v.percentage === 0);
if (!zeroVat) { console.error("No 0% OUTGOING VAT found"); process.exit(1); }
console.log("0% VAT row:", JSON.stringify({ id: zeroVat.id, percentage: zeroVat.percentage, name: zeroVat.name }));

// Step 2: POST product
const product = {
  name: "Fachbuch",
  number: 2237,
  priceExcludingVatCurrency: 5650,
  vatType: { id: zeroVat.id },
};
const createRes = await fetch(`${BASE}/product`, { method: "POST", headers: H, body: JSON.stringify(product) });
const createData = await createRes.json();
console.log("POST /product status:", createRes.status);
console.log("Created product:", JSON.stringify(createData.value, null, 2));

// Step 3: Verify (GETs are free)
const id = createData.value?.id;
if (id) {
  const verifyRes = await fetch(`${BASE}/product/${id}?fields=*,vatType(*)`, { headers: H });
  const verifyData = await verifyRes.json();
  console.log("Verify:", JSON.stringify({
    id: verifyData.value.id,
    number: verifyData.value.number,
    name: verifyData.value.name,
    priceExcludingVatCurrency: verifyData.value.priceExcludingVatCurrency,
    priceIncludingVatCurrency: verifyData.value.priceIncludingVatCurrency,
    vatType: { id: verifyData.value.vatType?.id, percentage: verifyData.value.vatType?.percentage },
  }));
}
