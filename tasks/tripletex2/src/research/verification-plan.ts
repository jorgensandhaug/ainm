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

  if (taskId === "21") {
    return {
      schemaVersion: RESEARCH_VERIFICATION_PLAN_SCHEMA_VERSION,
      planId: "task-21.onboard-employee-offer-letter.v1",
      taskId: "21",
      checks: [
        {
          type: "object",
          checkId: "employee-readback",
          description:
            "Read the created employee and confirm identity, date of birth, and department.",
          pathTemplate: "/employee/{{result.createdEntityIds.employeeId}}",
          query: {
            fields: "*,department(*)",
          },
          responsePath: "value",
          assertions: [
            {
              actualPath: "dateOfBirth",
              equalsFromPath: "result.verification.birthDate",
            },
          ],
        },
        {
          type: "collection",
          checkId: "employment-details-readback",
          description:
            "Read employments for the created employee and confirm remunerationType, employmentForm, salary, percentage, and occupation code.",
          pathTemplate: "/employee/employment",
          query: {
            employeeId: "{{result.createdEntityIds.employeeId}}",
            fields: "*,employmentDetails(*,occupationCode(*))",
          },
          collectionPath: "values",
          matchPath: "id",
          matchFromPath: "result.createdEntityIds.employmentId",
          assertions: [
            {
              actualPath: "startDate",
              equalsFromPath: "result.verification.startDate",
            },
            {
              actualPath: "employmentDetails.0.remunerationType",
              equalsFromPath: "result.verification.remunerationType",
            },
            {
              actualPath: "employmentDetails.0.employmentForm",
              equalsFromPath: "result.verification.employmentForm",
            },
            {
              actualPath: "employmentDetails.0.annualSalary",
              equalsFromPath: "result.verification.annualSalaryNok",
            },
            {
              actualPath: "employmentDetails.0.percentageOfFullTimeEquivalent",
              equalsFromPath:
                "result.verification.percentageOfFullTimeEquivalent",
            },
            {
              actualPath: "employmentDetails.0.occupationCode.id",
              equalsFromPath: "result.verification.occupationCodeId",
            },
          ],
        },
        {
          type: "collection",
          checkId: "standard-time-readback",
          description:
            "Read the standard worktime for the employee and confirm hours per day.",
          pathTemplate: "/employee/standardTime",
          query: {
            employeeId: "{{result.createdEntityIds.employeeId}}",
            fields: "*",
          },
          collectionPath: "values",
          matchPath: "id",
          matchFromPath: "result.createdEntityIds.standardTimeId",
          assertions: [
            {
              actualPath: "hoursPerDay",
              equalsFromPath: "result.verification.standardHoursPerDay",
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
