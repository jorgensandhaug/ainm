const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "gArdhGE8FGKVxrhgQGAaeAiPLTWSDaomDga2Xn4Jh6k";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/customer`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Oceano Lda",
    organizationNumber: "945727098",
    email: "post@oceano.no",
    postalAddress: {
      addressLine1: "Industriveien 56",
      postalCode: "4611",
      city: "Kristiansand",
    },
  }),
});

const data = await res.json();
console.log("STATUS:", res.status);
console.log("RESPONSE:", JSON.stringify(data, null, 2));

if (res.status === 201) {
  const c = data.value;
  console.log("\n=== VERIFICATION ===");
  console.log("id:", c.id);
  console.log("name:", c.name);
  console.log("organizationNumber:", c.organizationNumber);
  console.log("email:", c.email);
  console.log("postalAddress.addressLine1:", c.postalAddress?.addressLine1);
  console.log("postalAddress.postalCode:", c.postalAddress?.postalCode);
  console.log("postalAddress.city:", c.postalAddress?.city);
}
