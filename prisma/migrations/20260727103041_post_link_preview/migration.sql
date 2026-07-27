-- Add OpenGraph link-preview payload to posts (JSON: url/title/description/image/siteName)
ALTER TABLE "Post" ADD COLUMN "linkPreview" JSONB;
