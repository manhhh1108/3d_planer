# Phase 3: Auth + Role + User Management — Design Spec

**Date:** 2026-08-14
**Goal:** Thêm hệ thống xác thực email/mật khẩu với 3 role (ADMIN, PLANNING, VIEWER) vào Floor Manager; admin tạo và quản lý tài khoản nội bộ.

---

## 1. Phạm vi

### Làm trong Phase 3
- Prisma User model + Role enum + migration
- Seed script tạo admin đầu tiên
- 4 auth routes (login / refresh / logout / me)
- 2 backend middleware (requireAuth, requireRole)
- Bảo vệ tất cả 8 route hiện có bằng role tương ứng
- SvelteKit `hooks.server.ts` guard toàn bộ frontend
- Trang `/login`
- Trang `/admin/users` (CRUD user cho admin)
- TopBar: hiển thị tên user + nút Đăng xuất

### Không làm trong Phase 3
- SSO / OAuth
- Realtime session invalidation (revoke token ngay lập tức)
- Email đặt lại mật khẩu (admin reset thay)
- 2FA

---

## 2. Data model

```prisma
enum Role {
  ADMIN
  PLANNING
  VIEWER
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  name         String
  role         Role     @default(VIEWER)
  passwordHash String
  active       Boolean  @default(true)
  createdAt    DateTime @default(now())
}
```

`Snapshot.createdBy` giữ nguyên kiểu `String` — backend ghi `req.user.email` khi tạo snapshot.

---

## 3. Seed script

File: `floor-manager/prisma/seed.ts`

- Đọc `SEED_ADMIN_EMAIL` và `SEED_ADMIN_PASSWORD` từ `.env`
- Nếu chưa có User nào trong DB → tạo 1 user ADMIN với thông tin trên
- Chạy: `npm run seed` (thêm vào `package.json`)
- Idempotent: chạy nhiều lần không tạo duplicate

---

## 4. Backend — Auth routes

File mới: `floor-manager/server/routes/auth.ts`

| Method | Route | Mô tả | Auth required |
|--------|-------|--------|--------------|
| POST | `/api/auth/login` | Validate email/password, set 2 cookie | Không |
| POST | `/api/auth/refresh` | Verify refresh cookie, issue access cookie mới | Không |
| POST | `/api/auth/logout` | Xóa cả 2 cookie | Không |
| GET | `/api/auth/me` | Trả `{ id, email, name, role }` | Có |

### Cookie config

| Cookie | Value | httpOnly | SameSite | Path | MaxAge |
|--------|-------|----------|----------|------|--------|
| `access_token` | JWT (id, email, role) | true | strict | `/` | 15 phút |
| `refresh_token` | JWT (id) | true | strict | `/api/auth/refresh` | 7 ngày |

JWT secret lưu trong env: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`.

### Login flow

```
POST /api/auth/login { email, password }
  → User.findUnique(email)
  → bcrypt.compare(password, passwordHash)
  → user.active === false → 403
  → issue access_token (15m) + refresh_token (7d)
  → set cookies
  → return { id, email, name, role }
```

### Refresh flow

```
POST /api/auth/refresh
  → đọc refresh_token cookie
  → verify JWT → lấy userId
  → User.findUnique(userId) → active check
  → issue access_token mới
  → set cookie
  → return { ok: true }
