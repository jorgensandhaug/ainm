const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "zx3gp1vzJcG8y71Sp36Haw43xWrINCkl8nvIKHAhbbc";

const url = new URL("customer", `${baseUrl}/`);
const auth = Buffer.from(`0:${sessionToken}`).toString("base64");

const payload = {
  name: "Río Verde SL",
  email: "post@rio.no",
  organizationNumber: "919234830",
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

console.log(JSON.stringify({
  status: response.status,
  body: text ? JSON.parse(text) : null,
}, null, 2));

if (!response.ok) {
  process.exit(1);
}
