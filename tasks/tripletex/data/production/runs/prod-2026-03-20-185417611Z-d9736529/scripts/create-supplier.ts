const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "n4gGEPPjtCHog5MJCFmm5Qyi7vH1JJbNDdOWR9xKzUU";

const supplierPayload = {
  name: "Skogheim AS",
  organizationNumber: "993130494",
  email: "faktura@skogheim.no",
};

const auth = Buffer.from(`0:${sessionToken}`).toString("base64");
const url = new URL("supplier", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);

const response = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify(supplierPayload),
});

const text = await response.text();
let parsed: unknown = null;

if (text) {
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
}

if (!response.ok) {
  console.error(
    JSON.stringify(
      {
        status: response.status,
        body: parsed,
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
      body: parsed,
    },
    null,
    2,
  ),
);
