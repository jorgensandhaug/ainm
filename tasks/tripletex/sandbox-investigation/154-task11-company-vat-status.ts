const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa("0:" + TOKEN)}`;

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  // Check company info
  const company = await api("GET", "/company/1?fields=*");
  if (company.ok) {
    const c = company.data.value;
    console.log("=== COMPANY INFO ===");
    console.log(`  name: ${c.name}`);
    console.log(`  organizationNumber: ${c.organizationNumber}`);
    console.log(`  vatRegistered: ${c.vatRegistered}`);
    console.log(`  isVatRegistered: ${c.isVatRegistered}`);
    // Print all keys that might relate to VAT
    for (const [k, v] of Object.entries(c)) {
      if (String(k).toLowerCase().includes('vat') || String(k).toLowerCase().includes('mva') || String(k).toLowerCase().includes('tax')) {
        console.log(`  ${k}: ${JSON.stringify(v)}`);
      }
    }
  }

  // Also check company settings
  const settings = await api("GET", "/company/settings/altinn?fields=*");
  console.log("\n=== ALTINN SETTINGS ===");
  console.log(`  ${settings.status}: ${JSON.stringify(settings.data).substring(0, 500)}`);

  // Check sales modules for VAT-related modules
  const modules = await api("GET", "/company/salesmodules?fields=*");
  if (modules.ok) {
    console.log("\n=== SALES MODULES ===");
    for (const m of modules.data.values || []) {
      console.log(`  ${m.name}`);
    }
  }

  // Check company with specific VAT fields
  const comp2 = await api("GET", "/company?fields=id,name,organizationNumber,type");
  console.log("\n=== COMPANY LIST ===");
  console.log(JSON.stringify(comp2.data).substring(0, 500));

  // Check /ledger/vatType for incoming
  const vatTypes = await api("GET", "/ledger/vatType?typeOfVat=INCOMING&fields=id,number,percentage,name,displayName");
  console.log("\n=== INCOMING VAT TYPES ===");
  for (const vt of (vatTypes.data?.values || [])) {
    console.log(`  id=${vt.id} num=${vt.number} pct=${vt.percentage}% name="${vt.name || vt.displayName}"`);
  }
}

main().catch(console.error);
