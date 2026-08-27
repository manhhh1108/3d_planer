import { writable } from 'svelte/store';

/**
 * Bảng thuộc tính bên phải có đang mở không.
 *
 * Bảng này `position: fixed` nên nó nằm ĐÈ lên mép phải của khung 3D. Các nút
 * nổi neo bên phải trong ThreeViewer phải né sang trái khi bảng mở, không thì
 * chúng che đúng hàng chọn màu và người dùng không bấm được.
 */
export const propertiesPanelOpen = writable(false);

/**
 * Bảng điều khiển "Background Image" có đang hiện không.
 *
 * Chỉ cần có ảnh nền là bảng thuộc tính tự bật và không có cách nào đóng lại,
 * che mất một phần bản vẽ. Cờ này cho phép đóng; bấm vào ảnh nền trên canvas
 * (hoặc nhập ảnh mới) sẽ mở lại.
 */
export const backgroundPanelOpen = writable(true);

/**
 * Yêu cầu mở hộp thoại "Nhập sản phẩm từ DXF".
 *
 * Nút nằm ở mục IMPORT của thanh công cụ, còn hộp thoại lại do trang editor
 * dựng (nó mới biết layoutId). Store này nối hai chỗ đó.
 */
export const dxfImportOpen = writable(false);
