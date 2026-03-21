const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "wADA2pqQZxGe03nfzMWAwVVFHMffG-ZmvgLqr24PWqI";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const payload = {
  name: "Porto Alegre Lda",
  organizationNumber: "834147254",
  email: "post@porto.no",
  postalAddress: {
    addressLine1: "Storgata 65",
    postalCode: "4611",
    city: "Kristiansand",
  },
};

const res = await fetch(`${BASE}/customer`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: AUTH,
  },
  body: JSON.stringify(payload),
});

const body = await res.json();
console.log("STATUS:", res.status);
console.log("BODY:", JSON.stringify(body, null, 2));
