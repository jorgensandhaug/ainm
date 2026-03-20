const BASE_URL = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";

const RUN_DATE = "2026-03-20";
const CUSTOMER_NAME = "Ironbridge Ltd";
const CUSTOMER_ORG_NO = "832020141";
const PROJECT_NAME = "CRM Integration Reflection";
const PROJECT_MANAGER_EMAIL = "ella.williams@example.org";
const INITIAL_FIXED_PRICE = 428000;
const TARGET_FIXED_PRICE = 428550;
const MILESTONE_AMOUNT = TARGET_FIXED_PRICE * 0.25;

const authHeader = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;

type Wrapper<T> = {
  value?: T;
  values?: T[];
};

async function api<T>(method: string, path: string, body?: unknown): Promise<Wrapper<T>> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: authHeader,
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json; charset=utf-8" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await res.text();
  const parsed = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(JSON.stringify({ method, path, status: res.status, body: parsed }, null, 2));
  }
  return parsed as Wrapper<T>;
}

function exactEmail(items: any[], email: string) {
  return items.filter((item) => String(item?.email ?? "").toLowerCase() === email.toLowerCase());
}

function exactOrg(items: any[], org: string) {
  return items.filter((item) => String(item?.organizationNumber ?? "").replace(/\s+/g, "") === org);
}

function exactProject(items: any[], name: string, customerId: number) {
  return items.filter(
    (item) => String(item?.name ?? "") === name && Number(item?.customer?.id) === customerId,
  );
}

