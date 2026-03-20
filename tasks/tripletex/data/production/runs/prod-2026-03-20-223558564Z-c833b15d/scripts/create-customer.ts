const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const token = "2xkK6UjQNSj7qLIo1eM0oYjSmnQpIhw7LDex_-hunfg";

const url = `${baseUrl.replace(/\/+$/, "")}/customer`;
const auth = Buffer.from(`0:${token}`).toString("base64");

const payload = {
  name: "Colline SARL",
  email: "post@colline.no",
  organizationNumber: "939137599",
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
