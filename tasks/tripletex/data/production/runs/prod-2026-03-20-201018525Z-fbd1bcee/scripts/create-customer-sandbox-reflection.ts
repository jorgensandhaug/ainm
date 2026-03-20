const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const customerUrl = new URL("customer", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
const auth = Buffer.from(`0:${token}`).toString("base64");

const payload = {
  name: "Gr\u00fcnfeld Reflection 201018 AS",
  organizationNumber: "999201018",
  email: "post-reflection-201018@grunfeld.no",
  postalAddress: {
    addressLine1: "Kirkegata 87",
    postalCode: "6003",
    city: "\u00c5lesund",
  },
};

const response = await fetch(customerUrl, {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify(payload),
});

const text = await response.text();

console.log(JSON.stringify({ status: response.status, body: JSON.parse(text) }, null, 2));

if (!response.ok) {
  process.exit(1);
}
