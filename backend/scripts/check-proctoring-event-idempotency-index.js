import mongoose from "mongoose";
import { config } from "../src/config.js";

const reportLimit = Math.max(1, Number(process.env.DUPLICATE_REPORT_LIMIT || "25"));

async function main() {
  await mongoose.connect(config.mongodb.uri(), {
    dbName: config.mongodb.dbName,
    autoIndex: false,
    serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || "10000"),
  });

  const collection = mongoose.connection.db.collection("proctoringevents");
  const pipeline = [
    {
      $match: {
        idempotencyKey: { $type: "string", $gt: "" },
      },
    },
    {
      $group: {
        _id: {
          examId: "$examId",
          studentId: "$studentId",
          idempotencyKey: "$idempotencyKey",
        },
        count: { $sum: 1 },
        documentIds: { $push: "$_id" },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
  ];

  const [summary] = await collection.aggregate([...pipeline, { $count: "duplicateGroups" }]).toArray();
  const duplicateGroups = summary?.duplicateGroups || 0;

  if (duplicateGroups === 0) {
    console.log("OK: no duplicate proctoring event idempotency keys found.");
    return;
  }

  const samples = await collection
    .aggregate([
      ...pipeline,
      { $limit: reportLimit },
      {
        $project: {
          _id: 0,
          examId: "$_id.examId",
          studentId: "$_id.studentId",
          idempotencyKey: "$_id.idempotencyKey",
          count: 1,
          documentIds: { $slice: ["$documentIds", 10] },
        },
      },
    ])
    .toArray();

  console.error(`Found ${duplicateGroups} duplicate idempotency key group(s).`);
  console.error(JSON.stringify(samples, null, 2));
  process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error(`${error.name}: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect().catch(() => {});
  });
