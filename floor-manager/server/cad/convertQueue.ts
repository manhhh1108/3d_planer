import { ConvertQueue } from './queue.js';
import { runConversion } from './convert.js';

/**
 * Hàng đợi convert dùng chung toàn tiến trình.
 *
 * Để riêng một module lá (không import route nào) nên cả `routes/assets.ts` lẫn
 * `cad/storeAsset.ts` đều dùng được mà không tạo vòng import.
 *
 * Giữ 2 job song song: convert STEP đọc trọn file vào bộ nhớ, tăng số này là
 * đánh đổi bằng RAM.
 */
export const convertQueue = new ConvertQueue(runConversion, 2);
