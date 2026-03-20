const baseUrl = "https://kkpqfuj-amager.tripletex.dev/v2";
const sessionToken =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const invoiceDate = "2026-03-20";

type Json =
  | null
  | boolean
  | number
  | string
  | Json[]
  | { [key: string]: Json };

let totalCalls = 0;
let measuredCalls = 0;
let measureMode = false;

function authHeader() {
  return `Basic ${Buffer.from(`0:${sessionToken}`).toString("base64")}`;
}

function endpoint(pathAndQuery: string) {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(pathAndQuery, normalizedBase).toString();
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

async function request<T = any>(
  method: string,
  pathAndQuery: string,
  body?: Json,
): Promise<T> {
  totalCalls += 1;
  if (measureMode) measuredCalls += 1;

  const response = await fetch(endpoint(pathAndQuery), {
    method,
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const bodyText = await response.text();
  const bodyJson = bodyText ? safeJsonParse(bodyText) : undefined;

  if (!response.ok) {
    fail(`Tripletex error ${response.status} on ${method} ${pathAndQuery}: ${bodyText}`);
  }

  return (bodyJson as T) ?? (undefined as T);
}

function getValue<T>(payload: any): T {
  if (!payload?.value) fail(`Missing response.value: ${JSON.stringify(payload)}`);
  return payload.value as T;
}

function getValues<T>(payload: any): T[] {
  return Array.isArray(payload?.values) ? payload.values : [];
}

function exactString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function exactNumber(value: unknown) {
  return typeof value === "number" ? value : Number(value);
}

function generateValidOrgNumber(seed: number) {
  const digits = String(seed).padStart(8, "0").slice(-8).split("").map(Number);
  const weights = [3, 2, 7, 6, 5, 4, 3, 2];
  const sum = digits.reduce((acc, digit, index) => acc + digit * weights[index], 0);
  const remainder = sum % 11;
  const checkDigit = remainder === 0 ? 0 : 11 - remainder;
  if (checkDigit === 10) return generateValidOrgNumber(seed + 1);
  return `${digits.join("")}${checkDigit}`;
}

function chooseVatType(vatTypes: any[]) {
  const pct25 = vatTypes.find((vatType) => exactNumber(vatType?.percentage) === 25);
  if (pct25) return pct25;

  const pct0 = vatTypes.filter((vatType) => exactNumber(vatType?.percentage) === 0);
  if (pct0.length > 0 && pct0.length === vatTypes.length) return pct0[0];

  fail(`Could not resolve safe outgoing VAT type from ${JSON.stringify(vatTypes)}`);
}

function startMeasuredPhase() {
  measuredCalls = 0;
  measureMode = true;
}

function stopMeasuredPhase() {
  measureMode = false;
  return measuredCalls;
}

async function main() {
  const suffix = Date.now().toString().slice(-6);
  const customerName = `Codex Sandbox FP Customer ${suffix}`;
  const projectName = `Codex Sandbox FP Project ${suffix}`;
  const orgNumber = generateValidOrgNumber(31000000 + Number(suffix));

  const managerPayload = await request<any>(
    "GET",
    "employee?assignableProjectManagers=true&count=10&fields=*",
  );
  const manager =
    getValues<any>(managerPayload).find((employee) => employee?.id && exactString(employee?.email)) ??
    fail(`No assignable project manager found`);

  const customerPayload = await request<any>("POST", "customer", {
    name: customerName,
    organizationNumber: orgNumber,
    invoiceSendMethod: "MANUAL",
  });
  const customer = getValue<any>(customerPayload);

  const initialProjectPayload = await request<any>("POST", "project", {
    name: projectName,
    startDate: invoiceDate,
    customer: { id: customer.id },
    projectManager: { id: manager.id },
    isFixedPrice: true,
    fixedprice: 315000,
    invoiceOnAccountVatHigh: false,
  });
  const createdProject = getValue<any>(initialProjectPayload);

  const accountPayload = await request<any>("GET", "ledger/account?isBankAccount=true&fields=*");
  const invoiceAccount =
    getValues<any>(accountPayload).find(
      (account) => account?.isInvoiceAccount === true && exactNumber(account?.number) === 1920,
    ) ??
    getValues<any>(accountPayload).find((account) => account?.isInvoiceAccount === true) ??
    null;

  const vatPayload = await request<any>(
    "GET",
    `ledger/vatType?typeOfVat=OUTGOING&vatDate=${encodeURIComponent(invoiceDate)}&fields=*`,
  );
  const vatType = chooseVatType(getValues<any>(vatPayload));

  startMeasuredPhase();
  const projectSearchPayload = await request<any>(
    "GET",
    `project?name=${encodeURIComponent(projectName)}&count=50&fields=${encodeURIComponent("*,customer(*),projectManager(*)")}`,
  );
  const searchedProject = getValues<any>(projectSearchPayload).find(
    (project) =>
      exactString(project?.name) === projectName &&
      exactString(project?.customer?.organizationNumber) === orgNumber &&
      exactString(project?.projectManager?.email) === manager.email,
  );
  if (!searchedProject?.id) fail(`Project-first resolver failed`);

  const updatedProjectPayload = await request<any>("PUT", `project/${searchedProject.id}`, {
    name: projectName,
    startDate: exactString(searchedProject.startDate) || invoiceDate,
    customer: { id: customer.id },
    projectManager: { id: manager.id },
    isFixedPrice: true,
    fixedprice: 316000,
    invoiceOnAccountVatHigh: false,
  });
  const updatedProject = getValue<any>(updatedProjectPayload);

  const vatPayloadMeasured = await request<any>(
    "GET",
    `ledger/vatType?typeOfVat=OUTGOING&vatDate=${encodeURIComponent(invoiceDate)}&fields=*`,
  );
  const vatTypeMeasured = chooseVatType(getValues<any>(vatPayloadMeasured));

  const orderPayload = await request<any>("POST", "order", {
    customer: { id: customer.id },
    project: { id: updatedProject.id },
    orderDate: invoiceDate,
    deliveryDate: invoiceDate,
    invoiceOnAccountVatHigh: false,
    orderLines: [
      {
        description: "Sandbox proof 50% fixed price update branch",
        count: 1,
        unitPriceExcludingVatCurrency: 158000,
        vatType: { id: vatTypeMeasured.id },
      },
    ],
  });
  const order = getValue<any>(orderPayload);

  const invoicePayload = await request<any>(
    "PUT",
    `order/${order.id}/:invoice?invoiceDate=${encodeURIComponent(invoiceDate)}&sendToCustomer=false`,
  );
  const invoice = getValue<any>(invoicePayload);
  const updateBranchCalls = stopMeasuredPhase();

  startMeasuredPhase();
  const projectSearchPayload2 = await request<any>(
    "GET",
    `project?name=${encodeURIComponent(projectName)}&count=50&fields=${encodeURIComponent("*,customer(*),projectManager(*)")}`,
  );
  const searchedProject2 = getValues<any>(projectSearchPayload2).find(
    (project) =>
      exactString(project?.name) === projectName &&
      exactString(project?.customer?.organizationNumber) === orgNumber &&
      exactString(project?.projectManager?.email) === manager.email &&
      project?.isFixedPrice === true &&
      exactNumber(project?.fixedprice) === 316000,
  );
  if (!searchedProject2?.id) fail(`Skip-PUT resolver failed`);

  const vatPayloadSkipPut = await request<any>(
    "GET",
    `ledger/vatType?typeOfVat=OUTGOING&vatDate=${encodeURIComponent(invoiceDate)}&fields=*`,
  );
  const vatTypeSkipPut = chooseVatType(getValues<any>(vatPayloadSkipPut));

  const orderPayload2 = await request<any>("POST", "order", {
    customer: { id: customer.id },
    project: { id: searchedProject2.id },
    orderDate: invoiceDate,
    deliveryDate: invoiceDate,
    invoiceOnAccountVatHigh: false,
    orderLines: [
      {
        description: "Sandbox proof 50% fixed price skip-put branch",
        count: 1,
        unitPriceExcludingVatCurrency: 158000,
        vatType: { id: vatTypeSkipPut.id },
      },
    ],
  });
  const order2 = getValue<any>(orderPayload2);

  const invoicePayload2 = await request<any>(
    "PUT",
    `order/${order2.id}/:invoice?invoiceDate=${encodeURIComponent(invoiceDate)}&sendToCustomer=false`,
  );
  const invoice2 = getValue<any>(invoicePayload2);
  const skipPutCalls = stopMeasuredPhase();

  console.log(
    JSON.stringify({
      ok: true,
      totalCalls,
      fixtureProjectId: createdProject.id,
      invoiceAccount: invoiceAccount
        ? {
            id: invoiceAccount.id,
            number: invoiceAccount.number,
            isInvoiceAccount: invoiceAccount.isInvoiceAccount,
            bankAccountNumber: invoiceAccount.bankAccountNumber,
          }
        : null,
      vatType: { id: vatType.id, percentage: vatType.percentage },
      measured: {
        updateBranch: {
          calls: updateBranchCalls,
          invoiceId: invoice.id,
          amountExcludingVatCurrency: invoice.amountExcludingVatCurrency,
          amountCurrencyOutstanding: invoice.amountCurrencyOutstanding,
        },
        skipPutBranch: {
          calls: skipPutCalls,
          invoiceId: invoice2.id,
          amountExcludingVatCurrency: invoice2.amountExcludingVatCurrency,
          amountCurrencyOutstanding: invoice2.amountCurrencyOutstanding,
        },
      },
      manager: { id: manager.id, email: manager.email },
      customer: { id: customer.id, orgNumber },
      project: { id: createdProject.id, name: projectName },
    }),
  );
}

await main();