```

---

## 5. Backend — Middleware

File mới: `floor-manager/server/middleware/auth.ts`

### `requireAuth`

```typescript
// Gắn vào req.user, trả 401 nếu thiếu / hết hạn
export function requireAuth(req, res, next): void
```

- Đọc `access_token` từ `req.cookies`
- Verify JWT bằng `JWT_ACCESS_SECRET`
- Gắn `req.user: { id, email, role }` vào request
- 401 nếu không có hoặc verify thất bại

### `requireRole(...roles: Role[])`

```typescript
// Factory: trả 403 nếu req.user.role không thuộc danh sách
export function requireRole(...roles: Role[]): RequestHandler
```

---

## 6. Phân quyền trên routes hiện có

Áp dụng `requireAuth` cho **tất cả** 8 router. Thêm `requireRole` theo bảng:

| Route | Phương thức | Role tối thiểu |
|-------|-------------|----------------|
| `/api/sites`, `/api/layouts`, `/api/snapshots`, `/api/positions`, `/api/projects`, `/api/products`, `/api/assets`, `/api/reports`, `/api/files/list` | GET | VIEWER |
| `/api/sites`, `/api/layouts`, `/api/snapshots`, `/api/positions`, `/api/projects`, `/api/products`, `/api/assets`, `/api/files/upload` | POST, PATCH, PUT, DELETE | PLANNING |
| `/api/users` | GET, POST, PATCH, DELETE | ADMIN |

---

## 7. User management routes

File mới: `floor-manager/server/routes/users.ts` (ADMIN only)

| Method | Route | Mô tả |
|--------|-------|--------|
| GET | `/api/users` | Danh sách tất cả user |
| POST | `/api/users` | Tạo user mới (name, email, role, password) |
| PATCH | `/api/users/:id` | Cập nhật name, role, active |
| POST | `/api/users/:id/reset-password` | Admin đặt lại mật khẩu |

---

## 8. Frontend — Auth flow

File: `floor-manager-web/src/hooks.server.ts`

```
Mỗi request:
  1. Đọc access_token cookie
  2. Verify JWT
     a. Hợp lệ → event.locals.user = { id, email, name, role }; next()
     b. Hết hạn / thiếu → gọi POST /api/auth/refresh (server-side fetch)
        - OK → set access_token cookie mới, event.locals.user; next()
        - Thất bại → redirect(/login?redirect=<url>)
  3. Route /login: bỏ qua guard
```

---

## 9. Frontend — Pages

### `/login`

File: `floor-manager-web/src/routes/login/+page.svelte`

- Form: email + password + nút Đăng nhập
- Submit → POST `/api/auth/login`
- Thành công → redirect về `?redirect` hoặc `/`
- Lỗi → hiển thị thông báo "Email hoặc mật khẩu không đúng"

### `/admin/users`

File: `floor-manager-web/src/routes/admin/users/+page.svelte`

- Guard: `locals.user.role !== 'ADMIN'` → redirect `/`
- Bảng: STT, Tên, Email, Role (badge), Trạng thái (active/inactive), Thao tác
- Nút "Tạo user" → modal: name, email, role, password
- Nút "Sửa" → modal: name, role, active toggle
- Nút "Đặt lại mật khẩu" → modal: nhập mật khẩu mới

### TopBar (sửa file hiện có)

- Hiển thị `{user.name}` và badge role ở góc phải
- Nút "Đăng xuất" → POST `/api/auth/logout` → redirect `/login`

---

## 10. Dependencies cần thêm

```
floor-manager/:
  bcryptjs        (hash mật khẩu)
  jsonwebtoken    (tạo/verify JWT)
  cookie-parser   (đọc cookie trong Express)
  @types/bcryptjs
  @types/jsonwebtoken
  @types/cookie-parser
```

SvelteKit đã tích hợp sẵn cookie handling trong `hooks.server.ts` — không cần thêm dependency phía frontend.

---

## 11. Biến môi trường

Thêm vào `floor-manager/.env`:
```
JWT_ACCESS_SECRET=<random 64 chars>
JWT_REFRESH_SECRET=<random 64 chars>
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=<strong password>
```

---

## 12. Testing

Backend tests (vitest + supertest, DB: `floormanager_test`):
- Login thành công → cookie set
- Login sai mật khẩu → 401
- Login user inactive → 403
- Access token hết hạn → 401 trên protected route
- Refresh thành công → access token mới
- Refresh token hết hạn → 401
- VIEWER không POST → 403
- PLANNING không truy cập /api/users → 403
- ADMIN truy cập /api/users → 200

---

## 13. Tiêu chí hoàn thành

- `npm test` trong `floor-manager/`: tất cả test pass (bao gồm test mới)
- `npm run check` trong `floor-manager-web/`: 0 errors
- Chạy dev: không đăng nhập → redirect `/login`; đăng nhập VIEWER → mở editor được (read-only xem layout), nhưng POST `/api/snapshots` trả 403
- Seed script: `npm run seed` → tạo admin, chạy lần 2 → không duplicate
