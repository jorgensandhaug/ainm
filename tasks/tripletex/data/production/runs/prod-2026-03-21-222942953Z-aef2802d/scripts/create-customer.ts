const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "y0z7lOEsSNy_HmZi-DnCp2i1q-C2tnODTyU6r9otNG0";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/customer`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Bergwerk GmbH",
    organizationNumber: "946768693",
    email: "post@bergwerk.no",
    postalAddress: {
      addressLine1: "Solveien 5",
      postalCode: "3015",
      city: "Drammen",
    },
  }),
});

const data = await res.json();
console.log("Status:", res.status);
console.log(JSON.stringify(data, null, 2));
