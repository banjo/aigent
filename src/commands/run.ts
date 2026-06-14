import { cancel, intro, isCancel, log, outro, select, spinner, stream } from "@clack/prompts";
import { defineCommand } from "citty";
import { execa } from "execa";
import { spawn } from "node:child_process";
import type { Dirent } from "node:fs";
import { appendFile, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { styleText } from "node:util";

type PrdTask = {
    id: string;
    title: string;
    description: string;
    subtasks: string[];
    priority: number;
    passes: boolean;
    notes: string;
};

type Prd = {
    project: string;
    branchName: string;
    description: string;
    tasks: PrdTask[];
};

type Meta = {
    repositoryRoot?: string;
    remoteUrl?: string;
};

type Feature = {
    name: string;
    directory: string;
    prd: Prd;
};

type TokenUsage = {
    total: number;
    input: number;
    output: number;
    reasoning: number;
    cache: {
        write: number;
        read: number;
    };
};

type Usage = {
    tokens: TokenUsage;
    cost: number;
};

type UsageRecord = Usage & {
    timestamp: string;
    iteration: number;
    sessionId: string | undefined;
};

type OpenCodeEvent = {
    type?: string;
    sessionID?: string;
    part?: {
        type?: string;
        text?: string;
        tokens?: TokenUsage;
        cost?: number;
    };
};

type TextQueue = {
    push: (text: string) => void;
    end: () => void;
    fail: (error: unknown) => void;
    values: () => AsyncIterable<string>;
};

const emptyUsage = (): Usage => ({
    tokens: {
        total: 0,
        input: 0,
        output: 0,
        reasoning: 0,
        cache: {
            write: 0,
            read: 0,
        },
    },
    cost: 0,
});

const addUsage = (total: Usage, usage: Usage): Usage => ({
    tokens: {
        total: total.tokens.total + usage.tokens.total,
        input: total.tokens.input + usage.tokens.input,
        output: total.tokens.output + usage.tokens.output,
        reasoning: total.tokens.reasoning + usage.tokens.reasoning,
        cache: {
            write: total.tokens.cache.write + usage.tokens.cache.write,
            read: total.tokens.cache.read + usage.tokens.cache.read,
        },
    },
    cost: total.cost + usage.cost,
});

const formatUsage = (usage: Usage): string => {
    const tokens = usage.tokens;
    const cost = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 6,
    }).format(usage.cost);

    return `${cost}, ${tokens.total.toLocaleString("en-US")} tokens (${tokens.input.toLocaleString("en-US")} input, ${tokens.output.toLocaleString("en-US")} output, ${tokens.reasoning.toLocaleString("en-US")} reasoning, ${tokens.cache.read.toLocaleString("en-US")} cache read, ${tokens.cache.write.toLocaleString("en-US")} cache write)`;
};

const fileExists = async (path: string): Promise<boolean> => {
    try {
        const result = await stat(path);
        return result.isFile();
    } catch {
        return false;
    }
};

const readJson = async <T>(path: string): Promise<T | undefined> => {
    try {
        const content = await readFile(path, "utf8");
        return JSON.parse(content) as T;
    } catch {
        return undefined;
    }
};

const getRepositoryRoot = async (): Promise<string> => {
    const { stdout } = await execa("git", ["rev-parse", "--show-toplevel"]);
    return stdout.trim();
};

const getRemoteUrl = async (): Promise<string | undefined> => {
    try {
        const { stdout } = await execa("git", ["config", "--get", "remote.origin.url"]);
        return stdout.trim() || undefined;
    } catch {
        return undefined;
    }
};

const findFeatureDirectories = async (root: string): Promise<string[]> => {
    const result: string[] = [];

    const walk = async (directory: string): Promise<void> => {
        let entries: Dirent<string>[];

        try {
            entries = await readdir(directory, { withFileTypes: true });
        } catch {
            return;
        }

        if (
            (await fileExists(join(directory, "prd.json"))) &&
            (await fileExists(join(directory, "meta.json")))
        ) {
            result.push(directory);
            return;
        }

        await Promise.all(
            entries
                .filter(entry => entry.isDirectory())
                .map(entry => walk(join(directory, entry.name)))
        );
    };

    await walk(root);
    return result;
};

