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
    backendPlatform: Platform;
    backendPlatformInfo: PlatformInfo;
    // TODO
    frontendPlatform?: string;
    frontendUserAgent?: string;

    constructor(entry: TelemetryMessage, userId: string) {
        this.id = entry.sessionId;
        this.userId = userId;
        this.version = entry.version;
        this.startTime = entry.timestamp;
        const platform = entry.details?.platform;
        const platformInfoString = entry.details?.platformInfo;

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
            const nameRegex = /NAME=\\"(?<name>.+?)\\"/;
            const variantRegex = /ID_LIKE=(?:\\")?(?<variant>.+?)(?:\\")?\\n/;
            const versionRegex = /VERSION_ID=\\"(?<version>.+?)\\"/;

            return {
                distro: infoString.match(nameRegex)?.groups?.["name"] ?? undefined,
                variant: infoString.match(variantRegex)?.groups?.["variant"] ?? undefined,
                version: infoString.match(versionRegex)?.groups?.["version"] ?? undefined
            };
        } else {
            const versionRegex = /ProductVersion:\s*(?:\\t)*(?<version>(?:\d+\.\d+\.\d+)|(?:\d+\.\d+)|(?:\d+))/;
            return {
                version: infoString.match(versionRegex)?.groups?.["version"] ?? undefined
            };
        }
    }
}
