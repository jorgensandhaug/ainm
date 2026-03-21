import { readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

type TripletexCredentials = {
  base_url: string;
  session_token: string;
};

type ResourceType =
  | "customers"
  | "departments"
  | "employees"
  | "products"
  | "projects"
  | "travelExpenses"
  | "orders"
  | "invoices"
  | "vouchers";

type ResourceRecord = {
  id: number;
  label: string;
};

type BaselineSnapshot = {
  captured_at: string;
  base_url: string;
  resources: Record<ResourceType, number[]>;
};

type ResourceSnapshot = Record<ResourceType, ResourceRecord[]>;

type PlanItem = {
  resourceType: ResourceType;
  record: ResourceRecord;
  action: "delete" | "credit-note" | "reverse-voucher" | "unsupported";
};

const tripletexRootDir = resolve(import.meta.dir, "..");
const sandboxEnvPath = join(tripletexRootDir, ".sandbox.env");
const baselinePath = join(tripletexRootDir, "data", "sandbox-baseline.json");
const resourceTypes: ResourceType[] = [
  "customers",
  "departments",
  "employees",
  "products",
  "projects",
  "travelExpenses",
  "orders",
  "invoices",
  "vouchers",
];
const MAX_AUTOMATED_RESET_ITEMS = 200;
const MAX_REPORTED_PLAN_ITEMS = 40;
const MAX_APPLY_ERRORS = 12;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseEnvFile(raw: string): Record<string, string> {
  const env: Record<string, string> = {};

  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) {
      env[key] = value;
    }
  }

  return env;
}

async function loadSandboxCredentials(): Promise<TripletexCredentials> {
  if (Bun.env.TRIPLETEX_TEST_BASE_URL && Bun.env.TRIPLETEX_TEST_SESSION_TOKEN) {
    return {
      base_url: Bun.env.TRIPLETEX_TEST_BASE_URL,
      session_token: Bun.env.TRIPLETEX_TEST_SESSION_TOKEN,
    };
  }

  const raw = await readFile(sandboxEnvPath, "utf8");
  const env = parseEnvFile(raw);
  if (!env.TRIPLETEX_TEST_BASE_URL || !env.TRIPLETEX_TEST_SESSION_TOKEN) {
    throw new Error(`missing sandbox credentials in ${sandboxEnvPath}`);
  }

  return {
    base_url: env.TRIPLETEX_TEST_BASE_URL,
    session_token: env.TRIPLETEX_TEST_SESSION_TOKEN,
  };
}

class TripletexSandboxClient {
  private readonly baseUrl: string;
  private readonly authorization: string;

  constructor(credentials: TripletexCredentials) {
    this.baseUrl = credentials.base_url.replace(/\/+$/, "");
    this.authorization = `Basic ${Buffer.from(`0:${credentials.session_token}`).toString("base64")}`;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  private async request(method: string, path: string, body?: unknown): Promise<Response> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: this.authorization,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    return response;
  }

