# Tripletex

Date: 2026-03-19

## What it is

An AI accounting agent task.

You expose an HTTPS endpoint. Organizers send a prompt plus credentials for a fresh Tripletex sandbox account. Your agent must perform the requested accounting task through the Tripletex API and return `{"status":"completed"}`.

## Core task

Input:

- a natural-language accounting prompt
- sometimes attached files like PDFs/images
- proxy API credentials

Output:

- correct side effects in the Tripletex account
- HTTP `200`
- JSON response:

```json
{"status":"completed"}
```

## Task characteristics

- `30` task types
- `56` variants per task
- `7` languages: `nb`, `en`, `es`, `pt`, `nn`, `de`, `fr`
- timeout: `300s`
- fresh account per submission

Task families include:

- employees
- customers
- products
- invoices
- projects
- travel expenses
- departments
- corrections/reversals

## Endpoint contract

Your service must expose:

- method: `POST`
- path: `/solve`
- protocol: `HTTPS`
- content type: `application/json`

Request shape:

```json
{
  "prompt": "Opprett en ansatt ...",
  "files": [
    {
      "filename": "faktura.pdf",
      "content_base64": "JVBERi0xLjQg...",
      "mime_type": "application/pdf"
    }
  ],
  "tripletex_credentials": {
    "base_url": "https://tx-proxy.ainm.no/v2",
    "session_token": "abc123..."
  }
}
```

Important fields:

- `prompt`: the task description
- `files`: optional attachments
- `tripletex_credentials.base_url`: use this proxy base URL, not standard Tripletex URL
- `tripletex_credentials.session_token`: password for API auth

## Authentication

Tripletex API auth is Basic Auth:

- username: `0`
- password: `session_token`

Example:

```python
requests.get(
    f"{base_url}/employee",
    auth=("0", session_token),
)
```

Optional endpoint protection:

- if you configure an API key at submission time, the platform sends `Authorization: Bearer <your-api-key>` to your endpoint

## What gets scored

Scoring is not based on your response body content. It is based on what your agent actually changed in the Tripletex account.

Organizers verify final state field by field.

### Correctness

Per-task checks are weighted, then normalized:

```text
correctness = points_earned / max_points
```

### Tier multiplier

- Tier 1: `x1`
- Tier 2: `x2`
- Tier 3: `x3`

So non-perfect score is:

```text
score = correctness * tier
```

### Efficiency bonus

Only applied if correctness is perfect.

Bonus depends on:

- few API calls
- few or zero `4xx` errors

This can roughly double the tier score.

Practical range:

- failed run: `0.0`
- perfect Tier 2 but messy: around `2.1`
- perfect Tier 2 efficient: around `4.0`
- perfect Tier 3 efficient: up to around `6.0`

## Competition dynamics

- best score per task is kept
- bad runs do not lower previous best
- task assignment is weighted toward tasks you have attempted less
- daily submission limit: unlimited
- concurrent submissions limit: `10`

## Sandbox account

Each team can request a persistent sandbox account for exploration.

Useful for:

- testing agent logic
- learning entity relationships
- seeing UI + API together
- reproducing likely competition workflows

Difference vs competition:

- sandbox persists
- competition account is fresh each submission
- sandbox talks direct to Tripletex
- competition uses authenticated proxy

## Common API surface

Common endpoints in docs:

- `/employee`
- `/customer`
- `/product`
- `/invoice`
- `/order`
- `/travelExpense`
- `/project`
- `/department`
- `/ledger/account`
- `/ledger/posting`
- `/ledger/voucher`

Also see deeper REST inventory:

- [Tripletex API surface research](/home/jorge/repos/ainm/research/tripletex-api-surface.md)

## What actually makes a good agent

This task is mostly systems design, not model training.

A strong agent should:

1. parse prompt into structured intent
2. extract entities/values from text and files
3. map intent to exact API workflow
4. avoid unnecessary GETs and retries
5. verify final state
6. return success only when done

## High-value engineering concerns

### Prompt understanding

Need robust multilingual extraction:

- entity names
- dates
- amounts
- links between objects
- requested side effects
- whether task is create/update/delete/reverse

### Workflow planning

Many tasks require prerequisites.

Examples:

- create customer before invoice
- create order before invoice
- locate existing entity before update/delete
- enable/support module before later action

### Error handling

Every `4xx` hurts efficiency.

Need:

- input validation before calling
- read error body
- one-shot correction if possible
- avoid trial-and-error loops

### Verification

Strong pattern:

- perform write
- query back minimal fields
- confirm exact state

## Good baseline architecture

- FastAPI app exposing `/solve`
- LLM-based task parser/planner
- deterministic API client wrapper
- small workflow library for common operations
- file extraction layer for PDF/image attachments
- structured logging of API calls/errors

## Common failure modes

- wrong auth format
- using standard Tripletex URL instead of provided proxy URL
- endpoint not reachable over HTTPS
- timeout from too many model/API round trips
- excessive 4xxs from guessing fields or endpoints
- not handling multilingual prompts robustly
- forgetting that each submission starts from empty account state

## Best first implementation

If optimizing for time-to-first-working-agent:

1. implement FastAPI `/solve`
2. build a thin Tripletex client wrapper
3. support a narrow set of common task types first
4. add explicit post-write verification
5. log every API request/response summary
6. expand task coverage iteratively

## Source

Compiled from `ainm-docs` MCP resources:

- `challenge://tripletex/overview`
- `challenge://tripletex/endpoint`
- `challenge://tripletex/scoring`
- `challenge://tripletex/examples`
- `challenge://tripletex/sandbox`
