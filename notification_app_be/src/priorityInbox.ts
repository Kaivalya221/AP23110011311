import { Notification, TYPE_WEIGHT } from "./types";

/**
 * Stage 6 — Priority Inbox
 *
 * Computes a priority score for each notification based on:
 *   1. Type weight  (Placement=3, Result=2, Event=1)
 *   2. Recency      (newer notifications score higher)
 *
 * Score formula:
 *   score = typeWeight * 1_000_000 + recencyScore
 *
 * recencyScore is derived from timestamp so that among same-type
 * notifications, newer ones appear first.
 */
export function computePriorityScore(notification: Notification): number {
  const typeWeight = TYPE_WEIGHT[notification.Type] ?? 1;
  const timestampMs = new Date(notification.Timestamp).getTime();
  // Normalise to a value in [0, 999999] — recent = higher
  const recencyScore = timestampMs % 1_000_000;
  return typeWeight * 1_000_000 + recencyScore;
}

/**
 * Returns the top-n unread notifications by priority.
 * "Unread" in this context means all notifications from the API
 * (the API represents the student's unread inbox).
 *
 * Maintaining top-N efficiently:
 * As new notifications arrive, we re-sort and slice to n.
 * For very high-volume streams a min-heap of size n would give O(log n)
 * insertion, but for this exercise array sort is clear and correct.
 */
export function getTopNByPriority(
  notifications: Notification[],
  n: number
): Notification[] {
  return [...notifications]
    .sort((a, b) => computePriorityScore(b) - computePriorityScore(a))
    .slice(0, n);
}