  private async expectOk(method: string, path: string, body?: unknown): Promise<Response> {
    const response = await this.request(method, path, body);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${method} ${path} failed: ${response.status} ${text}`);
    }
    return response;
  }

  private async fetchList(
    path: string,
    mapRecord: (value: Record<string, unknown>) => ResourceRecord,
  ): Promise<ResourceRecord[]> {
    const pageSize = 1000;
    const records: ResourceRecord[] = [];

    for (let from = 0; ; from += pageSize) {
      const separator = path.includes("?") ? "&" : "?";
      const response = await this.expectOk("GET", `${path}${separator}from=${from}&count=${pageSize}`);
      const payload = (await response.json()) as { values?: Record<string, unknown>[] };
      const values = payload.values ?? [];
      records.push(...values.map(mapRecord));

      if (values.length < pageSize) {
        return records;
      }
    }
  }

  async listCustomers(): Promise<ResourceRecord[]> {
    return this.fetchList(
      "/customer?fields=id,name,displayName,customerNumber,isInactive",
      (value) => ({
        id: Number(value.id),
        label: String(value.displayName ?? value.name ?? value.id),
      }),
    );
  }

  async listDepartments(): Promise<ResourceRecord[]> {
    return this.fetchList(
      "/department?fields=id,name,displayName,departmentNumber,isInactive",
      (value) => ({
        id: Number(value.id),
        label: String(value.displayName ?? value.name ?? value.id),
      }),
    );
  }

  async listEmployees(): Promise<ResourceRecord[]> {
    return this.fetchList("/employee", (value) => ({
      id: Number(value.id),
      label: String(
        value.displayName ??
          (`${value.firstName ?? ""} ${value.lastName ?? ""}`.trim() || value.id),
      ),
    }));
  }

  async listProducts(): Promise<ResourceRecord[]> {
    return this.fetchList("/product?fields=id,name,isInactive", (value) => ({
      id: Number(value.id),
      label: String(value.name ?? value.id),
    }));
  }

  async listProjects(): Promise<ResourceRecord[]> {
    return this.fetchList("/project?fields=id,name,number", (value) => ({
      id: Number(value.id),
      label: String(value.name ?? value.number ?? value.id),
    }));
  }

  async listTravelExpenses(): Promise<ResourceRecord[]> {
    return this.fetchList("/travelExpense?fields=id", (value) => ({
      id: Number(value.id),
      label: String(value.description ?? value.id),
    }));
  }

  async listOrders(): Promise<ResourceRecord[]> {
    return this.fetchList(
      "/order?orderDateFrom=2000-01-01&orderDateTo=2100-01-01&fields=id,number",
      (value) => ({
        id: Number(value.id),
        label: String(value.number ?? value.reference ?? value.id),
      }),
    );
  }

  async listInvoices(): Promise<ResourceRecord[]> {
    return this.fetchList(
      "/invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2100-01-01&fields=id,invoiceNumber",
      (value) => ({
        id: Number(value.id),
        label: String(value.invoiceNumber ?? value.customerName ?? value.id),
      }),
    );
  }

  async listVouchers(): Promise<ResourceRecord[]> {
    return this.fetchList(
      "/ledger/voucher?dateFrom=2000-01-01&dateTo=2100-01-01&fields=id,number,date",
      (value) => ({
        id: Number(value.id),
        label: String(value.number ?? value.description ?? value.date ?? value.id),
      }),
    );
  }

  async snapshot(): Promise<ResourceSnapshot> {
    return {
      customers: await this.listCustomers(),
      departments: await this.listDepartments(),
      employees: await this.listEmployees(),
      products: await this.listProducts(),
      projects: await this.listProjects(),
      travelExpenses: await this.listTravelExpenses(),
      orders: await this.listOrders(),
      invoices: await this.listInvoices(),
      vouchers: await this.listVouchers(),
    };
  }

  async deleteCustomer(id: number): Promise<void> {
    await this.expectOk("DELETE", `/customer/${id}`);
  }

  async deleteDepartment(id: number): Promise<void> {
    await this.expectOk("DELETE", `/department/${id}`);
  }

  async deleteProduct(id: number): Promise<void> {
    await this.expectOk("DELETE", `/product/${id}`);
  }

  async deleteProject(id: number): Promise<void> {
    await this.expectOk("DELETE", `/project/${id}`);
  }

  async deleteOrder(id: number): Promise<void> {
    await this.expectOk("DELETE", `/order/${id}`);
  }

  async deleteTravelExpense(id: number): Promise<void> {
    const direct = await this.request("DELETE", `/travelExpense/${id}`);
    if (direct.ok) {
      return;
    }

    await this.request("PUT", `/travelExpense/:undeliver?id=${id}`, {});
    await this.request("PUT", `/travelExpense/:unapprove?id=${id}`);

    const retry = await this.request("DELETE", `/travelExpense/${id}`);
    if (!retry.ok) {
      const text = await retry.text();
      throw new Error(`DELETE /travelExpense/${id} failed: ${retry.status} ${text}`);
    }
  }

  async createCreditNote(invoiceId: number): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    await this.expectOk(
      "PUT",
      `/invoice/${invoiceId}/:createCreditNote?date=${today}&sendToCustomer=false&comment=Sandbox%20reset`,
    );
  }

  async reverseVoucher(voucherId: number): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    await this.expectOk("PUT", `/ledger/voucher/${voucherId}/:reverse?date=${today}`);
  }
}

async function loadBaseline(): Promise<BaselineSnapshot> {
  const raw = await readFile(baselinePath, "utf8");
  return JSON.parse(raw) as BaselineSnapshot;
}

function buildBaseline(snapshot: ResourceSnapshot, baseUrl: string): BaselineSnapshot {
  return {
    captured_at: new Date().toISOString(),
    base_url: baseUrl,
    resources: {
      customers: snapshot.customers.map((item) => item.id),
      departments: snapshot.departments.map((item) => item.id),
      employees: snapshot.employees.map((item) => item.id),
      products: snapshot.products.map((item) => item.id),
      projects: snapshot.projects.map((item) => item.id),
      travelExpenses: snapshot.travelExpenses.map((item) => item.id),
      orders: snapshot.orders.map((item) => item.id),
      invoices: snapshot.invoices.map((item) => item.id),
      vouchers: snapshot.vouchers.map((item) => item.id),
    },
  };
}

function extraRecords(
  snapshot: ResourceSnapshot,
  baseline: BaselineSnapshot,
  resourceType: ResourceType,
): ResourceRecord[] {
  const baselineIds = new Set(baseline.resources[resourceType] ?? []);
  return snapshot[resourceType].filter((record) => !baselineIds.has(record.id));
}

function buildPlan(snapshot: ResourceSnapshot, baseline: BaselineSnapshot): PlanItem[] {
  const plan: PlanItem[] = [];

  for (const record of extraRecords(snapshot, baseline, "travelExpenses")) {
    plan.push({ resourceType: "travelExpenses", record, action: "delete" });
  }
  for (const record of extraRecords(snapshot, baseline, "invoices")) {
    plan.push({ resourceType: "invoices", record, action: "credit-note" });
  }
  for (const record of extraRecords(snapshot, baseline, "vouchers")) {
    plan.push({ resourceType: "vouchers", record, action: "reverse-voucher" });
  }
  for (const record of extraRecords(snapshot, baseline, "orders")) {
    plan.push({ resourceType: "orders", record, action: "delete" });
  }
  for (const record of extraRecords(snapshot, baseline, "projects")) {
    plan.push({ resourceType: "projects", record, action: "delete" });
  }
  for (const record of extraRecords(snapshot, baseline, "products")) {
    plan.push({ resourceType: "products", record, action: "delete" });
  }
  for (const record of extraRecords(snapshot, baseline, "customers")) {
    plan.push({ resourceType: "customers", record, action: "delete" });
  }
  for (const record of extraRecords(snapshot, baseline, "departments")) {
    plan.push({ resourceType: "departments", record, action: "delete" });
  }
  for (const record of extraRecords(snapshot, baseline, "employees")) {
    plan.push({ resourceType: "employees", record, action: "unsupported" });
  }

  return plan;
}

function summarizePlan(plan: PlanItem[]): Record<string, number> {
  const summary: Record<string, number> = {
    total: plan.length,
  };

  for (const item of plan) {
    const actionKey = `action.${item.action}`;
    const resourceKey = `resource.${item.resourceType}`;
    summary[actionKey] = (summary[actionKey] ?? 0) + 1;
    summary[resourceKey] = (summary[resourceKey] ?? 0) + 1;
  }

  return summary;
}

function formatSummary(summary: Record<string, number>): string {
  return JSON.stringify(summary);
}

function collectResetBlockers(plan: PlanItem[]): string[] {
  const blockers: string[] = [];
  const unsupported = plan.filter((item) => item.action === "unsupported");

  if (plan.length > MAX_AUTOMATED_RESET_ITEMS) {
    blockers.push(
      `reset blocker: sandbox drift is too large for automated verifier reset (${plan.length} planned actions > ${MAX_AUTOMATED_RESET_ITEMS} limit)`,
    );
  }

  if (unsupported.length > 0) {
    const examples = unsupported
      .slice(0, 5)
      .map((item) => `${item.record.id} ${item.record.label}`)
      .join(", ");
    blockers.push(
      `reset blocker: unsupported reset targets detected for ${unsupported.length} employee records${examples ? ` (${examples})` : ""}`,
    );
  }

  return blockers;
}

function printPlan(plan: PlanItem[]): void {
  if (plan.length === 0) {
    console.log("sandbox already matches baseline");
    return;
  }

  console.log(`reset summary: ${formatSummary(summarizePlan(plan))}`);

  for (const item of plan.slice(0, MAX_REPORTED_PLAN_ITEMS)) {
    console.log(`${item.action}\t${item.resourceType}\t${item.record.id}\t${item.record.label}`);
  }

  if (plan.length > MAX_REPORTED_PLAN_ITEMS) {
    console.log(
      `reset plan truncated: ${plan.length - MAX_REPORTED_PLAN_ITEMS} additional items omitted`,
    );
  }
}

async function applyPlan(client: TripletexSandboxClient, plan: PlanItem[]): Promise<void> {
  const blockers = collectResetBlockers(plan);
  if (blockers.length > 0) {
    throw new Error(blockers.join("\n"));
  }

  const errors: string[] = [];

  for (const item of plan) {
    if (errors.length >= MAX_APPLY_ERRORS) {
      errors.push(`reset aborted after ${MAX_APPLY_ERRORS} failures`);
      break;
    }

    try {
      switch (item.action) {
        case "delete":
          if (item.resourceType === "travelExpenses") {
            await client.deleteTravelExpense(item.record.id);
          } else if (item.resourceType === "orders") {
            await client.deleteOrder(item.record.id);
          } else if (item.resourceType === "projects") {
            await client.deleteProject(item.record.id);
          } else if (item.resourceType === "products") {
            await client.deleteProduct(item.record.id);
          } else if (item.resourceType === "customers") {
            await client.deleteCustomer(item.record.id);
          } else if (item.resourceType === "departments") {
            await client.deleteDepartment(item.record.id);
          }
          console.log(`deleted\t${item.resourceType}\t${item.record.id}\t${item.record.label}`);
          break;
        case "credit-note":
          await client.createCreditNote(item.record.id);
          console.log(`credited\t${item.resourceType}\t${item.record.id}\t${item.record.label}`);
          break;
        case "reverse-voucher":
          await client.reverseVoucher(item.record.id);
          console.log(`reversed\t${item.resourceType}\t${item.record.id}\t${item.record.label}`);
          break;
        case "unsupported":
          errors.push(
            `unsupported reset target: ${item.resourceType} ${item.record.id} ${item.record.label}`,
          );
          break;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${item.action} ${item.resourceType} ${item.record.id} failed: ${message}`);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  if (plan.some((item) => item.action !== "unsupported")) {
    await sleep(2500);
  }
}

async function main(): Promise<void> {
  const command = Bun.argv[2];
  if (!command || !["snapshot", "plan", "apply"].includes(command)) {
    throw new Error("usage: bun tasks/tripletex/src/reset-sandbox.ts <snapshot|plan|apply>");
  }

  const client = new TripletexSandboxClient(await loadSandboxCredentials());
  const snapshot = await client.snapshot();

  if (command === "snapshot") {
    const baseline = buildBaseline(snapshot, client.getBaseUrl());
    await writeFile(baselinePath, JSON.stringify(baseline, null, 2));
    console.log(`wrote baseline ${baselinePath}`);
    return;
  }

  const baseline = await loadBaseline();
  const plan = buildPlan(snapshot, baseline);
  printPlan(plan);

  if (command === "apply" && plan.length > 0) {
    await applyPlan(client, plan);
  }
}

await main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});
