# AG Go Video Editor Demo

Nền tảng monorepo TypeScript cho bản demo trình chỉnh sửa video trực tuyến. Người dùng có thể upload,
preview, chọn vùng trim, export bằng FFmpeg và xem hoặc tải output trực tiếp từ Cloudinary. Hai
ứng dụng có production image riêng và có thể chạy cùng nhau bằng Docker Compose.

**Phase hiện tại: Phase 9 — Cloudinary Storage Migration**

## Tech stack

- Node.js 22+
- pnpm workspace
- TypeScript
- Next.js với App Router
- NestJS
- Cloudinary qua official Node SDK
- Docker và Docker Compose
- ESLint và Prettier

## Cấu trúc repository

```text
ag-go-video-editor-demo/
├── apps/
│   ├── api/                 # Backend NestJS
│   │   └── Dockerfile       # Production image API + FFmpeg
│   └── web/                 # Frontend Next.js
│       └── Dockerfile       # Production image Next.js standalone
├── packages/
│   └── shared/              # Kiểu dữ liệu và contract dùng chung
├── .dockerignore
├── .env.example
├── .gitignore
├── .prettierignore
├── .prettierrc
├── eslint.config.mjs
├── docker-compose.yml
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── README.md
```

## Yêu cầu môi trường

### Chạy bằng Docker

- Docker Engine hoặc Docker Desktop
- Docker Compose v2 (`docker compose`)

Không cần cài Node.js, pnpm, FFmpeg hoặc ffprobe trực tiếp trên host khi dùng Docker.

### Chạy trực tiếp trên host

- Node.js 22 trở lên
- pnpm 12 trở lên
- `ffmpeg` và `ffprobe` khả dụng trong `PATH`

Kiểm tra FFmpeg runtime:

```bash
ffmpeg -version
ffprobe -version
```

FFmpeg build phải hỗ trợ encoder H.264 `libx264` và AAC.

## Cấu hình environment

Sao chép `.env.example` thành `.env`, sau đó điền thông tin Cloudinary cho API runtime.
Không commit file `.env` hoặc credential thật.

| Biến                    | Phạm vi            | Mô tả                                                |
| ----------------------- | ------------------ | ---------------------------------------------------- |
| `NEXT_PUBLIC_API_URL`   | Web build          | URL API công khai mà browser truy cập                |
| `WEB_PORT`              | Docker Compose     | Port host publish cho web, mặc định `3000`           |
| `PORT`                  | API chạy trực tiếp | Port API khi chạy ngoài Docker, mặc định `3001`      |
| `API_PORT`              | Docker Compose     | Port host publish cho API, mặc định `3001`           |
| `WEB_URL`               | API runtime        | Origin frontend chính xác được API cho phép qua CORS |
| `CLOUDINARY_CLOUD_NAME` | API runtime        | Cloud name của Cloudinary                            |
| `CLOUDINARY_API_KEY`    | API runtime        | API key dùng để ký upload                            |
| `CLOUDINARY_API_SECRET` | API runtime        | API secret, chỉ tồn tại trong backend/runtime        |

`NEXT_PUBLIC_API_URL` được nhúng vào JavaScript client trong lúc `next build`. Giá trị này phải là URL
công khai nhìn thấy từ browser, ví dụ `https://api.example.com`; không dùng hostname nội bộ Docker
`http://api:3001`. Khi đổi biến này phải build lại web image.

Trong production, `WEB_URL` phải là origin chính xác của frontend, ví dụ
`https://editor.example.com`, để API trả CORS header phù hợp.

## Cài đặt local

```bash
pnpm install
```

## Chạy local

```bash
pnpm dev
```

Các địa chỉ mặc định:

- Web: http://localhost:3000
- API: http://localhost:3001
- Health Check: http://localhost:3001/health
- Upload signature: `POST http://localhost:3001/api/assets/upload-signature`
- Playback URL: `GET http://localhost:3001/api/assets/{assetId}/playback-url`
- Render video: `POST http://localhost:3001/api/renders`
- Render output URL: `GET http://localhost:3001/api/renders/{renderId}/playback-url`

Ví dụ xin signed upload parameters:

```bash
curl -X POST http://localhost:3001/api/assets/upload-signature \
  -H "Content-Type: application/json" \
  -d '{"filename":"demo.mp4","contentType":"video/mp4"}'
```

