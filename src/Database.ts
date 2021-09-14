import {Collection, Db, MongoClient} from "mongodb";
import {LRUMap} from "mnemonist";
import {config} from "./Config";
import {verboseError} from "./Util";
import {LogMessage, TelemetryMessage} from "./Models";

const messageCache = new LRUMap<string, TelemetryMessage>(1000);

export async function createOrGetCollection(db: Db, collectionName: string) {
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

export async function addToDb(entry: TelemetryMessage) {
    if (messageCache.has(entry.id)) {
        console.debug(`Skipping stale entry ${entry.id}`);
        return;
    }

    // TODO: Add to MongoDB itself
    messageCache.set(entry.id, entry);
    LogMessage(entry);
}
