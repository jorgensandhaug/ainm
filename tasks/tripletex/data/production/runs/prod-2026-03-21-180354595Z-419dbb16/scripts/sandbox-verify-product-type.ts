const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  const r = await fetch(`${BASE}/product?count=10&fields=*`, { headers: H });
  const json = await r.json();
  console.log(`GET /product → ${r.status}`);
  if (json.values && json.values.length > 0) {
    for (const p of json.values.slice(0, 5)) {
      console.log(`  id=${p.id} number=${JSON.stringify(p.number)} (type: ${typeof p.number}) productNumber=${JSON.stringify(p.productNumber)} name=${p.name}`);
    }
  } else {
    console.log("No products found");
  }
}

main().catch(console.error);