async function main() {
  const managerRes = await api<any>(
    "GET",
    `/employee?email=${encodeURIComponent(PROJECT_MANAGER_EMAIL)}&assignableProjectManagers=true&count=10&fields=*`,
  );
  let manager = exactEmail(managerRes.values ?? [], PROJECT_MANAGER_EMAIL)[0];
  let managerResolution: Record<string, unknown> = {
    requestedEmail: PROJECT_MANAGER_EMAIL,
    assignableExactHit: Boolean(manager?.id),
  };
  if (!manager?.id) {
    const sameEmailAny = await api<any>(
      "GET",
      `/employee?email=${encodeURIComponent(PROJECT_MANAGER_EMAIL)}&count=10&fields=*`,
    );
    const exactAny = exactEmail(sameEmailAny.values ?? [], PROJECT_MANAGER_EMAIL)[0];
    const assignableList = await api<any>(
      "GET",
      `/employee?assignableProjectManagers=true&count=10&fields=*`,
    );
    manager = (assignableList.values ?? [])[0];
    managerResolution = {
      requestedEmail: PROJECT_MANAGER_EMAIL,
      assignableExactHit: false,
      sameEmailExistsWithoutAssignableFilter: Boolean(exactAny?.id),
      fallbackAssignableManagerId: manager?.id ?? null,
      fallbackAssignableManagerEmail: manager?.email ?? null,
    };
  }
  if (!manager?.id) throw new Error("no assignable project manager available in sandbox");

  const customerRes = await api<any>(
    "GET",
    `/customer?organizationNumber=${encodeURIComponent(CUSTOMER_ORG_NO)}&count=10&fields=*`,
  );
  let customer = exactOrg(customerRes.values ?? [], CUSTOMER_ORG_NO)[0];
  if (!customer?.id) {
    const created = await api<any>("POST", "/customer", {
      name: CUSTOMER_NAME,
      organizationNumber: CUSTOMER_ORG_NO,
      invoiceSendMethod: "MANUAL",
    });
    customer = created.value;
  }
  if (!customer?.id) throw new Error("customer missing after create");

  const projectSearch = await api<any>(
    "GET",
    `/project?name=${encodeURIComponent(PROJECT_NAME)}&customerId=${customer.id}&count=50&fields=*`,
  );
  let project = exactProject(projectSearch.values ?? [], PROJECT_NAME, Number(customer.id))[0];
  if (!project?.id) {
    const created = await api<any>("POST", "/project", {
      name: PROJECT_NAME,
      startDate: RUN_DATE,
      customer: { id: customer.id },
      projectManager: { id: manager.id },
      isFixedPrice: true,
      fixedprice: INITIAL_FIXED_PRICE,
      invoiceOnAccountVatHigh: false,
    });
    project = created.value;
  }
  if (!project?.id) throw new Error("project missing after create");

  const updatedProject = await api<any>("PUT", `/project/${project.id}`, {
    name: PROJECT_NAME,
    startDate: RUN_DATE,
    customer: { id: customer.id },
    projectManager: { id: manager.id },
    isFixedPrice: true,
    fixedprice: TARGET_FIXED_PRICE,
    invoiceOnAccountVatHigh: false,
  });

  const vatRes = await api<any>(
    "GET",
    `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${RUN_DATE}&fields=*`,
  );
  const vatTypes = vatRes.values ?? [];
  const vat25 =
    vatTypes.find((vat) => Number(vat?.percentage) === 25) ??
    vatTypes.sort((a, b) => Number(b?.percentage ?? -1) - Number(a?.percentage ?? -1))[0];
  if (!vat25?.id) throw new Error("no vat type found");

  const order = await api<any>("POST", "/order", {
    customer: { id: customer.id },
    project: { id: project.id },
    orderDate: RUN_DATE,
    deliveryDate: RUN_DATE,
    invoiceOnAccountVatHigh: false,
    orderLines: [
      {
        description: "Milestone payment 25% of fixed price",
        count: 1,
        unitPriceExcludingVatCurrency: MILESTONE_AMOUNT,
        vatType: { id: vat25.id },
      },
    ],
  });

  const invoiceWrite = await api<any>(
    "PUT",
    `/order/${order.value.id}/:invoice?invoiceDate=${RUN_DATE}&sendToCustomer=false`,
  );

  const invoiceVerify = await api<any>(
    "GET",
    `/invoice/${invoiceWrite.value.id}?fields=*,customer(*),orders(*,project(*,customer(*),projectManager(*)),orderLines(*)),orderLines(*)`,
  );

  console.log(
    JSON.stringify(
      {
        managerId: manager.id,
        managerEmail: manager.email,
        managerResolution,
        customerId: customer.id,
        projectId: project.id,
        projectUpdatedFixedPrice: updatedProject.value?.fixedprice,
        projectUpdatedIsFixedPrice: updatedProject.value?.isFixedPrice,
        vatCandidates: vatTypes.map((vat) => ({
          id: vat.id,
          percentage: vat.percentage,
          name: vat.name,
          number: vat.number,
        })),
        chosenVat: {
          id: vat25.id,
          percentage: vat25.percentage,
          number: vat25.number,
          name: vat25.name,
        },
        orderId: order.value?.id,
        invoiceWriteShape: {
          id: invoiceWrite.value?.id,
          amountExcludingVatCurrency: invoiceWrite.value?.amountExcludingVatCurrency,
          amountCurrency: invoiceWrite.value?.amountCurrency,
          amountCurrencyOutstanding: invoiceWrite.value?.amountCurrencyOutstanding,
          customerId: invoiceWrite.value?.customer?.id ?? null,
          hasOrdersArray: Array.isArray(invoiceWrite.value?.orders),
          writeProjectId: invoiceWrite.value?.orders?.[0]?.project?.id ?? null,
          writeProjectManagerEmail:
            invoiceWrite.value?.orders?.[0]?.project?.projectManager?.email ?? null,
        },
        invoiceVerified: {
          id: invoiceVerify.value?.id,
          amountExcludingVatCurrency: invoiceVerify.value?.amountExcludingVatCurrency,
          amountCurrency: invoiceVerify.value?.amountCurrency,
          amountCurrencyOutstanding: invoiceVerify.value?.amountCurrencyOutstanding,
          projectId: invoiceVerify.value?.orders?.[0]?.project?.id ?? null,
          projectFixedPrice: invoiceVerify.value?.orders?.[0]?.project?.fixedprice ?? null,
          projectManagerEmail:
            invoiceVerify.value?.orders?.[0]?.project?.projectManager?.email ?? null,
          orderLineCount: invoiceVerify.value?.orders?.[0]?.orderLines?.length ?? null,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(String(err));
  process.exit(1);
});
