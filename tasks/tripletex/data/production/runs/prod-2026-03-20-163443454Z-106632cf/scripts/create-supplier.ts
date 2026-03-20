const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const token = "3dHc7QQptmDzPCT9ENn7uDy-_zpgf20UurNZE-qs62Q";

const payload = {
  name: "Río Verde SL",
  organizationNumber: "839568630",
  email: "faktura@roverdesl.no",
};

const response = await fetch(`${baseUrl}/supplier`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${Buffer.from(`0:${token}`).toString("base64")}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify(payload),
});

const text = await response.text();
let body: unknown = null;

try {
  body = text ? JSON.parse(text) : null;
} catch {
  body = text;
}

if (!response.ok) {
  console.error(
    JSON.stringify(
      {
        status: response.status,
        body,
      },
      null,
      2,
    ),
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      status: response.status,
      body,
    },
    null,
    2,
  ),
);
