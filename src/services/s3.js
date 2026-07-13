import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { logger } from "./logger.js";

const s3Endpoint = process.env.S3_ENDPOINT || "http://localhost:9000";
const s3AccessKey = process.env.S3_ACCESS_KEY || "cheatlock_admin";
const s3SecretKey = process.env.S3_SECRET_KEY || "cheatlock_secret";
const s3Bucket = process.env.S3_BUCKET || "cheatlock-telemetry";
const s3Region = process.env.S3_REGION || "us-east-1";

logger.info(`Initializing S3/MinIO client at endpoint: ${s3Endpoint}, bucket: ${s3Bucket}`);

const s3Client = new S3Client({
  endpoint: s3Endpoint,
  region: s3Region,
  credentials: {
    accessKeyId: s3AccessKey,
    secretAccessKey: s3SecretKey,
  },
  forcePathStyle: true, // Required for MinIO local compatibility
});

/**
 * Strips base64 headers and uploads a raw binary buffer to MinIO S3 bucket.
 * 
 * @param {string} key Unique object storage file key path
 * @param {string} base64Data Base64 encoded string data
 * @param {string} contentType MIME type of the uploaded file
 * @returns {Promise<string>} S3 object URL
 */
export async function uploadFrame(key, base64Data, contentType = "image/jpeg") {
  try {
    if (!base64Data) {
      throw new Error("Cannot upload empty data to S3.");
    }

    // Strip out base64 prefix headers if present
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, "base64");

    const command = new PutObjectCommand({
      Bucket: s3Bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    });

    await s3Client.send(command);
    
    // Return relative identifier path key
    return key;
  } catch (error) {
    logger.error(`Failed to upload object to MinIO S3 [Key: ${key}]: ${error.message}`);
    throw error;
  }
}

/**
 * Generates a temporary secure pre-signed URL for viewing S3 assets.
 * 
 * @param {string} key Unique object key path
 * @param {number} expiresInSeconds URL expiration time
 * @returns {Promise<string>} Secure signed URL
 */
export async function getSignedFrameUrl(key, expiresInSeconds = 3600) {
  try {
    if (!key) return "";

    // If key is already a full external web url, bypass signing
    if (key.startsWith("http://") || key.startsWith("https://")) {
      return key;
    }

    const command = new GetObjectCommand({
      Bucket: s3Bucket,
      Key: key,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn: expiresInSeconds });
    return url;
  } catch (error) {
    logger.error(`Failed to generate signed URL for S3 key [${key}]: ${error.message}`);
    // Fallback to a direct endpoint URL if signing fails
    return `${s3Endpoint}/${s3Bucket}/${key}`;
  }
}
