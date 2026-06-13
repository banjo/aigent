# Aigent Spec

`aigent` runs a Ralph-style autonomous implementation loop using OpenCode.

## Feature Storage

Feature state lives outside the target repository. Aigent must not create PRD, metadata, or progress files inside the target repository:

```text
~/.aigent/feature/<feature-name>-<short-hash>/
  prd.json
  meta.json
  progress.txt
```

`progress.txt` is created in the feature folder by `aigent run` if it does not exist.

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
5. Runs `opencode run --dir <repo> --dangerously-skip-permissions <prompt>` for up to 10 iterations.
6. Stops early when OpenCode prints `<promise>COMPLETE</promise>`.

OpenCode is not instructed to commit changes. Each iteration completes one task, updates external feature state, and stops. The next iteration continues with the next incomplete task.

Optional arguments:

```bash
aigent run --root /path/to/.aigent
aigent run --repositoryRoot /path/to/target-repo
aigent run --maxIterations 3
aigent run --featureRoot /path/to/.aigent/feature
```

`--root` points at an Aigent root that contains a `feature` directory. `--featureRoot` can be used when the feature directory itself should be passed directly.
`--repositoryRoot` bypasses Git repo discovery and is mainly useful for local fixtures.

## Local Fixture

This repository includes a local fixture for testing agent behavior without using the real `~/.aigent` directory:

```text
local/
  aigent/feature/test-feature-abc/
    prd.json
    meta.json
    progress.txt
  target-repo/
    README.md
```

Run the local fixture from the repository root:

```bash
pnpm start:fixture
```
