/**
 * Đọc đơn vị chiều dài từ file STEP (ISO-10303-21) để quy toạ độ về mét.
 *
 * occt-import-js trả toạ độ theo ĐƠN VỊ GỐC của file (không tự quy đổi), nên phải
 * đọc đơn vị length của model rồi nhân hệ số về mét. (web-ifc thì đã tự quy về mét,
 * nên IFC không cần hàm này — xem convert.ts.)
 */

// Tiền tố SI -> hệ số so với mét
const SI_PREFIX: Record<string, number> = {
  EXA: 1e18, PETA: 1e15, TERA: 1e12, GIGA: 1e9, MEGA: 1e6, KILO: 1e3,
  HECTO: 1e2, DECA: 1e1, DECI: 1e-1, CENTI: 1e-2, MILLI: 1e-3,
  MICRO: 1e-6, NANO: 1e-9, PICO: 1e-12, FEMTO: 1e-15, ATTO: 1e-18,
};

// CONVERSION_BASED_UNIT theo tên -> mét (đơn vị phi-SI thường gặp)
const CONVERSION_NAME: Record<string, number> = {
  INCH: 0.0254, INCHES: 0.0254,
  FOOT: 0.3048, FEET: 0.3048, FT: 0.3048,
  YARD: 0.9144, MILE: 1609.344,
  MILLIMETRE: 1e-3, MILLIMETER: 1e-3,
  CENTIMETRE: 1e-2, CENTIMETER: 1e-2,
  METRE: 1, METER: 1,
  KILOMETRE: 1e3, KILOMETER: 1e3,
};

/** SI_UNIT(prefix, .METRE.) trong 1 khối entity -> hệ số về mét, hoặc null. */
function siUnitMetreScale(block: string): number | null {
  const m = block.match(/SI_UNIT\s*\(\s*(\$|\.[A-Z]+\.)\s*,\s*\.METRE\.\s*\)/i);
  if (!m) return null;
  const prefix = m[1];
  if (prefix === '$') return 1; // .METRE. không tiền tố = mét
  const name = prefix.replace(/\./g, '').toUpperCase();
  return SI_PREFIX[name] ?? 1;
}

/** CONVERSION_BASED_UNIT('inch'/'foot'/...) -> mét, hoặc null nếu tên lạ. */
function conversionUnitScale(block: string): number | null {
  const m = block.match(/CONVERSION_BASED_UNIT\s*\(\s*'([^']*)'/i);
  if (!m) return null;
  const name = m[1].replace(/[^A-Za-z]/g, '').toUpperCase();
  return CONVERSION_NAME[name] ?? null;
}

/** Trích khối định nghĩa entity `#id=( ... );` (dừng ở `)` đầu tiên theo sau bởi `;`). */
function extractEntity(text: string, id: string): string | null {
  const re = new RegExp(id + '\\s*=\\s*([\\s\\S]*?)\\)\\s*;');
  const m = text.match(re);
  return m ? m[1] : null;
}

/**
 * Hệ số quy toạ độ STEP về mét. Ưu tiên đơn vị length được GLOBAL_UNIT_ASSIGNED_CONTEXT
 * tham chiếu (bỏ qua các LENGTH_UNIT khai báo nhưng không dùng). Trả null nếu không
 * xác định chắc chắn (caller sẽ fallback mm = 0.001).
 */
export function stepLengthScaleToMetre(text: string): number | null {
  // 1. Đơn vị length mà context toàn cục thực sự dùng
  const ctx = text.match(/GLOBAL_UNIT_ASSIGNED_CONTEXT\s*\(\s*\(([^)]*)\)/i);
  if (ctx) {
    const ids = ctx[1].match(/#\d+/g) ?? [];
    for (const id of ids) {
      const block = extractEntity(text, id);
      if (block && /LENGTH_UNIT/i.test(block)) {
        const s = siUnitMetreScale(block) ?? conversionUnitScale(block);
        if (s != null) return s;
      }
    }
  }

  // 2. Fallback: nếu toàn file chỉ có DUY NHẤT một hệ số length -> dùng nó.
  //    Nhiều đơn vị khác nhau (không rõ cái nào là model) -> trả null.
  const scales = new Set<number>();
  const siRe = /SI_UNIT\s*\(\s*(\$|\.[A-Z]+\.)\s*,\s*\.METRE\.\s*\)/gi;
  for (const m of text.matchAll(siRe)) {
    const s = siUnitMetreScale(m[0]);
    if (s != null) scales.add(s);
  }
  const convRe = /CONVERSION_BASED_UNIT\s*\(\s*'([^']*)'/gi;
  for (const m of text.matchAll(convRe)) {
    const name = m[1].replace(/[^A-Za-z]/g, '').toUpperCase();
    if (CONVERSION_NAME[name] != null) scales.add(CONVERSION_NAME[name]);
  }
  if (scales.size === 1) return [...scales][0];

  return null;
}
