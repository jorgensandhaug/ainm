const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const payload = {
  name: "Northwave Reflection 8693c94a AS",
  email: "post-reflection-8693c94a@northwave.no",
  organizationNumber: "999869394",
  postalAddress: {
    addressLine1: "Nygata 39",
    postalCode: "2317",
    city: "Hamar",
  },
};

const apiUrl = new URL("customer", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
const auth = Buffer.from(`0:${sessionToken}`).toString("base64");

const response = await fetch(apiUrl, {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify(payload),
});

const text = await response.text();

if (!response.ok) {
  console.error(text);
  process.exit(1);
}

console.log(text);
