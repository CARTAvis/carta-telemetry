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

// Simplified error handling
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || "error";

    res.status(err.statusCode).json({
        status: err.status,
        message: err.message
    });
});

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
        const client = await MongoClient.connect(config.databaseUri);
        const db = await client.db(config.databaseName);
        usageDataCollection = await createOrGetCollection(db, "usage");
        userDataCollection = await createOrGetCollection(db, "user");
        console.log(`Connected to MongoDB server ${config.databaseUri} and database ${config.databaseName}`);
    } catch (err) {
        verboseError(err);
        console.error("Error connecting to database");
        process.exit(1);
    }
}

const publicKey = fs.readFileSync(config.publicKeyLocation);
const privateKey = fs.readFileSync(config.privateKeyLocation);

export function verifyToken(tokenString: string): string | undefined {
    const tokenJson: any = jwt.verify(tokenString, publicKey);
    if (tokenJson && tokenJson.iss === "carta-telemetry" && tokenJson.uuid) {
        return tokenJson.uuid;
    }
    return undefined;
}

let tokenHandler: RequestHandler = (req, res) => {
    try {
        const uuid = uuidv1();
        const token = jwt.sign(
            {
                uuid,
                iss: "carta-telemetry"
            },
            privateKey
        );
        return res.json({
            token,
            token_type: "bearer"
        });
    } catch (err) {
        verboseError(err);
        console.error("Problem signinig token");
        res.status(500);
    }
};

app.get("/token", noCache, tokenHandler);

async function init() {
    await initDB();
    const expressServer = http.createServer(app);
    expressServer.listen(config.port);
}

init().then(() => console.log(chalk.green.bold(`Server initialised successfully on port ${config.port}`)));
