const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const AUTH = "Basic " + btoa("0:eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9");
const h = { "Content-Type": "application/json", Authorization: AUTH };

async function main() {
  const TODAY = new Date().toISOString().slice(0, 10);

  // Check ALL vatTypes (not just outgoing)
  const r1 = await fetch(`${BASE}/ledger/vatType?count=100&fields=id,name,percentage`, { headers: h });
  const all = await r1.json();
  console.log("ALL vatTypes:");
  for (const v of all.values) {
    console.log(`  id=${v.id} name="${v.name}" pct=${v.percentage}%`);
  }

  // Check outgoing only
  const r2 = await fetch(`${BASE}/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&count=100&fields=id,name,percentage`, { headers: h });
  const outgoing = await r2.json();
  console.log("\nOUTGOING vatTypes:");
  for (const v of outgoing.values) {
    console.log(`  id=${v.id} name="${v.name}" pct=${v.percentage}%`);
  }

  const has3 = outgoing.values.some((v: any) => v.id === 3);
  console.log("\nvatType id=3 in outgoing list:", has3);
}

main().catch(e => console.error("FATAL:", e.message));
