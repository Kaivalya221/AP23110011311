import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import { createLogger } from "../../logging_middleware/src/index";
import { NotificationApiClient } from "./apiClient";
import { getTopNByPriority } from "./priorityInbox";

dotenv.config();

// ─── Config ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? 3002;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN ?? "";
const BASE_URL = process.env.BASE_URL ?? "http://20.207.122.201";
const PKG = "notification-app-be";

if (!ACCESS_TOKEN) {
  process.stderr.write("ERROR: ACCESS_TOKEN is not set in .env\n");
  process.exit(1);
}

// ─── Logger & API Client ──────────────────────────────────────────────────────

const Log = createLogger({ accessToken: ACCESS_TOKEN, baseUrl: BASE_URL });
const notifClient = new NotificationApiClient(BASE_URL, ACCESS_TOKEN);

// ─── Express App ──────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /notifications
 * Returns all notifications fetched from the test server.
 */
app.get("/notifications", async (_req: Request, res: Response) => {
  await Log("backend", "INFO", PKG, "GET /notifications — fetching all notifications");

  try {
    const data = await notifClient.fetchNotifications();
    await Log("backend", "INFO", PKG, `Fetched ${data.notifications.length} notifications successfully`);
    res.json({ success: true, ...data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await Log("backend", "ERROR", PKG, `Failed to fetch notifications: ${message}`);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /notifications/priority?n=10
 * Stage 6 — Priority Inbox.
 * Returns top-n notifications sorted by (type weight + recency).
 * Default n=10; supports 10, 15, 20 as per product spec.
 */
app.get("/notifications/priority", async (req: Request, res: Response) => {
  const n = parseInt((req.query.n as string) ?? "10", 10);
  await Log("backend", "INFO", PKG, `GET /notifications/priority?n=${n} — priority inbox requested`);

  if (isNaN(n) || n <= 0) {
    await Log("backend", "WARN", PKG, `Invalid n param: ${req.query.n}`);
    res.status(400).json({ success: false, error: "n must be a positive integer" });
    return;
  }

  try {
    const { notifications } = await notifClient.fetchNotifications();
    await Log("backend", "DEBUG", PKG, `Fetched ${notifications.length} notifications — computing top ${n}`);

    const topN = getTopNByPriority(notifications, n);
    await Log("backend", "INFO", PKG, `Priority inbox computed: returning top ${topN.length} of ${notifications.length} notifications`);

    res.json({
      success: true,
      requested: n,
      returned: topN.length,
      notifications: topN,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await Log("backend", "ERROR", PKG, `Priority inbox computation failed: ${message}`);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /notifications/type/:type
 * Filter notifications by type: Event | Result | Placement
 */
app.get("/notifications/type/:type", async (req: Request, res: Response) => {
  const { type } = req.params;
  await Log("backend", "INFO", PKG, `GET /notifications/type/${type} — filter by type`);

  try {
    const { notifications } = await notifClient.fetchNotifications();
    const filtered = notifications.filter(
      (n) => n.Type.toLowerCase() === type.toLowerCase()
    );

    await Log("backend", "INFO", PKG, `Filtered ${filtered.length} notifications of type ${type}`);
    res.json({ success: true, type, count: filtered.length, notifications: filtered });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await Log("backend", "ERROR", PKG, `Failed to filter notifications by type ${type}: ${message}`);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /health
 */
app.get("/health", async (_req: Request, res: Response) => {
  await Log("backend", "DEBUG", PKG, "Health check called");
  res.json({ status: "ok", service: "notification-app-be" });
});

// ─── Global error handler ─────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  Log("backend", "ERROR", PKG, `Unhandled error: ${err.message}`);
  res.status(500).json({ success: false, error: err.message });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  await Log("backend", "INFO", PKG, `Campus Notification Service started on port ${PORT}`);
  process.stdout.write(`[notification-app-be] Running on http://localhost:${PORT}\n`);
});

export default app;
