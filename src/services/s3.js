import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { config } from "../config.js";
import { logger } from "./logger.js";

let cachedClient = null;

function getS3Config() {
  return config.s3();
}

function requireS3() {
  const s3 = getS3Config();
  if (!s3.enabled) {
    throw new Error("S3 storage is not configured. Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, and S3_SECRET_KEY.");
  }
  return s3;
}

function getClient() {
  if (cachedClient) return cachedClient;

  const s3 = requireS3();
  cachedClient = new S3Client({
    endpoint: s3.endpoint,
    region: s3.region,
    credentials: {
      accessKeyId: s3.accessKey,
      secretAccessKey: s3.secretKey,
    },
    forcePathStyle: true,
  });
  logger.info("S3/MinIO telemetry storage is configured.");
  return cachedClient;
}

export function isS3Configured() {
  return getS3Config().enabled;
}

export async function uploadFrame(key, base64Data, contentType = "image/jpeg") {
  const s3 = requireS3();
  if (!key || !base64Data) {
    throw new Error("S3 upload requires an object key and payload.");
  }

  try {
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");
    const command = new PutObjectCommand({
      Bucket: s3.bucket,
      Key: key,
      Body: buffer,
      ContentEncoding: "base64",
      ContentType: contentType,
    });

    await getClient().send(command);
    return key;
  } catch (error) {
    logger.error(`Failed to upload telemetry object to S3: ${error.name || "UploadError"}`);
    throw error;
  }
}

export async function getSignedFrameUrl(key, expiresInSeconds = 3600) {
  const s3 = requireS3();
  if (!key) return "";

  if (key.startsWith("data:") || key.startsWith("http")) {
    return key;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: s3.bucket,
      Key: key,
    });
    return await getSignedUrl(getClient(), command, { expiresIn: expiresInSeconds });
  } catch (error) {
    logger.error(`Failed to generate signed telemetry URL: ${error.name || "SigningError"}`);
    throw error;
  }
}
