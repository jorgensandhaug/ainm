const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}/${path}`, { headers: h });
  return (await r.json() as any);
}

// Get ALL banks and find ones that support specific CSV formats
const allBanks = await get("bank?count=500&fields=id,name,bankStatementFileFormatSupport");
const csvBanks = allBanks.values.filter((b: any) => {
  const formats = b.bankStatementFileFormatSupport || [];
  return formats.some((f: string) => f.includes("CSV") || f.includes("ZTL") || f.includes("VISMA"));
});
console.log("Banks with CSV/ZTL/VISMA support:");
for (const b of csvBanks) {
  console.log(`  ${b.id}: ${b.name} → ${b.bankStatementFileFormatSupport.join(", ")}`);
}
