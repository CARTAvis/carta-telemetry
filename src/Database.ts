import {Collection, Db, IndexDirection, MongoClient} from "mongodb";
import {LRUMap} from "mnemonist";
import {config} from "./Config";
import {verboseError} from "./Util";
import {PrintMessage, TelemetryAction, TelemetryMessage} from "./Models";
import {Session} from "./Models/Session";

const messageCache = new LRUMap<string, boolean>(100000);

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
    const hasIndex = await collection.indexExists(key);
    if (!hasIndex) {
        await collection.createIndex([[key, direction]], {name: key, unique});
        console.log(`Created ${key} index for collection ${collection.collectionName}`);
    }
}

let usageDataCollection: Collection;
let usersCollection: Collection;
let sessionsCollection: Collection;
let entriesCollection: Collection;

export async function initDB(updateIndices: boolean = false) {
    try {
        const client = await MongoClient.connect(config.dbUri);
        const db = await client.db(config.dbName);
        usageDataCollection = await createOrGetCollection(db, "usage");
        usersCollection = await createOrGetCollection(db, "users");
        entriesCollection = await createOrGetCollection(db, "entries");
        sessionsCollection = await createOrGetCollection(db, "sessions");

        if (updateIndices) {
            await updateIndex(usersCollection, "uuid");
            await updateIndex(sessionsCollection, "id");
            await updateIndex(sessionsCollection, "userId", 1, false);
            await updateIndex(entriesCollection, "id");
            await updateIndex(entriesCollection, "userId", 1, false);
            await updateIndex(entriesCollection, "ipHash", 1, false);
        }

        console.log(`Connected to MongoDB server ${config.dbUri} and database ${config.dbName}`);
    } catch (err) {
        verboseError(err);
        console.error("Error connecting to database");
        process.exit(1);
    }
}

export async function addToDb(entry: TelemetryMessage, userId: string, logEntry: boolean) {
    if (messageCache.has(entry.id)) {
        console.debug(`Skipping stale entry ${entry.id}`);
        return;
    }
    messageCache.set(entry.id, true);

    if (!entry.sessionId) {
        return;
    }

    if (logEntry) {
        try {
            await entriesCollection.insertOne(entry);
        } catch (err) {
            console.warn(err);
        }
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
            const existingSession = (await sessionsCollection.findOne({id: entry.sessionId})) as unknown as Session;
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
        PrintMessage(entry);
    }
}

export async function getUserMetrics() {
    try {
        const allUsers = await usersCollection.find().toArray();
        const numUsers = allUsers.length;
        const numOptedOutUsers = allUsers.filter(u => u.optOut).length;
        console.log(`Of the ${numUsers} unique users, ${numOptedOutUsers} (${((100 * numOptedOutUsers) / numUsers).toFixed(2)}%) opted out of telemetry`);
    } catch (err) {
        console.error(err);
    }
}

export async function getFileLoadMetrics() {
    try {
        const fileOpenEntries = await entriesCollection.find({action: "fileOpen"}).toArray();
        const fileOpenDetails = fileOpenEntries.map(e => e.details);
        const numFilesOpened = fileOpenEntries.length;
        if (numFilesOpened) {
            // Stokes
            const numStokesCubes = fileOpenDetails.filter(d => d.stokes > 1).length;
            console.log(`Of the ${numFilesOpened} files opened, ${numStokesCubes} (${((100 * numStokesCubes) / numFilesOpened).toFixed(2)}%) were Stokes cubes`);

            // 3D cubes
            const entries3d = fileOpenDetails.filter(d => d.depth > 1);
            const num3dCubes = entries3d.length;
            console.log(`Of the ${numFilesOpened} files opened, ${num3dCubes} (${((100 * num3dCubes) / numFilesOpened).toFixed(2)}%) were 3D cubes`);
            if (num3dCubes) {
                const channelSize = entries3d.map(d => d.depth);
                const minChannels = Math.min(...channelSize);
                const maxChannels = Math.max(...channelSize);
                const avgChannels = channelSize.reduce((a, b) => a + b) / num3dCubes;
                console.log(`Channel sizes range: [${minChannels}, ${maxChannels}]. Average: ${avgChannels.toFixed(1)}`);
            }

            // 2D slice sizes
            const numPixelsChannel = fileOpenDetails.map(d => d.width * d.height);
            // Slice sizes in megapixels
            const minSliceSize = Math.min(...numPixelsChannel) / 1.0e6;
            const maxSliceSize = Math.max(...numPixelsChannel) / 1.0e6;
            const avgSliceSize = numPixelsChannel.reduce((a, b) => a + b) / numFilesOpened / 1.0e6;
            const avgDims = Math.sqrt(avgSliceSize) * 1.0e3;
            const minDims = Math.sqrt(minSliceSize) * 1.0e3;
            const maxDims = Math.sqrt(maxSliceSize) * 1.0e3;
            console.log(`Channel slice sizes range (megapixels): [${minSliceSize.toFixed(2)}, ${maxSliceSize.toFixed(2)}]. Average: ${avgSliceSize.toFixed(2)}`);
            console.log(`Channel slice sizes range (square dims): [${minDims.toFixed(0)} * ${minDims.toFixed(0)}, ${maxDims.toFixed(0)} * ${maxDims.toFixed(0)}]. Average: ${avgDims.toFixed(0)} * ${avgDims.toFixed(0)}`);

            // Full cube size in MB
            const fullCubeSize = fileOpenDetails.map(d => d.width * d.height * d.depth * d.stokes);

            // Cube sizes in MB, assuming 32-bit data type
            const minCubeSize = (4 * Math.min(...fullCubeSize)) / 1.0e6;
            const maxCubeSize = (4 * Math.max(...fullCubeSize)) / 1.0e6;
            const avgCubeSize = (4 * fullCubeSize.reduce((a, b) => a + b)) / numFilesOpened / 1.0e6;
            console.log(`Cube size range (MB): [${minCubeSize.toFixed(2)}, ${maxCubeSize.toFixed(2)}]. Average: ${avgCubeSize.toFixed(2)}`);
        }
    } catch (err) {
        console.error(err);
    }
}
