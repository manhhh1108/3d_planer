<script lang="ts">
  import { onMount } from 'svelte';
  import PrintLayout from '$lib/components/editor/PrintLayout.svelte';
  import { currentProject } from '$lib/stores/project';
  import { backendStore, setActiveStore } from '$lib/services/datastore';

  const LAYOUT_ID = 'cmsve4rmu0008fotugs1wc1fv'; // Xưởng lắp ráp — nhiều snapshot
  let open = $state(false);
  let report = $state<string[]>([]);
  const log = (m: string) => { report = [...report, m]; };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  onMount(async () => {
    try {
      const res = await fetch('http://localhost:4000/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'admin@vhe.com', password: '123456' }),
        credentials: 'include',
      });
      log(`login: ${res.status}`);

      setActiveStore(backendStore);
      const p = await backendStore.load(LAYOUT_ID);
      if (!p) { log('KHONG load duoc layout'); return; }
      currentProject.set(p);
      open = true;
      await sleep(1800);

      // Tick 3 ngày trong nhóm chọn ngày (nhãn dạng dd/MM)
      const boxes = [...document.querySelectorAll('label')]
        .filter((l) => /^\s*\d{2}\/\d{2}\s*$/.test(l.textContent ?? ''))
        .map((l) => l.querySelector('input[type=checkbox]') as HTMLInputElement)
        .filter(Boolean);
      log(`so o chon ngay: ${boxes.length}`);
      for (const b of boxes.slice(0, 3)) { if (!b.checked) b.click(); }
      await sleep(1200);
      log(`da tick: ${boxes.filter((b) => b.checked).length}`);

      // Bắt blob mà jsPDF tạo ra khi save()
      let captured: Blob | null = null;
      const orig = URL.createObjectURL.bind(URL);
      URL.createObjectURL = (o: any) => { if (o instanceof Blob) captured = o; return orig(o); };

      const btn = [...document.querySelectorAll('button')]
        .find((b) => (b.textContent ?? '').includes('Xuất PDF')) as HTMLButtonElement;
      if (!btn) { log('KHONG thay nut Xuat PDF'); return; }
      btn.click();

      for (let i = 0; i < 60 && !captured; i++) await sleep(250);
      if (!captured) { log('KHONG bat duoc file PDF'); return; }

      const buf = await (captured as Blob).arrayBuffer();
      const bytes = new Uint8Array(buf);
      let txt = '';
      for (let i = 0; i < bytes.length; i++) txt += String.fromCharCode(bytes[i]);
      const pages = (txt.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
      const media = (txt.match(/\/MediaBox/g) ?? []).length;
      log(`kich thuoc: ${(bytes.length / 1024).toFixed(1)} KB`);
      log(`chu ky file: ${txt.slice(0, 8).trim()}`);
      log(`so trang (/Type /Page): ${pages}`);
      log(`so /MediaBox: ${media}`);
      log(`co anh nhung (/XObject): ${txt.includes('/XObject') ? 'co' : 'khong'}`);
    } catch (e) {
      log('LOI: ' + (e instanceof Error ? e.message : String(e)));
    }
  });
</script>

<div class="fixed top-2 left-2 z-[200] bg-black/85 text-green-300 text-xs font-mono rounded-lg p-3 space-y-0.5" data-report>
  {#each report as line}<div>{line}</div>{/each}
</div>

<PrintLayout bind:open layoutId={LAYOUT_ID} siteName="Kho bãi Nomura" layoutName="Xưởng lắp ráp"
  companyNameProp="Công ty CP VHE" companyLogoUrl="" />