const getMatchingFeatures = async ({
    featureRoot,
    repositoryRoot,
    remoteUrl,
}: {
    featureRoot: string;
    repositoryRoot: string;
    remoteUrl: string | undefined;
}): Promise<Feature[]> => {
    const directories = await findFeatureDirectories(featureRoot);
    const features = await Promise.all(
        directories.map(async directory => {
            const meta = await readJson<Meta>(join(directory, "meta.json"));
            const prd = await readJson<Prd>(join(directory, "prd.json"));

            if (!meta || !prd) {
                return undefined;
            }

            const metaRepositoryRoot = meta.repositoryRoot
                ? isAbsolute(meta.repositoryRoot)
                    ? resolve(meta.repositoryRoot)
                    : resolve(directory, meta.repositoryRoot)
                : undefined;
            const matchesRoot = metaRepositoryRoot ? metaRepositoryRoot === repositoryRoot : false;
            const matchesRemote =
                remoteUrl && meta.remoteUrl ? meta.remoteUrl === remoteUrl : false;

            if (!matchesRoot && !matchesRemote) {
                return undefined;
            }

            return {
                name: directory.split("/").at(-1) ?? directory,
                directory,
                prd,
            } satisfies Feature;
        })
    );

    return features.filter(feature => feature !== undefined);
};

const ensureProgressFile = async (featureDirectory: string): Promise<void> => {
    const path = join(featureDirectory, "progress.txt");

    if (await fileExists(path)) {
        return;
    }

    await writeFile(path, `# Aigent Progress Log\nStarted: ${new Date().toISOString()}\n---\n`);
};

const appendUsageRecord = async ({
    featureDirectory,
    record,
}: {
    featureDirectory: string;
    record: UsageRecord;
}): Promise<void> => {
    await appendFile(join(featureDirectory, "usage.jsonl"), `${JSON.stringify(record)}\n`);
};

const getNextTaskTitle = async (featureDirectory: string): Promise<string | undefined> => {
    const prd = await readJson<Prd>(join(featureDirectory, "prd.json"));
    const task = prd?.tasks
        .filter(nextTask => !nextTask.passes)
        .sort((first, second) => first.priority - second.priority)[0];

    return task ? `${task.id}: ${task.title}` : undefined;
};

const parseOpenCodeJsonLine = (line: string): OpenCodeEvent | undefined => {
    try {
        return JSON.parse(line) as OpenCodeEvent;
    } catch {
        return undefined;
    }
};

const getStreamSegmentLength = (): number => {
    const columns = process.stdout.columns ?? 100;
    return Math.max(columns - 12, 40);
};

const createTextQueue = (): TextQueue => {
    const values: string[] = [];
    const resolvers: Array<() => void> = [];
    let ended = false;
    let error: unknown;

    const notify = (): void => {
        const resolver = resolvers.shift();

        if (resolver) {
            resolver();
        }
    };

    return {
        push(text) {
            values.push(text);
            notify();
        },
        end() {
            ended = true;
            notify();
        },
        fail(nextError) {
            error = nextError;
            ended = true;
            notify();
        },
        async *values() {
            while (!ended || values.length > 0) {
                const value = values.shift();

                if (value !== undefined) {
                    yield value;
                    continue;
                }

                if (error !== undefined) {
                    throw error;
                }

                await new Promise<void>(resolvePromise => {
                    resolvers.push(resolvePromise);
                });
            }

            if (error !== undefined) {
                throw error;
            }
        },
    };
};

