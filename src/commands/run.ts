import { select } from "@clack/prompts";
import { defineCommand } from "citty";
import { execa } from "execa";
import { spawn } from "node:child_process";
import type { Dirent } from "node:fs";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

type Prd = {
    project: string;
    branchName: string;
    description: string;
    userStories: Array<{
        id: string;
        title: string;
        description: string;
        acceptanceCriteria: string[];
        priority: number;
        passes: boolean;
        notes: string;
    }>;
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

const runOpenCode = async ({ prompt, repositoryRoot }: { prompt: string; repositoryRoot: string }) => {
    const subprocess = spawn(
        "opencode",
        ["run", "--dir", repositoryRoot, "--dangerously-skip-permissions", prompt],
        {
            stdio: ["inherit", "pipe", "pipe"],
        }
    );

    let output = "";

    subprocess.stdout.on("data", chunk => {
        const text = chunk.toString();
        output += text;
        process.stdout.write(text);
    });

    subprocess.stderr.on("data", chunk => {
        const text = chunk.toString();
        output += text;
        process.stderr.write(text);
    });

    const exitCode = await new Promise<number | undefined>((resolvePromise, rejectPromise) => {
        subprocess.on("error", rejectPromise);
        subprocess.on("close", code => resolvePromise(code ?? undefined));
    });

    return { output, exitCode };
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
3. Check you are on the correct branch from PRD \`branchName\`. If not, check it out or create it from the default branch.
4. Pick the highest priority user story where \`passes: false\`.
5. Implement that single user story.
6. Run the project's relevant quality checks.
7. If checks pass, update the PRD file to set \`passes: true\` for the completed story.
8. Append progress to the progress log in the feature directory.

Do not commit changes. Finish one story, record progress, then stop so the next iteration can pick the next story.

## Progress Report Format

Append to the progress.txt file in the feature directory, never replace it:

\`\`\`
## [Date/Time] - [Story ID]
- What was implemented
- Files changed
- **Learnings for future iterations:**
  - Patterns discovered
  - Gotchas encountered
  - Useful context
---
\`\`\`

## Stop Condition

After completing a user story, check if all stories have \`passes: true\`.

If all stories are complete and passing, reply with:
<promise>COMPLETE</promise>

If there are still incomplete stories, end normally so the next iteration can continue.

Work on one story per iteration. Keep changes focused and keep quality checks green.
`;

export const runCommand = defineCommand({
    meta: {
        name: "run",
        description: "Run an OpenCode feature loop",
    },
    args: {
        maxIterations: {
            type: "string",
            description: "Maximum number of OpenCode iterations",
            default: "10",
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
    },
    async run({ args }) {
        const maxIterations = Number.parseInt(args.maxIterations, 10);

        if (!Number.isInteger(maxIterations) || maxIterations < 1) {
            throw new Error("maxIterations must be a positive integer");
        }

        const repositoryRoot = args.repositoryRoot
            ? resolve(args.repositoryRoot)
            : await getRepositoryRoot();
        const remoteUrl = args.repositoryRoot ? undefined : await getRemoteUrl();
        const featureRoot = resolve(args.featureRoot ?? join(args.root, "feature"));
        const features = await getMatchingFeatures({ featureRoot, repositoryRoot, remoteUrl });

        if (features.length === 0) {
            console.log(`No features found for ${repositoryRoot} in ${featureRoot}`);
            return;
        }

        const selected = await select({
            message: "Select feature",
            options: features.map(feature => ({
                value: feature.directory,
                label: `${feature.prd.description} (${feature.name})`,
            })),
        });

        if (typeof selected !== "string") {
            throw new Error("No feature selected");
        }

        await ensureProgressFile(selected);

        const prompt = createPrompt({ featureDirectory: selected });

        for (let index = 1; index <= maxIterations; index += 1) {
            console.log(`\nAigent iteration ${index} of ${maxIterations}`);

            const { output, exitCode } = await runOpenCode({ prompt, repositoryRoot });

            if (exitCode && exitCode !== 0) {
                throw new Error(`OpenCode exited with code ${exitCode}`);
            }

            if (output.includes("<promise>COMPLETE</promise>")) {
                console.log(`Completed all stories at iteration ${index}`);
                return;
            }
        }

        throw new Error(`Reached max iterations (${maxIterations}) without completion`);
    },
});
