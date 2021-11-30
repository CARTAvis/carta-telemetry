import {TelemetryMessage} from "./TelemetryMessage";

export enum Platform {
    Linux = "Linux",
    MacOS = "macOS",
    Unknown = "Unknown"
}

export interface PlatformInfo {
    variant?: string;
    distro?: string;
    version?: string;
}

export class Session {
    id: string;
    userId: string;
    version: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    backendPlatform: Platform;
    backendPlatformInfo: PlatformInfo;
    // TODO: Add frontend info
    frontendPlatform?: string;
    frontendUserAgent?: string;

    constructor(entry: TelemetryMessage, userId: string) {
        this.id = entry.sessionId;
        this.userId = userId;
        this.version = entry.version;
        this.startTime = entry.timestamp;
        const platform = entry.details?.platformInfo?.platform;
        const platformInfoString = entry.details?.platformInfo?.release_info;

        if (platformInfoString) {
            this.backendPlatformInfo = Session.GetPlatformInfo(platformInfoString, platform);
        } else {
            this.backendPlatformInfo = {};
        }

        if (platform) {
            this.backendPlatform = platform;
        } else {
            this.backendPlatform = Platform.Unknown;
        }
    }

    private static GetPlatformInfo(infoString: string, platform: Platform): PlatformInfo {
        if (!infoString || !platform) {
            return {};
        }

        if (platform === Platform.Linux) {
            // Pull out entries from /etc/os-release string, and trim quotation marks from any elemets
            const nameRegex = /NAME=(?<name>.+?)\n/m;
            const variantRegex = /ID_LIKE=(?<variant>.+?)\n/m;
            const versionRegex = /VERSION_ID=(?<version>.+?)\n/m;
            const quotationMarksRegex = /^"(.+(?="$))"$/;
            return {
                distro: infoString.match(nameRegex)?.groups?.["name"]?.replace(quotationMarksRegex, "$1") ?? undefined,
                variant: infoString.match(variantRegex)?.groups?.["variant"]?.replace(quotationMarksRegex, "$1") ?? undefined,
                version: infoString.match(versionRegex)?.groups?.["version"]?.replace(quotationMarksRegex, "$1") ?? undefined
            };
        } else {
            const versionRegex = /ProductVersion:\s*(?:\\t)*(?<version>(?:\d+\.\d+\.\d+)|(?:\d+\.\d+)|(?:\d+))/;
            return {
                version: infoString.match(versionRegex)?.groups?.["version"] ?? undefined
            };
        }
    }
}
