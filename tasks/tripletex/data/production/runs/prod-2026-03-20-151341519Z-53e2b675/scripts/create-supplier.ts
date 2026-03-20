const baseUrl = process.env.TRIPLETEX_BASE_URL;
const token = process.env.TRIPLETEX_TOKEN;

if (!baseUrl || !token) {
  throw new Error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_TOKEN");
}

const payload = {
  name: "Sonnental GmbH",
  organizationNumber: "957072445",
  email: "faktura@sonnentalgmbh.no",
};

const auth = Buffer.from(`0:${token}`).toString("base64");
const response = await fetch(`${baseUrl}/supplier`, {
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
  throw new Error(`Tripletex request failed with ${response.status}`);
}

const data = text ? JSON.parse(text) : null;
const value = data?.value;

if (
  !value ||
  value.name !== payload.name ||
  value.organizationNumber !== payload.organizationNumber ||
  value.email !== payload.email
) {
  console.error(JSON.stringify(data, null, 2));
  throw new Error("Supplier response missing expected fields");
}

console.log(
  JSON.stringify(
    {
      id: value.id,
      name: value.name,
      organizationNumber: value.organizationNumber,
      email: value.email,
    },
    null,
    2,
  ),
);
