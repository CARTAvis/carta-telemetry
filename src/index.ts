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
import {noCache, verboseError} from "./util";
import {config} from "./config";
import {Collection, Db, MongoClient} from "mongodb";

let app = express();
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.use(bearerToken());
app.use(cors());

async function createOrGetCollection(db: Db, collectionName: string) {
    const collectionExists = await db.listCollections({name: collectionName}, {nameOnly: true}).hasNext();
    if (collectionExists) {
        return db.collection(collectionName);
    } else {
        console.log(`Creating collection ${collectionName}`);
        return db.createCollection(collectionName);
    }
}

let usageDataCollection: Collection;
let userDataCollection: Collection;

export async function initDB() {
    try {
        const client = await MongoClient.connect(config.dbUri);
        const db = await client.db(config.dbName);
        usageDataCollection = await createOrGetCollection(db, "usage");
        userDataCollection = await createOrGetCollection(db, "user");
        console.log(`Connected to MongoDB server ${config.dbUri} and database ${config.dbName}`);
    } catch (err) {
        verboseError(err);
        console.error("Error connecting to database");
        process.exit(1);
    }
}

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
    const tokenJson: any = jwt.verify(tokenString, publicKey);
    if (tokenJson && tokenJson.iss === "carta-telemetry" && tokenJson.uuid) {
        return tokenJson.uuid;
    }
    return undefined;
}

let tokenHandler: RequestHandler = (req, res) => {
    try {
        const tokenData = {uuid: uuidv1(), iss: "carta-telemetry"};
        const token = jwt.sign(tokenData, privateKey, {algorithm: "RS256"});
        return res.json({token, token_type: "bearer"});
    } catch (err) {
        verboseError(err);
        console.error("Problem signing token");
        res.status(500).send();
    }
};

let submitHandler: RequestHandler = (req, res) => {
    console.log(req.token);
    return res.status(501).send();
};

let checkHandler: RequestHandler = (req, res, next) => {
    if (req.token) {
        res.json({
            success: true,
            uuid: req.token
        });
    } else {
        next({statusCode: 401, message: "Not authorized"});
    }
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
