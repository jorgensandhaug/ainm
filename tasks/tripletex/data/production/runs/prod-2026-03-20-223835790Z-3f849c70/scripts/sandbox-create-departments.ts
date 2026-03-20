const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const suffix = Date.now().toString().slice(-6);
const departments = [
  { name: `Ref HR ${suffix}` },
  { name: `Ref Salg ${suffix}` },
  { name: `Ref Økonomi ${suffix}` },
];

const url = new URL("department/list", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
const response = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Basic ${Buffer.from(`0:${token}`).toString("base64")}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify(departments),
});

const text = await response.text();
const body = text ? JSON.parse(text) : null;
console.log(JSON.stringify({ status: response.status, departments, body }, null, 2));

if (!response.ok) {
  process.exit(1);
}
