import * as express from "express";
import {config} from "./Config";

// Delay for the specified number of milliseconds
export async function delay(delay: number) {
    return new Promise<void>(resolve => {
        setTimeout(() => resolve(), delay);
    });
}

export function noCache(req: express.Request, res: express.Response, next: express.NextFunction) {
    res.header("Cache-Control", "private, no-cache, no-store, must-revalidate");
    res.header("Expires", "-1");
    res.header("Pragma", "no-cache");
    next();
}

export function detectIp(req: express.Request) {
    const forwardedHeader = req.headers["x-forwarded-for"];
    if (forwardedHeader) {
        if (Array.isArray(forwardedHeader)) {
            return forwardedHeader[0];
        } else {
            return (forwardedHeader as string).split(",")[0];
        }
    }
    return req.ip;
}

export function verboseLog(...args: any[]) {
    if (config.verbose) {
        console.log(args);
    }
}

export function verboseError(...args: any[]) {
    if (config.verbose) {
        console.error(args);
    }
}
