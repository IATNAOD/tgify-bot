import debugFactory from 'debug'

const debug = debugFactory('tgify:storage')

/** Version range of a peer dependency as declared in the package.json of this package */
function peerRange(name: string): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../../../package.json') as {
      peerDependencies?: Record<string, string>
    }
    return pkg.peerDependencies?.[name]
  } catch {
    return undefined
  }
}

function isMissing(error: unknown, name: string) {
  const { code, message } = (error ?? {}) as {
    code?: unknown
    message?: unknown
  }
  // a module missing inside the package itself is a different problem
  return (
    code === 'MODULE_NOT_FOUND' &&
    typeof message === 'string' &&
    message.includes(`'${name}'`)
  )
}

/**
 * Loads an optional peer dependency when a feature needs it, so the package itself
 * doesn't depend on drivers most users don't need.
 * Throws an error explaining how to install the dependency if it's missing.
 */
export function requireOptional<T>(name: string, feature: string): T {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(name) as T
  } catch (error) {
    if (!isMissing(error, name)) throw error
    const range = peerRange(name)
    const message = `${feature} needs the "${name}" package. Install it: npm install ${range ? `${name}@${range}` : name}`
    debug(message)
    throw new Error(message)
  }
}
