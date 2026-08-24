/**
 * Dựng tường trong 3D.
 *
 * Tách khỏi ThreeViewer để kiểm chứng được bằng script: chỉ cần Box3/BoxGeometry
 * nên chạy được không cần WebGL.
 */
import * as THREE from 'three';
import type { Wall } from '$lib/models/types';

const DEFAULT_COLOR = '#4b5563';
/** Số đoạn ghép cho tường cong — khớp với bản 2D để hai bên nhìn giống nhau */
const CURVE_SEGMENTS = 24;

/**
 * Một bức tường thành khối 3D.
 *
 * Toạ độ mặt bằng (x, y) ánh xạ sang (x, z) trong 3D; y trong 3D là chiều cao.
 * Tường thẳng là một hộp; tường cong ghép từ nhiều hộp bám theo bezier.
 */
export function buildWallMesh(w: Wall): THREE.Group {
	const group = new THREE.Group();
	const material = new THREE.MeshStandardMaterial({
		color: new THREE.Color(w.color || DEFAULT_COLOR),
		roughness: 0.9,
		metalness: 0.05,
	});

	const addSegment = (x1: number, z1: number, x2: number, z2: number) => {
		const len = Math.hypot(x2 - x1, z2 - z1);
		if (len < 0.01) return;
		const box = new THREE.Mesh(new THREE.BoxGeometry(len, w.height, w.thickness), material);
		box.position.set((x1 + x2) / 2, w.height / 2, (z1 + z2) / 2);
		// Trục X của hộp phải chạy dọc đoạn tường. Quay quanh Y một góc θ đưa
		// (1,0,0) về (cosθ, 0, −sinθ), nên θ = −atan2(dz, dx).
		box.rotation.y = -Math.atan2(z2 - z1, x2 - x1);
		box.castShadow = true;
		box.receiveShadow = true;
		group.add(box);
	};

	if (w.curvePoint) {
		let px = w.start.x;
		let pz = w.start.y;
		for (let i = 1; i <= CURVE_SEGMENTS; i++) {
			const t = i / CURVE_SEGMENTS;
			const mt = 1 - t;
			const nx = mt * mt * w.start.x + 2 * mt * t * w.curvePoint.x + t * t * w.end.x;
			const nz = mt * mt * w.start.y + 2 * mt * t * w.curvePoint.y + t * t * w.end.y;
			addSegment(px, pz, nx, nz);
			px = nx;
			pz = nz;
		}
	} else {
		addSegment(w.start.x, w.start.y, w.end.x, w.end.y);
	}

	group.userData.wallId = w.id;
	return group;
}
