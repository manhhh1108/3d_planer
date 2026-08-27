import type { BackgroundImage, Point } from '$lib/models/types';

/**
 * Điểm world có nằm trong ảnh nền không.
 *
 * Dùng đúng phép biến đổi của drawBackgroundImage(): ảnh vẽ quanh tâm
 * bg.position, bề rộng world = imgWidth * scale, xoay bg.rotation độ. Ở đây
 * quay NGƯỢC lại để so với hình chữ nhật chưa xoay.
 *
 * Ảnh đã khoá thì không tính là trúng — khoá là để kéo bản vẽ mà không sợ
 * xê dịch ảnh.
 */
export function hitTestBackgroundImage(
	wp: Point,
	bg: BackgroundImage,
	imgWidth: number,
	imgHeight: number
): boolean {
	if (bg.locked) return false;
	const dx = wp.x - bg.position.x;
	const dy = wp.y - bg.position.y;
	const a = (-bg.rotation * Math.PI) / 180;
	const lx = dx * Math.cos(a) - dy * Math.sin(a);
	const ly = dx * Math.sin(a) + dy * Math.cos(a);
	return Math.abs(lx) <= (imgWidth * bg.scale) / 2 && Math.abs(ly) <= (imgHeight * bg.scale) / 2;
}
