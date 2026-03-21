const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: AUTH },
  });
  const text = await res.text();
  if (!res.ok) { console.log(`${res.status}: ${text}`); return null; }
  return JSON.parse(text);
}

async function main() {
  // VAT types
  const vat = await api("GET", `/ledger/vatType?fields=*`);
  if (vat?.values) {
    for (const v of vat.values.slice(0, 20)) {
      console.log(`id=${v.id} number=${v.number} name=${v.name} percentage=${v.percentage}`);
    }
  }

  // Also get account 1920 id
  const accts = await api("GET", `/ledger/account?numberFrom=1920&numberTo=1920&fields=id,number,name`);
  if (accts?.values) {
    for (const a of accts.values) {
      console.log(`Account: id=${a.id} number=${a.number} name=${a.name}`);
    }
  }
}

main().catch(console.error);
