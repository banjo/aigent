import { defineCommand } from "citty";
import { version } from "../package.json";

export const main = defineCommand({
    meta: {
        name: "aigent",
        version,
        description: "Run autonomous feature loops with OpenCode",
    },
    subCommands: {
        helloWorld: () => import("@/commands/hello-world").then(m => m.helloWorldCommand),
        run: () => import("@/commands/run").then(m => m.runCommand),
    },
});
