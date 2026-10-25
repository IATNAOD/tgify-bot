/* eslint @typescript-eslint/restrict-template-expressions: [ "error", { "allowNumber": true, "allowBoolean": true } ] */
import * as crypto from 'crypto'
import * as fs from 'fs'
import { stat, realpath } from 'fs/promises'
import * as http from 'http'
import * as https from 'https'
import * as path from 'path'
import fetch, { RequestInit } from 'node-fetch'
import { hasProp } from '../helpers/check'
import { InputFile, Opts, Telegram } from '../types/typegram'
import { AbortSignal } from 'abort-controller'
import { compactOptions } from '../helpers/compact'
import MultipartStream from './multipart-stream'
import TelegramError from './error'
import { URL } from 'url'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const debug = require('debug')('tgify:client')
const { isStream } = MultipartStream

const WEBHOOK_REPLY_METHOD_ALLOWLIST = new Set<keyof Telegram>([
  'answerCallbackQuery',
  'answerInlineQuery',
  'deleteMessage',
  'leaveChat',
  'sendChatAction',
])

namespace ApiClient {
  export type Agent = http.Agent | ((parsedUrl: URL) => http.Agent) | undefined
  export interface Options {
    /**
     * Agent for communicating with the bot API.
     */
    agent?: http.Agent
    /**
     * Agent for attaching files via URL.
     * 1. Not all agents support both `http:` and `https:`.
     * 2. When passing a function, create the agents once, outside of the function.
     *    Creating new agent every request probably breaks `keepAlive`.
     */
    attachmentAgent?: Agent
    apiRoot: string
    /**
     * @default 'bot'
     * @see https://github.com/tdlight-team/tdlight-telegram-bot-api#user-mode
     */
    apiMode: 'bot' | 'user'
    webhookReply: boolean
    testEnv: boolean
  }

  export interface CallApiOptions {
    signal?: AbortSignal
  }
}

const DEFAULT_EXTENSIONS: Record<string, string | undefined> = {
  audio: 'mp3',
  photo: 'jpg',
  sticker: 'webp',
  video: 'mp4',
  animation: 'mp4',
  video_note: 'mp4',
  voice: 'ogg',
  live_photo: 'mp4',
}

/**
 * Fields that hold a file inside nested objects such as `InputMedia`, `InputPaidMedia`,
 * `InputPollMedia`, `InputProfilePhoto`, `InputStoryContent` and `InputSticker`.
 * Nested files can only be uploaded as separate parts referenced via `attach://`.
 */
const NESTED_FILE_FIELDS = new Set([
  'media',
  'thumb',
  'cover',
  'photo',
  'video',
  'sticker',
  'thumbnail',
  'animation',
])

const DEFAULT_OPTIONS: ApiClient.Options = {
  apiRoot: 'https://api.telegram.org',
  apiMode: 'bot',
  webhookReply: true,
  agent: new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 10000,
  }),
  attachmentAgent: undefined,
  testEnv: false,
}

// typed objects (InputMedia, InlineQueryResult, ...) may have a `url`, but are never files
function isInputFile(value: unknown): value is InputFile {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !hasProp(value, 'type') &&
    ((hasProp(value, 'source') && !!value.source) ||
      (hasProp(value, 'url') && !!value.url))
  )
}

// streams and buffers are class instances, so they are never walked into
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function includesNestedMedia(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(includesNestedMedia)
  if (!isPlainObject(value)) return false
  return Object.entries(value).some(
    ([key, field]) =>
      (NESTED_FILE_FIELDS.has(key) && isInputFile(field)) ||
      includesNestedMedia(field)
  )
}

function includesMedia(payload: Record<string, unknown>) {
  return Object.entries(payload).some(([key, value]) => {
    // has a `url` that is not a file
    if (key === 'link_preview_options') return false

    return isInputFile(value) || includesNestedMedia(value)
  })
}

function replacer(_: unknown, value: unknown) {
  if (value == null) return undefined
  return value
}

