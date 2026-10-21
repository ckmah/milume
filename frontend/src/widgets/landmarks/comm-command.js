function randomId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

/**
 * Call an anywidget ``@command`` over ``msg:custom``. Resolves ``[response, buffers]``
 * when the kernel replies with the matching id; rejects on abort (default 120 s).
 */
export function invokeCommand(model, name, msg, options = {}) {
  const id = randomId();
  const signal = options.signal ?? AbortSignal.timeout(120_000);
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const handler = (raw, buffers) => {
      if (raw?.id !== id) return;
      model.off?.("msg:custom", handler);
      resolve([raw.response ?? { ok: false }, buffers ?? []]);
    };
    const onAbort = () => {
      model.off?.("msg:custom", handler);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    model.on("msg:custom", handler);
    model.send({ id, kind: "anywidget-command", name, msg }, undefined, options.buffers ?? []);
  });
}
