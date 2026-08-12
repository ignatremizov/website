export type WorldAction = () => void | Promise<void>;

/**
 * Preserves synchronous action side effects while giving both thrown and
 * asynchronously rejected failures one explicit recovery boundary.
 */
export function executeWorldAction(
  action: WorldAction,
  onFailure: (error: unknown) => void,
): void {
  try {
    const pending = action();
    if (pending) void pending.catch(onFailure);
  } catch (error) {
    onFailure(error);
  }
}
