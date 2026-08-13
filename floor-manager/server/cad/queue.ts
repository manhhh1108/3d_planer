export type ConverterFn = (assetId: string) => Promise<void>;

/** Hàng đợi convert in-process. Converter tự lo cập nhật status trong DB. */
export class ConvertQueue {
  private pending: string[] = [];
  private runningIds = new Set<string>();

  constructor(
    private converter: ConverterFn,
    private concurrency = 2
  ) {}

  enqueue(assetId: string): void {
    if (this.pending.includes(assetId) || this.runningIds.has(assetId)) return;
    this.pending.push(assetId);
    this.drain();
  }

  private drain(): void {
    while (this.runningIds.size < this.concurrency && this.pending.length > 0) {
      const id = this.pending.shift()!;
      this.runningIds.add(id);
      this.converter(id)
        .catch(() => {
          /* converter tự ghi lỗi vào Asset; queue không dừng */
        })
        .finally(() => {
          this.runningIds.delete(id);
          this.drain();
        });
    }
  }

  /** Chờ đến khi không còn job nào (dùng cho test). */
  async idle(): Promise<void> {
    while (this.runningIds.size > 0 || this.pending.length > 0) {
      await new Promise((r) => setTimeout(r, 10));
    }
  }
}
