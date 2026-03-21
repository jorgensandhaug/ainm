import path from "node:path";
import { fileURLToPath } from "node:url";

import type { ActiveStrategySelectionConfig } from "../runtime/contracts";
import {
  createActiveStrategyResolver,
  loadActiveStrategySelectionConfig,
} from "./active-strategy-selection";
import {
  CANONICAL_TASK_REGISTRY,
  slugToTxTaskId,
  txTaskIdToSlug,
} from "./legacy-tripletex1-task-bridge";
import { createTaskRegistry } from "./task-registry";
import { taskRegistration as createCustomerTask } from "../tasks/task-01/task";
import { taskRegistration as createSupplierTask } from "../tasks/task-02/task";
import { taskRegistration as createDepartmentTask } from "../tasks/task-03/task";
import { taskRegistration as createProductTask } from "../tasks/task-04/task";
import { taskRegistration as createProjectTask } from "../tasks/task-05/task";
import { taskRegistration as createEmployeeTask } from "../tasks/task-06/task";
import { taskRegistration as createAccountingDimensionAndPostVoucherTask } from "../tasks/task-07/task";
import { taskRegistration as createAndSendInvoiceTask } from "../tasks/task-08/task";
import { taskRegistration as createCustomerInvoiceTask } from "../tasks/task-09/task";
import { taskRegistration as issueFullCreditNoteTask } from "../tasks/task-10/task";
import { taskRegistration as createOrderInvoiceAndRegisterPaymentTask } from "../tasks/task-11/task";
import { taskRegistration as runPayrollWithBonusTask } from "../tasks/task-12/task";
import { taskRegistration as registerTravelExpenseTask } from "../tasks/task-13/task";
import { taskRegistration as setProjectFixedPriceAndInvoiceMilestoneTask } from "../tasks/task-14/task";
import { taskRegistration as registerProjectHoursAndCreateProjectInvoiceTask } from "../tasks/task-15/task";
import { taskRegistration as registerSupplierInvoiceTask } from "../tasks/task-16/task";
import { taskRegistration as registerCustomerInvoicePaymentTask } from "../tasks/task-17/task";
import { taskRegistration as reverseCustomerInvoicePaymentTask } from "../tasks/task-18/task";
import { taskRegistration as unknownTask19 } from "../tasks/task-19/task";
import { taskRegistration as unknownTask20 } from "../tasks/task-20/task";
import { taskRegistration as unknownTask21 } from "../tasks/task-21/task";
import { taskRegistration as unknownTask22 } from "../tasks/task-22/task";
import { taskRegistration as unknownTask23 } from "../tasks/task-23/task";
import { taskRegistration as unknownTask25 } from "../tasks/task-25/task";
import { taskRegistration as unknownTask26 } from "../tasks/task-26/task";
import { taskRegistration as unknownTask27 } from "../tasks/task-27/task";
import { taskRegistration as analyzeExpenseIncreaseCreateInternalProjectsTask } from "../tasks/task-28/task";
import { taskRegistration as unknownTask29 } from "../tasks/task-29/task";
import { taskRegistration as unknownTask30 } from "../tasks/task-30/task";

const registeredTaskRegistrations = [
  createCustomerTask,
  createSupplierTask,
  createDepartmentTask,
  createProductTask,
  createProjectTask,
  createEmployeeTask,
  createAccountingDimensionAndPostVoucherTask,
  createAndSendInvoiceTask,
  createCustomerInvoiceTask,
  issueFullCreditNoteTask,
  createOrderInvoiceAndRegisterPaymentTask,
  runPayrollWithBonusTask,
  registerTravelExpenseTask,
  setProjectFixedPriceAndInvoiceMilestoneTask,
  registerProjectHoursAndCreateProjectInvoiceTask,
  registerSupplierInvoiceTask,
  registerCustomerInvoicePaymentTask,
  reverseCustomerInvoicePaymentTask,
  unknownTask19,
  unknownTask20,
  unknownTask21,
  unknownTask22,
  unknownTask23,
  unknownTask25,
  unknownTask26,
  unknownTask27,
  analyzeExpenseIncreaseCreateInternalProjectsTask,
  unknownTask29,
  unknownTask30,
] as const;
const registeredTaskRegistrationsById = new Map(
  registeredTaskRegistrations.map((registration) => [
    registration.task.taskId,
    registration,
  ]),
);

export const taskRegistrations = CANONICAL_TASK_REGISTRY.map((canonicalTask) => {
  const registration = registeredTaskRegistrationsById.get(canonicalTask.taskId);
  if (!registration) {
    throw new Error("Missing task registration for canonical task \"" + canonicalTask.taskId + "\".");
  }

  return registration;
});
export const DEFAULT_ACTIVE_STRATEGY_SELECTION_CONFIG_PATH =
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../configs/active-strategies.json",
  );

export const taskRegistry = createTaskRegistry(taskRegistrations);

export const taskSpecs = taskRegistry.taskSpecs;

export { slugToTxTaskId, txTaskIdToSlug };

export const listTaskIds = (): readonly string[] => taskRegistry.listTaskIds();

export const hasTask = (taskId: string): boolean => taskRegistry.hasTask(taskId);

export const getTaskSpec = (taskId: string) => taskRegistry.getTaskSpec(taskId);

export const requireTaskSpec = (taskId: string) =>
  taskRegistry.requireTaskSpec(taskId);

export const loadTaskModule = (taskId: string) =>
  taskRegistry.loadTaskModule(taskId);

export const requireTaskModule = (taskId: string) =>
  taskRegistry.requireTaskModule(taskId);

export const loadActiveStrategyResolver = async (
  configPath: string = DEFAULT_ACTIVE_STRATEGY_SELECTION_CONFIG_PATH,
  configOverride?: ActiveStrategySelectionConfig,
) => {
  if (configOverride) {
    return createActiveStrategyResolver({
      registry: taskRegistry,
      config: configOverride,
      configPath: "inline-override",
    });
  }

  const loadedConfig = await loadActiveStrategySelectionConfig(configPath);

  return createActiveStrategyResolver({
    registry: taskRegistry,
    ...loadedConfig,
  });
};
