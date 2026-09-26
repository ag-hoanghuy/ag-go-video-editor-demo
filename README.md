# AG Go Video Editor Demo

Nền tảng monorepo TypeScript cho bản demo trình chỉnh sửa video trực tuyến. Backend có thể nhận edit
instruction, tải source từ Cloudflare R2 và render một video MP4 đã cắt bằng FFmpeg.

**Phase hiện tại: Phase 6 — FFmpeg Video Rendering**

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
- `ffmpeg` và `ffprobe` khả dụng trong `PATH`

Kiểm tra FFmpeg runtime:

```bash
ffmpeg -version
ffprobe -version
```

FFmpeg build phải hỗ trợ encoder H.264 `libx264` và AAC.

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
- Playback URL: `GET http://localhost:3001/api/assets/{assetId}/playback-url`
- Render video: `POST http://localhost:3001/api/renders`

Ví dụ tạo presigned PUT URL:

```bash
curl -X POST http://localhost:3001/api/assets/upload-url \
  -H "Content-Type: application/json" \
  -d '{"filename":"demo.mp4","contentType":"video/mp4"}'
```

Khi upload trực tiếp bằng URL nhận được, request PUT phải gửi header `Content-Type: video/mp4`.

Ví dụ tạo presigned GET URL để preview:

```bash
curl http://localhost:3001/api/assets/00000000-0000-4000-8000-000000000000/playback-url
```

Backend chỉ nhận UUID và tự derive object key theo convention
`video-editor-demo/assets/{assetId}/original.mp4`; client không thể cung cấp object key tùy ý.

Ví dụ render đoạn từ giây 5 đến giây 12:

```bash
curl -X POST http://localhost:3001/api/renders \
  -H "Content-Type: application/json" \
  -d '{"assetId":"00000000-0000-4000-8000-000000000000","trim":{"start":5,"end":12}}'
```

Render chạy đồng bộ theo luồng:

```text
download source từ R2
→ ffprobe và validate duration
→ FFmpeg cắt/re-encode MP4
→ upload output lên R2
→ trả response completed
```

Output được lưu tại `video-editor-demo/renders/{renderId}/output.mp4`. API không nhận source hoặc
output object key từ client và chưa tạo playback/download URL cho output.

### CORS cho Cloudflare R2

Bucket R2 phải cho phép origin của frontend thực hiện `PUT` để upload và `GET` để phát video trực
tiếp. Cấu hình local development hỗ trợ cả `Content-Type` và range request khi seek:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000"],
    "AllowedMethods": ["GET", "PUT"],
    "AllowedHeaders": ["Content-Type", "Range"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
    "MaxAgeSeconds": 3600
  }
]
```

Khi deploy, thay origin local bằng origin chính xác của frontend. Presigned URL hợp lệ vẫn bị browser
chặn nếu bucket chưa có CORS phù hợp. Xem hướng dẫn
[Configure CORS](https://developers.cloudflare.com/r2/buckets/cors/) của Cloudflare R2.

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
- `GET /api/assets/:assetId/playback-url` validate UUID, tự derive object key và trả presigned GET URL.
- Frontend dùng URL tạm thời để phát video trực tiếp từ R2 bằng HTML5 `<video>` với controls.
- Preview hỗ trợ play, pause, seek, hiển thị duration và trạng thái lỗi bằng tiếng Việt.
- Chọn hoặc upload video mới sẽ reset preview trước đó; playback URL không được lưu lâu dài.
- Timeline hiển thị tổng thời lượng, vị trí phát hiện tại, vùng trim và hai handle `start` / `end`.
- Timeline và video đồng bộ hai chiều; thay đổi `start` sẽ seek video tới mốc mới.
- Edit state được giữ trên frontend dưới dạng `{ assetId, trim: { start, end } }` và luôn đảm bảo
  `0 <= start < end <= duration`.
- Người dùng có thể phát riêng đoạn đã chọn hoặc đặt lại vùng chọn về toàn bộ video.
- Upload video mới sẽ reset vùng trim về `start = 0` và `end = duration` sau khi metadata load xong.
- `POST /api/renders` nhận `assetId` cùng `trim`, validate dữ liệu và tự derive source/output key.
- Backend stream source từ R2 xuống file tạm, dùng `ffprobe` xác nhận khoảng trim không vượt duration.
- FFmpeg re-encode đoạn đã chọn sang H.264/AAC MP4 với `yuv420p` và `faststart` để tương thích browser.
- Output được stream lên R2 với `Content-Type: video/mp4`; file/thư mục tạm luôn được cleanup.
- Render synchronous và trả `{ renderId, status: "completed", outputKey }` sau khi upload hoàn tất.

## Ngoài scope Phase 6

Phase này chưa có nút Export trên frontend, playback/download URL cho output, queue, worker,
database, render persistence, progress API, multi-clip, concat, transition, text overlay hoặc audio
editing.

## Phase tiếp theo

**Phase 7 — Chưa được triển khai**

Scope Phase 7 sẽ được xác định trong yêu cầu riêng.
