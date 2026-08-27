/**
 * Chọn snapshot ứng với bố cục ĐANG CÓ của một ngày.
 *
 * Danh sách snapshot của một layout chứa cả bản bố trí trước cho ngày mai.
 * Lấy bừa bản mới nhất là nạp bố cục tương lai vào editor rồi lần lưu kế tiếp
 * ghi đè nó lên hôm nay — đúng lỗi "tự lưu đè layout ngày khác lên ngày hiện
 * tại", và bố cục hôm nay vừa lưu thì mở lại không thấy đâu.
 *
 * Quy tắc: bản của đúng ngày đó; không có thì bản gần nhất TRƯỚC ngày đó
 * (bố cục còn nguyên từ hôm trước); không có nữa thì null — ngày đó trắng.
 */
export function pickSnapshotForDate<T extends { date: string }>(
	snapshots: T[],
	date: string
): T | null {
	let best: T | null = null;
	let bestDate = '';
	for (const s of snapshots) {
		const d = s.date.slice(0, 10);
		if (d > date) continue; // snapshot của tương lai: chưa tới lượt
		if (!best || d > bestDate) {
			best = s;
			bestDate = d;
		}
	}
	return best;
}
