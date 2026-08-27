import { get } from 'svelte/store';
import { currentProject } from '$lib/stores/project';
import { timelineDate } from '$lib/stores/timeline';
import { applyWithoutDirty, markClean, resetWorkingDate } from '$lib/stores/saveStatus';
import { getActiveStore } from './datastore';

/**
 * Về lại bố cục của HÔM NAY.
 *
 * Bắt buộc phải NẠP LẠI dữ liệu, không chỉ đổi ngày đích: bố cục đang hiện
 * trên canvas là của ngày kia, giữ nguyên nó rồi lưu là ghi đè bố cục ngày
 * khác lên hôm nay.
 */
export async function backToToday(layoutId?: string): Promise<void> {
	timelineDate.set(null);
	resetWorkingDate();
	const id = layoutId ?? get(currentProject)?.id;
	if (!id) return;
	const project = await getActiveStore().load(id);
	if (!project) return;
	applyWithoutDirty(() => currentProject.set(project));
	markClean();
}
