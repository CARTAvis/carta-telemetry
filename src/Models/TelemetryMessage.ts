import * as chalk from "chalk";
import * as moment from "moment";

export enum TelemetryMode {
    None = "none",
    Minimal = "minimal",
    Usage = "usage"
}

export enum TelemetryAction {
    Connection = "connection",
    EndSession = "endSession",
    OptIn = "optIn",
    OptOut = "optOut",
    FileOpen = "fileOpen",
    FileClose = "fileClose"
}

export interface TelemetryMessage {
    timestamp: number;
    id: string;
    sessionId: string;
    usageEntry?: boolean;
    action: TelemetryAction;
    version: string;
    details?: any;
    regionCode?: string;
    countryCode?: string;
}

export function LogMessage(message: TelemetryMessage) {
    let messageString = `[${chalk.green(moment(message.timestamp))}]` + ` (v${chalk.italic(message.version)}) ${chalk.bold(message.action)}`;

    if (message.details) {
        messageString += `: ${JSON.stringify(message.details)}`;
    }
    console.log(messageString);
}
