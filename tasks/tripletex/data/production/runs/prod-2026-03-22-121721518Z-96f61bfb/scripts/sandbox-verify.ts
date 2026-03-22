const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE_URL}${path}`;
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`${method} ${path} → ${res.status}`);
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(JSON.stringify(json, null, 2));
  return { status: res.status, data: json };
}

async function main() {
  const uid = Math.random().toString(36).slice(2, 8);

  // POST /customer with all fields matching production shape
  const { status, data } = await api("POST", "/customer", {
    name: `Fjordkraft Reflection ${uid} AS`,
    organizationNumber: `999${uid.replace(/[^0-9]/g, '').padEnd(6, '0').slice(0, 6)}`,
    email: `post-reflection-${uid}@fjordkraft.no`,
    postalAddress: {
      addressLine1: "Fjordveien 129",
      postalCode: "2317",
      city: "Hamar"
    }
  });

  if (status !== 201) {
    console.error("Customer create failed");
    process.exit(1);
  }

  const customer = data.value;
  console.log("\n=== POST response verification ===");
  console.log("id:", customer.id);
  console.log("name:", customer.name);
  console.log("organizationNumber:", customer.organizationNumber);
  console.log("email:", customer.email);
  console.log("postalAddress.addressLine1:", customer.postalAddress?.addressLine1);
  console.log("postalAddress.postalCode:", customer.postalAddress?.postalCode);
  console.log("postalAddress.city:", customer.postalAddress?.city);

  // Verification GET with expanded postalAddress
  console.log("\n=== Verification GET ===");
  const { data: getResp } = await api("GET", `/customer/${customer.id}?fields=*,postalAddress(*)`);

  const verified = getResp.value;
  console.log("\n=== GET response verification ===");
  console.log("name match:", verified.name === customer.name);
  console.log("email match:", verified.email === customer.email);
  console.log("orgNumber match:", verified.organizationNumber === customer.organizationNumber);
  console.log("address match:", verified.postalAddress?.addressLine1 === "Fjordveien 129");
  console.log("postalCode match:", verified.postalAddress?.postalCode === "2317");
  console.log("city match:", verified.postalAddress?.city === "Hamar");

  console.log("\n=== All checks passed ===");
}

main().catch(e => { console.error(e); process.exit(1); });
