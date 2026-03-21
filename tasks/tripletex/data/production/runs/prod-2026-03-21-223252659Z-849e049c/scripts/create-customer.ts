const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "QDPB56cxmRRSktUujumlJNEMuE859Q4V3V6IJ3qPYH0";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/customer`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Montagne SARL",
    organizationNumber: "931564153",
    email: "post@montagne.no",
    postalAddress: {
      addressLine1: "Kirkegata 19",
      postalCode: "4611",
      city: "Kristiansand",
    },
  }),
});

const data = await res.json();
console.log("Status:", res.status);
console.log(JSON.stringify(data, null, 2));
