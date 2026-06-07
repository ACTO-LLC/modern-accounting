# Enhancements API Documentation

This document provides detailed documentation for the `/api/enhancements` endpoints used to manage AI-driven feature enhancement requests.

## Base URL

```
http://localhost:3001/api
```

## Authentication

Currently, the API does not require authentication. In production environments, implement appropriate authentication middleware (e.g., JWT, OAuth2).

---

## Endpoints Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/enhancements` | List all enhancements |
| GET | `/api/enhancements/:id` | Get enhancement by ID |
| POST | `/api/enhancements` | Create new enhancement |
| PUT | `/api/enhancements/:id` | Update enhancement |
| DELETE | `/api/enhancements/:id` | Delete enhancement |

---

## GET /api/enhancements

Retrieve a list of all enhancement requests with optional filtering.

### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `status` | string | No | - | Filter by status (pending, analyzing, in-progress, review, approved, deployed, rejected) |
| `limit` | number | No | 50 | Maximum number of results to return |
| `offset` | number | No | 0 | Number of results to skip (for pagination) |

### Response

**Status Code:** `200 OK`

```json
[
  {
    "id": 1,
    "requestorName": "admin@example.com",
    "description": "Add dark mode toggle to settings page",
    "status": "pr_created",
    "priority": 5,
    "intent": "UI Enhancement - Add visual preference option",
    "createdAt": "2026-01-15T10:00:00.000Z",
    "updatedAt": "2026-01-15T10:30:00.000Z",
    "branchName": "feature/enhancement-1-dark-mode",
    "prNumber": 42,
    "prUrl": "https://github.com/org/repo/pull/42",
    "notes": null
  },
  {
    "id": 2,
    "requestorName": "user@example.com",
    "description": "Add export to CSV functionality for invoices",
    "status": "pending",
    "priority": 3,
    "intent": null,
    "createdAt": "2026-01-15T11:00:00.000Z",
    "updatedAt": null,
    "branchName": null,
    "prNumber": null,
    "prUrl": null,
    "notes": null
  }
]
```

### Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | Unique identifier for the enhancement |
| `requestorName` | string | Name or email of the person who submitted the request |
| `description` | string | User's description of the desired feature |
| `status` | string | Current status of the enhancement |
| `priority` | number | Priority level (1-10, default 5) |
| `intent` | string | AI-parsed intent of the request |
| `createdAt` | string | ISO 8601 timestamp of creation |
| `updatedAt` | string | ISO 8601 timestamp of last update |
| `branchName` | string | Git branch created for this enhancement |
| `prNumber` | number | GitHub pull request number |
| `prUrl` | string | URL to the GitHub pull request |
| `notes` | string | Additional notes or error messages |

### Example Request

```bash
# Get all enhancements
curl http://localhost:3001/api/enhancements

# Get pending enhancements only
curl "http://localhost:3001/api/enhancements?status=pending"

# Paginated results
curl "http://localhost:3001/api/enhancements?limit=10&offset=20"
```

---

## GET /api/enhancements/:id

Retrieve a specific enhancement by its ID.

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | Yes | The enhancement ID |

### Response

**Status Code:** `200 OK`

```json
{
  "id": 1,
  "requestorName": "admin@example.com",
  "description": "Add dark mode toggle to settings page",
  "status": "pr_created",
  "priority": 5,
  "intent": "UI Enhancement - Add visual preference option",
  "createdAt": "2026-01-15T10:00:00.000Z",
  "updatedAt": "2026-01-15T10:30:00.000Z",
  "branchName": "feature/enhancement-1-dark-mode",
  "prNumber": 42,
  "prUrl": "https://github.com/org/repo/pull/42",
  "planJson": "{\"tasks\":[{\"title\":\"Create toggle component\",\"files\":[\"client/src/components/DarkModeToggle.tsx\"]}]}",
  "notes": null,
  "errorMessage": null
}
```

### Error Responses

**Status Code:** `404 Not Found`

```json
{
  "error": "Enhancement not found"
}
```

### Example Request

```bash
curl http://localhost:3001/api/enhancements/1
```

---

## POST /api/enhancements

Submit a new enhancement request. The AI will automatically parse the intent and begin processing.

### Request Body

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `description` | string | Yes | - | Description of the desired feature or improvement |
| `requestorName` | string | Yes | - | Name or email of the requestor |
| `priority` | number | No | 5 | Priority level from 1 (low) to 10 (high) |

### Request Example

```json
{
  "requestorName": "admin@example.com",
  "description": "Add export to PDF functionality for invoices",
  "priority": 7
}
```

### Response

**Status Code:** `201 Created`

```json
{
  "id": 3,
  "requestorName": "admin@example.com",
  "description": "Add export to PDF functionality for invoices",
  "status": "pending",
  "priority": 7,
  "intent": null,
  "createdAt": "2026-01-15T12:00:00.000Z",
  "updatedAt": null,
  "branchName": null,
  "prNumber": null,
  "prUrl": null,
  "notes": null
}
```

### Error Responses

**Status Code:** `400 Bad Request`

```json
{
  "error": "Missing required field: description"
}
```

```json
{
  "error": "Missing required field: requestorName"
}
```

### Example Request

