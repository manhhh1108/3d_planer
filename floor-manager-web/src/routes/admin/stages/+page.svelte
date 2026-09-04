<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { api, type ApiStage, type OutsideZonePolicy } from '$lib/services/api';

  let { data } = $props();
  let list = $derived(data.stages as ApiStage[]);
  let policy = $state<OutsideZonePolicy>(data.outsideZonePolicy as OutsideZonePolicy);

  let newName = $state('');
  let newColor = $state('#3b82f6');
  let err = $state('');

  async function addStage(e: SubmitEvent) {
    e.preventDefault();
    err = '';
    if (!newName.trim()) return;
    try {
      await api.stages.create({ name: newName.trim(), color: newColor, order: list.length });
      newName = '';
      await invalidateAll();
    } catch {
      err = 'Không tạo được công đoạn';
    }
  }

  async function patch(s: ApiStage, patchData: Partial<ApiStage>) {
    try {
      await api.stages.update(s.id, patchData);
      await invalidateAll();
    } catch {
      err = 'Không cập nhật được';
    }
  }

  async function softDelete(s: ApiStage) {
    if (!confirm(`Ẩn công đoạn "${s.name}"?`)) return;
    try {
      await api.stages.remove(s.id);
      await invalidateAll();
    } catch {
      err = 'Không ẩn được';
    }
  }

  async function savePolicy() {
    try {
      await api.settings.put<OutsideZonePolicy>('outsideZonePolicy', policy);
    } catch {
      err = 'Không lưu được cài đặt';
    }
  }

  let marginCm = $state<number>(
    typeof data.defaultMarginCm === 'number' && Number.isFinite(data.defaultMarginCm)
      ? data.defaultMarginCm : 50
  );
  async function saveMargin() {
    try { await api.settings.put<number>('defaultMarginCm', Number(marginCm)); }
    catch { err = 'Không lưu được margin'; }
  }
</script>

<h1>Công đoạn sản xuất</h1>
{#if err}<p style="color:#dc2626">{err}</p>{/if}

<form onsubmit={addStage} style="display:flex;gap:8px;align-items:center;margin:12px 0">
  <input placeholder="Tên công đoạn" bind:value={newName} />
  <input type="color" bind:value={newColor} />
  <button type="submit">Thêm</button>
</form>

<table>
  <thead><tr><th>Màu</th><th>Tên</th><th>Thứ tự</th><th>Trạng thái</th><th></th></tr></thead>
  <tbody>
    {#each list as s (s.id)}
      <tr style={s.active ? '' : 'opacity:.5'}>
        <td><input type="color" value={s.color} onchange={(e) => patch(s, { color: (e.currentTarget as HTMLInputElement).value })} /></td>
        <td><input value={s.name} onchange={(e) => patch(s, { name: (e.currentTarget as HTMLInputElement).value })} /></td>
        <td><input type="number" style="width:60px" value={s.order} onchange={(e) => patch(s, { order: Number((e.currentTarget as HTMLInputElement).value) })} /></td>
        <td>{s.active ? 'Đang dùng' : 'Đã ẩn'}</td>
        <td>
          {#if s.active}
            <button onclick={() => softDelete(s)}>Ẩn</button>
          {:else}
            <button onclick={() => patch(s, { active: true })}>Khôi phục</button>
          {/if}
        </td>
      </tr>
    {/each}
  </tbody>
</table>

<h2 style="margin-top:24px">Cài đặt đặt ngoài vùng</h2>
<label>
  Khi đặt sản phẩm ngoài mọi vùng:
  <select bind:value={policy} onchange={savePolicy}>
    <option value="warn">Cho đặt + cảnh báo (mặc định)</option>
    <option value="block">Chặn hoàn toàn</option>
    <option value="silent">Cho đặt, không cảnh báo</option>
  </select>
</label>

<h2 style="margin-top:24px">Khoảng cách mặc định</h2>
<label>
  Margin mặc định quanh sản phẩm (cm):
  <input type="number" min="0" bind:value={marginCm} onchange={saveMargin} style="width:90px" />
</label>
