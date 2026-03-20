const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const sessionToken = "tVlJKYhZ6L92StuXAwmRdyDuMTTDK-AxOtcIzgbX0pY";

const url = new URL(baseUrl.endsWith("/") ? `${baseUrl}supplier` : `${baseUrl}/supplier`);
const auth = Buffer.from(`0:${sessionToken}`).toString("base64");

const payload = {
  name: "Silveroak Ltd",
  organizationNumber: "943413231",
  email: "faktura@silveroakltd.no",
  invoiceEmail: "faktura@silveroakltd.no",
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
  console.error(text);
  process.exit(1);
}

console.log(text);
