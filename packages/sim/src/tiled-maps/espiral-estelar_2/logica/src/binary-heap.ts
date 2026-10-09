export class BinaryHeap<T> {
  private readonly items: T[] = [];

  constructor(private readonly compare: (a: T, b: T) => number) {}

  get size(): number {
    return this.items.length;
  }

  push(item: T): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): T | undefined {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0 && last !== undefined) {
      this.items[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(index: number): void {
    let child = index;
    while (child > 0) {
      const parent = (child - 1) >> 1;
      if (!this.isBefore(child, parent)) return;
      this.swap(child, parent);
      child = parent;
    }
  }

  private sinkDown(index: number): void {
    let parent = index;
    for (;;) {
      const smallest = [2 * parent + 1, 2 * parent + 2]
        .filter((child) => child < this.items.length)
        .reduce((best, child) => (this.isBefore(child, best) ? child : best), parent);
      if (smallest === parent) return;
      this.swap(parent, smallest);
      parent = smallest;
    }
  }

  private isBefore(a: number, b: number): boolean {
    return this.compare(this.items[a] as T, this.items[b] as T) < 0;
  }

  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b] as T, this.items[a] as T];
  }
}
