const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const opts: RequestInit = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`\n${method} /${path} → ${res.status}`);
  if (!res.ok) {
    console.log("ERROR:", text);
    return null;
  }
  if (!text) return null;
  const json = JSON.parse(text);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

// 1. Check what nameNO=seniorutvikler returns
console.log("=== Search: seniorutvikler ===");
const r1 = await api("GET", "employee/employment/occupationCode?nameNO=seniorutvikler&count=10&fields=*");
console.log("Results:", JSON.stringify(r1, null, 2));

// 2. Check what nameNO=utvikler returns
console.log("\n=== Search: utvikler ===");
const r2 = await api("GET", "employee/employment/occupationCode?nameNO=utvikler&count=10&fields=*");
console.log("Results:", JSON.stringify(r2, null, 2));

// 3. Check what nameNO=systemutvikler returns
console.log("\n=== Search: systemutvikler ===");
const r3 = await api("GET", "employee/employment/occupationCode?nameNO=systemutvikler&count=10&fields=*");
console.log("Results:", JSON.stringify(r3, null, 2));

// 4. Check what nameNO=programvareutvikler returns
console.log("\n=== Search: programvareutvikler ===");
const r4 = await api("GET", "employee/employment/occupationCode?nameNO=programvareutvikler&count=10&fields=*");
console.log("Results:", JSON.stringify(r4, null, 2));

// 5. Check what nameNO=programmerer returns
console.log("\n=== Search: programmerer ===");
const r5 = await api("GET", "employee/employment/occupationCode?nameNO=programmerer&count=10&fields=*");
console.log("Results:", JSON.stringify(r5, null, 2));
