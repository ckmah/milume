export type CommandModel = {
  send(content: unknown, callbacks?: unknown, buffers?: ArrayBuffer[] | DataView[]): void;
  on(event: string, callback: (msg: any, buffers?: ArrayBuffer[]) => void): void;
  off?(event: string, callback: (msg: any, buffers?: ArrayBuffer[]) => void): void;
};

export declare function invokeCommand<R = { ok: boolean; status?: number; error?: string }>(
  model: CommandModel,
  name: string,
  msg: unknown,
  options?: { signal?: AbortSignal; buffers?: ArrayBuffer[] },
): Promise<[R, (ArrayBuffer | DataView)[]]>;
