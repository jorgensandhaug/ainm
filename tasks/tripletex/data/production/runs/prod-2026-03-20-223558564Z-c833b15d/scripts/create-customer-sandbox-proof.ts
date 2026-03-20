const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const token =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const url = `${baseUrl.replace(/\/+$/, "")}/customer`;
const auth = Buffer.from(`0:${token}`).toString("base64");

const payload = {
  name: "Colline Reflection c833b15d SARL",
  email: "post-reflection-c833b15d@colline.no",
  organizationNumber: "999833115",
  postalAddress: {
    addressLine1: "Kirkegata 77",
    postalCode: "4611",
    city: "Kristiansand",
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

if (!response.ok) {
  throw new Error(`HTTP ${response.status}: ${text}`);
}

console.log(text);
