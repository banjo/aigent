import { defineCommand, showUsage } from "citty";

export const helloWorldCommand = defineCommand({
    meta: {
        name: "Hello world",
        description: "A sub command example",
    },
    args: {
        name: {
            type: "string",
            description: "Your name",
        },
    },
    run(ctx) {
        if (ctx.args.name) {
            console.log(`Hello ${ctx.args.name}!`);
            return;
        }

        showUsage(ctx.cmd);
    },
});
