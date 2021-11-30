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

let usageDataCollection: Collection;
let usersCollection: Collection;
let sessionsCollection: Collection;

export async function initDB() {
    try {
        const client = await MongoClient.connect(config.dbUri);
        const db = await client.db(config.dbName);
        usageDataCollection = await createOrGetCollection(db, "usage");
        usersCollection = await createOrGetCollection(db, "users");
        await updateIndex(usersCollection, "uuid");
        sessionsCollection = await createOrGetCollection(db, "sessions");
        await updateIndex(sessionsCollection, "id");
        await updateIndex(sessionsCollection, "userId", 1, false);

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

    if (!entry.sessionId) {
        return;
    }

    // Add user to DB if they don't already exist
    try {
        const updateDoc = {uuid: userId} as any;
        if (entry.action === TelemetryAction.OptOut) {
            updateDoc.optOut = true;
        } else if (entry.action === TelemetryAction.OptIn) {
            updateDoc.optOut = false;
        }

        if (entry.countryCode) {
            updateDoc.countryCode = entry.countryCode;
        }
        if (entry.regionCode) {
            updateDoc.regionCode = entry.regionCode;
        }

        await usersCollection.updateOne({uuid: userId}, {$set: updateDoc}, {upsert: true});
    } catch (err) {
        console.warn(err);
    }

    if (entry.action === TelemetryAction.Connection) {
        try {
            const session = new Session(entry, userId);
            await sessionsCollection.insertOne(session);
        } catch (err) {
            console.warn(err);
        }
    } else if (entry.action === TelemetryAction.EndSession) {
        try {
            const existingSession = (await sessionsCollection.findOne({id: entry.sessionId})) as Session;
            if (!existingSession) {
                console.warn(`Cannot find existing session ${entry.sessionId}`);
                return;
            }

            // Update document with end timestamp
            const duration = entry.timestamp - existingSession.startTime;
            if (duration >= 0) {
                await sessionsCollection.updateOne(
                    {id: entry.sessionId},
                    {
                        $set: {
                            endTime: entry.timestamp,
                            duration: duration
                        }
                    }
                );
            }
        } catch (err) {
            console.warn(err);
        }
    } else {
        LogMessage(entry);
    }

    messageCache.set(entry.id, true);
}
