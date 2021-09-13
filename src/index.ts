import * as express from "express";
import * as bodyParser from "body-parser";
import * as bearerToken from "express-bearer-token";
import * as http from "http";
import * as fs from "fs";
import * as cors from "cors";
import * as chalk from "chalk";
import * as jwt from "jsonwebtoken";
import {RequestHandler} from "express";
import {v1 as uuidv1} from "uuid";
import {noCache, verboseError} from "./Util";
import {config} from "./Config";
import {LogMessage, TelemetryMessage} from "./Models";
import {initDB} from "./Database";
import * as moment from "moment";

let app = express();
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use(bearerToken());
app.use(cors());

const publicKey = fs.readFileSync(config.publicKey);
const privateKey = fs.readFileSync(config.privateKey);

let authGuard: RequestHandler = (req, res, next) => {
    const tokenString = req.token;
    if (tokenString) {
        try {
            const uuid = verifyToken(tokenString);
            if (!uuid) {
                next({statusCode: 401, message: "Not authorized"});
            } else {
                req.token = uuid;
                next();
            }
        } catch (err: any) {
            next({statusCode: 400, message: err.message});
        }
    } else {
        next({statusCode: 401, message: "Not authorized"});
    }
};

function verifyToken(tokenString: string): string | undefined {
    const tokenJson: any = jwt.verify(tokenString, publicKey, {algorithms: ["RS256"]});
    if (tokenJson && tokenJson.iss === "carta-telemetry" && tokenJson.uuid) {
        return tokenJson.uuid;
    }
    return undefined;
}

let tokenHandler: RequestHandler = (req, res, next) => {
    try {
        const tokenData = {uuid: uuidv1(), iss: "carta-telemetry"};
        const token = jwt.sign(tokenData, privateKey, {algorithm: "RS256"});
        return res.json({token, token_type: "bearer"});
    } catch (err) {
        verboseError(err);
        next({statusCode: 500, message: "Problem signing token"});
    }
};

let checkHandler: RequestHandler = (req, res, next) => {
    if (!req.token) {
        return next({statusCode: 401, message: "Not authorized"});
    }

    res.json({
        success: true,
        uuid: req.token
    });
};

let submitHandler: RequestHandler = (req, res, next) => {
    if (!req.token) {
        return next({statusCode: 401, message: "Not authorized"});
    }

    const entries = req.body as TelemetryMessage[];

    if (!entries || !Array.isArray(entries) || !entries.length) {
        return next({statusCode: 400, message: "Malformed submission"});
    }
    console.log(`Received ${entries.length} telemetry entries from ${req.token} [${req.ip}]`);
    // TODO: insert into database itself
    for (const entry of entries) {
        LogMessage(entry);
    }
    console.log();
    res.json({success: true, uuid: req.token});
};

app.get("/token", noCache, tokenHandler);
app.get("/checkId", authGuard, checkHandler);
app.post("/submit", authGuard, submitHandler);

// Simplified error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || "error";

    res.status(err.statusCode).json({
        status: err.status,
        message: err.message
    });
});

async function init() {
    await initDB();
    const expressServer = http.createServer(app);
    expressServer.listen(config.port);
}

init().then(() => console.log(chalk.green.bold(`Server initialised successfully on port ${config.port}`)));
