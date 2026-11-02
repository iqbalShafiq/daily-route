/**
 * What the monitor is doing, for the rider to read while it works.
 *
 * The log lives in the worker process. The API forwards it as a stream.
 */

export type ActivityEvent = {
  at: string;
  phase: "fetch" | "classify" | "stored" | "idle" | "error";
  source: "x" | "news" | "monitor";
  message: string;
};

export class ActivityLog {
  readonly #events: ActivityEvent[] = [];
  readonly #listeners = new Set<(event: ActivityEvent) => void>();

  recent(): readonly ActivityEvent[] {
    return this.#events;
  }

  push(event: Omit<ActivityEvent, "at">): ActivityEvent {
    const full: ActivityEvent = { ...event, at: new Date().toISOString() };
    this.#events.push(full);
    if (this.#events.length > 40) this.#events.shift();
    for (const listener of this.#listeners) listener(full);
    return full;
  }

  subscribe(listener: (event: ActivityEvent) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }
}
