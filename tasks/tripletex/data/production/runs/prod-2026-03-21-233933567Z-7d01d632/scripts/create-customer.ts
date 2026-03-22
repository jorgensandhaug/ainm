const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "WFyZ8uIoS-uUbDZMFTiuftEuTR3G4PmQSsJ7Af0uq14";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/customer`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Greenfield Ltd",
    organizationNumber: "872154442",
    email: "post@greenfield.no",
    postalAddress: {
      addressLine1: "Sjøgata 85",
      postalCode: "7010",
      city: "Trondheim",
    },
  }),
});

const data = await res.json();
console.log(res.status, JSON.stringify(data, null, 2));
