const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "crOYO1-U6mNxGodq_PlAtqZo1UVGbEjktlH62Tlolto";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} -> ${r.status}`);
  console.log(JSON.stringify(json, null, 2));
  if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(json)}`);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

async function main() {
  // Step 1+2: parallel reads
  const [customers, managers] = await Promise.all([
    api("GET", "/customer?organizationNumber=886715536&count=10&fields=*"),
    api("GET", "/employee?email=jonas.haugen@example.org&assignableProjectManagers=true&count=10&fields=*"),
  ]);

  const customer = customers.find((c: any) => String(c.organizationNumber) === "886715536");
  if (!customer) throw new Error("Customer not found");

  const manager = managers.find((m: any) => m.email === "jonas.haugen@example.org");
  if (!manager) throw new Error("Manager not found");

  // Step 3: create project
  const project = await api("POST", "/project", {
    name: "Implementering Tindra",
    startDate: "2026-03-22",
    customer: { id: customer.id },
    projectManager: { id: manager.id },
  });

  console.log("Project created:", project.id);

  // Step 4: verification GET (free)
  await api("GET", `/project/${project.id}?fields=*,customer(id,name,organizationNumber),projectManager(id,firstName,lastName,email)`);
}

main().catch(e => { console.error(e); process.exit(1); });
