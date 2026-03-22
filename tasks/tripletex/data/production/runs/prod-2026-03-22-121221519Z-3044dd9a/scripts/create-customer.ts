const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "IQVflUBIhT0DJ-MljaT5P7UwSPKMFQUCHenjUT7ameY";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function main() {
  const res = await fetch(`${BASE_URL}/customer`, {
    method: "POST",
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Oakwood Ltd",
      organizationNumber: "980094863",
      email: "post@oakwood.no",
      postalAddress: {
        addressLine1: "Torggata 10",
        postalCode: "6003",
        city: "Ålesund"
      }
    })
  });
  const json = await res.json();
  console.log("Status:", res.status);
  console.log(JSON.stringify(json, null, 2));

  if (res.ok && json.value?.id) {
    // Verification GET (free)
    const vRes = await fetch(`${BASE_URL}/customer/${json.value.id}?fields=*`, {
      headers: { "Authorization": AUTH }
    });
    const vJson = await vRes.json();
    console.log("\nVerification GET:");
    console.log(JSON.stringify(vJson, null, 2));
  }
}

main().catch(e => { console.error(e); process.exit(1); });
