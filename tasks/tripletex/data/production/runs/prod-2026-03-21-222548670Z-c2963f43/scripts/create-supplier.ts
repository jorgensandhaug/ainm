const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "GPwZgbdyADH2nsnFEHppyvxdVyUszJycoTrJUWmpIPo";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const res = await fetch(`${BASE}/supplier`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: AUTH },
  body: JSON.stringify({
    name: "Floresta Lda",
    organizationNumber: "981154614",
    email: "faktura@florestalda.no",
    invoiceEmail: "faktura@florestalda.no",
  }),
});

const body = await res.json();
console.log("Status:", res.status);
console.log("Response:", JSON.stringify(body, null, 2));
