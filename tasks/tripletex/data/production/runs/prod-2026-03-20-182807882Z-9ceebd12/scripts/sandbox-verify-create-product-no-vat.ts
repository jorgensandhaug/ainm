const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const auth = `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;

const headers = {
  Authorization: auth,
  Accept: "application/json",
  "Content-Type": "application/json",
};

const productNumber = `8913${Date.now().toString().slice(-7)}`;

const response = await fetch(`${baseUrl}/product`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    name: "Stockage cloud sandbox no-vat verification",
    number: productNumber,
    priceExcludingVatCurrency: 26850,
  }),
});

const text = await response.text();
const data = text ? JSON.parse(text) : null;

if (!response.ok) {
  console.error(JSON.stringify({ status: response.status, data }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(data, null, 2));
