import type {
  TaskModule,
  TaskRegistration,
  TaskSpec,
} from "../runtime/contracts";

type AnyTaskModule = TaskModule<any, string>;
type AnyTaskRegistration = TaskRegistration<any, string>;
type AnyTaskSpec = TaskSpec<any, string>;

export interface TaskRegistry {
  registrations: readonly AnyTaskRegistration[];
  taskSpecs: readonly AnyTaskSpec[];
  listTaskIds(): readonly string[];
  hasTask(taskId: string): boolean;
  getTaskRegistration(taskId: string): AnyTaskRegistration | undefined;
  requireTaskRegistration(taskId: string): AnyTaskRegistration;
  getTaskSpec(taskId: string): AnyTaskSpec | undefined;
  requireTaskSpec(taskId: string): AnyTaskSpec;
  loadTaskModule(taskId: string): Promise<AnyTaskModule | undefined>;
  requireTaskModule(taskId: string): Promise<AnyTaskModule>;
}

export function createTaskRegistry(
  registrations: readonly AnyTaskRegistration[],
): TaskRegistry {
  const registrationsByTaskId = new Map<string, AnyTaskRegistration>();

  for (const registration of registrations) {
    const existing = registrationsByTaskId.get(registration.task.taskId);
    if (existing) {
      throw new Error(
        `Duplicate task registration for taskId "${registration.task.taskId}".`,
      );
    }

    registrationsByTaskId.set(registration.task.taskId, registration);
  }

  const taskSpecs = registrations.map(({ task }) => task);

  const getTaskRegistration = (
    taskId: string,
  ): AnyTaskRegistration | undefined => registrationsByTaskId.get(taskId);

  const requireTaskRegistration = (taskId: string): AnyTaskRegistration => {
    const registration = getTaskRegistration(taskId);
    if (!registration) {
      throw new Error(`Unknown taskId "${taskId}".`);
    }

    return registration;
  };

  const getTaskSpec = (taskId: string): AnyTaskSpec | undefined =>
    getTaskRegistration(taskId)?.task;

  const requireTaskSpec = (taskId: string): AnyTaskSpec =>
    requireTaskRegistration(taskId).task;

  const loadTaskModule = async (
    taskId: string,
  ): Promise<AnyTaskModule | undefined> => {
    const registration = getTaskRegistration(taskId);
    if (!registration) {
      return undefined;
    }

    const taskModule = await registration.loadTaskModule();
    if (taskModule.task.taskId !== taskId) {
      throw new Error(
        `Task module for "${taskId}" loaded mismatched taskId "${taskModule.task.taskId}".`,
      );
    }

    return taskModule;
  };

  const requireTaskModule = async (taskId: string): Promise<AnyTaskModule> => {
    const taskModule = await loadTaskModule(taskId);
    if (!taskModule) {
      throw new Error(`Unknown taskId "${taskId}".`);
    }

    return taskModule;
  };

  return {
    registrations,
    taskSpecs,
    listTaskIds: () => registrations.map(({ task }) => task.taskId),
    hasTask: (taskId: string) => registrationsByTaskId.has(taskId),
    getTaskRegistration,
    requireTaskRegistration,
    getTaskSpec,
    requireTaskSpec,
    loadTaskModule,
    requireTaskModule,
  };
}
