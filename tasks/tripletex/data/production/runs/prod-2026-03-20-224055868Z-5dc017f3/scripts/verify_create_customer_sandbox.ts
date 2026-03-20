const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const url = new URL("customer", `${baseUrl}/`);
const auth = Buffer.from(`0:${sessionToken}`).toString("base64");

const payload = {
  name: "Río Verde Reflection 017503 AS",
  email: "post-reflection-017503@rio.no",
  organizationNumber: "999017503",
  postalAddress: {
    addressLine1: "Solveien 5",
    postalCode: "4006",
    city: "Stavanger",
  },
};

const response = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify(payload),
});

const text = await response.text();

console.log(
  JSON.stringify(
    {
      status: response.status,
      body: text ? JSON.parse(text) : null,
    },
    null,
    2,
  ),
);

if (!response.ok) {
  process.exit(1);
}
