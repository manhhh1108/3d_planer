<!--
  Lưu ý chuẩn bị file CAD. Dùng chung cho ô upload lẻ và dialog nhập hàng loạt —
  sửa nội dung ở đây là cả hai nơi cùng đổi.
  Thu gọn mặc định: người đã quen file CAD không phải đọc lại mỗi lần.
-->
<details class="mt-1.5 group">
  <summary class="text-[11px] text-gray-400 hover:text-blue-600 cursor-pointer select-none list-none flex items-center gap-1 w-fit">
    <span class="text-gray-300 group-open:rotate-90 transition-transform inline-block">▸</span>
    ⓘ Lưu ý khi chuẩn bị file CAD
  </summary>
  <ul class="mt-1.5 space-y-1.5 text-[11px] leading-relaxed text-gray-500 border-l-2 border-gray-100 pl-2.5">
    <li>
      <strong class="text-gray-700">Muốn thấy khối 3D thật → dùng STEP hoặc IFC.</strong>
      DWG/DXF chỉ cho biên dạng 2D, trong 3D sẽ hiện thành khối hộp.
    </li>
    <li>
      <strong class="text-gray-700">Chỉ giữ biên dạng chi tiết.</strong>
      Xoá khung tên, đường gióng kích thước, hình phóng to bên cạnh — mọi nét
      trong file đều bị tính vào kích thước block.
    </li>
    <li>
      <strong class="text-gray-700">Biên dạng ngoài nên là một polyline kín.</strong>
      Vẽ bằng nhiều đoạn rời thì chỗ lõm (chữ L, chữ U) sẽ bị lấp đầy. Lỗ khoan
      cứ để, app tự bỏ qua.
    </li>
    <li>
      <strong class="text-gray-700">File phải khai báo đơn vị.</strong>
      Không khai báo thì app hiểu là milimét — bản vẽ bằng mét sẽ nhỏ đi 1000 lần.
    </li>
  </ul>
</details>
