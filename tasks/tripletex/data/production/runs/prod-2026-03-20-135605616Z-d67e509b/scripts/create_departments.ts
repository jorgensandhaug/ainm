const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "0i_kAyziXiLg2aRlF0DE3TKjVrTKBZZ_2O2KjHRACXE";

const payload = [
  { name: "Økonomi" },
  { name: "Innkjøp" },
  { name: "Regnskap" },
];

const auth = Buffer.from(`0:${sessionToken}`).toString("base64");

const response = await fetch(`${baseUrl}/department/list`, {
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
  throw new Error(`HTTP ${response.status} ${response.statusText}\n${text}`);
}

console.log(text);
