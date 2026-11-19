import { S3Client } from '@aws-sdk/client-s3';

let client: S3Client | null = null;

function requiredEnvironmentValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Supabase Storage is not configured. Set ${name}.`);
  return value;
}

export function getSupabaseS3() {
  const endpoint = requiredEnvironmentValue('SUPABASE_S3_ENDPOINT');
  const region = requiredEnvironmentValue('SUPABASE_S3_REGION');
  const accessKeyId = requiredEnvironmentValue('SUPABASE_S3_ACCESS_KEY_ID');
  const secretAccessKey = requiredEnvironmentValue('SUPABASE_S3_SECRET_ACCESS_KEY');
  const bucketName = requiredEnvironmentValue('SUPABASE_STORAGE_BUCKET');

  client ??= new S3Client({
    endpoint,
    region,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });

  return { client, bucketName };
}
