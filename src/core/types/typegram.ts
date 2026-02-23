import * as Typegram from '@tgify/types'

// internal type provisions
export * from '@tgify/types/api'
export * from '@tgify/types/inline'
export * from '@tgify/types/manage'
export * from '@tgify/types/markup'
export * from '@tgify/types/message'
export * from '@tgify/types/methods'
export * from '@tgify/types/passport'
export * from '@tgify/types/payment'
export * from '@tgify/types/settings'
export * from '@tgify/types/update'

// telegraf input file definition
interface InputFileByPath {
  source: string
  filename?: string
}
interface InputFileByReadableStream {
  source: NodeJS.ReadableStream
  filename?: string
}
interface InputFileByBuffer {
  source: Buffer
  filename?: string
}
interface InputFileByURL {
  url: string
  filename?: string
}
export type InputFile =
  | InputFileByPath
  | InputFileByReadableStream
  | InputFileByBuffer
  | InputFileByURL

export type Telegram = Typegram.ApiMethods<InputFile>

export type Opts<M extends keyof Telegram> = Typegram.Opts<InputFile>[M]
export type InputMedia = Typegram.InputMedia<InputFile>
export type InputMediaPhoto = Typegram.InputMediaPhoto<InputFile>
export type InputMediaVideo = Typegram.InputMediaVideo<InputFile>
export type InputMediaAnimation = Typegram.InputMediaAnimation<InputFile>
export type InputMediaAudio = Typegram.InputMediaAudio<InputFile>
export type InputMediaDocument = Typegram.InputMediaDocument<InputFile>
export type InputPaidMediaPhoto = Typegram.InputPaidMediaPhoto<InputFile>
export type InputPaidMediaVideo = Typegram.InputPaidMediaVideo<InputFile>
export type InputProfilePhoto = Typegram.InputProfilePhoto<InputFile>
export type InputStoryContent = Typegram.InputStoryContent<InputFile>

// tiny helper types
export type ChatAction = Opts<'sendChatAction'>['action']

/**
 * Sending video notes by a URL is currently unsupported
 */
export type InputFileVideoNote = Exclude<InputFile, InputFileByURL>
