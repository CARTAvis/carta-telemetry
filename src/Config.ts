import * as yargs from "yargs";

interface CommandLineOptions {
    [x: string]: unknown;

    verbose: boolean;
    logOutput: boolean;
    port: number;
    dbUri: string;
    dbName: string;
    publicKey: string;
    privateKey: string;
    ipBlacklist: string;
}

const helpOutputMaxSize = 140;

export const config = yargs
    .options({
        verbose: {
            description: "Show verbose output",
            type: "boolean",
            alias: "v"
        },
        logOutput: {
            description: "Store all incoming telemetry entries in the database as they arrive",
            type: "boolean",
            default: false,
            alias: "l"
        },
        port: {
            description: "HTTP port to listen on",
            type: "number",
            alias: "p",
            default: 8002
        },
        dbUri: {
            description: "MongoDB server URI",
            type: "string",
            default: "mongodb://localhost:27017"
        },
        dbName: {
            description: "MongoDB database name",
            type: "string",
            default: "carta-telemetry"
        },
        publicKey: {
            description: "Path to RSA256 public key for verifying JWTs",
            type: "string",
            default: "/etc/carta/telemetry/key_public.pem"
        },
        privateKey: {
            description: "Path to RSA256 private key for signing JWTs",
            type: "string",
            default: "/etc/carta/telemetry/key_private.pem"
        },
        ipBlacklist: {
            description: "Path to IP blacklist JSON file",
            type: "string",
            default: "/etc/carta/telemetry/blacklist.json"
        }
    })
    .wrap(Math.min(yargs.terminalWidth(), helpOutputMaxSize)).argv as CommandLineOptions;
