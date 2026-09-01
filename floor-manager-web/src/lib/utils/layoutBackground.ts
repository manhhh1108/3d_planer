/**
 * Phép căn ảnh nền của layout.
 *
 * Nền dựng từ DXF vốn khớp sẵn khung layout, nhưng ảnh scan/chụp thì không
 * mang tỉ lệ nên phải canh tay. Toàn bộ phép biến đổi gom về đây để canvas 2D,
 * viewer 3D và bản in dùng chung một cách tính — ba chỗ tự tính riêng thì sớm
 * muộn cũng lệch nhau.
 *
 * Quy ước: ảnh gốc phủ đúng ô [0,widthCm] × [0,heightCm]. Phép biến đổi áp
 * quanh TÂM ô đó: dịch, rồi xoay, rồi phóng.
 */
export interface LayoutBgTransform {
	offsetXCm: number;
	offsetYCm: number;
	scale: number;
	rotationDeg: number;
	opacity: number;
}

export const DEFAULT_LAYOUT_BG_TRANSFORM: LayoutBgTransform = {
	offsetXCm: 0,
	offsetYCm: 0,
	scale: 1,
	rotationDeg: 0,
	opacity: 0.5,
};

function finite(v: unknown, fallback: number): number {
	return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * Đọc giá trị từ server về dạng dùng được.
 *
 * Cột JSON có thể là null (layout cũ), là object thiếu field, hoặc chứa số rác
 * — mọi trường hợp đều phải ra một phép biến đổi vẽ được, không được ném lỗi
 * giữa vòng vẽ.
 */
export function normalizeLayoutBgTransform(raw: unknown): LayoutBgTransform {
	if (!raw || typeof raw !== 'object') return { ...DEFAULT_LAYOUT_BG_TRANSFORM };
	const o = raw as Record<string, unknown>;
	const d = DEFAULT_LAYOUT_BG_TRANSFORM;
	return {
		offsetXCm: finite(o.offsetXCm, d.offsetXCm),
		offsetYCm: finite(o.offsetYCm, d.offsetYCm),
		// Tỉ lệ 0 hoặc âm làm ảnh biến mất mà không báo gì — chặn ngay tại đây
		scale: Math.max(0.01, finite(o.scale, d.scale)),
		rotationDeg: finite(o.rotationDeg, d.rotationDeg),
		opacity: Math.min(1, Math.max(0, finite(o.opacity, d.opacity))),
	};
}

export function isDefaultLayoutBgTransform(t: LayoutBgTransform): boolean {
	const d = DEFAULT_LAYOUT_BG_TRANSFORM;
	return (
		t.offsetXCm === d.offsetXCm &&
		t.offsetYCm === d.offsetYCm &&
		t.scale === d.scale &&
		t.rotationDeg === d.rotationDeg &&
		t.opacity === d.opacity
	);
}

/** Tâm ảnh sau khi dịch, tính bằng cm trong hệ toạ độ bản vẽ */
export function layoutBgCenter(
	widthCm: number,
	heightCm: number,
	t: LayoutBgTransform
): { x: number; y: number } {
	return { x: widthCm / 2 + t.offsetXCm, y: heightCm / 2 + t.offsetYCm };
}

/**
 * Vẽ ảnh nền đã áp phép biến đổi.
 *
 * `unitScale` là số px ứng với 1cm của ngữ cảnh đang vẽ: canvas editor truyền
 * zoom (vì nó vẽ ở hệ px màn hình), còn bản in truyền 1 (nó đã scale ctx sẵn
 * về hệ cm). `centerPx` là tâm ảnh quy về toạ độ của ngữ cảnh đó.
 */
export function drawLayoutBgImage(
	ctx: CanvasRenderingContext2D,
	img: CanvasImageSource,
	widthCm: number,
	heightCm: number,
	t: LayoutBgTransform,
	centerPx: { x: number; y: number },
	unitScale: number
): void {
	const w = widthCm * unitScale * t.scale;
	const h = heightCm * unitScale * t.scale;
	ctx.save();
	ctx.globalAlpha = t.opacity;
	ctx.translate(centerPx.x, centerPx.y);
	if (t.rotationDeg) ctx.rotate((t.rotationDeg * Math.PI) / 180);
	ctx.drawImage(img, -w / 2, -h / 2, w, h);
	ctx.restore();
}

/**
 * Điểm (cm) có nằm trong ảnh nền không — đã tính cả xoay và phóng.
 *
 * Đưa điểm về hệ toạ độ riêng của ảnh rồi so với nửa cạnh, gọn hơn nhiều so
 * với xoay bốn góc rồi kiểm tra đa giác.
 */
export function hitLayoutBg(
	pointCm: { x: number; y: number },
	widthCm: number,
	heightCm: number,
	t: LayoutBgTransform
): boolean {
	if (widthCm <= 0 || heightCm <= 0) return false;
	const c = layoutBgCenter(widthCm, heightCm, t);
	const dx = pointCm.x - c.x;
	const dy = pointCm.y - c.y;
	const rad = (-t.rotationDeg * Math.PI) / 180;
	const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
	const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
	return (
		Math.abs(lx) <= (widthCm * t.scale) / 2 && Math.abs(ly) <= (heightCm * t.scale) / 2
	);
}

/** Khung bao (cm) của ảnh sau biến đổi — dùng để canh khung nhìn và nới khổ in */
export function layoutBgBounds(
	widthCm: number,
	heightCm: number,
	t: LayoutBgTransform
): { minX: number; minY: number; maxX: number; maxY: number } {
	const c = layoutBgCenter(widthCm, heightCm, t);
	const hw = (widthCm * t.scale) / 2;
	const hh = (heightCm * t.scale) / 2;
	const rad = (t.rotationDeg * Math.PI) / 180;
	// Nửa cạnh của khung bao thẳng trục sau khi xoay hình chữ nhật
	const cos = Math.abs(Math.cos(rad));
	const sin = Math.abs(Math.sin(rad));
	const ex = hw * cos + hh * sin;
	const ey = hw * sin + hh * cos;
	return { minX: c.x - ex, minY: c.y - ey, maxX: c.x + ex, maxY: c.y + ey };
}
