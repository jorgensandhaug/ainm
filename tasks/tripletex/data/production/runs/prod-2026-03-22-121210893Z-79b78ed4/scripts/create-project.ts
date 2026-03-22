const BASE_URL = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "Kn3vqTs2rMPo2pgzhVlFkpJVXjh_dvYk0KMdsMN52ZQ";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE_URL}${path}`;
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
  // Step 1+2 parallel: resolve customer + assignable PM
  const [customers, employees] = await Promise.all([
    api("GET", "/customer?organizationNumber=953177234&count=10&fields=*"),
    api("GET", "/employee?email=henrik.johansen@example.org&assignableProjectManagers=true&count=10&fields=*"),
  ]);

  const customer = customers.find((c: any) => String(c.organizationNumber) === "953177234");
  if (!customer) throw new Error("Customer not found");

  const pm = employees.find((e: any) => e.email === "henrik.johansen@example.org");
  if (!pm) throw new Error("Project manager not found");

  // Step 3: POST /project
  const project = await api("POST", "/project", {
    name: "Oppgradering Fjordkraft",
    startDate: "2026-03-22",
    customer: { id: customer.id },
    projectManager: { id: pm.id },
  });

  console.log("Project created:", project.id);

  // Step 4: verification GET (free)
  const verified = await api("GET", `/project/${project.id}?fields=*,customer(id,name,organizationNumber),projectManager(id,firstName,lastName,email)`);
  console.log("Verified project:", verified.name, "customer:", verified.customer?.name, verified.customer?.organizationNumber, "PM:", verified.projectManager?.email);
}

main().catch(e => { console.error(e); process.exit(1); });
