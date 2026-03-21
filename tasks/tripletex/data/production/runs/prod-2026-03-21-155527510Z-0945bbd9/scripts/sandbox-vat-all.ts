const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const r = await fetch(url, { method, headers: { Authorization: AUTH } });
  const json = await r.json();
  console.log(`${method} ${path} → ${r.status}`);
  return json.values || json.value || json;
}

const vatTypes = await api("GET", "/ledger/vatType?fields=*&count=100");
console.log("\nAll VAT types:");
for (const v of vatTypes as any[]) {
  if (v.percentage === 25 || v.number === 3) {
    console.log(`  id=${v.id} name=${v.name} percentage=${v.percentage} number=${v.number} typeOfVat=${v.typeOfVat}`);
  }
}

// Also show all outgoing types
console.log("\nAll outgoing VAT types:");
for (const v of vatTypes as any[]) {
  if (v.typeOfVat === "OUTGOING") {
    console.log(`  id=${v.id} name=${v.name} percentage=${v.percentage} number=${v.number}`);
  }
}

// Show types with percentage > 0
console.log("\nVAT types with percentage > 0:");
for (const v of vatTypes as any[]) {
  if (v.percentage > 0) {
    console.log(`  id=${v.id} name=${v.name} percentage=${v.percentage} number=${v.number} typeOfVat=${v.typeOfVat}`);
  }
}
