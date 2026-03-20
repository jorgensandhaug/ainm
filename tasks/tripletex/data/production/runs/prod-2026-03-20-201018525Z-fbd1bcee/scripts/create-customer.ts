const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const token = "QgSuTZZppd1u2EhoZlQr77TiNlkacvE08XNWikWKneo";

const customerUrl = new URL("customer", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
const auth = Buffer.from(`0:${token}`).toString("base64");

const payload = {
  name: "Gr\u00fcnfeld GmbH",
  organizationNumber: "886669445",
  email: "post@grunfeld.no",
  postalAddress: {
    addressLine1: "Kirkegata 87",
    postalCode: "6003",
    city: "\u00c5lesund",
  },
};

const response = await fetch(customerUrl, {
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
