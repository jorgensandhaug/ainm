// Sandbox verification: confirm account 7140 works identically to other accounts
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any, isFormData?: boolean) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH };
  if (body && !isFormData) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (res.status >= 400) {
    console.error("ERROR:", JSON.stringify(data).slice(0, 500));
    throw new Error(`${method} ${path} failed with ${res.status}`);
  }
  return data;
}

// Check account 7140 exists
const accountRes = await api("GET", `/ledger/account?number=7140&isApplicableForSupplierInvoice=true&fields=*`);
console.log(`Account 7140: id=${accountRes.values[0]?.id}, name=${accountRes.values[0]?.name}`);
console.log(`Count: ${accountRes.count}`);

if (accountRes.count === 0) {
  console.log("Account 7140 not found with isApplicableForSupplierInvoice=true, trying without filter...");
  const accountRes2 = await api("GET", `/ledger/account?number=7140&fields=*`);
  console.log(`Without filter: count=${accountRes2.count}, name=${accountRes2.values[0]?.name}`);
}

console.log("Sandbox verification complete for account 7140");