const runOpenCode = async ({
    label,
    model,
    prompt,
    repositoryRoot,
}: {
    label: string;
    model: string | undefined;
    prompt: string;
    repositoryRoot: string;
}) => {
    const iterationSpinner = spinner();
    let streamStarted = false;

    iterationSpinner.start(label);

    const textQueue = createTextQueue();
    let streamPromise: Promise<void> | undefined;
    const args = [
        "run",
        "--dir",
        repositoryRoot,
        "--dangerously-skip-permissions",
        "--format",
        "json",
    ];

    if (model) {
        args.push("--model", model);
    }

    args.push(prompt);

    const subprocess = spawn(
        "opencode",
        args,
        {
            stdio: ["inherit", "pipe", "pipe"],
        }
    );

    let output = "";
    let sessionId: string | undefined;
    let usage = emptyUsage();
    let stdoutBuffer = "";
    let textBuffer = "";
    const streamSegmentLength = getStreamSegmentLength();

    const flushTextSegment = (segment: string): void => {
        if (segment.trim().length === 0) {
            return;
        }

        if (!streamStarted) {
            streamStarted = true;
            iterationSpinner.stop(label);
            streamPromise = stream.message(textQueue.values());
        }

        textQueue.push(`${styleText("dim", segment.trimStart())}\n`);
    };

    const flushAvailableText = (): void => {
        while (textBuffer.length > 0) {
            const boundary = textBuffer.search(/\n|[.!?](?:\s|$)/);

            if (boundary !== -1) {
                const end = textBuffer[boundary] === "\n" ? boundary + 1 : boundary + 2;
                flushTextSegment(textBuffer.slice(0, end));
                textBuffer = textBuffer.slice(end);
                continue;
            }

            if (textBuffer.length >= streamSegmentLength) {
                flushTextSegment(textBuffer.slice(0, streamSegmentLength));
                textBuffer = textBuffer.slice(streamSegmentLength);
                continue;
            }

            return;
        }
    };

    const appendText = (text: string): void => {
        if (text.length === 0) {
            return;
        }

        textBuffer += text;
        flushAvailableText();
    };

    const flushTextBuffer = (): void => {
        if (textBuffer.length === 0) {
            return;
        }

        flushTextSegment(textBuffer);
        textBuffer = "";
    };

    const handleEvent = (event: OpenCodeEvent): void => {
        sessionId = event.sessionID ?? sessionId;

        if (event.type === "text" && event.part?.text) {
            output += event.part.text;
            appendText(event.part.text);
            return;
        }

        if (event.type === "step_finish" && event.part?.tokens && event.part.cost !== undefined) {
            usage = addUsage(usage, {
                tokens: event.part.tokens,
                cost: event.part.cost,
            });
        }
    };

    subprocess.stdout.on("data", chunk => {
        const text = chunk.toString();
        stdoutBuffer += text;

        const lines = stdoutBuffer.split("\n");
        stdoutBuffer = lines.pop() ?? "";

        for (const line of lines) {
            const event = parseOpenCodeJsonLine(line);

            if (event) {
                handleEvent(event);
            }
        }
    });

    subprocess.stderr.on("data", chunk => {
        const text = chunk.toString();
        output += text;
        appendText(text);
    });

    const exitCode = await new Promise<number | undefined>((resolvePromise, rejectPromise) => {
        subprocess.on("error", error => {
            textQueue.fail(error);
            rejectPromise(error);
        });
        subprocess.on("close", code => resolvePromise(code ?? undefined));
    });

    if (stdoutBuffer) {
        const event = parseOpenCodeJsonLine(stdoutBuffer);

        if (event) {
            handleEvent(event);
        }
    }

    flushTextBuffer();

    if (!streamStarted) {
        streamStarted = true;
        iterationSpinner.stop(label);
        streamPromise = stream.message(textQueue.values());
    }

    textQueue.end();

    if (streamPromise) {
        await streamPromise;
    }

    if (exitCode && exitCode !== 0) {
        log.error(`OpenCode exited with code ${exitCode}`);
    } else {
        log.success("Iteration completed");
    }

    return { output, exitCode, sessionId, usage };
};

const createPrompt = ({
    featureDirectory,
}: {
    featureDirectory: string;
}): string => `# Ralph-style Aigent Instructions

You are an autonomous coding agent working on a software project.

## Feature Files

- PRD: ${join(featureDirectory, "prd.json")}
- Progress log: ${join(featureDirectory, "progress.txt")}

All Aigent state files are in this feature directory. Do not create PRD, progress, or metadata files inside the target repository.

## Your Task

1. Read the PRD file above.
2. Read the progress log above, especially any Codebase Patterns section.
3. Pick the highest priority task where \`passes: false\`.
4. Implement that single task. Use \`subtasks\` as small implementation steps or a suggested breakdown.
5. Run the project's relevant quality checks.
6. If checks pass, update the PRD file to set \`passes: true\` for the completed task.
7. Append progress to the progress log in the feature directory.

Do not commit changes. Finish one task, record progress, then stop so the next iteration can pick the next task.

## Progress Report Format

Append to the progress.txt file in the feature directory, never replace it:

\`\`\`
## [Date/Time] - [Task ID]
- What was implemented
- Files changed
- **Learnings for future iterations:**
  - Patterns discovered
  - Gotchas encountered
  - Useful context
---
\`\`\`

## Stop Condition

After completing a task, check if all tasks have \`passes: true\`.

If all tasks are complete and passing, reply with:
<promise>COMPLETE</promise>

If there are still incomplete tasks, end normally so the next iteration can continue.

Work on one task per iteration. Keep changes focused and keep quality checks green.
`;