```bash
curl -X POST http://localhost:3001/api/enhancements \
  -H "Content-Type: application/json" \
  -d '{
    "requestorName": "admin@example.com",
    "description": "Add a button to export invoice data to PDF format"
  }'
```

---

## PUT /api/enhancements/:id

Update an existing enhancement. This endpoint allows updating various fields including status, notes, and branch information.

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | Yes | The enhancement ID |

### Request Body

All fields are optional. Only include fields you want to update.

| Field | Type | Description |
|-------|------|-------------|
| `description` | string | Updated description |
| `status` | string | New status value |
| `priority` | number | Updated priority (1-10) |
| `notes` | string | Additional notes |
| `branchName` | string | Git branch name |
| `prNumber` | number | Pull request number |
| `prUrl` | string | Pull request URL |
| `planJson` | string | JSON string of the implementation plan |
| `errorMessage` | string | Error message if failed |

### Request Example

```json
{
  "status": "approved",
  "notes": "Approved by admin after manual review"
}
```

### Response

**Status Code:** `200 OK`

```json
{
  "id": 1,
  "requestorName": "admin@example.com",
  "description": "Add dark mode toggle to settings page",
  "status": "approved",
  "priority": 5,
  "intent": "UI Enhancement - Add visual preference option",
  "createdAt": "2026-01-15T10:00:00.000Z",
  "updatedAt": "2026-01-15T14:00:00.000Z",
  "branchName": "feature/enhancement-1-dark-mode",
  "prNumber": 42,
  "prUrl": "https://github.com/org/repo/pull/42",
  "notes": "Approved by admin after manual review"
}
```

### Error Responses

**Status Code:** `400 Bad Request`

```json
{
  "error": "Invalid status value"
}
```

**Status Code:** `404 Not Found`

```json
{
  "error": "Enhancement not found"
}
```

### Example Request

```bash
curl -X PUT http://localhost:3001/api/enhancements/1 \
  -H "Content-Type: application/json" \
  -d '{
    "status": "approved",
    "notes": "Approved after code review"
  }'
```

---

## DELETE /api/enhancements/:id

Delete an enhancement request. Use with caution - this action cannot be undone.

### Path Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | Yes | The enhancement ID |

### Response

**Status Code:** `200 OK`

```json
{
  "success": true,
  "deletedId": 1
}
```

### Error Responses

**Status Code:** `404 Not Found`

```json
{
  "error": "Enhancement not found"
}
```

**Status Code:** `400 Bad Request`

```json
{
  "error": "Cannot delete enhancement with active deployment"
}
```

### Example Request

```bash
curl -X DELETE http://localhost:3001/api/enhancements/1
```

---

## Enhancement Status Values

The `status` field can have the following values:

| Status | Description |
|--------|-------------|
| `pending` | Request submitted, waiting to be picked up by the monitor agent |
| `processing` | Agent has claimed the request and is starting work |
| `planning` | AI is generating the implementation plan |
| `implementing` | AI is generating code changes |
| `reviewing` | Internal code review in progress |
| `copilot_reviewing` | GitHub Copilot review requested |
| `pr_created` | Pull request has been created and is ready for human review |
| `approved` | Enhancement approved, ready for deployment scheduling |
| `deployed` | Enhancement has been merged and deployed |
| `rejected` | Enhancement was rejected during review |
| `failed` | An error occurred during processing |

### Status Flow Diagram

```
pending -> processing -> planning -> implementing -> reviewing ->
copilot_reviewing -> pr_created -> approved -> deployed

Any status can transition to:
- failed (on error)
- rejected (on review failure)
```

---

## Error Response Format

All error responses follow this format:

```json
{
  "error": "Human-readable error message"
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid input or missing required fields |
| 404 | Not Found - Enhancement with specified ID does not exist |
| 409 | Conflict - Operation cannot be performed in current state |
| 500 | Internal Server Error - Unexpected server error |

---

## Rate Limiting

The API does not currently implement rate limiting. For production deployments, consider adding rate limiting to prevent abuse.

---

## TypeScript Types

For frontend integration, use these TypeScript interfaces:

```typescript
interface Enhancement {
  id: number;
  description: string;
  requestorName: string;
  status: EnhancementStatus;
  priority: number;
  intent?: string;
  branchName?: string;
  prNumber?: number;
  prUrl?: string;
  planJson?: string;
  notes?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

type EnhancementStatus =
  | 'pending'
  | 'processing'
  | 'planning'
  | 'implementing'
  | 'reviewing'
  | 'copilot_reviewing'
  | 'pr_created'
  | 'approved'
  | 'deployed'
  | 'rejected'
  | 'failed';

interface CreateEnhancementRequest {
  description: string;
  requestorName: string;
  priority?: number;
}

interface UpdateEnhancementRequest {
  description?: string;
  status?: EnhancementStatus;
  priority?: number;
  notes?: string;
  branchName?: string;
  prNumber?: number;
  prUrl?: string;
  planJson?: string;
  errorMessage?: string;
}
```

---

## Related Documentation

- [AI Feature System Overview](./ai-feature-system.md)
- [AI Workflow Diagram](./ai-workflow-diagram.md)
- [Full API Reference](./api-reference.md) - Includes deployments and GitHub endpoints
