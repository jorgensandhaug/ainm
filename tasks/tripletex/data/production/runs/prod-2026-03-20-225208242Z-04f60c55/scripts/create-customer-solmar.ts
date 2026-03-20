const baseUrl = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const token = "jI2gFmcEerzmgvEZjpEaiznWB0qLxqqcB4qOUnb1G9Q";

const url = `${baseUrl.replace(/\/+$/, "")}/customer`;
const auth = Buffer.from(`0:${token}`).toString("base64");

const payload = {
  name: "Solmar Lda",
  email: "post@solmar.no",
  organizationNumber: "850733651",
  postalAddress: {
    addressLine1: "Storgata 108",
    postalCode: "7010",
    city: "Trondheim",
  },
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
