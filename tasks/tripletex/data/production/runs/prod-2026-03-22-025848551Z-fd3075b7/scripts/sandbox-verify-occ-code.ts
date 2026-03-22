const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function main() {
  // Verify Markedsanalytiker occupation code
  const res = await fetch(`${BASE}/employee/employment/occupationCode?nameNO=Markedsanalytiker&count=10&fields=id,nameNO,code`, {
    headers: { Authorization: AUTH },
  });
  const data = await res.json();
  console.log("Markedsanalytiker lookup:", JSON.stringify(data.values, null, 2));

  // Also verify by id=3544
  const res2 = await fetch(`${BASE}/employee/employment/occupationCode/3544?fields=id,nameNO,code`, {
    headers: { Authorization: AUTH },
  });
  const data2 = await res2.json();
  console.log("\nDirect lookup id=3544:", JSON.stringify(data2.value, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