function buildJSONConfig(payload: unknown): Promise<RequestInit> {
  return Promise.resolve({
    method: 'POST',
    compress: true,
    headers: { 'content-type': 'application/json', connection: 'keep-alive' },
    body: JSON.stringify(payload, replacer),
  })
}

const FORM_DATA_JSON_FIELDS = [
  'results',
  'reply_markup',
  'mask_position',
  'shipping_options',
  'errors',
] as const

async function buildFormDataConfig(
  payload: Opts<keyof Telegram>,
  agent: ApiClient.Agent
) {
  for (const field of FORM_DATA_JSON_FIELDS) {
    if (hasProp(payload, field) && typeof payload[field] !== 'string') {
      payload[field] = JSON.stringify(payload[field])
    }
  }
  const boundary = crypto.randomBytes(32).toString('hex')
  const formData = new MultipartStream(boundary)
  await Promise.all(
    Object.keys(payload).map((key) =>
      // @ts-expect-error payload[key] can obviously index payload, but TS doesn't trust us
      attachFormValue(formData, key, payload[key], agent)
    )
  )
  return {
    method: 'POST',
    compress: true,
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      connection: 'keep-alive',
    },
    body: formData,
  }
}

async function attachFormValue(
  form: MultipartStream,
  id: string,
  value: unknown,
  agent: ApiClient.Agent
) {
  if (value == null) {
    return
  }
  if (
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    form.addPart({
      headers: { 'content-disposition': `form-data; name="${id}"` },
      body: `${value}`,
    })
    return
  }
  if ((id === 'thumb' || id === 'thumbnail') && isInputFile(value)) {
    const attachmentId = crypto.randomBytes(16).toString('hex')
    await attachFormMedia(form, value, attachmentId, agent)
    return form.addPart({
      headers: { 'content-disposition': `form-data; name="${id}"` },
      body: `attach://${attachmentId}`,
    })
  }
  if (isInputFile(value)) {
    return await attachFormMedia(form, value, id, agent)
  }
  // any other object or array is sent as JSON, with its nested files as separate parts
  return form.addPart({
    headers: { 'content-disposition': `form-data; name="${id}"` },
    body: JSON.stringify(await attachNestedMedia(form, value, agent), replacer),
  })
}

/** Uploads files found in nested objects, replacing them with `attach://` references */
async function attachNestedMedia(
  form: MultipartStream,
  value: unknown,
  agent: ApiClient.Agent
): Promise<unknown> {
  if (Array.isArray(value)) {
    return await Promise.all(
      value.map((item) => attachNestedMedia(form, item, agent))
    )
  }
  if (!isPlainObject(value)) return value
  const entries = await Promise.all(
    Object.entries(value).map(async ([key, field]) => {
      if (!NESTED_FILE_FIELDS.has(key) || !isInputFile(field)) {
        return [key, await attachNestedMedia(form, field, agent)]
      }
      const attachmentId = crypto.randomBytes(16).toString('hex')
      await attachFormMedia(form, field, attachmentId, agent)
      // `thumb` was renamed to `thumbnail` in Bot API 6.6
      const name = key === 'thumb' ? 'thumbnail' : key
      return [name, `attach://${attachmentId}`]
    })
  )
  return Object.fromEntries(entries)
}

async function attachFormMedia(
  form: MultipartStream,
  media: InputFile,
  id: string,
  agent: ApiClient.Agent
) {
  let fileName = media.filename ?? `${id}.${DEFAULT_EXTENSIONS[id] ?? 'dat'}`
  if ('url' in media && media.url !== undefined) {
    const timeout = 500_000 // ms
    const res = await fetch(media.url, { agent, timeout })
    return form.addPart({
      headers: {
        'content-disposition': `form-data; name="${id}"; filename="${fileName}"`,
      },
      body: res.body,
    })
  }
  if ('source' in media && media.source) {
    let mediaSource = media.source
    if (typeof media.source === 'string') {
      const source = await realpath(media.source)
      if ((await stat(source)).isFile()) {
        fileName = media.filename ?? path.basename(media.source)
        mediaSource = await fs.createReadStream(media.source)
      } else {
        throw new TypeError(`Unable to upload '${media.source}', not a file`)
      }
    }
    if (isStream(mediaSource) || Buffer.isBuffer(mediaSource)) {
      form.addPart({
        headers: {
          'content-disposition': `form-data; name="${id}"; filename="${fileName}"`,
        },
        body: mediaSource,
      })
    }
  }
}

