const baseUrl = process.env.TRIPLETEX_BASE_URL;
const token = process.env.TRIPLETEX_TOKEN;

if (!baseUrl || !token) {
  throw new Error("Missing TRIPLETEX_BASE_URL or TRIPLETEX_TOKEN");
}

const response = await fetch(
  `${baseUrl}/employee?email=${encodeURIComponent("lucy.walker@example.org")}&count=10&fields=*`,
  {
    headers: {
      Authorization: `Basic ${Buffer.from(`0:${token}`).toString("base64")}`,
      Accept: "application/json",
    },
  },
);

if (!response.ok) {
  throw new Error(`${response.status} ${await response.text()}`);
}

const data = await response.json();
console.log(JSON.stringify(data, null, 2));
