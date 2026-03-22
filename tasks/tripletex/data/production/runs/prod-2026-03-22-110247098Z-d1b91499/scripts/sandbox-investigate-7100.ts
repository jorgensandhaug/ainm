const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string) {
  const r = await fetch(`${BASE}${path}`, { method, headers: H });
  return r.json();
}

async function main() {
  // Check account 7100 details - especially vatType lock
  const acct = await api("GET", "/ledger/account?number=7100&fields=*");
  console.log("Account 7100:");
  console.log(JSON.stringify(acct.values[0], null, 2));

  // Check isApplicableForSupplierInvoice on 7100
  const acctFiltered = await api("GET", "/ledger/account?number=7100&isApplicableForSupplierInvoice=true&fields=*");
  console.log("\nAccount 7100 with isApplicableForSupplierInvoice=true:");
  console.log(`count=${acctFiltered.count}`);

  // Check a few other accounts for comparison
  for (const num of [6300, 6500, 6540, 7140]) {
    const a = await api("GET", `/ledger/account?number=${num}&fields=id,number,name,vatType`);
    const v = a.values?.[0];
    console.log(`\nAccount ${num}: name=${v?.name}, vatType=${JSON.stringify(v?.vatType)}`);

    const af = await api("GET", `/ledger/account?number=${num}&isApplicableForSupplierInvoice=true&fields=id,number`);
    console.log(`  isApplicableForSupplierInvoice filter: count=${af.count}`);
  }

  // Check what vatType id=0 is
  const vt0 = await api("GET", "/ledger/vatType?id=0&fields=*");
  console.log("\nvatType id=0:");
  console.log(JSON.stringify(vt0, null, 2));
}

main().catch(console.error);
