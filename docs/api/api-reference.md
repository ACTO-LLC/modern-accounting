# AI Feature System - API Reference

This document provides detailed API documentation for the AI-Driven Feature Addition System endpoints.

## Base URL

```
http://localhost:3001/api
```

## Authentication

Currently, the API does not require authentication. In production, implement appropriate authentication middleware.

---

## Enhancements API

### Create Enhancement

Submit a new feature enhancement request.

**Endpoint:** `POST /api/enhancements`

**Request Body:**

```json
{
  "requestorName": "string",
  "description": "string",
  "priority": "number (optional, default: 5)"
}
```

**Response:**

```json
{
  "id": 1,
  "requestorName": "admin@example.com",
  "description": "Add dark mode toggle to settings",
  "status": "pending",
  "priority": 5,
  "createdAt": "2026-01-15T10:00:00.000Z",
  "updatedAt": null,
  "branchName": null,
  "prNumber": null,
  "notes": null
}
```

**Status Codes:**

| Code | Description |
|------|-------------|
| 201 | Enhancement created successfully |
| 400 | Invalid request body |
| 500 | Server error |

**Example:**

```bash
curl -X POST http://localhost:3001/api/enhancements \
  -H "Content-Type: application/json" \
  -d '{
    "requestorName": "admin@example.com",
    "description": "Add export to PDF functionality for invoices"
  }'
```

---

### Get Enhancement

Retrieve a specific enhancement by ID.

**Endpoint:** `GET /api/enhancements/:id`

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| id | number | Enhancement ID |

**Response:**

```json
{
  "id": 1,
  "requestorName": "admin@example.com",
  "description": "Add dark mode toggle to settings",
  "status": "pr_created",
  "priority": 5,
  "createdAt": "2026-01-15T10:00:00.000Z",
  "updatedAt": "2026-01-15T10:15:00.000Z",
  "branchName": "feature/enhancement-1-add-dark-mode",
  "prNumber": 42,
  "prUrl": "https://github.com/org/repo/pull/42",
  "planJson": "{...}",
  "notes": null
}
```

**Status Codes:**

| Code | Description |
|------|-------------|
| 200 | Success |
| 404 | Enhancement not found |
| 500 | Server error |

**Example:**

```bash
curl http://localhost:3001/api/enhancements/1
```

---

### Update Enhancement

Update an existing enhancement.

**Endpoint:** `PATCH /api/enhancements/:id`

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| id | number | Enhancement ID |

**Request Body:**

```json
{
  "status": "string (optional)",
  "notes": "string (optional)",
  "branchName": "string (optional)",
  "prNumber": "number (optional)"
}
```

**Response:**

```json
{
  "id": 1,
  "status": "completed",
  "updatedAt": "2026-01-15T12:00:00.000Z"
}
```

**Status Codes:**

| Code | Description |
|------|-------------|
| 200 | Updated successfully |
| 400 | Invalid request body |
| 404 | Enhancement not found |
| 500 | Server error |

**Example:**

```bash
curl -X PATCH http://localhost:3001/api/enhancements/1 \
  -H "Content-Type: application/json" \
  -d '{"notes": "Waiting for manual review"}'
```

---

### List Enhancements

Get all enhancements with optional filtering.

**Endpoint:** `GET /api/enhancements`

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| status | string | Filter by status (optional) |
| limit | number | Max results (default: 50) |
| offset | number | Skip results (default: 0) |

**Response:**

```json
[
  {
    "id": 1,
    "requestorName": "admin@example.com",
    "description": "Add dark mode toggle",
    "status": "completed",
    "createdAt": "2026-01-15T10:00:00.000Z"
  },
  {
    "id": 2,
    "requestorName": "user@example.com",
    "description": "Add export functionality",
    "status": "pending",
    "createdAt": "2026-01-15T11:00:00.000Z"
  }
]
```

**Example:**

```bash
# Get all pending enhancements
curl "http://localhost:3001/api/enhancements?status=pending"

# Get latest 10 enhancements
curl "http://localhost:3001/api/enhancements?limit=10"
```

---

## Deployments API

### Schedule Deployment

Schedule a deployment for an enhancement.

**Endpoint:** `POST /api/deployments`

**Request Body:**

```json
{
  "enhancementId": "number",
  "scheduledDate": "string (ISO 8601 datetime)"
}
```

**Response:**

```json
{
  "Id": 1,
  "EnhancementId": 5,
  "ScheduledDate": "2026-01-16T09:00:00.000Z",
  "Status": "pending",
  "DeployedAt": null,
  "Notes": null
}
```

**Status Codes:**

