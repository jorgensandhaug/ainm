const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "u_0IyWL-66xWfhLEXhLczIkxXuLkePJLgAfKiRKHbVM";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/customer`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Skogheim AS",
    organizationNumber: "855954346",
    email: "post@skogheim.no",
    postalAddress: {
      addressLine1: "Parkveien 17",
      postalCode: "4611",
      city: "Kristiansand",
    },
  }),
});

const data = await res.json();
console.log("STATUS:", res.status);
console.log(JSON.stringify(data, null, 2));
