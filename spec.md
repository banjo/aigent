# Aigent Spec

`aigent` runs a Ralph-style autonomous implementation loop using OpenCode.

## Feature Storage

Feature state lives outside the target repository. Aigent must not create PRD, metadata, or progress files inside the target repository:

```text
~/.aigent/feature/<feature-name>-<short-hash>/
  prd.json
  meta.json
  progress.txt
  usage.jsonl
```

`progress.txt` is created in the feature folder by `aigent run` if it does not exist.

`usage.jsonl` is appended by `aigent run` after each OpenCode iteration. It stores machine-readable token and cost usage outside the target repository.

## PRD Format

`prd.json` follows the Ralph PRD structure:

```json
{
    "project": "MyApp",
    "branchName": "ralph/task-priority",
    "description": "Task Priority System - Add priority levels to tasks",
    "tasks": [
        {
            "id": "US-001",
            "title": "Add priority field to database",
            "description": "As a developer, I need to store task priority so it persists across sessions.",
            "subtasks": ["Add the database field", "Run typecheck"],
            "priority": 1,
            "passes": false,
            "notes": ""
        }
    ]
}
```

OpenCode works on one incomplete task per iteration. The highest priority task where `passes` is `false` is selected by the prompt. `subtasks` is a string array with small steps or a suggested breakdown. When a task is complete and checks pass, OpenCode updates this external PRD file and sets that task's `passes` field to `true`.

## Meta Format

`meta.json` connects a feature directory to a repository:

```json
{
    "repositoryRoot": "/absolute/path/to/repo",
    "remoteUrl": "git@github.com:owner/repo.git"
}
```

`aigent run` matches features for the current Git repository when either `repositoryRoot` equals `git rev-parse --show-toplevel` or `remoteUrl` equals `git config --get remote.origin.url`.

`repositoryRoot` can be absolute or relative. Relative paths are resolved from the feature directory that contains `meta.json`.

## Run Command

```bash
aigent run
```

Behavior:

1. Finds the current Git repository root.
2. Scans `~/.aigent/feature` recursively for directories containing both `prd.json` and `meta.json`.
3. Filters features that belong to the current repository.
4. Prompts the user to choose a feature.
5. Counts tasks in the selected PRD and runs one iteration per task plus extra iterations.
6. Runs `opencode run --dir <repo> --dangerously-skip-permissions --format json <prompt>` for each iteration.
7. Streams OpenCode `text` events to the terminal while collecting token and cost data from `step_finish` events.
8. Prints iteration usage after each iteration.
9. Appends iteration usage to `usage.jsonl` in the feature directory.
10. Stops early when OpenCode prints `<promise>COMPLETE</promise>`.
11. Prints final total usage when the run completes or reaches the iteration limit.

OpenCode is not instructed to commit changes. Each iteration completes one task, updates external feature state, and stops. The next iteration continues with the next incomplete task.

By default, the maximum iteration count is `taskCount + 3`. For example, a PRD with 5 tasks runs up to 8 iterations and logs `Found 5 tasks, doing 8 iterations (3 extra)`.

Optional arguments:

```bash
aigent run --root /path/to/.aigent
aigent run --repositoryRoot /path/to/target-repo
aigent run --maxIterations 3
aigent run --extraIterations 2
aigent run --model openai/gpt-5.5
aigent run --featureRoot /path/to/.aigent/feature
```

`--root` points at an Aigent root that contains a `feature` directory. `--featureRoot` can be used when the feature directory itself should be passed directly.
`--repositoryRoot` bypasses Git repo discovery and is mainly useful for local fixtures.
`--maxIterations` is an explicit override. `--extraIterations` controls the default buffer above task count and defaults to 3.
`--model` is forwarded to `opencode run --model` and should use OpenCode's `provider/model` format.

## Usage Format

Each `usage.jsonl` line represents one OpenCode iteration:

```json
{"timestamp":"2026-06-14T10:00:00.000Z","iteration":1,"sessionId":"ses_123","tokens":{"total":12868,"input":63,"output":5,"reasoning":0,"cache":{"write":0,"read":12800}},"cost":0}
```

`prd.json` remains product and task state only. Token and cost usage belongs in `usage.jsonl`. `progress.txt` remains the human-readable implementation log maintained by the agent.

## Local Fixture

This repository includes a local fixture for testing agent behavior without using the real `~/.aigent` directory:

```text
local/
  aigent/feature/test-feature-abc/
    prd.json
    meta.json
    progress.txt
    usage.jsonl
  target-repo/
    README.md
    notes/
```

Run the local fixture from the repository root:

```bash
pnpm start:fixture
```
