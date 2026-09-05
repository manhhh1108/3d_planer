/**
 * Tạo database riêng cho E2E nếu chưa có.
 *
 * E2E không dùng chung DB với `npm test` (bộ test đó TRUNCATE trước mỗi case)
 * cũng không dùng DB dev (sẽ xoá mất dữ liệu người dùng đang làm dở).
 */
import { Client } from 'pg';

const name = process.env.E2E_DB_NAME ?? 'floormanager_e2e';
const admin = process.env.E2E_ADMIN_DB_URL
  ?? 'postgresql://floormanager:floormanager123@localhost:5432/postgres';

const client = new Client({ connectionString: admin });
await client.connect();
const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
if (rowCount === 0) {
  // Không tham số hoá được tên database -> chặn ký tự lạ thay vì nối chuỗi mù.
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Tên database không hợp lệ: ${name}`);
  await client.query(`CREATE DATABASE "${name}"`);
  console.log(`Đã tạo database ${name}`);
} else {
  console.log(`Database ${name} đã có`);
}
await client.end();
