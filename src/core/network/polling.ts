import * as tg from '../types/typegram'
import * as tt from '../../telegram-types'
import AbortController from 'abort-controller'
import ApiClient from './client'
import d from 'debug'
import { promisify } from 'util'
import { TelegramError } from './error'
const debug = d('tgify:polling')
const wait = promisify(setTimeout)
function always<T>(x: T) {
  return () => x
}
const noop = always(Promise.resolve())

export class Polling {
  private readonly abortController = new AbortController()
  private skipOffsetSync = false
  private offset = 0
  private readonly inFlight = new Set<Promise<void>>()
  private failure?: { error: unknown }
  constructor(
    private readonly telegram: ApiClient,
    private readonly allowedUpdates: readonly tt.UpdateType[],
    /** Max updates handled at once. If unset, each batch is handled completely before fetching the next one */
    private readonly concurrency?: number
  ) {
    if (concurrency !== undefined && !(concurrency >= 1))
      throw new TypeError('Polling concurrency must be at least 1')
  }

  private async *[Symbol.asyncIterator]() {
    debug('Starting long polling')
    do {
      try {
        const updates = await this.telegram.callApi(
          'getUpdates',
          {
            timeout: 50,
            offset: this.offset,
            allowed_updates: this.allowedUpdates,
            limit: this.limit(),
          },
          this.abortController
        )
        const last = updates[updates.length - 1]
        if (last !== undefined) {
          this.offset = last.update_id + 1
        }
        yield updates
      } catch (error) {
        const err = error as Error & {
          parameters?: { retry_after: number }
        }

        if (err.name === 'AbortError') return
        if (
          err.name === 'FetchError' ||
          (err instanceof TelegramError && err.code === 429) ||
          (err instanceof TelegramError && err.code >= 500)
        ) {
          const retryAfter: number = err.parameters?.retry_after ?? 5
          debug('Failed to fetch updates, retrying after %ds.', retryAfter, err)
          await wait(retryAfter * 1000)
          continue
        }
        if (
          err instanceof TelegramError &&
          // Unauthorized      Conflict
          (err.code === 401 || err.code === 409)
        ) {
          this.skipOffsetSync = true
          throw err
        }
        throw err
      }
    } while (!this.abortController.signal.aborted)
  }

  /** Fetch no more updates than there are free slots; getUpdates accepts 1-100 */
  private limit() {
    if (this.concurrency === undefined) return undefined
    return Math.min(100, Math.max(1, this.concurrency - this.inFlight.size))
  }

  private async syncUpdateOffset() {
    if (this.skipOffsetSync) return
    debug('Syncing update offset...')
    await this.telegram.callApi('getUpdates', { offset: this.offset, limit: 1 })
  }

  async loop(handleUpdate: (updates: tg.Update) => Promise<void>) {
    if (this.abortController.signal.aborted)
      throw new Error('Polling instances must not be reused!')
    try {
      if (this.concurrency === undefined)
        for await (const updates of this)
          await Promise.all(updates.map(handleUpdate))
      else await this.concurrentLoop(handleUpdate, this.concurrency)
    } finally {
      debug('Long polling stopped')
      // prevent instance reuse
      this.stop()
      await this.syncUpdateOffset().catch(noop)
    }
  }

  /**
   * Keeps fetching updates while fewer than `concurrency` are being handled,
   * so one slow handler doesn't hold back the rest.
   * Fetched updates are confirmed to Telegram on the next getUpdates, before they're handled.
   */
  private async concurrentLoop(
    handleUpdate: (update: tg.Update) => Promise<void>,
    concurrency: number
  ) {
    try {
      for await (const updates of this) {
        for (const update of updates) {
          const task: Promise<void> = handleUpdate(update).then(
            () => {
              this.inFlight.delete(task)
            },
            (error: unknown) => {
              this.inFlight.delete(task)
              // fail fast like the sequential loop: stop on the first unhandled error
              this.failure ??= { error }
              this.stop()
            }
          )
          this.inFlight.add(task)
        }
        while (this.inFlight.size >= concurrency)
          await Promise.race(this.inFlight)
      }
    } finally {
      // let started handlers finish before the offset is synced
      await Promise.all(this.inFlight)
    }
    if (this.failure) throw this.failure.error
  }

  stop() {
    this.abortController.abort()
  }
}
