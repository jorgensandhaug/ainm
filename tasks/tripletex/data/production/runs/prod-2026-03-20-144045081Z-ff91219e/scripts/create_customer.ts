const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const payload = {
  name: "Leaderboard Attribution Test AS",
  email: "leaderboard-attribution@example.no",
  organizationNumber: "999888770",
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
const data = text ? JSON.parse(text) : null;

if (!response.ok) {
  console.error(JSON.stringify({ status: response.status, body: data }, null, 2));
  process.exit(1);
}

const customer = data?.value;

if (
  !customer ||
  customer.name !== payload.name ||
  customer.email !== payload.email ||
  customer.organizationNumber !== payload.organizationNumber
) {
  console.error(JSON.stringify({ error: "Unexpected customer response", body: data }, null, 2));
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      organizationNumber: customer.organizationNumber,
    },
    null,
    2,
  ),
);
