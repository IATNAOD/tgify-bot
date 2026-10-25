import debugFactory from 'debug'

const debug = debugFactory('tgify:storage')

export const defaults = { table: 'tgify-sessions' }

/** Default `onInitError`: a failed connection must not end up as an unhandled rejection */
export const reportInitError = (store: string) => (error: unknown) => {
  debug('%s init error', store, error)
  console.error(
    `Extensions.storage.${store}(): connection or setup failed`,
    error
  )
}
