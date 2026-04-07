import { 
  S3Client, 
  PutObjectCommand, 
  GetObjectCommand, 
  DeleteObjectCommand 
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Config } from "../config/s3";

/**
 * S3 Service (Cloudflare R2 Implementation)
 * Handles secure file uploads, downloads for processing, and deletion.
 */
const s3Client = new S3Client({
  region: "auto",
  endpoint: s3Config.endpoint,
  credentials: {
    accessKeyId: s3Config.accessKeyId || "",
    secretAccessKey: s3Config.secretAccessKey || "",
  },
});

export const s3Service = {
  /**
   * Generates a Presigned URL for the Frontend.
   * Allows the client to upload directly to R2, bypassing our Express server.
   */
  async getUploadUrl(fileKey: string, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: s3Config.bucketName,
      Key: fileKey,
      ContentType: contentType,
    });

    // URL is valid for 15 mins for security
    return await getSignedUrl(s3Client, command, { expiresIn: 900 });
  },

  /**
   * Generates a temporary Download URL for the BullMQ Worker.
   * This is used to fetch the file binary for text extraction.
   */
  async getDownloadUrl(fileKey: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: s3Config.bucketName,
      Key: fileKey,
    });

    // 1-hour expiry is sufficient for background processing
    return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  },

  /**
   * Deletes a file from the R2 bucket.
   * Used during document deletion to free up storage.
   */
  async deleteFile(fileKey: string): Promise<any> {
    const command = new DeleteObjectCommand({
      Bucket: s3Config.bucketName,
      Key: fileKey,
    });

    return await s3Client.send(command);
  }
};