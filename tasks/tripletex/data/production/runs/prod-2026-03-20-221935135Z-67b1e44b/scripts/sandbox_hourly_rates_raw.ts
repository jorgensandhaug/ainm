import { Buffer } from "node:buffer";

const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2/";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

function authHeader() {
  return `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
}

const url = new URL("project/hourlyRates", BASE_URL);
url.searchParams.set("projectId", "401959961");
url.searchParams.set("count", "100");
url.searchParams.set("fields", "*,projectSpecificRates(*,employee(*),activity(*))");

const response = await fetch(url, {
  headers: {
    Authorization: authHeader(),
    Accept: "application/json",
  },
});

const text = await response.text();
if (!response.ok) {
  throw new Error(`${response.status} ${text}`);
}

console.log(text);
