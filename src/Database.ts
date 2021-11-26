import {Collection, Db, IndexDirection, MongoClient} from "mongodb";
import {LRUMap} from "mnemonist";
import {config} from "./Config";
import {verboseError} from "./Util";
import {LogMessage, TelemetryAction, TelemetryMessage} from "./Models";
import {Session} from "./Models/Session";

const messageCache = new LRUMap<string, boolean>(10000);

export async function createOrGetCollection(db: Db, collectionName: string) {
    const collectionExists = await db.listCollections({name: collectionName}, {nameOnly: true}).hasNext();
    if (collectionExists) {
        return db.collection(collectionName);
    } else {
        console.log(`Creating collection ${collectionName}`);
        return db.createCollection(collectionName);
    }
}

async function updateIndex(collection: Collection, key: string, direction: IndexDirection = 1, unique: boolean = true) {
    const hasIndex = await collection.indexExists("username");
    if (!hasIndex) {
        await collection.createIndex([[key, direction]], {name: key, unique});
        console.log(`Created ${key} index for collection ${collection.collectionName}`);
    }
}

let usageData: Collection;
let users: Collection;
let sessions: Collection;

export async function initDB() {
    try {
        const client = await MongoClient.connect(config.dbUri);
        const db = await client.db(config.dbName);
        usageData = await createOrGetCollection(db, "usage");
        users = await createOrGetCollection(db, "users");
        await updateIndex(users, "uuid");
        sessions = await createOrGetCollection(db, "sessions");
        await updateIndex(sessions, "id");
        await updateIndex(sessions, "userId", 1, false);

        console.log(`Connected to MongoDB server ${config.dbUri} and database ${config.dbName}`);
    } catch (err) {
        verboseError(err);
        console.error("Error connecting to database");
        process.exit(1);
    }
}

export async function addToDb(entry: TelemetryMessage, userId: string) {
    if (messageCache.has(entry.id)) {
        console.debug(`Skipping stale entry ${entry.id}`);
        return;
    }

    // TODO: Add to MongoDB itself

    if (entry.action === TelemetryAction.Connection) {
        try {
            const session = new Session(entry, userId);
            await sessions.insertOne(session);
        } catch (err) {
            console.warn(err);
        }
    }

    messageCache.set(entry.id, true);
    LogMessage(entry);
}
