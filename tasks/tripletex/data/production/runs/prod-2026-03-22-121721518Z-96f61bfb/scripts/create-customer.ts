const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "fO0CnzOcI_15_IzGJotXQj5OSMyilek6qS1nR1TljrE";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE_URL}${path}`;
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`${method} ${path} → ${res.status}`);
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(JSON.stringify(json, null, 2));
  return { status: res.status, data: json };
}

async function main() {
  // One POST /customer with all prompt fields
  const { status, data } = await api("POST", "/customer", {
    name: "Fjordkraft AS",
    organizationNumber: "843216285",
    email: "post@fjordkraft.no",
    postalAddress: {
      addressLine1: "Fjordveien 129",
      postalCode: "2317",
      city: "Hamar"
    }
  });

  if (status !== 201) {
    console.error("Customer create failed");
    process.exit(1);
  }

  const customer = data.value;
  console.log("Customer created:", customer.id);

  // Verification GET (free)
  await api("GET", `/customer/${customer.id}?fields=*,postalAddress(*)`);
}

main().catch(e => { console.error(e); process.exit(1); });
