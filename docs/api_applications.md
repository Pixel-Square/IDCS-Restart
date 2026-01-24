# Applications API

This document describes the endpoints, payloads and responses for the `applications` API used by the frontend.

Base prefix: `/api/applications/`

Endpoints

- `GET /api/applications/` — list applications (filters: applicant, status, type)
- `POST /api/applications/` — create application (see payload)
- `GET /api/applications/{id}/` — retrieve application detail
- `POST /api/applications/{id}/submit/` — submit a draft application (server validates against active schema)
- `POST /api/applications/{id}/approve/` — approve current step
- `POST /api/applications/{id}/reject/` — reject application
- `GET /api/applications/{id}/history/` — approval history (timeline)
- `GET /api/applications/inbox/` — approver inbox (applications user can act on)

Attachments

- `GET /api/attachments/?application_id={id}` — list attachments for an application (soft-deleted filtered out)
- `POST /api/attachments/` — upload attachment (multipart/form-data; fields: `application`, `file`, `label`)
- `DELETE /api/attachments/{id}/` — soft-delete an attachment (sets `is_deleted`)

Payloads

- Create application (`POST /api/applications/`)

  {
    "application_type": "LEAVE",
    "data": {
      "reason": "string",
      "days": 2,
      "leave_type": "SICK"
    }
  }

- Approve (`POST /api/applications/{id}/approve/`)

  {
    "action": "APPROVE",
    "remarks": "Optional text"
  }

- Reject (`POST /api/applications/{id}/reject/`)

  {
    "action": "REJECT",
    "remarks": "Reason for rejection"
  }

Responses

- Successful create: 201
  - Body: application object (id, application_type, current_state, form_version)
- Submit success: 200
  - Body: application object with `current_state` = `SUBMITTED`
- Approve/Reject success: 200
  - Body: updated application object (status/state fields) or 403 if unauthorized
- Validation failures: 400, body contains field-level errors, e.g.

  {
    "reason": ["This field is required."]
  }

- Authentication: all endpoints require authentication (401 if missing)

Notes

- Form schema is versioned: on `submit` the server snapshots the active schema into an `ApplicationFormVersion` and binds it to the `Application.form_version`. The server performs strict server-side validation during submit and will return 400 with validation details if the provided `data` does not match.
- Approval actions are recorded as `ApprovalAction` rows and exposed via the `/history/` endpoint.
- Attachments are soft-deleted via `is_deleted` flag and filtered from lists by default.
# Applications API - Contract

This document describes the endpoints, expected payloads, and responses for the `applications` APIs used by the frontend.

Base URL: `/api/applications/`

Endpoints

- `POST /api/applications/` - Create (submit) an application
  - Payload: {
    "application_type": <id>,
    "data": [{"field_key": "reason", "value": "..."}, ...]
  }
  - Response: 201 Created with application object (fields: `id`, `application_type`, `current_state`, `form_version`, `submitted_at`)
  - Errors: 400 Bad Request for validation errors - payload will contain `field_key: ["error..."]`

- `GET /api/applications/` - List user's applications
  - Response: 200 OK: list of application summaries

- `GET /api/applications/{id}/` - Application detail
  - Response: 200 OK: application fields, `data`, `attachments`, `current_state`, `current_step`
  - 403 Forbidden if user is not permitted to view

- `POST /api/applications/{id}/approve/` - Approve current step
  - Payload: { "action": "APPROVE", "remarks": "..." }
  - Response: 200 OK: updated application
  - Errors: 403 Forbidden if user not authorized, 400 for invalid action

- `POST /api/applications/{id}/reject/` - Reject current step
  - Payload: { "action": "REJECT", "remarks": "..." }
  - Response: 200 OK: updated application (now REJECTED)

- `GET /api/applications/inbox/` - Approver inbox (applications the current user may act on)
  - Query params: `page`, `page_size`, optional filters
  - Response: 200 OK: paginated list of application summaries
  - 401 Unauthorized if unauthenticated

- `GET /api/applications/{id}/history/` - Approval history timeline
  - Response: 200 OK: list of timeline events (fields: `step_order`, `step_role`, `action`, `acted_by`, `remarks`, `acted_at`)

- `POST /api/applications/{id}/attachments/` - Upload attachment
  - Multipart form payload: `file` (binary), `label` (string)
  - Response: 201 Created: attachment object
  - 403 Forbidden if uploads not allowed for this application/user

- `DELETE /api/attachments/{attachment_id}/` - Soft-delete an attachment
  - Response: 204 No Content on success, 403 if not permitted

Common error codes

- 400 Bad Request: validation errors, malformed JSON
- 401 Unauthorized: authentication required
- 403 Forbidden: user lacks permission to view/act
- 404 Not Found: missing resource

Notes

- Create/submit endpoint performs server-side validation against the active form schema. The response for validation errors is a `400` with a JSON body mapping `field_key` to error messages.
- Approval actions require the user to be authorized (match current step role or have override permissions). If an SLA escalation role exists and the step is overdue, that escalated role may act.
