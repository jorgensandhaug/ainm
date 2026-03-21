const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(path: string) {
  const url = `${BASE}/${path}`;
  const res = await fetch(url, {
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  });
  const text = await res.text();
  console.log(`\nGET /${path} → ${res.status}`);
  if (!res.ok) return null;
  const json = JSON.parse(text);
  return json.values ?? json.value ?? json;
}

// Check if nameNO=senior matches anything with "seniorutvikler" or "senior"
console.log("=== nameNO=senior (count=20) ===");
const r = await api("employee/employment/occupationCode?nameNO=senior&count=20&fields=id,nameNO,code");
if (Array.isArray(r)) {
  r.forEach((x: any) => console.log(`  id=${x.id} nameNO=${x.nameNO} code=${x.code}`));
  console.log(`Total: ${r.length}`);
}

// Also try "seniorkonsulent" since that's another common "Senior" prefixed title
console.log("\n=== nameNO=seniorkonsulent ===");
const r2 = await api("employee/employment/occupationCode?nameNO=seniorkonsulent&count=5&fields=id,nameNO,code");
if (Array.isArray(r2)) {
  r2.forEach((x: any) => console.log(`  id=${x.id} nameNO=${x.nameNO} code=${x.code}`));
}

// Try "senioringeniør"
console.log("\n=== nameNO=senioringeniør ===");
const r3 = await api("employee/employment/occupationCode?nameNO=senioringeni%C3%B8r&count=5&fields=id,nameNO,code");
if (Array.isArray(r3)) {
  r3.forEach((x: any) => console.log(`  id=${x.id} nameNO=${x.nameNO} code=${x.code}`));
}

// Try "seniorrådgiver"
console.log("\n=== nameNO=seniorrådgiver ===");
const r4 = await api("employee/employment/occupationCode?nameNO=seniorr%C3%A5dgiver&count=5&fields=id,nameNO,code");
if (Array.isArray(r4)) {
  r4.forEach((x: any) => console.log(`  id=${x.id} nameNO=${x.nameNO} code=${x.code}`));
}
