const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const suffix = "64b4936f";

const payload = {
  name: `Codex Reflection ${suffix} AS`,
  email: `post-reflection-${suffix}@example.no`,
  organizationNumber: "999493664",
  postalAddress: {
    addressLine1: "Fjordveien 129",
    postalCode: "2317",
    city: "Hamar",
  },
};

const auth = Buffer.from(`0:${sessionToken}`).toString("base64");

const response = await fetch(`${baseUrl}/customer`, {
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
  console.error(
    JSON.stringify(
      {
        status: response.status,
        body: text,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(text);
