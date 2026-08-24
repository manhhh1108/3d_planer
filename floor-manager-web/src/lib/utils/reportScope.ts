/**
 * Chọn phạm vi cho trang báo cáo: mặt bằng nào, rồi layout nào trong đó.
 *
 * Tách khỏi component để kiểm chứng được các nhánh biên — không có mặt bằng
 * nào, mặt bằng chưa có layout, layout mồ côi.
 */

interface HasId {
	id: string;
}
interface HasSite {
	id: string;
	siteId: string;
}

/** Layout thuộc một mặt bằng, giữ nguyên thứ tự đầu vào */
export function layoutsOfSite<T extends HasSite>(layouts: T[], siteId: string): T[] {
	return layouts.filter((l) => l.siteId === siteId);
}

/**
 * Mặt bằng mở sẵn khi vào trang.
 *
 * Ưu tiên mặt bằng đầu tiên CÓ layout: mở vào một mặt bằng rỗng thì báo cáo
 * trống trơn và người dùng dễ tưởng hỏng. Không mặt bằng nào có layout thì lấy
 * cái đầu danh sách; không có mặt bằng nào thì trả chuỗi rỗng.
 */
export function pickDefaultSiteId<S extends HasId, L extends HasSite>(
	sites: S[],
	layouts: L[],
): string {
	const withLayout = sites.find((s) => layouts.some((l) => l.siteId === s.id));
	return withLayout?.id ?? sites[0]?.id ?? '';
}
