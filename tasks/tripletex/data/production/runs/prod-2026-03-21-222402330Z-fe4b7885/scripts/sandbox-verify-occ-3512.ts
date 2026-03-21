const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const r = await fetch(url, { method, headers: H });
  const data = await r.json();
  console.log(`  → ${r.status}`, JSON.stringify(data, null, 2));
  return data;
}

// Search by brukerstøtte to see all matches
console.log("=== Search: brukerstøtte ===");
await api("GET", "/employee/employment/occupationCode?nameNO=brukerstøtte&count=20&fields=id,nameNO,code");

// Search by IKT to see related codes
console.log("\n=== Search: IKT-brukerstøtte ===");
await api("GET", "/employee/employment/occupationCode?nameNO=IKT-brukerstøtte&count=20&fields=id,nameNO,code");

// Search by code containing 3512
console.log("\n=== Search: code=3512 ===");
await api("GET", "/employee/employment/occupationCode?code=3512&count=20&fields=id,nameNO,code");

// Get details of id 752 specifically
console.log("\n=== Get id 752 details ===");
await api("GET", "/employee/employment/occupationCode/752?fields=*");
