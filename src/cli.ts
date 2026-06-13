import { defineCommand } from "citty";
import { version } from "../package.json";

export const main = defineCommand({
    meta: {
        name: "aigent",
        version,
        description: "Example CLI",
    },
    args: {
        dev: {
            type: "boolean",
            description: "Run in development mode",
            required: false,
            default: false,
            alias: "d",
        },
    },
    subCommands: {
        helloWorld: () => import("@/commands/hello-world").then(m => m.helloWorldCommand),
    },
});
