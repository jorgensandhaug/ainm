const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "LdKVC2twwobdeApYoW8Kk8MrepTT_lILp-9O3RehPtQ";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/customer`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Windmill Ltd",
    organizationNumber: "884659876",
    email: "post@windmill.no",
    postalAddress: {
      addressLine1: "Parkveien 124",
      postalCode: "7010",
      city: "Trondheim",
    },
  }),
});

const data = await res.json();
console.log(JSON.stringify(data, null, 2));
