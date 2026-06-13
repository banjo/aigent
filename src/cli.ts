import { defineCommand } from "citty";
import { version } from "../package.json";

export const main = defineCommand({
    meta: {
        name: "aigent",
        version,
        description: "Run autonomous feature loops with OpenCode",
    },
    subCommands: {
        run: () => import("@/commands/run").then(m => m.runCommand),
    },
});