export const runCommand = defineCommand({
    meta: {
        name: "run",
        description: "Run an OpenCode feature loop",
    },
    args: {
        maxIterations: {
            type: "string",
            description: "Maximum number of OpenCode iterations. Defaults to task count plus extra iterations",
        },
        extraIterations: {
            type: "string",
            description: "Extra OpenCode iterations to run after one pass per task",
            default: "3",
        },
        featureRoot: {
            type: "string",
            description: "Directory containing feature folders",
        },
        root: {
            type: "string",
            description: "Aigent root directory containing a feature directory",
            default: join(homedir(), ".aigent"),
        },
        repositoryRoot: {
            type: "string",
            description: "Target repository root. Defaults to the current Git repository root",
        },
        model: {
            type: "string",
            description: "OpenCode model to use, in provider/model format",
        },
    },
    async run({ args }) {
        intro("aigent run");

        const extraIterations = Number.parseInt(args.extraIterations, 10);

        if (!Number.isInteger(extraIterations) || extraIterations < 0) {
            log.error("extraIterations must be a non-negative integer");
            throw new Error("extraIterations must be a non-negative integer");
        }

        const repositoryRoot = args.repositoryRoot
            ? resolve(args.repositoryRoot)
            : await getRepositoryRoot();
        const remoteUrl = args.repositoryRoot ? undefined : await getRemoteUrl();
        const featureRoot = resolve(args.featureRoot ?? join(args.root, "feature"));
        const features = await getMatchingFeatures({ featureRoot, repositoryRoot, remoteUrl });

        if (features.length === 0) {
            log.warn(`No features found for ${repositoryRoot} in ${featureRoot}`);
            outro("No matching features found");
            return;
        }

        const selected = await select({
            message: "Select feature",
            options: features.map(feature => ({
                value: feature.directory,
                label: `${feature.prd.description} (${feature.name})`,
            })),
        });

        if (isCancel(selected)) {
            cancel("Feature selection cancelled");
            return;
        }

        const selectedFeature = features.find(feature => feature.directory === selected);

        if (!selectedFeature) {
            log.error("Selected feature was not found");
            throw new Error("Selected feature was not found");
        }

        const taskCount = selectedFeature.prd.tasks.length;
        const maxIterations = args.maxIterations
            ? Number.parseInt(args.maxIterations, 10)
            : taskCount + extraIterations;

        if (!Number.isInteger(maxIterations) || maxIterations < 1) {
            log.error("maxIterations must be a positive integer");
            throw new Error("maxIterations must be a positive integer");
        }

        log.info(`Found ${taskCount} tasks, doing ${maxIterations} iterations (${extraIterations} extra)`);

        await ensureProgressFile(selected);

        const prompt = createPrompt({ featureDirectory: selected });
        let usageTotal = emptyUsage();

        for (let index = 1; index <= maxIterations; index += 1) {
            const taskTitle = await getNextTaskTitle(selected);
            const iterationLabel = taskTitle
                ? `Iteration ${index}: ${taskTitle}`
                : `Iteration ${index}`;

            const { output, exitCode, sessionId, usage } = await runOpenCode({
                label: iterationLabel,
                model: args.model,
                prompt,
                repositoryRoot,
            });
            usageTotal = addUsage(usageTotal, usage);

            await appendUsageRecord({
                featureDirectory: selected,
                record: {
                    timestamp: new Date().toISOString(),
                    iteration: index,
                    sessionId,
                    ...usage,
                },
            });

            log.info(`Iteration ${index} usage: ${formatUsage(usage)}`);

            if (exitCode && exitCode !== 0) {
                log.error(`OpenCode exited with code ${exitCode}`);
                throw new Error(`OpenCode exited with code ${exitCode}`);
            }

            if (output.includes("<promise>COMPLETE</promise>")) {
                log.success(`Completed all tasks at iteration ${index}`);
                log.success(`Final usage: ${formatUsage(usageTotal)}`);
                outro("Aigent run complete");
                return;
            }
        }

        log.warn(`Final usage: ${formatUsage(usageTotal)}`);
        outro("Aigent reached the iteration limit");
        throw new Error(`Reached max iterations (${maxIterations}) without completion`);
    },
});
