const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "HYP69G8KmpCpViqSTrQncliYZKPKnMujgaXEOwB0Q78";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/customer`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Nordlys AS",
    organizationNumber: "951285463",
    email: "post@nordlys.no",
    postalAddress: {
      addressLine1: "Parkveien 45",
      postalCode: "5003",
      city: "Bergen",
    },
  }),
});

const data = await res.json();
console.log("Status:", res.status);
console.log(JSON.stringify(data, null, 2));
