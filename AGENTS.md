# AGENTS.md

File này định nghĩa các quy tắc chung áp dụng cho toàn bộ quá trình phát triển `ag-go-video-editor-demo`.

Mọi Phase phải tuân thủ các quy tắc dưới đây. Prompt của từng Phase chỉ mô tả mục tiêu và yêu cầu đặc thù, không cần lặp lại các quy tắc trong file này.

## 1. Quy ước ngôn ngữ

Các định danh kỹ thuật phải viết bằng tiếng Anh, bao gồm:

- biến
- hàm
- class
- interface
- type
- enum
- tên file
- tên thư mục
- API path

Comment do developer viết phải sử dụng tiếng Việt.

Message và nội dung hiển thị cho người dùng do dự án tạo ra phải sử dụng tiếng Việt, trừ trường hợp đó là giá trị kỹ thuật hoặc protocol cần giữ nguyên.

Không thêm comment cho những đoạn code đã rõ ràng. Comment chỉ nên giải thích lý do hoặc quyết định kỹ thuật khi cần thiết.

## 2. Clean Code

Luôn ưu tiên code đơn giản, dễ đọc và dễ bảo trì.

Yêu cầu:

- hàm nhỏ và có trách nhiệm rõ ràng
- tuân thủ single responsibility
- sử dụng dependency injection hợp lý
- đặt tên rõ nghĩa
- tránh duplicate logic
- không sử dụng `any` trừ trường hợp thực sự không thể tránh và phải có lý do rõ ràng
- không để dead code
- không để unused import
- không để commented-out code
- không thêm comment thừa
- không tạo abstraction sớm
- không thêm dependency nếu không thực sự cần thiết
- controller phải mỏng, business logic đặt đúng layer
- giữ TypeScript type-safe tại các boundary quan trọng

Ưu tiên giải pháp đơn giản phù hợp với scope hiện tại thay vì thiết kế enterprise quá sớm.

## 3. Bảo mật

Không được:

- hardcode credential hoặc secret
- commit file `.env` thật
- đưa credential vào source code
- đưa credential vào test fixture
- đưa credential vào README
- đưa credential vào commit message
- log secret
- trả raw error có thể chứa credential cho client

`.env.example` chỉ chứa tên biến và giá trị mẫu an toàn.

Trước khi commit phải review:

```bash
git status
git diff
```

và kiểm tra chắc chắn không có secret, file tạm hoặc artifact không cần thiết được commit.

## 4. Git Workflow

Mỗi Phase tương ứng với đúng **một implementation commit**.

Không được:

- amend commit của Phase trước
- rewrite lịch sử Phase trước
- tạo nhiều implementation commit cho cùng một Phase
- tự ý bắt đầu Phase kế tiếp khi chưa được yêu cầu

Trước khi triển khai Phase mới phải đọc trạng thái hiện tại của repository và giữ nguyên những phần đã hoạt động tốt.

Commit message của từng Phase được quy định trong prompt của Phase đó.

## 5. Validation bắt buộc

Trước khi một Phase được coi là hoàn thành, phải chạy:

```bash
pnpm format
pnpm format:check
pnpm lint
pnpm typecheck
pnpm build
```

Nếu repository đã có test hoặc Phase đó bổ sung test thì phải chạy thêm:

```bash
pnpm test
```

Tất cả các validation liên quan phải PASS.

Không được báo một command PASS nếu command đó chưa thực sự được chạy.

Nếu validation phát hiện lỗi do thay đổi của Phase hiện tại, phải sửa trước khi commit.

## 6. Báo cáo cuối Phase

Sau khi hoàn thành mỗi Phase, báo cáo ngắn gọn:

1. Đã triển khai những gì
2. Cây thư mục/file chính được thêm hoặc thay đổi
3. Dependency mới được thêm, nếu có
4. Endpoint mới được thêm, nếu có
5. Các lệnh validation đã chạy và kết quả
6. Test/runtime verification đã thực hiện, nếu có
7. Git commit hash
8. Xác nhận repository không chứa secret
9. Xác nhận chưa triển khai Phase tiếp theo
10. Các giới hạn hoặc lưu ý quan trọng còn lại

Không cần mô tả lại toàn bộ kiến trúc nếu Phase đó không thay đổi kiến trúc.

## 7. Kế thừa kiến trúc

Trước khi sửa code:

- đọc code hiện tại
- đọc cấu trúc repository
- hiểu convention đã tồn tại
- kiểm tra Git status

Luôn giữ lại kiến trúc và convention từ các Phase trước nếu chúng vẫn phù hợp.

Không rewrite hoặc refactor phần cũ chỉ vì có thể viết theo cách khác.

Chỉ thay đổi code ngoài scope trực tiếp của Phase khi thực sự cần thiết để Phase đó hoạt động đúng.

Nếu thay đổi kiến trúc là bắt buộc, phải giữ thay đổi ở mức nhỏ nhất cần thiết.

## 8. Scope của Phase

Prompt của từng Phase là nguồn xác định scope cụ thể.

Không tự mở rộng chức năng ngoài yêu cầu.

Không tự triển khai trước chức năng thuộc Phase sau.

Nếu yêu cầu đặc thù của Phase thiếu thông tin quan trọng và không thể xác định an toàn từ code hiện tại, phải hỏi lại trước khi tự suy đoán.
