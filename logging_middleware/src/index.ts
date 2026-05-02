import axios from "axios";

// ─── Types ────────────────────────────────────────────────────────────────────

export type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";
export type LogStack = "backend" | "frontend";

export interface LoggerConfig {
  /** Bearer token obtained from /evaluation-service/auth */
  accessToken: string;
  /** Base URL of the test server */
  baseUrl?: string;
}

export interface LogPayload {
  stack: LogStack;
  level: LogLevel;
  package: string;
  message: string;
}

// ─── Logger Class ─────────────────────────────────────────────────────────────

export class AffordmedLogger {
  private accessToken: string;
  private baseUrl: string;
  private logEndpoint: string;

  constructor(config: LoggerConfig) {
    this.accessToken = config.accessToken;
    this.baseUrl = config.baseUrl ?? "http://20.207.122.201";
    this.logEndpoint = `${this.baseUrl}/evaluation-service/logs`;
  }

  /**
   * Core Log function as required by the assessment.
   * Sends a log entry to the Affordmed Test Server.
   *
   * @param stack   - "backend" or "frontend"
   * @param level   - Log level: INFO | WARN | ERROR | DEBUG
   * @param pkg     - Package/module name (e.g., "vehicle-scheduler", "notification-service")
   * @param message - Descriptive log message
   */
  async Log(
    stack: LogStack,
    level: LogLevel,
    pkg: string,
    message: string
  ): Promise<void> {
    const payload: LogPayload = { stack, level, package: pkg, message };

    try {
      await axios.post(this.logEndpoint, payload, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 5000,
      });
    } catch (err: unknown) {
      // Silently fail — logging must never crash the host application
      if (axios.isAxiosError(err)) {
        process.stderr.write(
          `[AffordmedLogger] Failed to send log: ${err.message}\n`
        );
      }
    }
  }
}

// ─── Factory helper ───────────────────────────────────────────────────────────

/**
 * Creates and returns a bound Log function, ready to be used across your app.
 *
 * Usage:
 *   const Log = createLogger({ accessToken: "your_token" });
 *   await Log("backend", "INFO", "my-package", "Server started on port 3000");
 */
export function createLogger(config: LoggerConfig) {
  const logger = new AffordmedLogger(config);
  return logger.Log.bind(logger);
}

export default AffordmedLogger;