| Code | Description |
|------|-------------|
| 201 | Deployment scheduled |
| 400 | Missing required fields |
| 500 | Server error |

**Example:**

```bash
curl -X POST http://localhost:3001/api/deployments \
  -H "Content-Type: application/json" \
  -d '{
    "enhancementId": 5,
    "scheduledDate": "2026-01-16T09:00:00Z"
  }'
```

---

### Get Pending Deployments

Retrieve all pending deployments.

**Endpoint:** `GET /api/deployments/pending`

**Response:**

```json
[
  {
    "Id": 1,
    "EnhancementId": 5,
    "ScheduledDate": "2026-01-16T09:00:00.000Z",
    "Status": "pending",
    "Description": "Add dark mode toggle",
    "RequestorName": "admin@example.com",
    "BranchName": "feature/enhancement-5-dark-mode",
    "PrNumber": 42
  }
]
```

**Example:**

```bash
curl http://localhost:3001/api/deployments/pending
```

---

### List Deployments

Get all deployments with optional status filter.

**Endpoint:** `GET /api/deployments`

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| status | string | Filter by status (optional) |

**Response:**

```json
[
  {
    "Id": 1,
    "EnhancementId": 5,
    "ScheduledDate": "2026-01-16T09:00:00.000Z",
    "Status": "deployed",
    "DeployedAt": "2026-01-16T09:01:23.000Z",
    "Description": "Add dark mode toggle",
    "RequestorName": "admin@example.com",
    "BranchName": "feature/enhancement-5-dark-mode",
    "PrNumber": 42
  }
]
```

**Example:**

```bash
# Get all deployments
curl http://localhost:3001/api/deployments

# Get failed deployments
curl "http://localhost:3001/api/deployments?status=failed"
```

---

### Get Deployment

Retrieve a specific deployment by ID.

**Endpoint:** `GET /api/deployments/:id`

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| id | number | Deployment ID |

**Response:**

```json
{
  "Id": 1,
  "EnhancementId": 5,
  "ScheduledDate": "2026-01-16T09:00:00.000Z",
  "Status": "deployed",
  "DeployedAt": "2026-01-16T09:01:23.000Z",
  "Notes": "Merged PR #42",
  "Description": "Add dark mode toggle",
  "RequestorName": "admin@example.com",
  "BranchName": "feature/enhancement-5-dark-mode",
  "PrNumber": 42
}
```

**Status Codes:**

| Code | Description |
|------|-------------|
| 200 | Success |
| 404 | Deployment not found |
| 500 | Server error |

**Example:**

```bash
curl http://localhost:3001/api/deployments/1
```

---

### Update Deployment

Update or reschedule a pending deployment.

**Endpoint:** `PATCH /api/deployments/:id`

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| id | number | Deployment ID |

**Request Body:**

```json
{
  "scheduledDate": "string (ISO 8601, optional)",
  "status": "string (optional)",
  "notes": "string (optional)"
}
```

**Response:**

```json
{
  "Id": 1,
  "ScheduledDate": "2026-01-17T09:00:00.000Z",
  "Status": "pending",
  "Notes": "Rescheduled to next day"
}
```

**Status Codes:**

| Code | Description |
|------|-------------|
| 200 | Updated successfully |
| 400 | No fields to update |
| 404 | Deployment not found or not pending |
| 500 | Server error |

**Example:**

```bash
curl -X PATCH http://localhost:3001/api/deployments/1 \
  -H "Content-Type: application/json" \
  -d '{"scheduledDate": "2026-01-17T09:00:00Z"}'
```

---

### Cancel Deployment

Cancel a pending deployment.

**Endpoint:** `DELETE /api/deployments/:id`

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| id | number | Deployment ID |

**Response:**

```json
{
  "success": true,
  "deletedId": 1
}
```

**Status Codes:**

| Code | Description |
|------|-------------|
| 200 | Deleted successfully |
| 404 | Deployment not found or not pending |
| 500 | Server error |

**Example:**

```bash
curl -X DELETE http://localhost:3001/api/deployments/1
```

---

## GitHub API

### Create Branch

Create a new git branch.

**Endpoint:** `POST /api/github/branches`

**Request Body:**

```json
{
  "branchName": "string",
  "baseBranch": "string (optional, default: main)"
}
```

**Response:**

```json
{
  "success": true,
  "branch": "feature/new-feature",
  "sha": "abc123..."
}
```

**Example:**

```bash
curl -X POST http://localhost:3001/api/github/branches \
  -H "Content-Type: application/json" \
  -d '{"branchName": "feature/my-feature"}'
```

---

### Commit File

Commit a file to a branch.

