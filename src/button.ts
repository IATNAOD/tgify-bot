import {
  KeyboardButton,
  InlineKeyboardButton,
  KeyboardButtonRequestChat,
  KeyboardButtonRequestUsers,
} from './core/types/typegram'

type Hideable<B> = B & { hide: boolean }


export function text(
  text: string,
  hide = false,
  extra?: Pick<KeyboardButton.Text, 'style' | 'icon_custom_emoji_id'>,
): Hideable<KeyboardButton.Text> {
  return { text, hide, ...extra }
}

export function contactRequest(
  text: string,
  hide = false
): Hideable<KeyboardButton.RequestContact> {
  return { text, request_contact: true, hide }
}

export function locationRequest(
  text: string,
  hide = false
): Hideable<KeyboardButton.RequestLocation> {
  return { text, request_location: true, hide }
}

export function pollRequest(
  text: string,
  type?: 'quiz' | 'regular',
  hide = false
): Hideable<KeyboardButton.RequestPoll> {
  return { text, request_poll: { type }, hide }
}

export function userRequest(
  text: string,
  /** Must fit in a signed 32 bit int */
  request_id: number,
  extra?: Omit<KeyboardButtonRequestUsers, 'request_id' | 'text'>,
  hide = false
): Hideable<KeyboardButton.RequestUsers> {
  return {
    text,
    request_users: { request_id, ...extra },
    hide,
  }
}

export function botRequest(
  text: string,
  /** Must fit in a signed 32 bit int */
  request_id: number,
  extra?: Omit<
    KeyboardButtonRequestUsers,
    'request_id' | 'user_is_bot' | 'text'
  >,
  hide = false
): Hideable<KeyboardButton.RequestUsers> {
  return {
    text,
    request_users: { request_id, user_is_bot: true, ...extra },
    hide,
  }
}

type KeyboardButtonRequestGroup = Omit<
  KeyboardButtonRequestChat,
  'request_id' | 'chat_is_channel'
>

export function groupRequest(
  text: string,
  /** Must fit in a signed 32 bit int */
  request_id: number,
  extra?: KeyboardButtonRequestGroup,
  hide = false
): Hideable<KeyboardButton.RequestChat> {
  return {
    text,
    request_chat: { request_id, chat_is_channel: false, ...extra },
    hide,
  }
}

type KeyboardButtonRequestChannel = Omit<
  KeyboardButtonRequestChat,
  'request_id' | 'chat_is_channel' | 'chat_is_forum'
>

export function channelRequest(
  text: string,
  /** Must fit in a signed 32 bit int */
  request_id: number,
  extra?: KeyboardButtonRequestChannel,
  hide = false
): Hideable<KeyboardButton.RequestChat> {
  return {
    text,
    request_chat: { request_id, chat_is_channel: true, ...extra },
    hide,
  }
}

export function url(
  text: string,
  url: string,
  hide = false,
  extra?: Pick<InlineKeyboardButton.Url, 'style' | 'icon_custom_emoji_id'>,
): Hideable<InlineKeyboardButton.Url> {
  return { text, url, hide, ...extra }
}

export function callback(
  text: string,
  data: string,
  hide = false,
  extra?: Pick<InlineKeyboardButton.Callback, 'style' | 'icon_custom_emoji_id'>,
): Hideable<InlineKeyboardButton.Callback> {
  return { text, callback_data: data, hide, ...extra }
}

export function switchToChat(
  text: string,
  value: string,
  hide = false,
  extra?: Pick<InlineKeyboardButton.SwitchInline, 'style' | 'icon_custom_emoji_id'>,
): Hideable<InlineKeyboardButton.SwitchInline> {
  return { text, switch_inline_query: value, hide, ...extra }
}

export function switchToCurrentChat(
  text: string,
  value: string,
  hide = false,
  extra?: Pick<InlineKeyboardButton.SwitchInlineCurrentChat, 'style' | 'icon_custom_emoji_id'>,
): Hideable<InlineKeyboardButton.SwitchInlineCurrentChat> {
  return { text, switch_inline_query_current_chat: value, hide, ...extra }
}

export function game(
  text: string,
  hide = false,
  extra?: Pick<InlineKeyboardButton.Game, 'style' | 'icon_custom_emoji_id'>,
): Hideable<InlineKeyboardButton.Game> {
  return { text, callback_game: {}, hide, ...extra }
}

export function pay(
  text: string,
  hide = false,
  extra?: Pick<InlineKeyboardButton.Pay, 'style' | 'icon_custom_emoji_id'>,
): Hideable<InlineKeyboardButton.Pay> {
  return { text, pay: true, hide, ...extra }
}

export function login(
  text: string,
  url: string,
  opts: {
    forward_text?: string
    bot_username?: string
    request_write_access?: boolean
  } = {},
  hide = false,
  extra?: Pick<InlineKeyboardButton.Login, 'style' | 'icon_custom_emoji_id'>,
): Hideable<InlineKeyboardButton.Login> {
  return {
    text,
    hide,
    login_url: { ...opts, url },
    ...extra
  }
}

// works as both InlineKeyboardButton and KeyboardButton
export function webApp(
  text: string,
  url: string,
  hide = false,
  extra?: Pick<InlineKeyboardButton.WebApp, 'style' | 'icon_custom_emoji_id'>,
): Hideable<InlineKeyboardButton.WebApp> {
  return {
    text,
    hide,
    web_app: { url },
    ...extra
  }
}
