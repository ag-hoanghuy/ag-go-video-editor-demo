# AG Go Video Editor Demo

Nền tảng monorepo TypeScript cho bản demo trình chỉnh sửa video trực tuyến. Repository hiện chỉ
chứa phần khởi tạo dự án và kết nối kiểm tra trạng thái giữa frontend với backend.

**Phase hiện tại: Phase 1 — Project Bootstrap**

## Tech stack

- Node.js 22+
- pnpm workspace
- TypeScript
- Next.js với App Router
- NestJS
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

Tham khảo `.env.example` khi cần thay đổi cấu hình local. Đặt biến dành cho Next.js trong
`apps/web/.env.local` và cung cấp biến của API qua môi trường chạy. Các cổng local đã có giá trị mặc
định phù hợp nên có thể chạy dự án ngay sau khi cài đặt.

## Chạy local

```bash
pnpm dev
```

Các địa chỉ mặc định:

- Web: http://localhost:3000
- API: http://localhost:3001
- Health Check: http://localhost:3001/health

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

## Ngoài scope Phase 1

Phase này chưa bao gồm upload hoặc xem trước video, timeline, trimming, FFmpeg, rendering,
Cloudflare R2, database, Redis, queue, authentication, Docker hay hạ tầng deployment.

## Phase tiếp theo

**Phase 2 — Cloudflare R2 Integration**

Phase 2 chưa được triển khai trong repository này.
