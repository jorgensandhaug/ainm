const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "9XAkrCgA28c49FBRMXz84nRBCe0M3ysePiCbx-lVFnI";

const payload = {
  name: "Northwave Ltd",
  email: "post@northwave.no",
  organizationNumber: "964179239",
  postalAddress: {
    addressLine1: "Nygata 39",
    postalCode: "2317",
    city: "Hamar",
  },
};

const apiUrl = new URL("customer", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
const auth = Buffer.from(`0:${sessionToken}`).toString("base64");

const response = await fetch(apiUrl, {
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
  console.error(text);
  process.exit(1);
}

console.log(text);
