const baseUrl = process.env.TRIPLETEX_BASE_URL;
const sessionToken = process.env.TRIPLETEX_SESSION_TOKEN;

if (!baseUrl || !sessionToken) {
  throw new Error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_SESSION_TOKEN");
}

const suffix = "batch-reflection-20260319";
const requestedNames = [
  `Sandbox Batch Økonomi ${suffix}`,
  `Sandbox Batch Innkjøp ${suffix}`,
  `Sandbox Batch Regnskap ${suffix}`,
];

const auth = Buffer.from(`0:${sessionToken}`).toString("base64");

type Department = {
  id?: number;
  name?: string;
  displayName?: string;
  isInactive?: boolean;
};

type ListResponseDepartment = {
  values?: Department[];
};

const response = await fetch(`${baseUrl}/department/list`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json; charset=utf-8",
    Accept: "application/json",
  },
  body: JSON.stringify(requestedNames.map((name) => ({ name }))),
});

const text = await response.text();
if (!response.ok) {
  throw new Error(`POST /department/list failed: ${response.status} ${text}`);
}

const data = JSON.parse(text) as ListResponseDepartment;
const created = data.values;

if (!created || created.length !== requestedNames.length) {
  throw new Error(`Unexpected batch response length: ${text}`);
}

for (let i = 0; i < requestedNames.length; i += 1) {
  const expectedName = requestedNames[i];
  const actual = created[i];
  if (!actual?.id || actual.name !== expectedName || actual.displayName !== expectedName || actual.isInactive !== false) {
    throw new Error(`Unexpected batch item for ${expectedName}: ${text}`);
  }
}

console.log(JSON.stringify(created, null, 2));
