const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  });
  const text = await res.text();
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) { console.error(text); return null; }
  return JSON.parse(text);
}

async function main() {
  // 1. Verify nameNO=innkjøper search returns id 2503 with full details
  const r1 = await api("GET", `/employee/employment/occupationCode?nameNO=${encodeURIComponent("innkjøper")}&count=5&fields=*`);
  console.log("nameNO=innkjøper results:", JSON.stringify(r1, null, 2));

  // 2. Also check what code=3323 returns (to understand the ambiguity)
  const r2 = await api("GET", `/employee/employment/occupationCode?code=3323&count=20&fields=*`);
  console.log("code=3323 results:", JSON.stringify(r2, null, 2));

  // 3. Verify id=2503 directly
  const r3 = await api("GET", `/employee/employment/occupationCode?id=2503&fields=*`);
  console.log("id=2503 details:", JSON.stringify(r3, null, 2));
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
