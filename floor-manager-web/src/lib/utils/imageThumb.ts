/**
 * Thu nhỏ ảnh ở phía client trước khi upload.
 *
 * Ảnh chụp 5MB dùng làm icon 40px trong sidebar là phí băng thông của mọi
 * người mở editor, nên vẽ lại qua canvas về cạnh dài tối đa MAX_EDGE.
 */
const MAX_EDGE = 256;
const JPEG_QUALITY = 0.85;

/** Backend chỉ nhận .png và .jpg (xem server/routes/files.ts) */
export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg'];
export const ACCEPTED_IMAGE_EXT = '.png,.jpg,.jpeg';

function loadImage(file: File): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(file);
		const img = new Image();
		img.onload = () => {
			URL.revokeObjectURL(url);
			resolve(img);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('Không đọc được ảnh'));
		};
		img.src = url;
	});
}

/**
 * Trả về File đã thu nhỏ. Giữ PNG là PNG để không mất nền trong suốt, còn lại
 * xuất JPEG cho nhẹ. Ảnh vốn đã nhỏ hơn MAX_EDGE thì trả nguyên file gốc —
 * encode lại chỉ giảm chất lượng chứ không tiết kiệm thêm.
 */
export async function shrinkImage(file: File): Promise<File> {
	const img = await loadImage(file);
	const longest = Math.max(img.naturalWidth, img.naturalHeight);
	if (longest <= MAX_EDGE) return file;

	const scale = MAX_EDGE / longest;
	const w = Math.max(1, Math.round(img.naturalWidth * scale));
	const h = Math.max(1, Math.round(img.naturalHeight * scale));

	const canvas = document.createElement('canvas');
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext('2d');
	if (!ctx) return file; // không có 2d context thì gửi nguyên bản còn hơn hỏng

	const keepAlpha = file.type === 'image/png';
	if (!keepAlpha) {
		// JPEG không có kênh alpha — nền trong suốt sẽ ra đen nếu không tô trắng
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, w, h);
	}
	ctx.drawImage(img, 0, 0, w, h);

	const mime = keepAlpha ? 'image/png' : 'image/jpeg';
	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, mime, keepAlpha ? undefined : JPEG_QUALITY)
	);
	if (!blob) return file;

	const base = file.name.replace(/\.[^.]+$/, '') || 'thumb';
	return new File([blob], `${base}${keepAlpha ? '.png' : '.jpg'}`, { type: mime });
}
