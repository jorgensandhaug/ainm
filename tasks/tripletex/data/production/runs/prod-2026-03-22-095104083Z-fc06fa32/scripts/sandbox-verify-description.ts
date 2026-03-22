const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const uid = Math.random().toString(36).slice(2, 10);

async function main() {
  // Test 1: POST /customer with name + organizationNumber + description (no email, no address)
  const res = await fetch(`${BASE}/customer`, {
    method: "POST",
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `Description Test ${uid}`,
      organizationNumber: "999" + uid.slice(0, 6).replace(/[^0-9]/g, "1"),
      description: "This is a test description with multi-line content.\nLine 2.\nLine 3 with special chars: æøå ÆØÅ — €",
    }),
  });
  const data = await res.json();
  console.log("POST /customer status:", res.status);
  console.log("Response:", JSON.stringify(data, null, 2));

  // Verify description is stored and returned
  const v = data.value;
  if (v) {
    console.log("\n--- Verification ---");
    console.log("name:", v.name);
    console.log("organizationNumber:", v.organizationNumber);
    console.log("description:", v.description);
    console.log("description length:", v.description?.length);
    console.log("description preserved?", v.description?.includes("æøå") && v.description?.includes("—") && v.description?.includes("€"));
    console.log("email (should be empty):", JSON.stringify(v.email));
  }

  // Test 2: GET back to confirm persistence
  if (v?.id) {
    const getRes = await fetch(`${BASE}/customer/${v.id}?fields=*`, {
      headers: { "Authorization": AUTH },
    });
    const getData = await getRes.json();
    console.log("\nGET /customer/" + v.id + " status:", getRes.status);
    console.log("GET description:", getData.value?.description);
    console.log("Description matches:", getData.value?.description === v.description);
  }
}

main();
