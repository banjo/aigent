---
name: aigent-prd
description: Convert PRDs into Aigent feature state. Use when the user asks to convert a PRD, create an Aigent PRD, set up a feature folder, or write prd.json/meta.json for aigent.
user-invocable: true
---

# Aigent PRD Converter

Convert a PRD, feature brief, issue, or rough requirement list into Aigent's external feature-state format.

The job is not to implement the feature. The job is to create the correct files in the correct place so `aigent run` can execute the work later.

## Output Files

Create a feature directory containing:

```text
<aigent-root>/feature/<feature-name>-<short-hash>/
  prd.json
  meta.json
  progress.txt
```

Default `aigent-root`:

```text
~/.aigent
```

Use a different root only if the user gives one explicitly, such as a fixture root.

## Directory Name

Use this format:

```text
<feature-name-kebab-case>-<short-hash>
```

Rules:

- `feature-name-kebab-case` comes from the PRD title or feature name.
- `short-hash` should be a short stable suffix, such as 6 to 8 lowercase hex characters from the source PRD path, issue URL, or feature title.
- Do not put Aigent state files inside the target repository unless the user explicitly asks for a fixture.

Example:

```text
~/.aigent/feature/task-status-a1b2c3/
```

## prd.json Format

Write `prd.json` exactly in this shape:

```json
{
    "project": "Project Name",
    "branchName": "aigent/feature-name",
    "description": "Short feature description",
    "tasks": [
        {
            "id": "US-001",
            "title": "Small task title",
            "description": "One focused task that can be completed in one Aigent iteration.",
            "subtasks": [
                "Concrete implementation step",
                "Another thing related to this task",
            ],
            "priority": 1,
            "passes": false,
            "notes": ""
        }
    ]
}
```


## meta.json Format

Write `meta.json` so Aigent can match the feature to the target repository.

Prefer `repositoryRoot` when the target repo is local and known:

```json
{
    "repositoryRoot": "/absolute/path/to/target-repo"
}
```

Use `remoteUrl` when the repo is not local or the user gave a Git remote URL:

```json
{
    "remoteUrl": "git@github.com:org/repo.git"
}
```

If neither is known, ask one short question for the target repository path or remote URL before writing files.

## progress.txt Format

Create `progress.txt` with a fresh header:

```text
# Aigent Progress Log
Started: <ISO timestamp>
---
```

Do not pre-fill implementation progress. Aigent iterations append progress later.

## Task Size

Each task must fit in one Aigent iteration.

Good task sizes:

- Add one database field and migration.
- Implement one API endpoint.
- Add one UI component to an existing page.
- Add one validation rule with tests.
- Wire one existing backend action into one UI flow.

Too large; split these:

- Build a full dashboard.
- Add authentication.
- Refactor the whole API.
- Implement a complete billing system.

Rule of thumb: if the task cannot be described in two or three sentences, split it.

## Task Ordering

Order tasks by dependency, then by document order.

Typical order:

1. Schema and migrations.
2. Backend services, queries, or API routes.
3. UI components that use the backend.
4. Integration, polish, and verification.

No task should depend on a later task.

## Subtask Rules

Subtasks should be concrete and checkable.

Good subtasks:

- Add `status` column with default `pending`.
- Update `createTask` to accept `status`.
- Add tests for invalid status values.
- Run `pnpm typecheck`.
- Mark this task as passing in the external PRD.

Bad subtasks:

- Make it work well.
- Improve UX.
- Handle edge cases.
- Ensure everything is robust.

Always include the expected quality checks as subtasks when they are known, such as `pnpm typecheck`, `pnpm test`, or project-specific checks from the PRD.

Always include a final subtask to mark the task as passing in `prd.json` after checks pass.

## Conversion Workflow

1. Read the PRD or requirement text.
2. Identify the project name, feature name, and target repository.
3. Ask for the target repository path or remote URL if missing.
4. Split the work into one-iteration tasks.
5. Sort tasks by dependency.
6. Build `prd.json` using Aigent's `tasks` format.
7. Build `meta.json` with `repositoryRoot` or `remoteUrl`.
8. Create `progress.txt` with the standard header.
9. Save all files in the feature directory.
10. Report the feature directory path and task count.

## Example

Input PRD:

```markdown
# Task Status Feature

Add ability to mark tasks with different statuses.

Requirements:
- Persist status in database
- Show status badge on each task
- Toggle between pending, in progress, and done
- Filter list by status
```

Output `prd.json`:

```json
{
    "project": "TaskApp",
    "branchName": "aigent/task-status",
    "description": "Task Status Feature - track task progress with status values",
    "tasks": [
        {
            "id": "US-001",
            "title": "Add status field to tasks",
            "description": "Store task status in the database so later tasks can read and update it.",
            "subtasks": [
                "Add a status field with pending, in_progress, and done values",
                "Set the default status to pending",
                "Run the relevant migration or schema update",
            ],
            "priority": 1,
            "passes": false,
            "notes": ""
        },
        {
            "id": "US-002",
            "title": "Display task status badge",
            "description": "Show the current status on each task so users can scan progress quickly.",
            "subtasks": [
                "Render a status badge on each task row or card",
                "Use distinct labels for pending, in progress, and done",
            ],
            "priority": 2,
            "passes": false,
            "notes": ""
        },
        {
            "id": "US-003",
            "title": "Add status updates",
            "description": "Let users change task status from the task list.",
            "subtasks": [
                "Add a status control to each task row or card",
                "Persist status changes through the existing data layer",
                "Update the UI after a successful change",
            ],
            "priority": 3,
            "passes": false,
            "notes": ""
        },
        {
            "id": "US-004",
            "title": "Filter tasks by status",
            "description": "Let users filter the task list by status.",
            "subtasks": [
                "Add a status filter with all, pending, in progress, and done options",
                "Apply the filter to the task list",
                "Preserve the existing list behavior when all is selected",
            ],
            "priority": 4,
            "passes": false,
            "notes": ""
        }
    ]
}
```

Example `meta.json`:

```json
{
    "repositoryRoot": "/Users/me/code/taskapp"
}
```

Example `progress.txt`:

```text
# Aigent Progress Log
Started: 2026-06-14T10:00:00.000Z
---
```

## Checklist Before Finishing

- `prd.json` is valid JSON.
- `prd.json` uses `tasks`, not `userStories`.
- Every task has `id`, `title`, `description`, `subtasks`, `priority`, `passes`, and `notes`.
- Every task starts with `passes: false`.
- Tasks are small enough for one Aigent iteration.
- Tasks are ordered by dependency.
- `meta.json` has either `repositoryRoot` or `remoteUrl`.
- `progress.txt` exists with the standard header.
- Files are outside the target repository unless the user explicitly requested a fixture.
