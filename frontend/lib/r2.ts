import { S3Client, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { r2Config } from "./config";

// R2 is S3-compatible, so we use the AWS SDK
export const r2 = new S3Client({
  region: "auto",
  endpoint: r2Config.endpoint,
  credentials: {
    accessKeyId: r2Config.accessKeyId,
    secretAccessKey: r2Config.secretAccessKey,
  },
});

/**
 * Generate a signed PUT URL for uploading to R2
 * @param key - The R2 object key (e.g., "person/user_123/uuid.jpg")
 * @param contentType - MIME type of the file
 * @param expiresIn - Expiration time in seconds (default: 600 = 10 minutes)
 * @returns Signed URL for PUT request
 */
export async function generateSignedPutUrl(
  key: string,
  contentType: string,
  expiresIn: number = 600
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: r2Config.bucketName,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(r2, command, { expiresIn });
}

/**
 * Generate a signed GET URL for reading from R2 (if needed for private objects)
 * @param key - The R2 object key
 * @param expiresIn - Expiration time in seconds (default: 3600 = 1 hour)
 * @returns Signed URL for GET request
 */
export async function generateSignedGetUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: r2Config.bucketName,
    Key: key,
  });

  return getSignedUrl(r2, command, { expiresIn });
}

/**
 * Get the public URL for an R2 object
 * @param key - The R2 object key
 * @returns Public CDN URL
 */
export function getPublicUrl(key: string): string {
  return `${r2Config.publicBaseUrl}/${key}`;
}

