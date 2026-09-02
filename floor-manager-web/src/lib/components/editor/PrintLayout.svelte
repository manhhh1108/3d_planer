<script lang="ts">
  import { currentProject, layoutBgFile, layoutDimsCm, layoutBgTransform } from '$lib/stores/project';
  import { drawLayoutBgImage, layoutBgBounds, layoutBgCenter, DEFAULT_LAYOUT_BG_TRANSFORM, type LayoutBgTransform } from '$lib/utils/layoutBackground';
  import { get } from 'svelte/store';
  import { tick } from 'svelte';
  import { getCatalogItem } from '$lib/utils/furnitureCatalog';
  import { floorPlanBounds, planHasContent, type PlanBounds } from '$lib/utils/planRender';
  import { drawWallsToCanvas } from '$lib/utils/planRender';
  import type { Project, Floor } from '$lib/models/types';
  import { api, FILES_BASE, type ApiSnapshot } from '$lib/services/api';
  import { positionToItem, todayStr } from '$lib/services/mapping';

  let {
    open = $bindable(false),
    layoutId = '',
    siteName = '',
    layoutName = '',
    companyNameProp = '',
    companyLogoUrl = '',
  }: {
    open?: boolean;
    layoutId?: string;
    siteName?: string;
    layoutName?: string;
    /** Tên công ty đã lưu ở cấp mặt bằng — khỏi gõ lại mỗi lần xuất */
    companyNameProp?: string;
    /** Đường dẫn logo đã lưu ở cấp mặt bằng */
    companyLogoUrl?: string;
  } = $props();

  let pageSize = $state<'a4' | 'letter'>('a4');
  let orientation = $state<'landscape' | 'portrait'>('landscape');
  let scale = $state('1:50');
  let showLegend = $state(true);
  let showBackground = $state(true);
  /** Kèm một trang phối cảnh 3D để thấy hình khối thật của sản phẩm */
  let include3D = $state(false);
  /** Ảnh 3D đã chụp — null khi chưa vào chế độ 3D lần nào */
  let photo3D = $state<HTMLImageElement | null>(null);
  let printCanvas: HTMLCanvasElement;
  let exporting = $state(false);
  let printing = $state(false);
  /** Lỗi của lần xuất/in gần nhất — hiện thẳng trên thanh công cụ */
  let exportError = $state<string | null>(null);
  let companyName = $state('');
  let companyLogoText = $state('');
  let snapshots = $state<ApiSnapshot[]>([]);
  let selectedDates = $state<string[]>([]);
  let loadingSnapshots = $state(false);

  /**
   * Logo đã nạp sẵn để vẽ lên canvas.
   *
   * Nạp qua fetch -> blob -> data URL chứ không gán thẳng src: canvas bị "vấy
   * bẩn" (tainted) bởi ảnh khác origin sẽ làm toDataURL() ném lỗi, tức là hỏng
   * luôn cả việc xuất PDF chỉ vì một cái logo.
   */
  let logoImage = $state<HTMLImageElement | null>(null);

  /** Nền layout (bản vẽ DXF/ảnh đã import) — trải từ gốc toạ độ theo layoutDimsCm */
  let bgLayoutImage = $state<HTMLImageElement | null>(null);
  let bgLayoutDims = $state({ widthCm: 0, heightCm: 0 });
  let bgLayoutT = $state<LayoutBgTransform>({ ...DEFAULT_LAYOUT_BG_TRANSFORM });
  /** Ảnh nền riêng của tầng — có vị trí, xoay, tỉ lệ và độ mờ riêng */
  let bgFloorImage = $state<HTMLImageElement | null>(null);
  let hasBackground = $derived(bgLayoutImage !== null || bgFloorImage !== null);

  /** Trang đang xem trước (chỉ số trong pageDates) */
  let previewIndex = $state(0);
  /** Bố cục từng ngày đã nạp cho khung xem trước */
  let pageProjects = $state<Record<string, Project>>({});
  let loadingPreview = $state(false);

  let pageDates = $derived(selectedDates.length > 0 ? [...selectedDates].sort() : [todayStr()]);
  /** Trang 3D nối vào cuối, nên tổng số trang không còn bằng số ngày */
  let has3DPage = $derived(include3D && photo3D !== null);
  let pageCount = $derived(pageDates.length + (has3DPage ? 1 : 0));
  let previewIsPhoto = $derived(has3DPage && previewIndex >= pageDates.length);
  let previewDate = $derived(pageDates[Math.min(previewIndex, pageDates.length - 1)] ?? todayStr());

  const SCALE_OPTIONS = ['1:25', '1:50', '1:100', '1:200'];
  const FONT = "'Noto Sans', Arial, 'Segoe UI', system-ui, sans-serif";
  const PAD = 36;
  /** Khoảng lùi của nét khung ngoài so với mép giấy */
  const FRAME_M = 14;
  /** Nét khung trong — khung tên bám đúng vào đây cho liền một khối */
  const INNER = FRAME_M + 4;
  /** Chừa trên cùng: không còn dải tiêu đề, chỉ cần thoát khỏi nét khung */
  const TITLE_H = INNER + 6;
  /** Bội số độ phân giải khi xuất — 3× khổ 96dpi ≈ 288dpi, đủ nét khi in giấy */
  const EXPORT_SCALE = 3;

  function getActiveFloor(project: Project): Floor | undefined {
    return project.floors.find(f => f.id === project.activeFloorId) ?? project.floors[0];
  }

  function getProjectName(): string {
    return get(currentProject)?.name ?? 'Mặt bằng';
  }

  function isoDate(d: string): string {
    return d.slice(0, 10);
  }

  function shortDate(date: string): string {
    return `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
  }

  function toggleDate(date: string) {
    selectedDates = selectedDates.includes(date)
      ? selectedDates.filter((d) => d !== date)
      : [...selectedDates, date].sort();
    // Bỏ tick bớt ngày thì trang đang xem có thể vượt quá số trang còn lại
    previewIndex = Math.min(previewIndex, Math.max(0, selectedDates.length - 1));
  }

  async function refreshSnapshots() {
    if (!layoutId) {
      snapshots = [];
      selectedDates = [];
      return;
    }
    loadingSnapshots = true;
    try {
      snapshots = await api.snapshots.list(layoutId);
      if (selectedDates.length === 0) {
        selectedDates = snapshots.some((s) => isoDate(s.date) === todayStr()) ? [todayStr()] : [];
      }
    } catch (e) {
      console.error('[PrintLayout] Không tải được danh sách snapshot:', e);
      snapshots = [];
    } finally {
      loadingSnapshots = false;
    }
  }

  function withSnapshotPositions(project: Project, snapshot: ApiSnapshot): Project {
    const clone = structuredClone(project) as Project;
    const floor = getActiveFloor(clone);
    if (floor) floor.furniture = (snapshot.positions ?? []).map(positionToItem);
    return clone;
  }

  /**
   * Vẽ chữ vừa bề ngang cho trước: thu nhỏ cỡ chữ trước, hết cỡ thì cắt bớt.
   *
   * Không dùng tham số maxWidth của fillText — nó ép co ngang chữ lại thành
   * nét dẹp dính vào nhau, đúng kiểu "nhìn như bị mờ" trên nhãn block.
   */
  function drawFittedText(
    ctx: CanvasRenderingContext2D,
    text: string,
    y: number,
    maxW: number,
    size: number,
    bold: boolean,
  ) {
    const setFont = (px: number) => { ctx.font = `${bold ? 'bold ' : ''}${px}px ${FONT}`; };
    let px = size;
    setFont(px);
    while (px > 6 && ctx.measureText(text).width > maxW) {
      px -= 0.5;
      setFont(px);
    }
    let out = text;
    if (ctx.measureText(out).width > maxW) {
      while (out.length > 1 && ctx.measureText(`${out}…`).width > maxW) out = out.slice(0, -1);
      out = `${out}…`;
    }
    ctx.fillText(out, 0, y);
  }

  /**
   * Nới khung nhìn để chứa cả tấm nền.
   *
   * Bản vẽ CAD thường rộng hơn hẳn vùng đã đặt block; căn theo bounds của
   * block không thôi thì phần nền còn lại bị cắt mất gần hết.
   */
  function boundsWithBackground(base: PlanBounds | null, floor: Floor | undefined): PlanBounds | null {
    let b: PlanBounds | null = base ? { ...base } : null;
    const grow = (x1: number, y1: number, x2: number, y2: number) => {
      b = b
        ? {
            minX: Math.min(b.minX, x1),
            minY: Math.min(b.minY, y1),
            maxX: Math.max(b.maxX, x2),
            maxY: Math.max(b.maxY, y2),
          }
        : { minX: x1, minY: y1, maxX: x2, maxY: y2 };
    };

    if (bgLayoutImage && bgLayoutDims.widthCm > 0 && bgLayoutDims.heightCm > 0) {
      const bb = layoutBgBounds(bgLayoutDims.widthCm, bgLayoutDims.heightCm, bgLayoutT);
      grow(bb.minX, bb.minY, bb.maxX, bb.maxY);
    }

    const fb = floor?.backgroundImage;
    if (bgFloorImage && fb) {
      const halfW = (bgFloorImage.naturalWidth * fb.scale) / 2;
      const halfH = (bgFloorImage.naturalHeight * fb.scale) / 2;
      // Ảnh có xoay thì lấy bán kính ngoại tiếp cho gọn, khỏi tính lại 4 góc
      const hw = fb.rotation ? Math.hypot(halfW, halfH) : halfW;
      const hh = fb.rotation ? Math.hypot(halfW, halfH) : halfH;
      grow(fb.position.x - hw, fb.position.y - hh, fb.position.x + hw, fb.position.y + hh);
    }
    return b;
  }

  /** Vẽ nền trong hệ toạ độ cm (ctx đã translate/scale sẵn về khung bản vẽ) */
  function drawBackgrounds(ctx: CanvasRenderingContext2D, floor: Floor) {
    if (bgLayoutImage && bgLayoutDims.widthCm > 0 && bgLayoutDims.heightCm > 0) {
      const { widthCm, heightCm } = bgLayoutDims;
      // ctx đã ở hệ cm nên 1cm = 1 đơn vị; độ mờ lấy đúng mức người dùng đã canh
      drawLayoutBgImage(
        ctx, bgLayoutImage, widthCm, heightCm, bgLayoutT,
        layoutBgCenter(widthCm, heightCm, bgLayoutT), 1,
      );
    }

    const fb = floor.backgroundImage;
    if (bgFloorImage && fb) {
      ctx.save();
      // Giữ đúng độ mờ người dùng đã chỉnh trong editor cho ảnh nền của tầng
      ctx.globalAlpha = fb.opacity;
      ctx.translate(fb.position.x, fb.position.y);
      if (fb.rotation) ctx.rotate((fb.rotation * Math.PI) / 180);
      const w = bgFloorImage.naturalWidth * fb.scale;
      const h = bgFloorImage.naturalHeight * fb.scale;
      ctx.drawImage(bgFloorImage, -w / 2, -h / 2, w, h);
      ctx.restore();
    }
  }

  /** Core rendering — works for screen preview (dpr>1) and PDF export (dpr=1). */
  function renderToCanvas(
    ctx: CanvasRenderingContext2D,
    cw: number,
    ch: number,
    dpr = 1,
    renderProject: Project | null = get(currentProject),
    snapshotDate = todayStr(),
    pageIndex = 1,
    pageTotal = 1,
    photo: HTMLImageElement | null = null,
  ) {
    const project = renderProject;
    if (!project) return;
    const floor = getActiveFloor(project);
    const resolvedSiteName = siteName || 'Mặt bằng';
    const resolvedLayoutName = layoutName || floor?.name || project.name;
    const resolvedCompany = companyName.trim() || companyNameProp.trim() || 'Công ty';
    const resolvedLogo = companyLogoText.trim() || resolvedCompany.slice(0, 4).toUpperCase();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cw, ch);

    // ── Khung bao bản vẽ ─────────────────────────────────────────
    // Hai nét: nét ngoài đậm làm biên, nét trong mảnh cho ra dáng bản vẽ kỹ
    // thuật. Vẽ trước mọi thứ khác để không đè lên nội dung.
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.6;
    ctx.strokeRect(FRAME_M, FRAME_M, cw - FRAME_M * 2, ch - FRAME_M * 2);
    ctx.lineWidth = 0.5;
    ctx.strokeRect(FRAME_M + 4, FRAME_M + 4, cw - (FRAME_M + 4) * 2, ch - (FRAME_M + 4) * 2);

    // Không còn dải tiêu đề trên cùng: tên công ty, mặt bằng, layout, tỉ lệ và
    // ngày đều đã nằm trong khung tên phía dưới — in hai lần chỉ tốn chỗ vẽ.

    // ── Khung tên: bám sát nét khung trong, dưới cùng trang ───────
    const footerX = INNER;
    const footerW = cw - INNER * 2;
    const frameH = 78;
    const footerY = ch - INNER - frameH;

    // ── Legend column (right side) ───────────────────────────────
    const showLegendHere = showLegend && !photo;
    const legendW = showLegendHere ? 215 : 0;
    const planAreaX = PAD;
    const planAreaY = TITLE_H + 4;
    const planAreaW = cw - PAD * 2 - legendW - (legendW > 0 ? 12 : 0);
    const planAreaH = footerY - planAreaY - 10;

    if (showLegendHere && floor?.furniture?.length) {
      const lx = planAreaX + planAreaW + 12;
      const ly = planAreaY + 4;
      ctx.font = `bold 13px ${FONT}`;
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('DANH SÁCH BLOCK', lx, ly);

      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(lx, ly + 20);
      ctx.lineTo(lx + legendW - 4, ly + 20);
      ctx.stroke();

      // Group by catalogId
      const counts = new Map<string, number>();
      for (const fi of floor.furniture) {
        counts.set(fi.catalogId, (counts.get(fi.catalogId) ?? 0) + 1);
      }

      let rowY = ly + 28;
      const rowH = 28;
      for (const [cid, cnt] of counts) {
        const cat = getCatalogItem(cid);
        if (!cat) continue;
        if (rowY + rowH > footerY - 10) break;

        // Color dot
        ctx.fillStyle = cat.color ?? '#3b82f6';
        ctx.beginPath();
        ctx.arc(lx + 6, rowY + 7, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#1e293b';
        ctx.font = `bold 12px ${FONT}`;
        ctx.textBaseline = 'top';

        // Truncate long names
        let name = cat.name;
        if (name.length > 20) name = name.slice(0, 19) + '…';
        ctx.fillText(name, lx + 18, rowY);

        ctx.fillStyle = '#64748b';
        ctx.font = `10.5px ${FONT}`;
        ctx.fillText(`SL: ${cnt}  |  ${cat.width ?? 0}×${cat.depth ?? 0}cm`, lx + 18, rowY + 14);

        rowY += rowH;
      }
    }

    // ── Floor plan ───────────────────────────────────────────────
    const contentBounds = planHasContent(floor) ? floorPlanBounds(floor) : null;
    const planBounds = showBackground ? boundsWithBackground(contentBounds, floor) : contentBounds;
    if (photo) {
      ctx.fillStyle = '#0f172a';
      ctx.font = `bold 14px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('PHỐI CẢNH 3D', planAreaX, planAreaY);

      const capH = 22;
      const boxY = planAreaY + capH;
      const boxH = planAreaH - capH;
      const ratio = photo.naturalWidth / photo.naturalHeight;
      let dw = planAreaW;
      let dh = dw / ratio;
      if (dh > boxH) { dh = boxH; dw = dh * ratio; }
      ctx.drawImage(photo, planAreaX + (planAreaW - dw) / 2, boxY + (boxH - dh) / 2, dw, dh);
    } else if (!floor || !planBounds) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = `13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Chưa có gì trên mặt bằng', planAreaX + planAreaW / 2, planAreaY + planAreaH / 2);
    } else {
      const { minX, minY, maxX, maxY } = planBounds;
      const planW = maxX - minX;
      const planH = maxY - minY;

      if (planW > 0 && planH > 0) {
        const fitScale = Math.min(planAreaW / planW, planAreaH / planH) * 0.92;
        const drawnW = planW * fitScale;
        const drawnH = planH * fitScale;
        const offsetX = planAreaX + (planAreaW - drawnW) / 2 - minX * fitScale;
        const offsetY = planAreaY + (planAreaH - drawnH) / 2 - minY * fitScale;

        // Clip to plan area
        ctx.save();
        ctx.beginPath();
        ctx.rect(planAreaX, planAreaY, planAreaW, planAreaH);
        ctx.clip();

        // Grid
        ctx.strokeStyle = 'rgba(148,163,184,0.18)';
        ctx.lineWidth = 0.6;
        const gridCm = 500;
        for (let x = Math.floor(minX / gridCm) * gridCm; x <= maxX + gridCm; x += gridCm) {
          const px = offsetX + x * fitScale;
          ctx.beginPath(); ctx.moveTo(px, planAreaY); ctx.lineTo(px, planAreaY + planAreaH); ctx.stroke();
        }
        for (let y = Math.floor(minY / gridCm) * gridCm; y <= maxY + gridCm; y += gridCm) {
          const py = offsetY + y * fitScale;
          ctx.beginPath(); ctx.moveTo(planAreaX, py); ctx.lineTo(planAreaX + planAreaW, py); ctx.stroke();
        }

        ctx.translate(offsetX, offsetY);
        ctx.scale(fitScale, fitScale);

        // Nền nằm dưới cùng, đúng thứ tự lớp như trên màn hình
        if (showBackground) drawBackgrounds(ctx, floor);

        // Tường vẽ trước để block nằm đè lên, giống thứ tự trên màn hình
        drawWallsToCanvas(ctx, floor.walls, { x: 0, y: 0 }, 1.2 / fitScale);

        for (const fi of floor.furniture) {
          const cat = getCatalogItem(fi.catalogId);
          const fw = fi.width ?? cat?.width ?? 30;
          const fd = fi.depth ?? cat?.depth ?? 30;
          const color = fi.color ?? cat?.color ?? '#3b82f6';
          const rot = (fi.rotation || 0) * Math.PI / 180;

          ctx.save();
          ctx.translate(fi.position.x, fi.position.y);
          ctx.rotate(rot);

          // Fill
          ctx.fillStyle = color + 'bb';
          ctx.fillRect(-fw / 2, -fd / 2, fw, fd);

          // Border
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.2 / fitScale;
          ctx.strokeRect(-fw / 2, -fd / 2, fw, fd);

          // Label
          if (cat) {
            // Kích thước ô tính ra px trang, rồi vẽ chữ ở hệ px đó: vẽ trong hệ
            // cm sẽ khiến nét chữ to nhỏ theo mức thu phóng của từng bản vẽ.
            const boxW = fw * fitScale;
            const boxH = fd * fitScale;
            // Block cao hẹp thì xoay chữ dọc thay vì nhồi vào bề ngang
            const vertical = boxH > boxW * 1.35;
            const availW = (vertical ? boxH : boxW) - 8;
            const availH = (vertical ? boxW : boxH) - 6;

            if (availW > 14 && availH > 9) {
              ctx.save();
              ctx.scale(1 / fitScale, 1 / fitScale);
              if (vertical) ctx.rotate(-Math.PI / 2);
              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';

              const twoLines = availH >= 26;
              const nameSize = Math.min(13, Math.max(6, availH * (twoLines ? 0.34 : 0.58)));
              ctx.fillStyle = '#0f172a';
              drawFittedText(ctx, cat.name, twoLines ? -nameSize * 0.6 : 0, availW, nameSize, true);
              if (twoLines) {
                ctx.fillStyle = '#475569';
                drawFittedText(ctx, cat.id.slice(-6).toUpperCase(), nameSize * 0.8, availW, nameSize * 0.8, false);
              }
              ctx.restore();
            }
          }
          ctx.restore();
        }

        ctx.restore(); // undo clip + translate/scale

        // Scale bar (bottom-left of plan area)
        const barM = 5;
        const barPx = barM * 100 * fitScale;
        const bx = planAreaX + 4;
        const by = planAreaY + planAreaH - 10;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(bx, by - 4, barPx / 2, 4);
        ctx.fillStyle = '#94a3b8';
        ctx.fillRect(bx + barPx / 2, by - 4, barPx / 2, 4);
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(bx, by - 4); ctx.lineTo(bx, by + 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(bx + barPx, by - 4); ctx.lineTo(bx + barPx, by + 2); ctx.stroke();
        ctx.fillStyle = '#475569';
        ctx.font = `11px ${FONT}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'bottom';
        ctx.fillText('0', bx, by - 6);
        ctx.textAlign = 'right';
        ctx.fillText(`${barM}m`, bx + barPx, by - 6);

      }
    }

    // ── Footer ───────────────────────────────────────────────────
    const col1W = footerW * 0.44;
    const col2W = footerW * 0.25;
    const col3W = footerW - col1W - col2W;

    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(footerX, footerY, footerW, frameH);
    ctx.beginPath();
    ctx.moveTo(footerX + col1W, footerY);
    ctx.lineTo(footerX + col1W, footerY + frameH);
    ctx.moveTo(footerX + col1W + col2W, footerY);
    ctx.lineTo(footerX + col1W + col2W, footerY + frameH);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#0f172a';
    ctx.font = `bold 17px ${FONT}`;
    ctx.fillText(resolvedSiteName, footerX + 12, footerY + 13, col1W - 24);
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = '#ef4444';
    ctx.fillText(resolvedLayoutName, footerX + 12, footerY + 41, col1W - 24);

    ctx.fillStyle = '#0f172a';
    ctx.font = `12px ${FONT}`;
    ctx.fillText(`Ngày: ${shortDate(snapshotDate)}`, footerX + col1W + 12, footerY + 14, col2W - 24);
    ctx.fillText(`Tỉ lệ: ${scale}`, footerX + col1W + 12, footerY + 38, col2W - 24);

    // Logo và tên công ty nằm cùng một hàng, căn giữa theo chiều cao khung tên
    const logoX = footerX + col1W + col2W + 14;
    const midY = footerY + frameH / 2;
    let nameX = logoX;
    ctx.textBaseline = 'middle';

    if (logoImage?.complete && logoImage.naturalWidth > 0) {
      // Vừa khung, giữ nguyên tỉ lệ — logo méo còn tệ hơn không có logo
      const logoBoxH = 40;
      const logoBoxW = Math.min(col3W * 0.45, 110);
      const ratio = logoImage.naturalWidth / logoImage.naturalHeight;
      let dw = logoBoxW;
      let dh = dw / ratio;
      if (dh > logoBoxH) { dh = logoBoxH; dw = dh * ratio; }
      ctx.drawImage(logoImage, logoX, midY - dh / 2, dw, dh);
      nameX = logoX + dw + 10;
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.font = `bold 20px ${FONT}`;
      ctx.fillText(resolvedLogo, logoX, midY);
      nameX = logoX + ctx.measureText(resolvedLogo).width + 10;
    }

    // Cắt bớt tên dài thay vì ép co ngang — fillText có maxWidth sẽ bóp chữ dẹp
    ctx.font = `13px ${FONT}`;
    ctx.fillStyle = '#ef4444';
    const nameMaxW = footerX + footerW - nameX - 12;
    let companyLabel = resolvedCompany;
    if (ctx.measureText(companyLabel).width > nameMaxW) {
      while (companyLabel.length > 1 && ctx.measureText(`${companyLabel}…`).width > nameMaxW) {
        companyLabel = companyLabel.slice(0, -1);
      }
      companyLabel = `${companyLabel}…`;
    }
    ctx.fillText(companyLabel, nameX, midY);
    ctx.textBaseline = 'top';

    ctx.textAlign = 'right';
    ctx.fillStyle = '#64748b';
    ctx.font = `10px ${FONT}`;
    ctx.fillText(`Trang ${pageIndex} / ${pageTotal}`, cw - PAD - 10, footerY + frameH - 16);
  }

  /** Dựng Image từ một nguồn đã nội tuyến (data URL); ảnh hỏng trả về null */
  async function decodeImage(src: string): Promise<HTMLImageElement | null> {
    const img = new Image();
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve(); // ảnh hỏng thì bỏ qua, đừng chặn xuất PDF
      img.src = src;
    });
    return img.naturalWidth > 0 ? img : null;
  }

  /**
   * Tải ảnh về data URL rồi mới dựng Image.
   *
   * Gán thẳng src của ảnh khác origin sẽ "vấy bẩn" (taint) canvas, khiến
   * toDataURL() ném lỗi — hỏng cả bản PDF chỉ vì một cái logo hay tấm nền.
   */
  async function loadImageInline(url: string): Promise<HTMLImageElement | null> {
    try {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return null;
      const blob = await res.blob();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      return await decodeImage(dataUrl);
    } catch {
      return null;
    }
  }

  async function loadLogo() {
    // Không có logo cũng in được — khung tên rơi về chữ viết tắt
    logoImage = companyLogoUrl ? await loadImageInline(`${FILES_BASE}${companyLogoUrl}`) : null;
  }

  /**
   * Chụp khung nhìn 3D đang mở.
   *
   * ThreeViewer chỉ được gắn khi editor ở chế độ 3D, nên hàm này chỉ có ảnh khi
   * người dùng đang đứng ở 3D. Renderer bật preserveDrawingBuffer nên khung
   * hình cuối vẫn đọc được dù hộp thoại đang che lên trên.
   */
  async function capture3DView(): Promise<HTMLImageElement | null> {
    for (const c of Array.from(document.querySelectorAll('canvas'))) {
      // Bỏ qua canvas xem trước của chính hộp thoại này. Gọi getContext('webgl')
      // lên nó trước khi nó kịp lấy ngữ cảnh 2d sẽ khoá nó thành canvas WebGL
      // vĩnh viễn, và getContext('2d') sau đó trả về null — hỏng cả bản xem trước.
      if (c.closest('[data-print-preview]')) continue;
      if (c.width < 32 || c.height < 32) continue;
      let isWebgl = false;
      try {
        isWebgl = !!(c.getContext('webgl2') || c.getContext('webgl'));
      } catch {
        continue;
      }
      if (!isWebgl) continue;
      try {
        const url = c.toDataURL('image/png');
        if (url.length < 128) continue;
        return await decodeImage(url);
      } catch {
        // canvas bị vấy bẩn -> bỏ qua, các trang còn lại vẫn xuất được
      }
    }
    return null;
  }

  /** Nền bản vẽ: nền layout tải từ server, ảnh nền tầng vốn đã là data URL */
  async function loadBackgrounds() {
    bgLayoutImage = null;
    bgFloorImage = null;
    bgLayoutDims = get(layoutDimsCm);
    bgLayoutT = get(layoutBgTransform);

    const layoutUrl = get(layoutBgFile);
    if (layoutUrl) bgLayoutImage = await loadImageInline(layoutUrl);

    const project = get(currentProject);
    const floorBg = project ? getActiveFloor(project)?.backgroundImage : undefined;
    if (floorBg?.dataUrl) bgFloorImage = await decodeImage(floorBg.dataUrl);
  }

  /** Bố cục của một ngày, lấy từ snapshot ngày đó (có nhớ lại để khỏi tải lặp) */
  async function projectForDate(date: string): Promise<Project | null> {
    const base = get(currentProject);
    if (!base) return null;
    if (pageProjects[date]) return pageProjects[date];
    const snap = snapshots.find((s) => isoDate(s.date) === date);
    if (!layoutId || !snap) return base;
    const detail = await api.snapshots.get(snap.id);
    const built = withSnapshotPositions(base, detail);
    pageProjects = { ...pageProjects, [date]: built };
    return built;
  }

  async function renderPrintCanvas() {
    if (!printCanvas) return;
    loadingPreview = true;
    try {
      const project = await projectForDate(previewDate);
      if (!printCanvas) return;
      const dpr = window.devicePixelRatio || 1;
      const cw = printCanvas.clientWidth;
      const ch = printCanvas.clientHeight;
      printCanvas.width = cw * dpr;
      printCanvas.height = ch * dpr;
      renderToCanvas(
        printCanvas.getContext('2d')!,
        cw, ch, dpr,
        project,
        previewDate,
        Math.min(previewIndex, pageCount - 1) + 1,
        pageCount,
        previewIsPhoto ? photo3D : null,
      );
    } catch (e) {
      // Nạp snapshot hỏng thì khung xem trước đứng im — nói ra thay vì để trắng
      console.error('[PrintLayout] Dựng bản xem trước thất bại:', e);
      exportError = `Không dựng được bản xem trước: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      loadingPreview = false;
    }
  }

  /**
   * Khổ giấy quy ra px logic 96dpi — đúng hệ toạ độ của khung xem trước
   * (`.print-page` đặt theo mm nên clientWidth ra đúng những số này).
   *
   * Trước đây bản xuất dùng khung 1754px trong khi cỡ chữ vẫn là cỡ thiết kế
   * cho khung 1123px, nên chữ in ra bé lại còn khoảng 2/3. Độ nét giờ nâng
   * bằng EXPORT_SCALE chứ không nâng bằng cách phóng to hệ toạ độ.
   */
  function pageDims() {
    const isLandscape = orientation === 'landscape';
    const isA4 = pageSize === 'a4';
    return {
      isLandscape,
      isA4,
      W: isA4 ? (isLandscape ? 1123 : 794) : (isLandscape ? 1056 : 816),
      H: isA4 ? (isLandscape ? 794 : 1123) : (isLandscape ? 816 : 1056),
    };
  }

  /** Vẽ sẵn mỗi ngày thành một ảnh trang — dùng chung cho xuất PDF và in trực tiếp */
  async function renderPageImages(): Promise<{ date: string; src: string }[]> {
    await document.fonts.ready;
    const base = get(currentProject);
    if (!base) return [];
    const { W, H } = pageDims();
    const out: { date: string; src: string }[] = [];
    const total = pageCount;
    const draw = (project: Project, date: string, index: number, photo: HTMLImageElement | null) => {
      const off = document.createElement('canvas');
      off.width = Math.round(W * EXPORT_SCALE);
      off.height = Math.round(H * EXPORT_SCALE);
      renderToCanvas(off.getContext('2d')!, W, H, EXPORT_SCALE, project, date, index, total, photo);
      out.push({ date, src: off.toDataURL('image/jpeg', 0.95) });
    };

    for (let i = 0; i < pageDates.length; i++) {
      const date = pageDates[i];
      draw((await projectForDate(date)) ?? base, date, i + 1, null);
    }
    // Trang phối cảnh nối cuối, dùng bố cục của ngày cuối cùng cho khung tên
    if (has3DPage && photo3D) {
      const lastDate = pageDates[pageDates.length - 1] ?? todayStr();
      draw((await projectForDate(lastDate)) ?? base, lastDate, total, photo3D);
    }
    return out;
  }

  /** Bỏ ký tự Windows/POSIX không cho phép trong tên tệp, tránh trình duyệt chặn tải */
  function safeFileName(name: string): string {
    return (name.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'mat-bang').slice(0, 80);
  }

  /** Tải blob về máy bằng thẻ <a download> — chủ động hơn pdf.save() để bắt được lỗi */
  function downloadBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  async function exportPDF() {
    exporting = true;
    exportError = null;
    try {
      const pages = await renderPageImages();
      if (pages.length === 0) {
        exportError = 'Chưa có dữ liệu mặt bằng để xuất';
        return;
      }

      const { isLandscape, isA4 } = pageDims();
      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({
        orientation: isLandscape ? 'landscape' : 'portrait',
        unit: 'mm',
        format: isA4 ? 'a4' : 'letter',
      });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();

      pages.forEach((page, index) => {
        if (index > 0) pdf.addPage(isA4 ? 'a4' : 'letter', isLandscape ? 'landscape' : 'portrait');
        pdf.addImage(page.src, 'JPEG', 0, 0, pw, ph);
      });

      // Tự tạo blob rồi tải, thay vì pdf.save(): save() nuốt lỗi bên trong nên
      // hỏng ở đâu cũng chỉ thấy "bấm mà không ra file".
      downloadBlob(pdf.output('blob'), `${safeFileName(getProjectName())}-matbang.pdf`);
    } catch (e) {
      console.error('[PrintLayout] Xuất PDF thất bại:', e);
      exportError = `Xuất PDF lỗi: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      exporting = false;
    }
  }

  /**
   * In tất cả ngày đã chọn.
   *
   * Khung xem trước chỉ có đúng một canvas nên `window.print()` trần chỉ in
   * được trang đang xem. Ở đây dựng ảnh từng ngày rồi in qua iframe riêng:
   * tài liệu in tự đặt @page và chỉ chứa đúng các trang cần in, không phải
   * chống chọi với CSS của trang editor bên dưới lớp phủ.
   */
  async function doPrint() {
    printing = true;
    exportError = null;
    let frame: HTMLIFrameElement | null = null;
    try {
      const pages = await renderPageImages();
      if (pages.length === 0) {
        exportError = 'Chưa có dữ liệu mặt bằng để in';
        return;
      }

      const { isA4, isLandscape } = pageDims();
      const size = `${isA4 ? 'A4' : 'letter'} ${isLandscape ? 'landscape' : 'portrait'}`;
      const body = pages.map((p) => `<img src="${p.src}" alt="">`).join('');
      const html = `<!doctype html><html><head><meta charset="utf-8"><title>${getProjectName()}</title><style>
@page { size: ${size}; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
img { display: block; width: 100%; height: auto; break-after: page; page-break-after: always; }
img:last-child { break-after: auto; page-break-after: auto; }
</style></head><body>${body}</body></html>`;

      frame = document.createElement('iframe');
      frame.setAttribute('aria-hidden', 'true');
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;';
      document.body.appendChild(frame);

      const sheet = frame;
      const doc = frame.contentDocument;
      const win = frame.contentWindow;
      if (!doc || !win) {
        exportError = 'Trình duyệt chặn khung in';
        return;
      }
      doc.open();
      doc.write(html);
      doc.close();

      // Ảnh chưa nạp xong mà in là ra trang trắng
      await new Promise<void>((resolve) => {
        const imgs = Array.from(doc.images);
        let left = imgs.filter((im) => !im.complete).length;
        if (left === 0) { resolve(); return; }
        const done = () => { if (--left <= 0) resolve(); };
        for (const im of imgs) {
          if (im.complete) continue;
          im.addEventListener('load', done, { once: true });
          im.addEventListener('error', done, { once: true });
        }
        setTimeout(resolve, 5000);
      });
      await tick();

      // Giữ tham chiếu riêng: `frame` bị gán null ngay dưới đây để khối finally
      // không gỡ iframe khi hộp thoại in còn đang mở.
      const cleanup = () => sheet.remove();
      win.addEventListener('afterprint', cleanup, { once: true });
      win.focus();
      win.print();
      // Firefox không bắn afterprint trong iframe — dọn muộn cho chắc
      setTimeout(cleanup, 60_000);
      frame = null;
    } catch (e) {
      console.error('[PrintLayout] In thất bại:', e);
      exportError = `In lỗi: ${e instanceof Error ? e.message : String(e)}`;
    } finally {
      frame?.remove();
      printing = false;
    }
  }
  function close() { open = false; }

  $effect(() => {
    if (open) {
      // Mở lại là lấy tên công ty đã lưu ở mặt bằng; trước đây luôn về 'VHE'
      companyName = companyNameProp;
      companyLogoText = '';
      pageProjects = {};
      previewIndex = 0;
      exportError = null;
      void loadLogo();
      void loadBackgrounds();
      void capture3DView().then((img) => {
        photo3D = img;
        // Không có ảnh thì đừng bật sẵn, tránh xuất ra một trang trắng
        if (!img) include3D = false;
      });
      void refreshSnapshots();
      setTimeout(renderPrintCanvas, 60);
    }
  });
  $effect(() => {
    if (open) {
      void pageSize; void orientation; void scale; void showLegend;
      void companyName; void companyLogoText; void previewIndex; void pageDates; void logoImage;
      void showBackground; void bgLayoutImage; void bgFloorImage; void bgLayoutDims;
      void include3D; void photo3D;
      setTimeout(renderPrintCanvas, 20);
    }
  });
