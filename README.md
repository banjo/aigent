# aigent

[![NPM version](https://img.shields.io/npm/v/@banjoanton/aigent?color=%23c53635&label=%20)](https://www.npmjs.com/package/@banjoanton/aigent)
[![skills.sh](https://skills.sh/b/banjo/aigent)](https://skills.sh/banjo/aigent)

Run a Ralph-style implementation loop with OpenCode.

Aigent keeps feature state outside your repository, picks one incomplete PRD task per iteration, runs OpenCode, records progress, and tracks token usage.

## Install

```bash
npm install -g @banjoanton/aigent
```

You also need `opencode` available in your shell.

## Skills

Install the included agent skills with the `skills` CLI:

```bash
npx skills add banjo/aigent
```

This installs `aigent-prd`, which turns a PRD, feature brief, issue, or rough requirement list into the `prd.json`, `meta.json`, and `progress.txt` files that `aigent run` uses.

## Workflow

Create a feature folder outside the target repo:

```text
~/.aigent/feature/task-priority-abc/
  prd.json
  meta.json
  progress.txt
```

Example `prd.json`:

```json
{
    "project": "MyApp",
    "branchName": "ralph/task-priority",
    "description": "Add task priority",
    "tasks": [
        {
            "id": "US-001",
            "title": "Store task priority",
            "description": "Add a priority field and keep existing tasks working.",
            "subtasks": ["Add the field", "Update tests"],
            "priority": 1,
            "passes": false,
            "notes": ""
        }
    ]
}
```

Example `meta.json`:

```json
{
    "repositoryRoot": "/absolute/path/to/my-app"
}
```

Run it from the target repository:

```bash
aigent run
```

Aigent will:

1. Find matching features in `~/.aigent/feature`.
2. Ask which feature to run.
3. Start a local status dashboard.
4. Run one OpenCode iteration per incomplete task.
5. Update `prd.json`, `progress.txt`, and `usage.jsonl` in the feature folder.

## Dashboard

During `aigent run`, the CLI prints a local dashboard URL. It shows the current task, remaining work, iteration count, token usage, cached tokens, and cost.

## Local Fixture

```bash
pnpm start:fixture
```
