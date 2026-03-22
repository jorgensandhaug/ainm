/**
 * Find the actual company org number in the sandbox.
 * Check if buyer mismatch in EHF XML affects supplierInvoice creation.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${btoa("0:" + TOKEN)}`;

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method, headers: { Authorization: AUTH } });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, ok: res.ok, data };
}

async function main() {
  // Get company info
  const compRes = await api("GET", "/company/1?fields=*");
  if (compRes.ok) {
    const c = compRes.data.value;
    console.log("Company:", JSON.stringify({
      id: c.id,
      name: c.name,
      organizationNumber: c.organizationNumber,
      type: c.type,
    }, null, 2));
  }

  // Get logged-in user info
  const meRes = await api("GET", "/token/session/>whoAmI?fields=*");
  console.log("\nWhoAmI:", JSON.stringify(meRes.data, null, 2).substring(0, 500));

  // Get company with full details
  const comp2 = await api("GET", "/company?fields=*");
  if (comp2.ok) {
    for (const c of (comp2.data.values || []).slice(0, 3)) {
      console.log(`\nCompany: id=${c.id} name="${c.name}" org="${c.organizationNumber}" type=${c.type}`);
    }
  }
}

main().catch(console.error);
