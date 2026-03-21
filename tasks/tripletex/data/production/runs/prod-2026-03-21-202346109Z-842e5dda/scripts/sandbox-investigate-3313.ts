const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} /${path} → ${r.status}`);
  if (!r.ok) console.log("ERROR:", JSON.stringify(json, null, 2));
  return json;
}

async function main() {
  // 1. Search occupation codes with nameNO=regnskapsfører (what we used in prod)
  console.log("=== nameNO=regnskapsfører ===");
  const res1 = await api("GET", "employee/employment/occupationCode?nameNO=regnskapsfører&count=20&fields=id,nameNO,code");
  console.log("Results:", JSON.stringify(res1.values, null, 2));
  console.log("Full result size:", res1.fullResultSize);

  // 2. Search by code containing 3313 (to see what 7-digit codes exist)
  console.log("\n=== code=3313 ===");
  const res2 = await api("GET", "employee/employment/occupationCode?code=3313&count=20&fields=id,nameNO,code");
  console.log("Results:", JSON.stringify(res2.values, null, 2));
  console.log("Full result size:", res2.fullResultSize);

  // 3. What is the exact code for id 4672?
  console.log("\n=== id 4672 details ===");
  const res3 = await api("GET", "employee/employment/occupationCode/4672?fields=*");
  console.log("Details:", JSON.stringify(res3.value, null, 2));

  // 4. Also check what STYRK 3313 is in Norwegian occupation classification
  // STYRK 3313 = Regnskapsførere. Let me also try broader search
  console.log("\n=== nameNO=bokfør ===");
  const res4 = await api("GET", "employee/employment/occupationCode?nameNO=bokfør&count=10&fields=id,nameNO,code");
  console.log("Results:", JSON.stringify(res4.values, null, 2));

  // 5. Try a more specific search for accounting-related codes
  console.log("\n=== nameNO=regnskap ===");
  const res5 = await api("GET", "employee/employment/occupationCode?nameNO=regnskap&count=20&fields=id,nameNO,code");
  console.log("Results:", JSON.stringify(res5.values, null, 2));
  console.log("Full result size:", res5.fullResultSize);
}

main().catch((e) => { console.error(e); process.exit(1); });
