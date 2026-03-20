const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const auth = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

const response = await fetch(`${baseUrl}/product`, {
  method: "POST",
  headers: {
    Authorization: auth,
    Accept: "application/json",
    "Content-Type": "application/json; charset=utf-8",
  },
  body: JSON.stringify({
    name: "Reflection invalid 15%",
    number: `reflection-invalid-${Date.now()}`,
    priceExcludingVatCurrency: 28350,
    vatType: { id: 31 },
  }),
});

const text = await response.text();
const data = text ? JSON.parse(text) : null;

console.log(
  JSON.stringify(
    {
      status: response.status,
      body: data,
    },
    null,
    2,
  ),
);