async function answerToWebhook(
  response: Response,
  payload: Opts<keyof Telegram>,
  options: ApiClient.Options
): Promise<true> {
  if (!includesMedia(payload)) {
    if (!response.headersSent) {
      response.setHeader('content-type', 'application/json')
    }
    response.end(JSON.stringify(payload), 'utf-8')
    return true
  }

  const { headers, body } = await buildFormDataConfig(
    payload,
    options.attachmentAgent
  )
  if (!response.headersSent) {
    for (const [key, value] of Object.entries(headers)) {
      response.setHeader(key, value)
    }
  }
  await new Promise((resolve) => {
    response.on('finish', resolve)
    body.pipe(response)
  })
  return true
}

function redactToken(error: Error): never {
  error.message = error.message.replace(
    /\/(bot|user)(\d+):[^/]+\//,
    '/$1$2:[REDACTED]/'
  )
  throw error
}

type Response = http.ServerResponse
class ApiClient {
  readonly options: ApiClient.Options

  constructor(
    readonly token: string,
    options?: Partial<ApiClient.Options>,
    private readonly response?: Response
  ) {
    this.options = {
      ...DEFAULT_OPTIONS,
      ...compactOptions(options),
    }
    if (this.options.apiRoot.startsWith('http://')) {
      this.options.agent = undefined
    }
  }

  /**
   * If set to `true`, first _eligible_ call will avoid performing a POST request.
   * Note that such a call:
   * 1. cannot report errors or return meaningful values,
   * 2. resolves before bot API has a chance to process it,
   * 3. prematurely confirms the update as processed.
   *
   * https://core.telegram.org/bots/faq#how-can-i-make-requests-in-response-to-updates
   * https://github.com/telegraf/telegraf/pull/1250
   */
  set webhookReply(enable: boolean) {
    this.options.webhookReply = enable
  }

  get webhookReply() {
    return this.options.webhookReply
  }

  async callApi<M extends keyof Telegram>(
    method: M,
    payload: Opts<M>,
    { signal }: ApiClient.CallApiOptions = {}
  ): Promise<ReturnType<Telegram[M]>> {
    const { token, options, response } = this

    if (
      options.webhookReply &&
      response?.writableEnded === false &&
      WEBHOOK_REPLY_METHOD_ALLOWLIST.has(method)
    ) {
      debug('Call via webhook', method, payload)
      // @ts-expect-error using webhookReply is an optimisation that doesn't respond with normal result
      // up to the user to deal with this
      return await answerToWebhook(response, { method, ...payload }, options)
    }

    if (!token) {
      throw new TelegramError({
        error_code: 401,
        description: 'Bot Token is required',
      })
    }

    debug('HTTP call', method, payload)

    const config: RequestInit = includesMedia(payload)
      ? await buildFormDataConfig(
          { method, ...payload },
          options.attachmentAgent
        )
      : await buildJSONConfig(payload)
    const apiUrl = new URL(
      `./${options.apiMode}${token}${options.testEnv ? '/test' : ''}/${method}`,
      options.apiRoot
    )
    config.agent = options.agent
    // @ts-expect-error AbortSignal shim is missing some props from Request.AbortSignal
    config.signal = signal
    config.timeout = 500_000 // ms
    const res = await fetch(apiUrl, config).catch(redactToken)
    if (res.status >= 500) {
      const errorPayload = {
        error_code: res.status,
        description: res.statusText,
      }
      throw new TelegramError(errorPayload, { method, payload })
    }
    const data = await res.json()
    if (!data.ok) {
      debug('API call failed', data)
      throw new TelegramError(data, { method, payload })
    }
    return data.result
  }
}

export default ApiClient
