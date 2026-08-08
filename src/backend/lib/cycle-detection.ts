/**
 * Pure dependency cycle detection (depth-first search).
 *
 * @param taskId        The task that wants to depend on `dependsOnId`.
 * @param dependsOnId   The proposed prerequisite.
 * @param adjacency     Existing graph: taskId -> list of ids it depends on.
 * @returns true if adding edge `taskId -> dependsOnId` would create a cycle.
 *
 * A cycle exists if `taskId` is reachable starting from `dependsOnId`.
 */
export function wouldCreateCycle(
  taskId: string,
  dependsOnId: string,
  adjacency: Map<string, string[]>,
): boolean {
  if (taskId === dependsOnId) return true;

  const visited = new Set<string>();
  const stack: string[] = [dependsOnId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === taskId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const neighbors = adjacency.get(current) ?? [];
    for (const next of neighbors) {
      if (!visited.has(next)) stack.push(next);
    }
  }
  return false;
}