**Endpoint:** `POST /api/github/commits`

**Request Body:**

```json
{
  "branch": "string",
  "path": "string",
  "content": "string",
  "message": "string"
}
```

**Response:**

```json
{
  "success": true
}
```

**Example:**

```bash
curl -X POST http://localhost:3001/api/github/commits \
  -H "Content-Type: application/json" \
  -d '{
    "branch": "feature/my-feature",
    "path": "src/utils/helper.ts",
    "content": "export function helper() { return true; }",
    "message": "feat: Add helper function"
  }'
```

---

### Create Pull Request

Create a new pull request.

**Endpoint:** `POST /api/github/pulls`

**Request Body:**

```json
{
  "head": "string (branch name)",
  "base": "string (optional, default: main)",
  "title": "string",
  "body": "string"
}
```

**Response:**

```json
{
  "number": 42,
  "url": "https://api.github.com/repos/org/repo/pulls/42",
  "htmlUrl": "https://github.com/org/repo/pull/42"
}
```

**Example:**

```bash
curl -X POST http://localhost:3001/api/github/pulls \
  -H "Content-Type: application/json" \
  -d '{
    "head": "feature/my-feature",
    "title": "feat: Add new feature",
    "body": "## Summary\n\nThis PR adds a new feature..."
  }'
```

---

### Post PR Comment

Post a comment on a pull request.

**Endpoint:** `POST /api/github/pulls/:number/comments`

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| number | number | PR number |

**Request Body:**

```json
{
  "body": "string"
}
```

**Response:**

```json
{
  "id": 12345,
  "body": "Comment text",
  "createdAt": "2026-01-15T10:00:00Z"
}
```

**Example:**

```bash
curl -X POST http://localhost:3001/api/github/pulls/42/comments \
  -H "Content-Type: application/json" \
  -d '{"body": "@github-copilot Please review this PR"}'
```

---

### Get PR Comments

Retrieve comments on a pull request.

**Endpoint:** `GET /api/github/pulls/:number/comments`

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| number | number | PR number |

**Query Parameters:**

| Name | Type | Description |
|------|------|-------------|
| since | string | ISO 8601 datetime to filter comments (optional) |

**Response:**

```json
[
  {
    "id": 12345,
    "body": "Comment text",
    "user": "username",
    "createdAt": "2026-01-15T10:00:00Z",
    "updatedAt": "2026-01-15T10:00:00Z"
  }
]
```

**Example:**

```bash
curl http://localhost:3001/api/github/pulls/42/comments
```

---

### Get PR Status

Get the status of a pull request including checks and reviews.

**Endpoint:** `GET /api/github/pulls/:number/status`

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| number | number | PR number |

**Response:**

```json
{
  "state": "open",
  "merged": false,
  "mergeable": true,
  "checks": [
    {
      "name": "build",
      "status": "completed",
      "conclusion": "success"
    },
    {
      "name": "test",
      "status": "completed",
      "conclusion": "success"
    }
  ]
}
```

**Example:**

```bash
curl http://localhost:3001/api/github/pulls/42/status
```

---

### Merge Pull Request

Merge a pull request.

**Endpoint:** `POST /api/github/pulls/:number/merge`

**Parameters:**

| Name | Type | Description |
|------|------|-------------|
| number | number | PR number |

**Request Body:**

```json
{
  "mergeMethod": "string (merge|squash|rebase, optional, default: squash)"
}
```

**Response:**

```json
{
  "merged": true,
  "sha": "abc123...",
  "message": "Pull Request successfully merged"
}
```

**Example:**

```bash
curl -X POST http://localhost:3001/api/github/pulls/42/merge \
  -H "Content-Type: application/json" \
  -d '{"mergeMethod": "squash"}'
```

---

## Error Responses

All endpoints return errors in a consistent format:

```json
{
  "error": "Error message describing what went wrong"
}
```

### Common Error Codes

| Code | Description |
|------|-------------|
| 400 | Bad Request - Invalid input or missing required fields |
| 404 | Not Found - Resource doesn't exist |
| 500 | Internal Server Error - Server-side error |

### Example Error Response

```json
{
  "error": "Missing required fields: enhancementId and scheduledDate"
}
```

---

## Rate Limiting

The API currently does not implement rate limiting. For production deployments, consider adding rate limiting middleware to prevent abuse.

---

## Webhooks (Future)

The system is designed to support webhooks for real-time notifications. Planned webhook events:

- `enhancement.created` - New enhancement submitted
- `enhancement.status_changed` - Enhancement status updated
- `deployment.scheduled` - Deployment scheduled
- `deployment.completed` - Deployment finished (success or failure)
