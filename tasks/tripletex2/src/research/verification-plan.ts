import {
  RESEARCH_VERIFICATION_PLAN_SCHEMA_VERSION,
  type ResearchVerificationPlan,
} from "./types";

export function buildTaskVerificationPlan(
  taskId: string,
): ResearchVerificationPlan | undefined {
  if (taskId === "06") {
    return {
      schemaVersion: RESEARCH_VERIFICATION_PLAN_SCHEMA_VERSION,
      planId: "task-06.create-employee.v1",
      taskId: "06",
      checks: [
        {
          type: "object",
          checkId: "employee-readback",
          description:
            "Read the created employee and confirm the normalized identity fields.",
          pathTemplate: "/employee/{{result.createdEntityIds.employeeId}}",
          query: {
            fields: "*",
          },
          responsePath: "value",
          assertions: [
            {
              actualPath: "firstName",
              equalsFromPath: "result.verification.firstName",
            },
            {
              actualPath: "lastName",
              equalsFromPath: "result.verification.lastName",
            },
            {
              actualPath: "email",
              equalsFromPath: "result.verification.email",
            },
            {
              actualPath: "dateOfBirth",
              equalsFromPath: "result.verification.dateOfBirth",
            },
          ],
        },
        {
          type: "collection",
          checkId: "employment-readback",
          description:
            "Read employments for the created employee and confirm the scored start date.",
          pathTemplate: "/employee/employment",
          query: {
            employeeId: "{{result.createdEntityIds.employeeId}}",
            fields: "*",
          },
          collectionPath: "values",
          matchPath: "id",
          matchFromPath: "result.createdEntityIds.employmentId",
          assertions: [
            {
              actualPath: "startDate",
              equalsFromPath: "result.verification.startDate",
            },
          ],
        },
      ],
    };
  }

  if (taskId === "15") {
    return {
      schemaVersion: RESEARCH_VERIFICATION_PLAN_SCHEMA_VERSION,
      planId: "task-15.register-hours-project-invoice.v1",
      taskId: "15",
      checks: [
        {
          type: "object",
          checkId: "timesheet-entry-readback",
          description:
            "Read the first created timesheet entry and confirm hours, project, and activity.",
          pathTemplate: "/timesheet/entry/{{result.verification.timesheetEntryIds.0}}",
          query: {
            fields: "*",
          },
          responsePath: "value",
          assertions: [
            {
              actualPath: "project.id",
              equalsFromPath: "result.verification.projectId",
            },
            {
              actualPath: "activity.id",
              equalsFromPath: "result.verification.activityId",
            },
            {
              actualPath: "hours",
              equalsFromPath: "result.verification.registeredHours.0",
            },
          ],
        },
        {
          type: "object",
          checkId: "invoice-readback",
          description:
            "Read the created invoice and confirm customer, amount, and order linkage.",
          pathTemplate: "/invoice/{{result.createdEntityIds.invoiceId}}",
          query: {
            fields: "*,customer(*),orders(*)",
          },
          responsePath: "value",
          assertions: [
            {
              actualPath: "customer.id",
              equalsFromPath: "result.verification.customerId",
            },
            {
              actualPath: "amountExcludingVatCurrency",
              equalsFromPath: "result.verification.amountExcludingVatCurrency",
            },
            {
              actualPath: "invoiceNumber",
              equalsFromPath: "result.verification.invoiceNumber",
            },
          ],
        },
      ],
    };
  }

  if (taskId === "11") {
    return {
      schemaVersion: RESEARCH_VERIFICATION_PLAN_SCHEMA_VERSION,
      planId: "task-11.order-invoice-payment.v1",
      taskId: "11",
      checks: [
        {
          type: "object",
          checkId: "invoice-readback",
          description:
            "Read the created invoice and confirm the customer, invoice date, paid state, and scored order lines.",
          pathTemplate: "/invoice/{{result.createdEntityIds.invoiceId}}",
          query: {
            fields:
              "*,customer(*),orderLines(*,product(*)),orders(*,orderLines(*,product(*)))",
          },
          responsePath: "value",
          assertions: [
            {
              actualPath: "customer.id",
              equalsFromPath: "result.createdEntityIds.customerId",
            },
            {
              actualPath: "invoiceDate",
              equalsFromPath: "result.verification.invoiceDate",
            },
            {
              actualPath: "invoiceNumber",
              equalsFromPath: "result.verification.invoiceNumber",
            },
            {
              actualPath: "orders.0.orderLines.0.description",
              equalsFromPath: "input.lines.0.description",
            },
            {
              actualPath: "orders.0.orderLines.1.description",
              equalsFromPath: "input.lines.1.description",
            },
            {
              actualPath: "amountCurrencyOutstanding",
              equalsFromPath: "result.verification.remainingOutstanding",
            },
          ],
        },
      ],
    };
  }

  return undefined;
}
