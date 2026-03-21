const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function main() {
  const res = await fetch(`${BASE}/project?count=50&fields=*,customer(*),projectManager(*)`, {
    headers: { Authorization: AUTH },
  });
  const data = await res.json();
  console.log(`Found ${data.values?.length || 0} projects:`);
  for (const p of data.values || []) {
    console.log(`  id=${p.id} name="${p.name}" fixedprice=${p.fixedprice} isFixedPrice=${p.isFixedPrice} customer="${p.customer?.name}" (${p.customer?.organizationNumber}) pm=${p.projectManager?.email}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
