const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method, headers: { Authorization: AUTH } });
  const text = await res.text();
  console.log(`${method} ${path.substring(0, 80)} -> ${res.status}`);
  if (!res.ok) { console.log(`  ERROR: ${text.substring(0, 200)}`); return null; }
  return JSON.parse(text);
}

async function main() {
  // Test: number=8060 (comma-separated single)
  console.log("=== number=8060 ===");
  const r1 = await api("GET", `/ledger/account?number=8060&fields=id,number,name`);
  console.log(`  count=${r1?.count} values=${JSON.stringify(r1?.values?.map((a: any) => `${a.number}:${a.id}`))}`);

  // Test: number=1920,8060 (comma-separated)
  console.log("\n=== number=1920,8060 ===");
  const r2 = await api("GET", `/ledger/account?number=1920,8060&fields=id,number,name`);
  console.log(`  count=${r2?.count} values=${JSON.stringify(r2?.values?.map((a: any) => `${a.number}:${a.id}:${a.name}`))}`);

  // Test: number=8060,8160 (both FX accounts)
  console.log("\n=== number=8060,8160 ===");
  const r3 = await api("GET", `/ledger/account?number=8060,8160&fields=id,number,name`);
  console.log(`  count=${r3?.count} values=${JSON.stringify(r3?.values?.map((a: any) => `${a.number}:${a.id}:${a.name}`))}`);
}

main().catch(console.error);
