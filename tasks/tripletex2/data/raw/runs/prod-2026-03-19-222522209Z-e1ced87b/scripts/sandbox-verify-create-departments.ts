const baseUrl = process.env.TRIPLETEX_BASE_URL;
const sessionToken = process.env.TRIPLETEX_SESSION_TOKEN;

if (!baseUrl || !sessionToken) {
  throw new Error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_SESSION_TOKEN");
}

const suffix = "reflection-20260319";
const departmentNames = [
  `Sandbox Økonomi ${suffix}`,
  `Sandbox Innkjøp ${suffix}`,
  `Sandbox Regnskap ${suffix}`,
];

const auth = Buffer.from(`0:${sessionToken}`).toString("base64");

type Department = {
  id?: number;
  name?: string;
  displayName?: string;
  isInactive?: boolean;
};

type ResponseWrapperDepartment = {
  value?: Department;
};

async function createDepartment(name: string): Promise<Department> {
  const response = await fetch(`${baseUrl}/department`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json; charset=utf-8",
      Accept: "application/json",
    },
    body: JSON.stringify({ name }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`POST /department failed for ${name}: ${response.status} ${text}`);
  }

  const data = JSON.parse(text) as ResponseWrapperDepartment;
  const created = data.value;
  if (!created?.id || created.name !== name || created.displayName !== name || created.isInactive !== false) {
    throw new Error(`Unexpected response for ${name}: ${text}`);
  }

  return created;
}

const createdDepartments: Department[] = [];

for (const name of departmentNames) {
  createdDepartments.push(await createDepartment(name));
}

console.log(JSON.stringify(createdDepartments, null, 2));