API tạo UUID v4 và `public_id` server-side theo convention
`video-editor-demo/assets/{assetId}/original`; client không thể truyền `public_id` tùy ý. Browser gửi
file cùng `api_key`, `timestamp`, `signature` và `public_id` dưới dạng `multipart/form-data` trực tiếp
tới Cloudinary. API secret không được gửi tới browser.

Ví dụ lấy URL CDN để preview:

```bash
curl http://localhost:3001/api/assets/00000000-0000-4000-8000-000000000000/playback-url
```

Backend chỉ nhận UUID và tự derive public ID trước khi tạo secure delivery URL. Playback URL của
Cloudinary không phải URL ký có expiry.

Ví dụ render đoạn từ giây 5 đến giây 12:

```bash
curl -X POST http://localhost:3001/api/renders \
  -H "Content-Type: application/json" \
  -d '{"assetId":"00000000-0000-4000-8000-000000000000","trim":{"start":5,"end":12}}'
```

Render chạy đồng bộ theo luồng:

```text
download source dạng HTTPS stream từ Cloudinary xuống file tạm
→ ffprobe và validate duration
→ FFmpeg cắt/re-encode MP4
→ upload output lên Cloudinary với `resource_type=video`
→ trả response completed
```

Output được lưu tại `video-editor-demo/renders/{renderId}/output`. API không nhận source hoặc output
public ID từ client.

Ví dụ lấy URL CDN cho output đã render:

```bash
curl http://localhost:3001/api/renders/00000000-0000-4000-8000-000000000000/playback-url
```

Backend validate `renderId` là UUID v4, tự derive output public ID và trả secure delivery URL. Frontend
dùng URL này để preview hoặc tải video trực tiếp từ Cloudinary; binary output không đi qua NestJS API.

Luồng end-to-end hiện tại:

```text
upload source
→ preview
→ chọn trim
→ export
→ backend FFmpeg render
→ output lên Cloudinary
→ preview/download output
```

## Chạy production bằng Docker Compose

Điền `.env` bằng Cloudinary credentials và URL public phù hợp, sau đó build hai image:

```bash
docker compose build
```

Khởi động production containers:

```bash
docker compose up -d
docker compose ps
```

Compose publish web ở `WEB_PORT` và API ở `API_PORT`. Với cấu hình mặc định:

- Web: http://localhost:3000
- API health: http://localhost:3001/health

Service `web` chỉ khởi động sau khi healthcheck `GET /health` của `api` thành công. Kiểm tra nhanh:

```bash
curl http://localhost:3001/health
curl http://localhost:3000
```

Theo dõi log và dừng stack:

```bash
docker compose logs -f web api
docker compose down
```

Web image chạy Next.js standalone production server. API image chạy `node dist/main.js`, cài FFmpeg
ở runtime và không dùng watch mode. Source/build dependencies không được copy vào runtime stages.

Thư mục tạm của render nằm tại `/tmp/video-editor` bên trong API container, không bind mount ra host.
Logic `finally` hiện tại tiếp tục cleanup file và thư mục tạm sau mỗi request.

### Build image riêng

```bash
docker build \
  --file apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
  --tag ag-go-video-editor-demo-web .

docker build \
  --file apps/api/Dockerfile \
  --tag ag-go-video-editor-demo-api .
```

### Kiểm tra FFmpeg trong API container

```bash
docker compose exec api ffmpeg -version
docker compose exec api ffprobe -version
docker compose exec api sh -lc "ffmpeg -hide_banner -encoders 2>/dev/null | grep -E 'libx264|aac'"
```

Kết quả encoder phải có `libx264` và `aac`.

### Smoke test sau deploy

1. Chạy `docker compose build` và `docker compose up -d`.
2. Xác nhận `GET /health` trả `{ "status": "ok" }`.
3. Mở frontend bằng URL public đã cấu hình.
4. Chọn một file MP4 thật và upload source trực tiếp lên Cloudinary.
5. Xác nhận preview source có thể play, pause và seek.
6. Chọn vùng trim rồi bấm Export.
7. Xác nhận API dùng FFmpeg render và upload output lên Cloudinary.
8. Phát thử output và tải file bằng nút `Tải video`.

