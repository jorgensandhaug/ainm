const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function main() {
  const uid = Date.now().toString().slice(-6);
  const res = await fetch(`${BASE_URL}/customer`, {
    method: "POST",
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `Oakwood Reflection ${uid} Ltd`,
      organizationNumber: `999${uid}`,
      email: `post-reflection-${uid}@oakwood.no`,
      postalAddress: {
        addressLine1: "Torggata 10",
        postalCode: "6003",
        city: "Ålesund"
      }
    })
  });
  const json = await res.json();
  console.log("POST Status:", res.status);
  console.log(JSON.stringify(json, null, 2));

  if (res.ok && json.value?.id) {
    const vRes = await fetch(`${BASE_URL}/customer/${json.value.id}?fields=*`, {
      headers: { "Authorization": AUTH }
    });
    const vJson = await vRes.json();
    console.log("\nVerification GET:");
    console.log(JSON.stringify(vJson, null, 2));

    // Verify fields
    const c = vJson.value;
    console.log("\n--- Field verification ---");
    console.log("name:", c.name);
    console.log("organizationNumber:", c.organizationNumber);
    console.log("email:", c.email);
    console.log("postalAddress.addressLine1:", c.postalAddress?.addressLine1 ?? "(sparse link)");
    console.log("postalAddress.postalCode:", c.postalAddress?.postalCode ?? "(sparse link)");
    console.log("postalAddress.city:", c.postalAddress?.city ?? "(sparse link)");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
