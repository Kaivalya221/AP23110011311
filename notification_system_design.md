# Notification System Design

---

## Stage 1

### REST API Design — Campus Notification Platform

#### Core Entities

**Notification**
```json
{
  "id": "uuid",
  "type": "Event | Result | Placement",
  "message": "string",
  "timestamp": "ISO8601",
  "isRead": "boolean",
  "studentId": "string"
}
```

#### REST API Endpoints

---

**GET /notifications**
Fetch all notifications for the authenticated student.

- Headers: `Authorization: Bearer <token>`
- Response 200:
```json
{
  "notifications": [
    {
      "id": "d146095a-0d86-4a34-9e69-3900a14576bc",
      "type": "Result",
      "message": "mid-sem",
      "timestamp": "2026-04-22T17:51:30",
      "isRead": false
    }
  ]
}
```

---

**GET /notifications/priority?n=10**
Returns top-n notifications ranked by importance (Placement > Result > Event) and recency.

- Headers: `Authorization: Bearer <token>`
- Query: `n` (integer, default=10, options: 10, 15, 20)
- Response 200:
```json
{
  "requested": 10,
  "returned": 10,
  "notifications": [ ... ]
}
```

---

**GET /notifications/:id**
Fetch a single notification by ID.

- Headers: `Authorization: Bearer <token>`
- Response 200:
```json
{ "notification": { "id": "...", "type": "...", "message": "...", "timestamp": "...", "isRead": true } }
```
- Response 404: `{ "error": "Notification not found" }`

---

**PATCH /notifications/:id/read**
Mark a specific notification as read.

- Headers: `Authorization: Bearer <token>`
- Response 200:
```json
{ "id": "...", "isRead": true }
```

---

**PATCH /notifications/read-all**
Mark all notifications as read for the authenticated student.

- Headers: `Authorization: Bearer <token>`
- Response 200:
```json
{ "updated": 42 }
```

---

**POST /notifications/notify-all**
(Admin/HR endpoint) Send a notification to all students simultaneously.

- Headers: `Authorization: Bearer <token>`
- Request Body:
```json
{
  "type": "Placement",
  "message": "CSX Corporation hiring",
  "studentIds": ["id1", "id2"]
}
```
- Response 202 (Accepted — async):
```json
{ "jobId": "uuid", "status": "queued", "totalRecipients": 50000 }
```

---

#### Real-Time Notification Mechanism

**Chosen approach: Server-Sent Events (SSE)**

SSE is the right fit here because notifications are server-to-client only (students do not push events back). Compared to WebSockets:
- SSE uses a standard HTTP connection — no protocol upgrade overhead
- Automatic reconnection built into browsers
- Works well through proxies and load balancers with keep-alive
- Lower implementation complexity on the backend

**Endpoint:**
```
GET /notifications/stream
Headers: Authorization: Bearer <token>
Content-Type: text/event-stream
```

The server pushes events in the format:
```
event: notification
data: {"id":"...","type":"Placement","message":"CSX Corporation hiring","timestamp":"..."}
```

---

## Stage 2

### Persistent Storage — Database Choice & Schema

#### Recommended Database: PostgreSQL (Relational)

**Rationale:**
- Notifications have a well-defined, consistent schema (ID, Type, Message, Timestamp, isRead, studentId) — relational fits naturally.
- SQL queries (joins, filters, indexes) are well-optimised for the common access patterns: "fetch unread for student", "filter by type", "order by timestamp".
- ACID guarantees ensure no duplicate or lost notifications during the notify-all bulk operation.
- Mature tooling, easy to self-host or use managed (AWS RDS, Supabase, etc.).

#### Schema

```sql
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TYPE notification_type AS ENUM ('Event', 'Result', 'Placement');

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  type notification_type NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for the most common query pattern
CREATE INDEX idx_notifications_student_unread
  ON notifications (student_id, is_read, created_at DESC);

CREATE INDEX idx_notifications_type
  ON notifications (type);
```

#### Problems as Data Volume Increases

1. **Table size explosion**: With 50,000 students and millions of notifications, a single table will grow into hundreds of GBs.
2. **Read slowdowns**: Full-table scans for unread notifications per student.
3. **Write bottlenecks**: Bulk inserts for notify-all (50,000 rows at once) cause lock contention.