Smoke test cần Cloudinary credentials hợp lệ và một file MP4 thật. Không dùng `http://api:3001` ở
bất kỳ cấu hình browser-facing nào. Không cần cấu hình bucket CORS riêng.

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
- Backend NestJS trả về `{ "status": "ok" }` từ `GET /health`.
- Package `@ag-go-video-editor/shared` cung cấp contract dùng chung cho frontend và backend.
- CORS cho phép frontend local truy cập backend.
- Backend validate Cloudinary config ngay khi khởi động; API secret chỉ tồn tại ở backend/runtime.
- `POST /api/assets/upload-signature` chỉ chấp nhận file `.mp4` với MIME `video/mp4`.
- Server tạo UUID v4, derive public ID dưới `video-editor-demo/assets/` và ký tham số upload.
- Storage layer tạo signed upload, secure delivery URL, download stream và upload file render.
- Frontend validate extension `.mp4` và MIME `video/mp4` trước khi gọi API.
- Browser upload video trực tiếp lên Cloudinary bằng signed `multipart/form-data`; binary không đi qua NestJS API.
- UI hiển thị tên file, dung lượng, trạng thái, phần trăm tiến trình và lỗi rõ ràng.
- Sau khi upload thành công, frontend chỉ giữ `assetId` trong React state.
- `GET /api/assets/:assetId/playback-url` validate UUID, tự derive public ID và trả secure delivery URL.
- Frontend dùng playback URL từ API để phát video trực tiếp bằng HTML5 `<video>` với controls.
- Preview hỗ trợ play, pause, seek, hiển thị duration và trạng thái lỗi bằng tiếng Việt.
- Chọn hoặc upload video mới sẽ reset preview trước đó; playback URL không được lưu lâu dài.
- Timeline hiển thị tổng thời lượng, vị trí phát hiện tại, vùng trim và hai handle `start` / `end`.
- Timeline và video đồng bộ hai chiều; thay đổi `start` sẽ seek video tới mốc mới.
- Edit state được giữ trên frontend dưới dạng `{ assetId, trim: { start, end } }` và luôn đảm bảo
  `0 <= start < end <= duration`.
- Người dùng có thể phát riêng đoạn đã chọn hoặc đặt lại vùng chọn về toàn bộ video.
- Upload video mới sẽ reset vùng trim về `start = 0` và `end = duration` sau khi metadata load xong.
- `POST /api/renders` nhận `assetId` cùng `trim`, validate dữ liệu và tự derive source/output public ID.
- Backend tải source từ Cloudinary bằng HTTPS stream xuống file tạm, dùng `ffprobe` xác nhận khoảng trim không vượt duration.
- FFmpeg re-encode đoạn đã chọn sang H.264/AAC MP4 với `yuv420p` và `faststart` để tương thích browser.
- Output được upload lên Cloudinary với `resource_type=video`; file/thư mục tạm luôn được cleanup.
- Render synchronous và trả `{ renderId, status: "completed" }` sau khi upload hoàn tất.
- Frontend gửi trực tiếp edit state hiện tại tới `POST /api/renders` khi người dùng chọn Export.
- Trong khi backend render đồng bộ, nút Export bị disable và UI chỉ hiển thị trạng thái, không giả lập
  phần trăm tiến trình.
- `GET /api/renders/:renderId/playback-url` validate UUID, tự derive output public ID và trả secure delivery URL.
- Video output có thể được preview bằng HTML5 `<video controls>` hoặc tải xuống trực tiếp từ Cloudinary.
- Khi trim thay đổi, output cũ được đánh dấu không còn đại diện cho vùng chọn hiện tại và yêu cầu export
  lại; upload source mới sẽ reset toàn bộ export state.
- Frontend phân biệt lỗi render, lỗi lấy playback URL và lỗi phát video output.
- Web và API có multi-stage production Dockerfile riêng; web chạy Next.js standalone, API chạy NestJS
  build với production dependencies.
- API image cung cấp `ffmpeg`, `ffprobe`, encoder `libx264` và AAC.
- Docker Compose truyền Cloudinary credentials cho API runtime, publish đúng hai port và dùng healthcheck API để điều
  phối thứ tự khởi động.
- `NEXT_PUBLIC_API_URL` được truyền vào web build dưới dạng URL public; `WEB_URL` cấu hình CORS API ở
  runtime.

## Ngoài scope Phase 9

Phase này chưa có queue, worker, render progress realtime, database, render history, danh sách export,
background retry, authentication, multi-clip, concat, transition, text overlay hoặc audio editing.
Không có cấu hình dành riêng cho một cloud/container provider cụ thể.

## Phase tiếp theo

**Phase 10 — Chưa được triển khai**

Scope Phase 10 sẽ được xác định trong yêu cầu riêng.
