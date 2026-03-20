import { Buffer } from "node:buffer";

const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2/";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

function authHeader() {
  return `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
}

const response = await fetch(new URL("timesheet/entry", BASE_URL), {
  method: "POST",
  headers: {
    Authorization: authHeader(),
    Accept: "application/json",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    employee: { id: 18565207 },
    project: { id: 401959961 },
    activity: { id: 5588720 },
    date: "2026-03-20",
    hours: 2,
    projectChargeableHours: 2,
  }),
});

const text = await response.text();
console.log(text);
if (!response.ok) {
  process.exit(1);
}
