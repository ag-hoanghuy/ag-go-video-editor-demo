# AG Go Video Editor Demo

Nền tảng monorepo TypeScript cho bản demo trình chỉnh sửa video trực tuyến. Người dùng có thể chọn
video MP4 trên web và upload trực tiếp từ browser lên Cloudflare R2 bằng presigned URL.

**Phase hiện tại: Phase 3 — Video Upload UI**

## Tech stack

- Node.js 22+
- pnpm workspace
- TypeScript
- Next.js với App Router
- NestJS
- Cloudflare R2 qua AWS SDK S3-compatible
- ESLint và Prettier

## Cấu trúc repository

```text
ag-go-video-editor-demo/
├── apps/
│   ├── api/                 # Backend NestJS
│   └── web/                 # Frontend Next.js
├── packages/
│   └── shared/              # Kiểu dữ liệu và contract dùng chung
├── .env.example
├── .gitignore
├── .prettierignore
├── .prettierrc
├── eslint.config.mjs
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```

## Yêu cầu môi trường

- Node.js 22 trở lên
- pnpm 12 trở lên

## Cài đặt

```bash
pnpm install
```

Sao chép `.env.example` thành `.env`, sau đó thay các giá trị mẫu R2 bằng thông tin từ Cloudflare.
Không commit file `.env` hoặc credential thật.

Các biến R2 bắt buộc:

| Biến                           | Mô tả                                    |
| ------------------------------ | ---------------------------------------- |
| `R2_ACCOUNT_ID`                | Cloudflare account ID gồm 32 ký tự hex   |
| `R2_ACCESS_KEY_ID`             | Access Key ID của R2 API token           |
| `R2_SECRET_ACCESS_KEY`         | Secret Access Key của R2 API token       |
| `R2_BUCKET`                    | Tên bucket lưu object                    |
| `R2_ENDPOINT`                  | S3 API endpoint của account              |
| `R2_PRESIGNED_URL_TTL_SECONDS` | Thời gian hiệu lực, từ 1 đến 604800 giây |

## Chạy local

```bash
pnpm dev
```

Các địa chỉ mặc định:

- Web: http://localhost:3000
- API: http://localhost:3001
- Health Check: http://localhost:3001/health
- Upload URL: `POST http://localhost:3001/api/assets/upload-url`

Ví dụ tạo presigned PUT URL:

```bash
curl -X POST http://localhost:3001/api/assets/upload-url \
  -H "Content-Type: application/json" \
  -d '{"filename":"demo.mp4","contentType":"video/mp4"}'
```

Khi upload trực tiếp bằng URL nhận được, request PUT phải gửi header `Content-Type: video/mp4`.

### CORS cho Cloudflare R2

Bucket R2 phải cho phép origin của frontend thực hiện `PUT` với header `Content-Type`. Cấu hình tối
thiểu cho local development:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Khi deploy, thay origin local bằng origin chính xác của frontend. Presigned URL hợp lệ vẫn bị browser
chặn nếu bucket chưa có CORS phù hợp.

## Các scripts

| Script              | Chức năng                                      |
| ------------------- | ---------------------------------------------- |
| `pnpm dev`          | Chạy đồng thời frontend và backend             |
| `pnpm build`        | Build tất cả workspace package có script build |
| `pnpm typecheck`    | Kiểm tra TypeScript trong toàn workspace       |
| `pnpm lint`         | Kiểm tra mã nguồn bằng ESLint                  |
| `pnpm format`       | Định dạng repository bằng Prettier             |
| `pnpm format:check` | Kiểm tra định dạng mà không thay đổi file      |

## Chức năng hiện tại

- Trang chủ Next.js hiển thị tên và mô tả dự án.
- Frontend gọi `GET /health` và hiển thị trạng thái API bằng tiếng Việt.
- Backend NestJS trả về `{ "status": "ok" }` từ `GET /health`.
- Package `@ag-go-video-editor/shared` cung cấp contract `HealthResponse` cho cả hai ứng dụng.
- CORS cho phép frontend local truy cập backend.
- Backend validate cấu hình R2 ngay khi khởi động.
- `POST /api/assets/upload-url` chỉ chấp nhận file `.mp4` với MIME `video/mp4`.
- Server tạo UUID, kiểm soát object key dưới `video-editor-demo/assets/` và trả presigned PUT URL.
- Storage layer hỗ trợ cả presigned PUT URL và presigned GET URL.
- Frontend validate extension `.mp4` và MIME `video/mp4` trước khi gọi API.
- Browser upload video trực tiếp lên R2 bằng `PUT`; binary không đi qua NestJS API.
- UI hiển thị tên file, dung lượng, trạng thái, phần trăm tiến trình và lỗi rõ ràng.
- Sau khi upload thành công, frontend giữ `assetId` và `objectKey` trong React state.

## Ngoài scope Phase 3

Phase này chưa bao gồm video preview hoặc playback, timeline, trimming, FFmpeg, rendering,
database, persistence cho asset, Redis, queue, worker, authentication, Docker hay hạ tầng
deployment.

## Phase tiếp theo

**Phase 4 — Chưa được triển khai**

Scope Phase 4 sẽ được xác định trong yêu cầu riêng.
