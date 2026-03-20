const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const token = "7rdXaxbpj20E7Wr1xgPmIFChJI9INBdr1fMoUEhp1cU";

const url = new URL("department/list", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
const body = [{ name: "HR" }, { name: "Salg" }, { name: "Økonomi" }];

const response = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Basic ${Buffer.from(`0:${token}`).toString("base64")}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  },
  body: JSON.stringify(body),
});

const text = await response.text();
console.log(JSON.stringify({ status: response.status, body: text ? JSON.parse(text) : null }, null, 2));

if (!response.ok) {
  process.exit(1);
}
