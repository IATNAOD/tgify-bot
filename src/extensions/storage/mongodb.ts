import { defaults, reportInitError } from './defaults'
import { SessionStore } from '../../session'
import { requireOptional } from './optional'

/** The part of a `MongoClient` from the `mongodb` package that the store uses */
export interface MongoClientLike {
  connect(): Promise<unknown>
  db(name?: string): {
    collection(name: string): {
      findOne(filter: object): Promise<unknown>
      updateOne(
        filter: object,
        update: object,
        options?: object
      ): Promise<unknown>
      deleteOne(filter: object): Promise<unknown>
      createIndex(
        index: Record<string, number>,
        options?: object
      ): Promise<unknown>
    }
  }
}

interface CommonOpts {
  /** The name of the database we want to use. If not provided, database name will be taken from connection string. */
  database?: string
  /**
   * MongoDB collection name to use for sessions. Defaults to "tgify-sessions".
   *
   * Sessions are looked up by `key`: for big collections, consider an index `{ key: 1 }`.
   */
  collection?: string
  /**
   * Drop sessions that weren't saved for this long, in ms.
   * Creates a TTL index on the `expiresAt` field of the collection.
   */
  ttl?: number
  /** Called on fatal connection or setup errors. Defaults to logging them. */
  onInitError?: (err: unknown) => void
}

interface NewClientOpts extends CommonOpts {
  /** MongoDB connection URL; required. */
  url: string
  /**
   * MongoDB `MongoClientOptions`.
   *
   * Remember to install the db driver: `npm install mongodb`.
   *
   * @see {@link https://www.mongodb.com/docs/drivers/node/current/fundamentals/connection/connection-options MongoDB | Connection Options}
   * */
  config?: object
}

interface ExistingClientOpts extends CommonOpts {
  /** If passed, we'll reuse this `MongoClient` instead of creating our own. */
  client: MongoClientLike
}

interface SessionDoc<Session> {
  key: string
  session: Session
  expiresAt?: Date
}

/**
 * Session store backed by MongoDB. Needs the `mongodb` package to be installed separately.
 * @unstable
 */
export function Mongo<Session>(opts: NewClientOpts): SessionStore<Session>
export function Mongo<Session>(opts: ExistingClientOpts): SessionStore<Session>
export function Mongo<Session>(
  opts: NewClientOpts | ExistingClientOpts
): SessionStore<Session> {
  const onInitError = opts.onInitError ?? reportInitError('Mongo')
  const { ttl } = opts

  let client: MongoClientLike
  let connection: Promise<unknown> | undefined

  if ('client' in opts) client = opts.client
  else {
    const { MongoClient } = requireOptional<typeof import('mongodb')>(
      'mongodb',
      'Extensions.storage.Mongo()'
    )
    client = new MongoClient(
      opts.url,
      opts.config as import('mongodb').MongoClientOptions
    )
    connection = client.connect()
    connection.catch(onInitError)
  }

  const collection = client
    .db(opts.database)
    .collection(opts.collection ?? defaults.table)

  if (ttl !== undefined)
    Promise.resolve(connection)
      .then(
        () =>
          collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
        // a failed connection is already reported above
        () => undefined
      )
      .catch(onInitError)

  return {
    async get(key) {
      // since we synchronously return store instance
      await connection
      const doc = (await collection.findOne({
        key,
      })) as SessionDoc<Session> | null
      // MongoDB removes expired documents once a minute, so they may still be found
      if (doc?.expiresAt && doc.expiresAt.getTime() <= Date.now())
        return undefined
      return doc?.session
    },
    async set(key: string, session: Session) {
      await connection
      const update =
        ttl === undefined
          ? { $set: { key, session }, $unset: { expiresAt: '' } }
          : { $set: { key, session, expiresAt: new Date(Date.now() + ttl) } }
      await collection.updateOne({ key }, update, { upsert: true })
    },
    async delete(key: string) {
      await connection
      await collection.deleteOne({ key })
    },
  }
}