#### Solutions

- **Partitioning**: Partition `notifications` by `created_at` (monthly partitions). Old partitions can be archived or dropped.
- **Read replicas**: Direct all read queries (GET /notifications) to a replica; writes go to the primary.
- **Connection pooling**: Use PgBouncer to handle thousands of concurrent student connections.

#### Relevant Queries

Fetch all unread notifications for a student:
```sql
SELECT * FROM notifications
WHERE student_id = $1 AND is_read = FALSE
ORDER BY created_at DESC;
```

Fetch placement notifications in the last 7 days:
```sql
SELECT * FROM notifications
WHERE type = 'Placement'
  AND created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
```

Mark all as read for a student:
```sql
UPDATE notifications
SET is_read = TRUE
WHERE student_id = $1 AND is_read = FALSE;
```

---

## Stage 3

### Slow Query Analysis

#### Original Query
```sql
SELECT * FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

#### Why Is This Slow?

With 5,000,000 rows and no index on `(studentID, isRead)`, the database engine must perform a **full sequential scan** of the entire table to find matching rows, then sort them. At this scale that is O(n) per query — extremely slow as n grows.

#### Is the Query Accurate?

The query logic is correct but `SELECT *` is wasteful — fetching all columns when typically only a subset is needed. Prefer explicit column names.

#### Computation Cost

Without indexes: O(n) scan = scanning ~5M rows per request × concurrent users = severe CPU and I/O pressure.

#### Fix: Composite Index

```sql
CREATE INDEX idx_notifications_student_unread
  ON notifications (student_id, is_read, created_at DESC);
```

With this index, the DB performs an **index range scan** restricted to that student's unread rows — effectively O(log n + k) where k is the result size.

#### "Add indexes on every column" — Is that good advice?

**No.** This is harmful advice. Every index:
- Slows down INSERT / UPDATE / DELETE (index must be updated too)
- Consumes additional disk space
- Can confuse the query planner if there are too many options

Only index columns that appear in WHERE clauses, JOIN conditions, or ORDER BY of frequent, high-volume queries.

#### Query: Placement Notifications in Last 7 Days

```sql
SELECT id, student_id, message, created_at
FROM notifications
WHERE type = 'Placement'
  AND created_at >= NOW() - INTERVAL '7 days'
ORDER BY created_at DESC;
```

Supporting index:
```sql
CREATE INDEX idx_notifications_type_created
  ON notifications (type, created_at DESC);
```

---

## Stage 4

### Notification Fetching Performance — Reducing DB Load

#### Problem

Fetching all notifications on every page load for 50,000 students hammers the database on every request, causing slow response times and overwhelming the DB connection pool.

#### Suggested Solutions & Tradeoffs

---

**1. Server-Side Caching (Redis)**

Cache each student's unread notification list in Redis with a TTL (e.g., 60 seconds).

- On GET /notifications: check Redis first → DB only on cache miss
- On new notification arrival: invalidate that student's cache key
- **Tradeoff**: slight staleness (up to TTL seconds). Acceptable for a notification inbox; not acceptable for financial transactions.
- **Implementation**: `GET cache:notifications:student:{id}` → if miss, query DB and `SET` with TTL.

---

**2. Pagination**

Instead of loading all notifications at once, return pages of 20-50.

- Reduces payload size and DB rows fetched per request
- Frontend loads more on scroll (infinite scroll) or page click
- **Tradeoff**: UX complexity on the client side; need cursor-based pagination for correctness at high volume.

```
GET /notifications?cursor=<last_seen_id>&limit=20
```

---

**3. Read Replicas**

Direct all GET /notifications reads to a Postgres read replica. Writes (mark as read, new notifications) go to primary.

- Near-zero additional latency, major relief for primary DB
- **Tradeoff**: Replication lag (usually <100ms); a student may briefly see a notification they just marked as read.

---

**4. Push Model Instead of Pull (SSE / WebSockets)**

Rather than fetching on every page load, maintain a persistent SSE connection. The server pushes new notifications as they arrive.

- Eliminates polling entirely — 0 DB queries on page load after initial fetch
- **Tradeoff**: Requires managing open connections (one per online student). At 50,000 concurrent students, this needs horizontal scaling with sticky sessions or a pub/sub broker (Redis Pub/Sub, Kafka).

---

**Recommended Combination**: Redis caching (Layer 1) + Pagination (Layer 2) + SSE for real-time delivery (Layer 3). This covers both bulk load reduction and real-time UX.

---

## Stage 5

### Reliable Notify-All — Redesigned

#### Original Pseudocode Problems

```
function notify_all(student_ids: array, message: string):
    for student_id in student_ids:
        send_email(student_id, message)   # calls Email API
        save_to_db(student_id, message)   # DB insert
        push_to_app(student_id, message)  # SSE push
