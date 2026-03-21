const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "zm6yIqHVbQ_SM0W4YqPdgdBOsmOGdto7jUqkW5gM7ns";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/customer`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Floresta Lda",
    organizationNumber: "893475656",
    email: "post@floresta.no",
    postalAddress: {
      addressLine1: "Kirkegata 132",
      postalCode: "7010",
      city: "Trondheim",
    },
  }),
});

const data = await res.json();
console.log("Status:", res.status);
console.log(JSON.stringify(data, null, 2));
