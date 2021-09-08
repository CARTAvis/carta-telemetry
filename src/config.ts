import * as yargs from "yargs";

interface CommandLineOptions {
    [x: string]: unknown;
    verbose: boolean;
    port: number;
    databaseUri: string;
    databaseName: string;
    publicKeyLocation: string;
    privateKeyLocation: string;
}

export const config = yargs.options({
    verbose: {
        type: "boolean",
        alias: "v"
    },
    port: {
        type: "number",
        alias: "p",
        default: 8002
    },
    databaseUri: {
        type: "string",
        default: "mongodb://localhost:27017"
    },
    databaseName: {
        type: "string",
        default: "carta-telemetry"
    },
    publicKeyLocation: {
        type: "string",
        default: "/etc/carta/telemetry/key_public.pem"
    },
    privateKeyLocation: {
        type: "string",
        default: "/etc/carta/telemetry/key_private.pem"
    }
}).argv as CommandLineOptions;
