const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "6mKkUVZzAWZ2A3pdSA9u__rJekiz9gMQzq9HzDK0YcY";

const payload = {
  name: "Fjordkraft AS",
  email: "post@fjordkraft.no",
  organizationNumber: "843216285",
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
