const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "tmjLdYrnD8NeOmk14sj9EPnD8tu-_05kz3rbT1WzoaE";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/supplier`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Oakwood Ltd",
    organizationNumber: "887507295",
    email: "faktura@oakwoodltd.no",
    invoiceEmail: "faktura@oakwoodltd.no",
  }),
});

const body = await res.json();
console.log("Status:", res.status);
console.log("Response:", JSON.stringify(body, null, 2));
