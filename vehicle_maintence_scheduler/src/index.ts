import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import { createLogger } from "../../logging_middleware/src/index";
import { ApiClient } from "./apiClient";
import { knapsack } from "./knapsack";
import { ScheduleResult } from "./types";

dotenv.config();

// ─── Config ───────────────────────────────────────────────────────────────────

const PORT = process.env.PORT ?? 3001;
const ACCESS_TOKEN = process.env.ACCESS_TOKEN ?? "";
const BASE_URL = process.env.BASE_URL ?? "http://20.207.122.201";
const PKG = "vehicle-maintence-scheduler";

if (!ACCESS_TOKEN) {
  process.stderr.write("ERROR: ACCESS_TOKEN is not set in .env\n");
  process.exit(1);
}

// ─── Logger & API Client ──────────────────────────────────────────────────────

const Log = createLogger({ accessToken: ACCESS_TOKEN, baseUrl: BASE_URL });
const apiClient = new ApiClient(BASE_URL, ACCESS_TOKEN);

// ─── Express App ──────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /schedule
 * Fetches all depots and vehicles from the test server, then runs the
 * 0/1 Knapsack algorithm to compute the optimal maintenance schedule
 * for each depot.
 */
app.get("/schedule", async (_req: Request, res: Response) => {
  await Log("backend", "INFO", PKG, "GET /schedule — scheduling request received");

  try {
    // Fetch depots
    await Log("backend", "DEBUG", PKG, "Fetching depots from evaluation service");
    const { depots } = await apiClient.fetchDepots();
    await Log("backend", "INFO", PKG, `Fetched ${depots.length} depots successfully`);

    // Fetch vehicles
    await Log("backend", "DEBUG", PKG, "Fetching vehicles from evaluation service");
    const { vehicles } = await apiClient.fetchVehicles();
    await Log("backend", "INFO", PKG, `Fetched ${vehicles.length} vehicles/tasks successfully`);

    // Run knapsack for each depot
    const results: ScheduleResult[] = [];

    for (const depot of depots) {
      await Log(
        "backend",
        "DEBUG",
        PKG,
        `Running knapsack for depot ${depot.ID} with budget ${depot.MechanicHours} hours`
      );

      const { selectedTasks, totalDuration, totalImpact } = knapsack(
        vehicles,
        depot.MechanicHours
      );

      await Log(
        "backend",
        "INFO",
        PKG,
        `Depot ${depot.ID}: selected ${selectedTasks.length} tasks — totalDuration=${totalDuration}h, totalImpact=${totalImpact}`
      );

      results.push({
        depotId: depot.ID,
        mechanicHoursBudget: depot.MechanicHours,
        selectedTasks,
        totalDuration,
        totalImpact,
      });
    }

    await Log("backend", "INFO", PKG, "Schedule computation complete — returning results");
    res.json({ success: true, schedules: results });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await Log("backend", "ERROR", PKG, `Schedule computation failed: ${message}`);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /schedule/:depotId
 * Returns optimal schedule for a single depot.
 */
app.get("/schedule/:depotId", async (req: Request, res: Response) => {
  const depotId = parseInt(req.params.depotId, 10);
  await Log("backend", "INFO", PKG, `GET /schedule/${depotId} — single depot schedule requested`);

  if (isNaN(depotId)) {
    await Log("backend", "WARN", PKG, `Invalid depotId param: ${req.params.depotId}`);
    res.status(400).json({ success: false, error: "depotId must be a number" });
    return;
  }

  try {
    const { depots } = await apiClient.fetchDepots();
    const depot = depots.find((d) => d.ID === depotId);

    if (!depot) {
      await Log("backend", "WARN", PKG, `Depot ${depotId} not found`);
      res.status(404).json({ success: false, error: `Depot ${depotId} not found` });
      return;
    }

    const { vehicles } = await apiClient.fetchVehicles();
    await Log("backend", "DEBUG", PKG, `Running knapsack for depot ${depotId} — budget: ${depot.MechanicHours}h, tasks: ${vehicles.length}`);

    const { selectedTasks, totalDuration, totalImpact } = knapsack(
      vehicles,
      depot.MechanicHours
    );

    await Log("backend", "INFO", PKG, `Depot ${depotId} result: ${selectedTasks.length} tasks selected, impact=${totalImpact}`);

    const result: ScheduleResult = {
      depotId: depot.ID,
      mechanicHoursBudget: depot.MechanicHours,
      selectedTasks,
      totalDuration,
      totalImpact,
    };

    res.json({ success: true, schedule: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await Log("backend", "ERROR", PKG, `Failed to compute schedule for depot ${depotId}: ${message}`);
    res.status(500).json({ success: false, error: message });
  }
});

/**
 * GET /health
 */
app.get("/health", async (_req: Request, res: Response) => {
  await Log("backend", "DEBUG", PKG, "Health check endpoint called");
  res.json({ status: "ok", service: "vehicle-maintence-scheduler" });
});

// ─── Global error handler ─────────────────────────────────────────────────────

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  Log("backend", "ERROR", PKG, `Unhandled error: ${err.message}`);
  res.status(500).json({ success: false, error: err.message });
});

// ─── Start ────────────────────────────────────────────────────────────────────

app.listen(PORT, async () => {
  await Log("backend", "INFO", PKG, `Vehicle Maintenance Scheduler started on port ${PORT}`);
  process.stdout.write(`[vehicle-maintence-scheduler] Running on http://localhost:${PORT}\n`);
});

export default app;
