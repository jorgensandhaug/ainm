const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// Verify the same one-call path in sandbox with unique payload
const res = await fetch(`${BASE}/customer`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Nordlys Reflection b2cb8ce1 AS",
    organizationNumber: "999828211",
    email: "post-reflection-b2cb8ce1@nordlys.no",
    postalAddress: {
      addressLine1: "Parkveien 45",
      postalCode: "5003",
      city: "Bergen",
    },
  }),
});

const data = await res.json();
console.log("Status:", res.status);
const v = data.value;
console.log("ID:", v.id);
console.log("Name:", v.name);
console.log("OrgNum:", v.organizationNumber);
console.log("Email:", v.email);
console.log("Address:", v.postalAddress?.addressLine1, v.postalAddress?.postalCode, v.postalAddress?.city);
console.log("InvoiceSendMethod:", v.invoiceSendMethod);
console.log("PhysicalAddress (sparse link):", JSON.stringify(v.physicalAddress));
