# affordmed-logger

Reusable logging middleware package for the Affordmed Campus Hiring Evaluation.

## Setup

```bash
npm install
npm run build
```

## Usage

```typescript
import { createLogger } from "./dist/index";

const Log = createLogger({ accessToken: "YOUR_BEARER_TOKEN" });

// Log(stack, level, package, message)
await Log("backend", "INFO", "my-service", "Server started on port 3000");
await Log("backend", "ERROR", "my-service", "Database connection failed");
await Log("backend", "DEBUG", "my-service", "Processing request for user 42");
await Log("backend", "WARN",  "my-service", "Response time exceeded 500ms");
```

## API

### `Log(stack, level, package, message)`

| Param     | Type                              | Description                        |
|-----------|-----------------------------------|------------------------------------|
| `stack`   | `"backend"` \| `"frontend"`       | Which stack the log is from        |
| `level`   | `"INFO"` \| `"WARN"` \| `"ERROR"` \| `"DEBUG"` | Severity level     |
| `package` | `string`                          | Package/module identifier          |
| `message` | `string`                          | Descriptive log message            |
