/** 给旧测试的数据库替身补齐 SDK 的分页链能力，保持原有过滤、错误与调用记录。
 * 只在原替身没有 range 时负责切片；已有分页实现继续由原替身处理。
 */
export function pagedQueryDouble<T>(source: T): T {
  if (!source || typeof source !== "object") return source;
  const state: { range?: [number, number] } = {};
  function wrap(value: object): object {
    return new Proxy(value, {
      get(target, key, receiver) {
        const original = Reflect.get(target, key, receiver);
        if (key === "then" && typeof original === "function") {
          return (resolve: (result: unknown) => unknown, reject?: (error: unknown) => unknown) =>
            Promise.resolve(target).then((result: unknown) => {
              if (!state.range || !result || typeof result !== "object" || !("data" in result) || !Array.isArray(result.data)) return result;
              const [from, to] = state.range;
              return { ...result, data: result.data.slice(from, to + 1) };
            }).then(resolve, reject);
        }
        if (key === "range" && typeof original !== "function") {
          return (from: number, to: number) => { state.range = [from, to]; return receiver; };
        }
        if ((key === "order" || key === "abortSignal") && typeof original !== "function") return () => receiver;
        if (typeof original !== "function") return original;
        return (...args: unknown[]) => {
          const next = original.apply(target, args);
          if (key === "single" || key === "maybeSingle") return next;
          return next && typeof next === "object" ? wrap(next) : next;
        };
      },
    });
  }
  return wrap(source) as T;
}
