const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "5jcwwsKdUzBROjNNG1RCMb9HAyp9fs9ssRGPgBJZfos";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const departments = [
  { name: "Produksjon" },
  { name: "Lager" },
  { name: "Kvalitetskontroll" },
];

const res = await fetch(`${BASE}/department/list`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: AUTH,
  },
  body: JSON.stringify(departments),
});

const body = await res.json();
console.log("Status:", res.status);
console.log("Response:", JSON.stringify(body, null, 2));

if (res.status !== 201) {
  console.error("FAILED");
  process.exit(1);
}

for (const dept of body.values) {
  console.log(`Created department: id=${dept.id} name=${dept.name}`);
}
