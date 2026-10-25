import debugFactory from 'debug'

import { MemorySessionStore, type SessionStore } from '../../session'
import type { MiddlewareFn } from '../../middleware'
import type { Context } from '../../context'

const debug = debugFactory('tgify:ratelimit')

export interface RateLimitState {
  /** Updates counted in the current window */
  count: number
  /** When the current window ends, unix time in ms */
  resetAt: number
}

export interface RateLimitOptions<C extends Context = Context> {
  /** Window length in ms. Defaults to 1000. */
  window?: number
  /** Updates allowed per window and key. Defaults to 1. */
  limit?: number
  /** Updates with the same key are counted together. Defaults to the sender, `ctx.from.id`; updates without a key aren't limited. */
  keyGenerator?: (ctx: C) => string | number | undefined | null
  /** Called instead of the rest of the chain when the limit is exceeded. Defaults to dropping the update. */
  onLimitExceeded?: (ctx: C, next: () => Promise<void>) => unknown
  /**
   * Where the counters live. Defaults to memory: `MemorySessionStore` with `window` as ttl, so stale keys are swept.
   *
   * Pass a shared store to limit across several bot instances, e.g.
   * `Extensions.storage.Redis({ prefix: 'tgify:ratelimit:', ttl: window })`.
   * Instances don't lock the store, so at the same moment they may let a few extra updates through.
   */
  store?: SessionStore<RateLimitState>
}

/**
 * Lets at most `limit` updates with the same key through per `window` ms (fixed window).
 * Doesn't need `session()`.
 */
export default function ratelimit<C extends Context = Context>(
  options: RateLimitOptions<C> = {}
): MiddlewareFn<C> {
  const window = options.window ?? 1000
  const limit = options.limit ?? 1
  const keyGenerator = options.keyGenerator ?? ((ctx: C) => ctx.from?.id)
  const onLimitExceeded = options.onLimitExceeded ?? (() => undefined)
  const store = options.store ?? new MemorySessionStore<RateLimitState>(window)
  // updates with the same key are counted one after another, so concurrent ones aren't lost
  const queues = new Map<string, Promise<unknown>>()

  const count = async (key: string) => {
    const stored = await store.get(key)
    const now = Date.now()
    const state =
      stored && now < stored.resetAt
        ? { count: stored.count + 1, resetAt: stored.resetAt }
        : { count: 1, resetAt: now + window }
    await store.set(key, state)
    return state.count
  }

  return async (ctx, next) => {
    const id = keyGenerator(ctx)
    if (id === undefined || id === null) return next()
    const key = String(id)

    const counted = (queues.get(key) ?? Promise.resolve()).then(() =>
      count(key)
    )
    const queued = counted.catch(() => undefined)
    queues.set(key, queued)
    let hits: number
    try {
      hits = await counted
    } finally {
      if (queues.get(key) === queued) queues.delete(key)
    }

    debug('%s: %d of %d', key, hits, limit)
    return hits <= limit ? next() : onLimitExceeded(ctx, next)
  }
}
