import { AsyncLocalStorage } from "node:async_hooks";

// Which trip and match a model call is for, without every call site passing it
// through a domain port that has no business knowing. The use case that has the
// ids wraps its call; `generateJson` reads them when it writes the `model_call`
// row. Outside a wrapper both are null — spend that belongs to no trip, like
// reading a news item, is still spend.

export type ModelRefs = { tripId?: string; matchId?: string };

const store = new AsyncLocalStorage<ModelRefs>();

export const withModelRefs = <T>(refs: ModelRefs, run: () => Promise<T>) =>
  store.run(refs, run);

export const currentModelRefs = (): ModelRefs => store.getStore() ?? {};
