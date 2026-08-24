/**
 * Khi nào thì canh lại khung camera 3D.
 *
 * Cảnh 3D được dựng lại sau MỌI thay đổi dữ liệu. Nếu lần dựng nào cũng canh
 * khung thì đặt thêm một block là view bị thu nhỏ về mặc định, người dùng phải
 * zoom lại từ đầu. Ngược lại, không canh bao giờ thì block đầu tiên của một mặt
 * bằng trống có thể rơi ngoài tầm nhìn.
 *
 * Tách khỏi component để kiểm chứng được cả một chuỗi thao tác.
 */

export interface CameraFitState {
	/** Mặt bằng đã canh khung gần nhất */
	floorId: string | null;
	/** Lần dựng trước có gì trong cảnh không */
	hadContent: boolean;
}

export const initialCameraFitState: CameraFitState = { floorId: null, hadContent: false };

export interface CameraFitDecision {
	fit: boolean;
	next: CameraFitState;
}

/**
 * Chỉ canh khung khi đổi sang mặt bằng khác, hoặc khi mặt bằng vừa từ trống
 * thành có đồ. Thêm/di chuyển/sửa block trên mặt bằng đang mở thì giữ nguyên
 * góc nhìn.
 */
export function decideCameraFit(
	state: CameraFitState,
	floorId: string,
	hasContent: boolean,
): CameraFitDecision {
	const switchedFloor = state.floorId !== floorId;
	const firstContent = hasContent && !state.hadContent;
	const fit = switchedFloor || firstContent;
	return {
		fit,
		next: {
			floorId: fit ? floorId : state.floorId,
			hadContent: hasContent,
		},
	};
}