</script>

<svelte:window onkeydown={(e) => { if (e.key === 'Escape') close(); }} />

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 bg-black/60 z-[100] flex items-start justify-center overflow-auto print-overlay-backdrop"
    onclick={close}
    onkeydown={(e) => { if (e.key === 'Escape') close(); }}
  >
    <!-- Toolbar (hidden on print) -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="fixed top-0 left-0 right-0 bg-slate-800 text-white px-5 py-2.5 flex items-center gap-3 z-[101] print-hide"
      onclick={(e) => e.stopPropagation()}
      onkeydown={() => {}}
    >
      <span class="font-semibold text-sm text-white/90">Xuất mặt bằng</span>
      <div class="h-4 w-px bg-white/20"></div>

      <label class="text-xs text-white/70 flex items-center gap-1.5">
        Khổ
        <select bind:value={pageSize} class="bg-slate-700 text-white text-xs rounded px-2 py-1 border border-slate-600">
          <option value="a4">A4</option>
          <option value="letter">Letter</option>
        </select>
      </label>

      <label class="text-xs text-white/70 flex items-center gap-1.5">
        Chiều
        <select bind:value={orientation} class="bg-slate-700 text-white text-xs rounded px-2 py-1 border border-slate-600">
          <option value="landscape">Ngang</option>
          <option value="portrait">Dọc</option>
        </select>
      </label>

      <label class="text-xs text-white/70 flex items-center gap-1.5">
        Tỉ lệ
        <select bind:value={scale} class="bg-slate-700 text-white text-xs rounded px-2 py-1 border border-slate-600">
          {#each SCALE_OPTIONS as s}<option value={s}>{s}</option>{/each}
        </select>
      </label>

      <label class="text-xs text-white/70 flex items-center gap-1.5 cursor-pointer select-none">
        <input type="checkbox" bind:checked={showLegend} class="accent-blue-400" />
        Danh sách block
      </label>

      {#if hasBackground}
        <label class="text-xs text-white/70 flex items-center gap-1.5 cursor-pointer select-none" title="In kèm bản vẽ nền DXF/ảnh đã import">
          <input type="checkbox" bind:checked={showBackground} class="accent-blue-400" />
          Nền bản vẽ
        </label>
      {/if}

      <label
        class="text-xs flex items-center gap-1.5 select-none {photo3D ? 'text-white/70 cursor-pointer' : 'text-white/30 cursor-not-allowed'}"
        title={photo3D
          ? 'Thêm một trang phối cảnh 3D để thấy hình khối thật của sản phẩm'
          : 'Chuyển editor sang chế độ 3D rồi mở lại hộp thoại này để chụp được khung nhìn'}
      >
        <input type="checkbox" bind:checked={include3D} disabled={!photo3D} class="accent-blue-400" />
        Trang 3D
      </label>

      <label class="text-xs text-white/70 flex items-center gap-1.5">
        Công ty
        <input bind:value={companyName} class="w-28 bg-slate-700 text-white text-xs rounded px-2 py-1 border border-slate-600" />
      </label>

      {#if logoImage}
        <span class="text-xs text-white/50 flex items-center gap-1.5" title="Logo lấy từ cấu hình mặt bằng">
          Logo
          <img src={logoImage.src} alt="" class="h-5 max-w-[3.5rem] object-contain bg-white/90 rounded px-1" />
        </span>
      {:else}
        <label class="text-xs text-white/70 flex items-center gap-1.5" title="Chưa có ảnh logo — sửa mặt bằng để tải lên">
          Logo
          <input bind:value={companyLogoText} placeholder="chữ tắt" class="w-20 bg-slate-700 text-white text-xs rounded px-2 py-1 border border-slate-600" />
        </label>
      {/if}

      {#if layoutId}
        <div class="flex items-center gap-1.5 max-w-[22rem] overflow-x-auto">
          <span class="text-xs text-white/70 shrink-0">Ngày</span>
          {#if loadingSnapshots}
            <span class="text-xs text-white/40">Đang tải...</span>
          {:else if snapshots.length === 0}
            <span class="text-xs text-white/40">Chưa có snapshot</span>
          {:else}
            {#each [...snapshots].reverse() as s}
              {@const d = isoDate(s.date)}
              <label class="text-xs text-white/75 flex items-center gap-1 bg-white/10 rounded px-2 py-1 whitespace-nowrap cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedDates.includes(d)}
                  onchange={() => toggleDate(d)}
                  class="accent-blue-400"
                />
                {shortDate(d)}
              </label>
            {/each}
          {/if}
        </div>
      {/if}

      {#if pageCount > 1}
        <div class="flex items-center gap-1 text-xs text-white/70">
          <button
            onclick={() => previewIndex = Math.max(0, previewIndex - 1)}
            disabled={previewIndex === 0}
            class="w-6 h-6 rounded bg-white/10 hover:bg-white/20 disabled:opacity-30"
            aria-label="Trang trước"
          >‹</button>
          <span class="whitespace-nowrap">
            Trang {Math.min(previewIndex, pageCount - 1) + 1}/{pageCount}
            {#if loadingPreview}<span class="text-white/40">…</span>{/if}
          </span>
          <button
            onclick={() => previewIndex = Math.min(pageCount - 1, previewIndex + 1)}
            disabled={previewIndex >= pageCount - 1}
            class="w-6 h-6 rounded bg-white/10 hover:bg-white/20 disabled:opacity-30"
            aria-label="Trang sau"
          >›</button>
        </div>
      {/if}

      <div class="flex-1"></div>

      {#if exportError}
        <span class="text-xs text-red-300 max-w-[20rem] truncate" title={exportError} role="alert">{exportError}</span>
      {/if}

      <button
        onclick={exportPDF}
        disabled={exporting}
        class="px-4 py-1.5 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors flex items-center gap-2"
      >
        {#if exporting}
          <span class="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
          Đang xuất...
        {:else}
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Xuất PDF
        {/if}
      </button>

      <button
        onclick={doPrint}
        disabled={printing}
        title={pageCount > 1 ? `In ${pageCount} trang` : 'In'}
        class="px-3 py-1.5 bg-slate-600 hover:bg-slate-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors flex items-center gap-2"
      >
        {#if printing}
          <span class="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
          Đang dựng trang...
        {:else}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 6 2 18 2 18 9"/>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 0 2 2v5a2 2 0 0 1-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
          </svg>
          In{pageCount > 1 ? ` (${pageCount})` : ''}
        {/if}
      </button>

      <button onclick={close} class="px-2.5 py-1.5 text-white/60 hover:text-white text-sm transition-colors">✕</button>
    </div>

    <!-- Preview page -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="bg-white shadow-2xl mt-14 mb-8 print-page relative"
      class:print-landscape={orientation === 'landscape'}
      class:print-portrait={orientation === 'portrait'}
      class:print-a4={pageSize === 'a4'}
      class:print-letter={pageSize === 'letter'}
      onclick={(e) => e.stopPropagation()}
      onkeydown={() => {}}
    >
      <canvas bind:this={printCanvas} data-print-preview class="w-full h-full block"></canvas>
    </div>
  </div>
{/if}

<style>
  .print-page {
    box-sizing: border-box;
    overflow: hidden;
  }
  .print-landscape.print-a4    { width: 297mm; height: 210mm; }
  .print-portrait.print-a4     { width: 210mm; height: 297mm; }
  .print-landscape.print-letter { width: 11in; height: 8.5in; }
  .print-portrait.print-letter  { width: 8.5in; height: 11in; }

  @media print {
    .print-overlay-backdrop {
      position: fixed;
      inset: 0;
      background: white;
      display: block;
      overflow: visible;
    }
    .print-hide { display: none !important; }
    .print-page {
      position: fixed;
      top: 0; left: 0;
      margin: 0;
      box-shadow: none;
      page-break-after: always;
    }
  }
</style>
