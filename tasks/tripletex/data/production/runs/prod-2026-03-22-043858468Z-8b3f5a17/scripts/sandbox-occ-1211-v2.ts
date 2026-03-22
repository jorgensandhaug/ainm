const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method: "GET", headers: H });
  return JSON.parse(await res.text());
}

async function main() {
  // Search for exact/near matches for STYRK 1211 = "Finans- og økonomisjef"
  const searches = [
    "finans- og",
    "økonomisjef",
    "finansleder",
    "finanscontroller",
    "controller",
    "økonomileder",
    "regnskapssjef", // already known-correct mapping for this title
  ];

  for (const s of searches) {
    console.log(`\n=== nameNO=${s} ===`);
    const r = await api(`/employee/employment/occupationCode?nameNO=${encodeURIComponent(s)}&count=20&fields=id,nameNO,code`);
    for (const o of (r.values || [])) {
      console.log(`  id=${o.id} code=${o.code} name=${o.nameNO}`);
    }
  }

  // Check the FINANSSJEF code (1577) and ØKONOMISJEF (6538) details
  console.log("\n=== COMPARING CANDIDATES ===");
  const candidates = [1577, 6538];
  for (const id of candidates) {
    const r = await api(`/employee/employment/occupationCode/${id}?fields=*`);
    console.log(`\nid=${id}: ${JSON.stringify(r.value)}`);
  }

  // Also look: does Tripletex have a direct STYRK-08 mapping?
  // Search for IDs near known good ones to find patterns
  console.log("\n=== LOOKING FOR CODES IN 1211xxx RANGE ===");
  // Let's try offset-based iteration
  const r = await api("/employee/employment/occupationCode?code=1211&from=0&count=500&fields=id,nameNO,code&sorting=code");
  console.log(`Total results for code=1211: ${r.count}`);
  const all = r.values || [];
  // Check if any code starts with "1211"
  const starts = all.filter((o: any) => String(o.code).startsWith("1211"));
  console.log(`Starting with 1211: ${starts.length}`);
  if (starts.length > 0) {
    for (const o of starts) {
      console.log(`  id=${o.id} code=${o.code} name=${o.nameNO}`);
    }
  }

  // Also check: what does the WRONG FINANSSJEF id=1577 map to in STYRK?
  // And what is the correct mapping for prior working codes?
  console.log("\n=== VERIFYING: CORRECT vs WRONG occupationCode patterns ===");
  console.log("Pattern: STYRK 3313 correct=REGNSKAPSMEDARBEIDER(4677) wrong=REGNSKAPSFØRER(4672)");
  const check3313 = await api(`/employee/employment/occupationCode/4672?fields=id,nameNO,code`);
  console.log(`WRONG: id=4672 code=${check3313.value?.code} name=${check3313.value?.nameNO}`);
  const check3313c = await api(`/employee/employment/occupationCode/4677?fields=id,nameNO,code`);
  console.log(`CORRECT: id=4677 code=${check3313c.value?.code} name=${check3313c.value?.nameNO}`);

  console.log("Pattern: STYRK 3323 correct=INNKJØPSASSISTENT(2507) wrong=INNKJØPER(2503)");
  const check3323w = await api(`/employee/employment/occupationCode/2503?fields=id,nameNO,code`);
  console.log(`WRONG: id=2503 code=${check3323w.value?.code} name=${check3323w.value?.nameNO}`);
  const check3323c = await api(`/employee/employment/occupationCode/2507?fields=id,nameNO,code`);
  console.log(`CORRECT: id=2507 code=${check3323c.value?.code} name=${check3323c.value?.nameNO}`);
}

main().catch(e => { console.error(e); process.exit(1); });
