import debugFactory from 'debug'
import { SessionStore } from '../../session'

import { reportInitError } from './defaults'
import { requireOptional } from './optional'

const debug = debugFactory('tgify:storage')

/** The part of a client from `createClient()` of the `redis` package that the store uses */
export interface RedisClientLike {
  readonly isOpen: boolean
  connect(): Promise<unknown>
  get(key: string): Promise<unknown>
  set(
    key: string,
    value: string,
    options?: { expiration: { type: 'PX'; value: number } }
  ): Promise<unknown>
  del(key: string): Promise<unknown>
}

interface CommonOpts {
  /** Prefix to use for session keys. Defaults to "tgify:". */
  prefix?: string
  /** Drop sessions that weren't saved for this long, in ms (expiry of the Redis key). */
  ttl?: number
  /** Called on fatal connection errors. Defaults to logging them. */
  onInitError?: (err: unknown) => void
}

interface NewClientOpts extends CommonOpts {
  /**
   * `redis[s]://[[username][:password]@][host][:port][/db-number]`
   *
   * See [`redis`](https://www.iana.org/assignments/uri-schemes/prov/redis) and [`rediss`](https://www.iana.org/assignments/uri-schemes/prov/rediss) IANA registration for more details
   */
  url?: string
  /**
   * `RedisClientOptions` of the `redis` package, except `url`.
   *
   * Remember to install the db driver: `npm install redis`.
   */
  config?: object
}

interface ExistingClientOpts extends CommonOpts {
  /** If passed, we'll reuse this client instead of creating our own. It's connected unless it's open already. */
  client: RedisClientLike
}

/**
 * Session store backed by Redis. Needs the `redis` package to be installed separately.
 * @unstable
 */
export function Redis<Session>(opts: NewClientOpts): SessionStore<Session>
export function Redis<Session>(opts: ExistingClientOpts): SessionStore<Session>
export function Redis<Session>(
  opts: NewClientOpts | ExistingClientOpts
): SessionStore<Session> {
  const { ttl } = opts

  // reported once: node-redis retries a failed connection and repeats the error on every attempt
  let initErrorReported = false
  const onInitError = (error: unknown) => {
    if (initErrorReported) return debug('Redis client error', error)
    initErrorReported = true
    ;(opts.onInitError ?? reportInitError('Redis'))(error)
  }

  let client: RedisClientLike
  if ('client' in opts) client = opts.client
  else {
    const { createClient } = requireOptional<typeof import('redis')>(
      'redis',
      'Extensions.storage.Redis()'
    )
    const created = createClient({
      ...(opts.config as import('redis').RedisClientOptions),
      url: opts.url,
    })
    // without an 'error' listener node-redis ends the process on a lost connection;
    // depending on the version, a failed first connection shows up only here
    created.on('error', (error: unknown) =>
      created.isReady ? debug('Redis client error', error) : onInitError(error)
    )
    client = created
  }

  // connecting a client that is open already throws
  const connection = client.isOpen ? Promise.resolve() : client.connect()
  connection.catch(onInitError)

  const prefix = opts.prefix || 'tgify:'

  return {
    async get(key) {
      await connection
      const value = await client.get(prefix + key)
      return typeof value === 'string' ? JSON.parse(value) : undefined
    },
    async set(key: string, session: Session) {
      await connection
      return await client.set(
        prefix + key,
        JSON.stringify(session),
        ttl === undefined
          ? undefined
          : { expiration: { type: 'PX', value: ttl } }
      )
    },
    async delete(key: string) {
      await connection
      return await client.del(prefix + key)
    },
  }
}
