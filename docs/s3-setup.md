# S3 Bucket Setup for Media Uploads

The platform stores user/admin uploads (task thumbnails, avatars, banners, marketplace images) on **AWS S3** and optionally serves them through CloudFront. Two upload paths exist:

| Path | When used | Requires bucket CORS? |
|---|---|---|
| **Direct (server-side)** via `POST /api/media/upload` | Files **≤ 4 MB** | No — server streams the file straight to S3 |
| **Multipart (browser → S3 directly)** via presigned URLs | Files **> 4 MB** | **Yes** — browser uploads parts directly to S3 |

The 4 MB threshold is set in [src/lib/s3-multipart-upload.ts](../src/lib/s3-multipart-upload.ts) (`MULTIPART_THRESHOLD`). It's intentionally just under the Vercel serverless 4.5 MB body-size cap.

## Symptom: thumbnail upload fails with "Failed to fetch"

This happens when:

1. **The file is larger than 4 MB and the bucket's CORS policy is missing or doesn't expose the `ETag` header.** The browser then rejects the multipart upload because the JS client cannot read the per-part ETag it needs to call `complete`.
2. The S3 region/bucket name in `.env` is wrong (less common — usually surfaces as 403/404 instead).
3. Network proxies/VPN block direct PUT to `s3.<region>.amazonaws.com`.

## Required `.env` keys

```bash
AWS_REGION="ap-southeast-1"
AWS_S3_BUCKET_NAME="revtype"
AWS_ACCESS_KEY_ID="…"
AWS_SECRET_ACCESS_KEY="…"
AWS_CLOUDFRONT_DOMAIN="dxxxxxx.cloudfront.net"   # optional
```

## Required S3 bucket CORS policy

Go to **S3 → your bucket → Permissions → Cross-origin resource sharing (CORS)** and apply:

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://your-production-domain.com"
    ],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3000
  }
]
```

Replace `your-production-domain.com` with the public origin you serve the app from. The key line is **`"ExposeHeaders": ["ETag"]`** — without it, multipart upload from the browser breaks.

## Required IAM permissions

The IAM user behind `AWS_ACCESS_KEY_ID` needs (at minimum):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:AbortMultipartUpload",
        "s3:ListMultipartUploadParts"
      ],
      "Resource": "arn:aws:s3:::revtype/*"
    },
    {
      "Effect": "Allow",
      "Action": ["s3:ListBucket", "s3:ListBucketMultipartUploads"],
      "Resource": "arn:aws:s3:::revtype"
    }
  ]
}
```

## Quick verification

1. As an admin, open **Admin → Tasks → Create Task**.
2. Upload a small (< 4 MB) image as the thumbnail — should succeed via direct upload regardless of CORS.
3. Upload a large (> 4 MB) image — succeeds only if the CORS policy above is applied.
4. Check the browser DevTools network tab — for the > 4 MB case you should see PUTs to `*.s3.*.amazonaws.com` with `ETag` exposed in the response headers.