```

**Identified Shortcomings:**

1. **No atomicity**: If `send_email` succeeds but `save_to_db` fails for student #200, that student gets an email but no in-app record. The state is inconsistent.
2. **Synchronous loop**: Iterating over 50,000 students sequentially in one HTTP request will time out. The caller gets no response for minutes.
3. **No retry logic**: If `send_email` fails midway (as stated — failed for 200 students), there is no way to retry just the failed subset.
4. **No observability**: No logging of which students were notified or which failed.

#### Redesigned Approach

**Strategy: Task Queue + Worker Pool**

```
function notify_all(student_ids: array, message: string):
    jobId = generate_uuid()
    Log("backend", "INFO", "notify-all", f"notify_all job {jobId} queued for {len(student_ids)} students")
    
    // Enqueue a batch job — return immediately to the caller
    queue.enqueue("send_notification_batch", {
        jobId: jobId,
        studentIds: student_ids,
        message: message,
        type: "Placement"
    })
    
    return { jobId: jobId, status: "queued" }


// Worker processes this asynchronously
function process_notification_batch(job):
    failed = []
    
    for student_id in job.studentIds:
        try:
            // Save to DB first — source of truth
            save_to_db(student_id, job.message, job.type)
            
            // Then send email — fire-and-forget with retry
            enqueue_email(student_id, job.message)   // separate email queue
            
            // Push via SSE if student is online
            push_to_app(student_id, job.message)
            
        except Exception as e:
            Log("backend", "ERROR", "notify-all", f"Failed for student {student_id}: {e}")
            failed.append(student_id)
    
    if failed:
        Log("backend", "WARN", "notify-all", f"Retrying {len(failed)} failed notifications")
        queue.enqueue("process_notification_batch", { studentIds: failed, ... })
```

#### Should DB Save and Email Happen Together?

**No.** They should be decoupled:

- DB insert is the **authoritative record** — it must always happen first.
- Email delivery is a **side effect** — it can fail and be retried independently without affecting data integrity.
- If we roll back the DB insert when email fails, the student never gets an in-app notification either — worse UX.

The correct model: save to DB → enqueue email job separately → email worker retries with exponential backoff on failure.

---

## Stage 6

### Priority Inbox Implementation

#### Approach

Priority is determined by a two-factor score:

```
score = typeWeight × 1,000,000 + recencyScore
```

Where:
- `typeWeight`: Placement=3, Result=2, Event=1
- `recencyScore`: Unix timestamp modulo 1,000,000 (higher = more recent)

This ensures Placement always outranks Result, which always outranks Event. Within the same type, newer notifications appear first.

#### Implementation

See `src/priorityInbox.ts` in `notification_app_be`.

The `getTopNByPriority(notifications, n)` function:
1. Fetches all notifications from the API
2. Computes priority score for each
3. Sorts descending by score
4. Returns the top n

#### Maintaining Top-N Efficiently as New Notifications Arrive

**Current implementation**: Sort all + slice — O(n log n). Acceptable for hundreds of notifications.

**For high-volume streams**: Replace with a **min-heap of size n**:
- Maintain a heap of the current top-n by score
- For each incoming notification: if its score > heap minimum, pop the minimum and push the new one
- O(log n) per insertion, O(n) space — optimal for streaming

#### API Endpoint

```
GET /notifications/priority?n=10
GET /notifications/priority?n=15
GET /notifications/priority?n=20
```

Response includes the notifications ranked by priority with their type and timestamp visible so the frontend can render appropriate badges.
