import { Vehicle } from "./types";

/**
 * Solves the 0/1 Knapsack problem to select the optimal subset of vehicle
 * maintenance tasks that maximises total operational impact within a
 * mechanic-hour budget.
 *
 * Algorithm: Dynamic Programming — O(n * W) time, O(n * W) space
 *
 * @param vehicles  - List of maintenance tasks with Duration and Impact
 * @param budget    - Available mechanic-hours (capacity)
 * @returns         - Selected tasks and aggregate stats
 */
export function knapsack(
  vehicles: Vehicle[],
  budget: number
): { selectedTasks: Vehicle[]; totalDuration: number; totalImpact: number } {
  const n = vehicles.length;

  // dp[i][w] = max impact using first i items with capacity w
  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(budget + 1).fill(0)
  );

  // Fill DP table
  for (let i = 1; i <= n; i++) {
    const { Duration: dur, Impact: imp } = vehicles[i - 1];
    for (let w = 0; w <= budget; w++) {
      dp[i][w] = dp[i - 1][w]; // skip this task
      if (dur <= w) {
        // take this task if it improves the score
        dp[i][w] = Math.max(dp[i][w], dp[i - 1][w - dur] + imp);
      }
    }
  }

  // Backtrack to find selected tasks
  const selectedTasks: Vehicle[] = [];
  let remainingCapacity = budget;

  for (let i = n; i > 0; i--) {
    if (dp[i][remainingCapacity] !== dp[i - 1][remainingCapacity]) {
      selectedTasks.push(vehicles[i - 1]);
      remainingCapacity -= vehicles[i - 1].Duration;
    }
  }

  const totalDuration = selectedTasks.reduce((sum, v) => sum + v.Duration, 0);
  const totalImpact = selectedTasks.reduce((sum, v) => sum + v.Impact, 0);

  return { selectedTasks, totalDuration, totalImpact };
}
