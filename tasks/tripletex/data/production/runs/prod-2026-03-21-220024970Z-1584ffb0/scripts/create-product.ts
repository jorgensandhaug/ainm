const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "vEWGfhHBJGWHlUUT8ecgnvyE68WWcZuhPdn-UdlRt68";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: GET outgoing VAT types to find the 15% row
const vatRes = await fetch(
  `${BASE}/ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*`,
  { headers: H }
);
const vatData = await vatRes.json();
console.log("VAT status:", vatRes.status);

const rows = vatData.values ?? vatData.fullResultSize ? vatData.values : [];
const match = rows.filter((r: any) => r.percentage === 15);
console.log("15% OUTGOING matches:", JSON.stringify(match.map((r: any) => ({ id: r.id, number: r.number, percentage: r.percentage, name: r.name }))));

if (match.length === 0) {
  console.error("No 15% OUTGOING VAT type found — blocked");
  process.exit(1);
}

// Pick the base outgoing 15% code (lowest id among matches)
const vatType = match.sort((a: any, b: any) => a.id - b.id)[0];
console.log("Selected vatType:", vatType.id, vatType.name);

// Step 2: POST product
const body = {
  name: "Eplejuice",
  number: 9026,
  priceExcludingVatCurrency: 49700,
  vatType: { id: vatType.id },
};

const prodRes = await fetch(`${BASE}/product`, {
  method: "POST",
  headers: H,
  body: JSON.stringify(body),
});
const prodData = await prodRes.json();
console.log("Product status:", prodRes.status);
console.log("Product response:", JSON.stringify(prodData.value ?? prodData, null, 2));
