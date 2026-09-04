<script lang="ts">
  import { stages } from '$lib/stores/stages';
  let { stageIds, x, y, onPick, onCancel }:
    { stageIds: string[]; x: number; y: number; onPick: (id: string) => void; onCancel: () => void } = $props();
  let options = $derived($stages.filter((s) => stageIds.includes(s.id)));
</script>

<div class="popup" style={`left:${x}px; top:${y}px`}>
  <p>Chọn công đoạn</p>
  {#each options as st (st.id)}
    <button onclick={() => onPick(st.id)}>
      <span class="dot" style={`background:${st.color}`}></span>{st.name}
    </button>
  {/each}
  <button class="cancel" onclick={onCancel}>Huỷ</button>
</div>

<style>
  .popup { position: absolute; z-index: 50; background: #fff; border: 1px solid #cbd5e1; border-radius: 8px; padding: 8px; box-shadow: 0 4px 16px rgba(0,0,0,.15); display: flex; flex-direction: column; gap: 4px; }
  .popup button { display: flex; align-items: center; gap: 6px; padding: 4px 8px; background: none; border: none; cursor: pointer; text-align: left; }
  .popup button:hover { background: #f1f5f9; }
  .dot { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
  .cancel { color: #64748b; }
</style>
