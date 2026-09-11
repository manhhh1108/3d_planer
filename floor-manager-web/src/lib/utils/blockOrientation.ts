/**
 * Đặt block lên đúng mặt tiếp sàn trong 3D.
 *
 * Mesh được dựng theo kích thước GỐC (lúc nằm đáy) rồi xoay 90°, chứ không kéo
 * giãn theo kích thước đã hoán vị — kéo giãn làm khối CAD dài 4m bị bóp méo
 * thành khối cao 4m thay vì được dựng đứng lên.
 *
 * Quy ước trục: width=X, height=Y, depth=Z. Hình hộp có 6 mặt tiếp sàn:
 *  - bottom/top: đáy / lật úp (quay 180° quanh X)
 *  - side / side2 (hai mặt bên): depth gốc thành chiều cao -> xoay ±90° quanh X
 *  - end  / end2  (hai mặt đầu): width gốc thành chiều cao -> xoay ±90° quanh Z
 */
import * as THREE from 'three';
import { poseQuaternion } from './restPose';

/**
 * @param model Nhóm chứa mesh của block. Có thể đã được gắn vào scene rồi —
 *   hàm này tự tháo ra để đo, xem bên dưới.
 * @param rollRad Phép lăn Úp/Ngửa quanh trục đứng cũ (xem restPose.ts). 0 = chỉ lật 90°.
 */
export function applyOrientation(model: THREE.Object3D, orientation: string | undefined, rollRad = 0): void {
	model.position.set(0, 0, 0);
	// Lật + lăn là MỘT phép xoay cứng ghép lại, áp sau khi mesh đã dựng theo kích
	// thước gốc — nên không kéo giãn gì, không lặp lại lỗi méo khối của lần nắn
	// hướng ở client trước đây. Góc lăn 0 thì trùng khít phép lật 90° cũ.
	model.quaternion.copy(poseQuaternion(orientation, rollRad));

	// Box3.setFromObject đo trong TOẠ ĐỘ THẾ GIỚI. Hàm này còn được gọi lại lúc
	// GLB nạp xong, khi model đã nằm trong group đặt tại vị trí block — lúc đó
	// tâm đo được là toạ độ thế giới (ví dụ x = 9500cm), đem trừ vào position
	// cục bộ sẽ giật block về gần gốc toạ độ. Tháo khỏi cha để đo trong chính
	// hệ toạ độ của nó, đo xong gắn lại.
	const parent = model.parent;
	const index = parent ? parent.children.indexOf(model) : -1;
	if (parent) parent.remove(model);

	model.updateMatrixWorld(true);
	// Mặc định three.js đo bằng cách xoay 8 GÓC hộp bao cục bộ, không đi từng đỉnh.
	// Lật đúng 90° thì kết quả vẫn khít, nhưng lăn một góc lẻ thì hộp phình ra: đáy
	// hộp thấp hơn đáy thật nên khối bị kéo LƠ LỬNG khỏi sàn (đo được 3,6 m với
	// khối ST4), tâm cũng lệch khỏi khuôn 2D. Đo từng đỉnh thì khít — nhưng tốn với
	// GLB nhiều đỉnh, nên chỉ dùng khi có lăn; khối lật 90° thuần giữ cách cũ.
	const box = new THREE.Box3().setFromObject(model, rollRad !== 0);

	if (!box.isEmpty()) {
		// Xoay quanh gốc làm block lệch khỏi tâm và chìm dưới sàn — kéo lại cho
		// footprint đúng tâm và đáy chạm y = 0.
		const center = new THREE.Vector3();
		box.getCenter(center);
		model.position.x -= center.x;
		model.position.z -= center.z;
		model.position.y -= box.min.y;
	}

	if (parent) {
		// Trả về đúng chỗ cũ để thứ tự vẽ không đổi
		if (index >= 0) parent.children.splice(index, 0, model);
		else parent.children.push(model);
		model.parent = parent;
		model.updateMatrixWorld(true);
	}
}
