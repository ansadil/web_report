import type { DataAdapter } from './types.js';

export class DataAdapterRegistry {
  private readonly adapters = new Map<string, DataAdapter>();

  register(adapter: DataAdapter): void {
    if (this.adapters.has(adapter.id)) {
      throw new Error(`Data adapter already registered: ${adapter.id}`);
    }
    this.adapters.set(adapter.id, adapter);
  }

  replace(adapter: DataAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  get(id: string): DataAdapter {
    const a = this.adapters.get(id);
    if (!a) throw new Error(`No data adapter registered with id "${id}". Available: ${[...this.adapters.keys()].join(', ') || '(none)'}`);
    return a;
  }

  has(id: string): boolean {
    return this.adapters.has(id);
  }

  list(): readonly string[] {
    return [...this.adapters.keys()];
  }
}
