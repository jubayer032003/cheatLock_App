import mongoose from "mongoose";
import { config } from "../src/config.js";

const apply = process.env.APPLY_RETENTION_INDEX_MIGRATION === "true";

async function main() {
  await mongoose.connect(config.mongodb.uri(), {
    dbName: config.mongodb.dbName,
    autoIndex: false,
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || "10000"),
  });

  const collection = mongoose.connection.db.collection("proctoringevents");
  const indexes = await collection.indexes();
  const legacyCreatedAtTtl = indexes.find((index) =>
    index.key?.createdAt === 1 && typeof index.expireAfterSeconds === "number"
  );
  const retentionTtl = indexes.find((index) =>
    index.key?.retentionExpiresAt === 1 && index.expireAfterSeconds === 0
  );

  console.log(JSON.stringify({
    apply,
    legacyCreatedAtTtl: legacyCreatedAtTtl?.name || null,
    retentionExpiresAtTtl: retentionTtl?.name || null,
  }, null, 2));

  if (apply && legacyCreatedAtTtl) {
    await collection.dropIndex(legacyCreatedAtTtl.name);
    console.log(`Dropped legacy TTL index: ${legacyCreatedAtTtl.name}`);
  }

  if (apply && !retentionTtl) {
    await collection.createIndex({ retentionExpiresAt: 1 }, { expireAfterSeconds: 0, name: "retentionExpiresAt_1" });
    console.log("Created retentionExpiresAt TTL index.");
  }

  if (!apply && legacyCreatedAtTtl) {
    process.exitCode = 1;
    console.error("Legacy createdAt TTL index still exists. Rerun with APPLY_RETENTION_INDEX_MIGRATION=true after review.");
  }
}

main()
  .catch((error) => {
    console.error(`${error.name}: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
