const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) { console.log(text); }
  return { status: res.status, data: res.ok ? JSON.parse(text) : text };
}

async function main() {
  // 1. Search by nameNO=finanssjef to confirm id 1577
  const r1 = await api("GET", "/employee/employment/occupationCode?nameNO=finanssjef&count=10&fields=id,nameNO,code");
  console.log("nameNO=finanssjef:", JSON.stringify(r1.data.values));

  // 2. Search by code=1211 with high count to see if any code starts with 1211
  const r2 = await api("GET", "/employee/employment/occupationCode?code=1211&count=200&fields=id,nameNO,code");
  const codes1211 = (r2.data.values || []).filter((o: any) => String(o.code).startsWith("1211"));
  console.log(`Codes starting with 1211 (out of ${r2.data.count} total matches):`, JSON.stringify(codes1211));

  // 3. Also try nameNO=økonomisjef to see alternatives
  const r3 = await api("GET", "/employee/employment/occupationCode?nameNO=%C3%B8konomisjef&count=10&fields=id,nameNO,code");
  console.log("nameNO=økonomisjef:", JSON.stringify(r3.data.values));

  // 4. Try nameNO=finans to see all finans* codes
  const r4 = await api("GET", "/employee/employment/occupationCode?nameNO=finans&count=20&fields=id,nameNO,code");
  console.log("nameNO=finans:", JSON.stringify(r4.data.values));
}

main().catch(e => { console.error(e); process.exit(1); });
