/**
 * Chạy một danh sách việc, mỗi lúc nhiều nhất `limit` việc chạy song song.
 *
 * Kết quả trả về **theo đúng thứ tự danh sách vào**, không theo thứ tự chạy xong,
 * để bảng tiến độ khớp dòng với file người dùng đã chọn.
 *
 * Một việc ném lỗi không làm hỏng cả lô: các việc còn lại vẫn chạy tiếp, và ô
 * tương ứng trong mảng kết quả nhận `{ ok: false, error }`.
 */
export type TaskResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

export async function runWithLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
  onDone?: (index: number, result: TaskResult<T>) => void,
): Promise<Array<TaskResult<T>>> {
  const results = new Array<TaskResult<T>>(tasks.length);
  let next = 0;

  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      try {
        results[i] = { ok: true, value: await tasks[i]() };
      } catch (error) {
        results[i] = { ok: false, error };
      }
      onDone?.(i, results[i]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(limit, tasks.length)) }, () => worker()),
  );
  return results;
}
