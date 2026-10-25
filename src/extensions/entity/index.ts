import type { Message, TextMessage, Tree, MessageEntity } from './types'
import * as serialisers from './serialisers'
import { Parser } from './parser/index'
import * as escapers from './escapers'

export const parse_html = Parser.parse_html
export const parse_markdown = Parser.parse_markdown

// https://github.com/tdlib/td/blob/721300bcb4d0f2114505712f4dc6350af1ce1a09/td/telegram/MessageEntity.cpp#L39
const TYPE_PRIORITY: Record<MessageEntity['type'], number> = {
  mention: 50,
  hashtag: 50,
  bot_command: 50,
  url: 50,
  email: 50,
  bold: 90,
  italic: 91,
  code: 20,
  pre: 11,
  text_link: 49,
  text_mention: 49,
  cashtag: 50,
  phone_number: 50,
  underline: 92,
  strikethrough: 93,
  blockquote: 0,
  spoiler: 94,
  custom_emoji: 99,
  expandable_blockquote: 0,
  // not in tdlib's list; uses the custom emoji syntax in MarkdownV2, so it nests the same way
  date_time: 99,
}

function findChildren(
  fromEntityIndex: number,
  parent: MessageEntity,
  entities: MessageEntity[]
) {
  const ret: MessageEntity[] = []

  for (let i = fromEntityIndex + 1; i < entities.length; i++) {
    const entity = entities[i]

    if (
      !entity ||
      entity.offset + entity.length > parent.offset + parent.length
    )
      break

    ret.push(entity)
  }

  return ret
}

const ends = (entity: MessageEntity) => entity.offset + entity.length

export function toTree(msg: TextMessage, offset = 0, upto = Infinity) {
  if (!msg.entities?.length) return [msg.text.slice(offset, upto)]

  const entities = msg.entities!
  const nodes: Tree = []

  let last = offset

  let i = 0
  while (i < entities.length) {
    const entity = entities[i]!

    if (last < entity.offset) {
      nodes.push(msg.text.slice(last, entity.offset))
      last = entity.offset
    }

    const children = findChildren(i, entity, msg.entities)
    const node = {
      ...entity,
      text: msg.text.slice(entity.offset, ends(entity)),
      children: toTree(
        { text: msg.text, entities: children },
        entity.offset,
        ends(entity)
      ),
    }

    last = ends(node)

    nodes.push(node)
    i += children.length + 1
  }

  if (last < upto) {
    const final = msg.text.slice(last, upto)
    if (final) nodes.push(final)
  }

  return nodes
}

const serialse = (
  tree: Tree,
  serialiser: typeof serialisers.HTML,
  escaper: typeof escapers.HTML
) => {
  let ret = ''
  for (const node of tree) {
    if (typeof node === 'string') ret += escaper(node)
    else ret += serialiser(serialse(node.children, serialiser, escaper), node)
  }
  return ret
}

// outer entities first: by offset, then longer, then by tdlib priority
const compareEntities = (a: MessageEntity, b: MessageEntity) => {
  if (a.offset < b.offset) return -1
  if (a.offset > b.offset) return 1
  if (a.length > b.length) return -1
  if (a.length < b.length) return 1
  const a_priority = TYPE_PRIORITY[a.type]
  const b_priority = TYPE_PRIORITY[b.type]
  if (a_priority < b_priority) return -1
  if (a_priority > b_priority) return 1
  return 0
}

type EntityAttributes = {
  url?: string
  language?: string
  user?: { id: number }
}

// entities may be merged only if they differ in range alone, e.g. not links to different URLs
const sameKind = (a: MessageEntity, b: MessageEntity) => {
  const x = a as MessageEntity & EntityAttributes
  const y = b as MessageEntity & EntityAttributes
  return (
    x.type === y.type &&
    x.url === y.url &&
    x.language === y.language &&
    x.user?.id === y.user?.id
  )
}

/** Merges overlapping or adjacent entities of the same kind; custom emoji and dates are kept as is */
const optimizeEntities = (entities: MessageEntity[]) => {
  // filter copies the array, so the caller's entities aren't reordered
  const sorted = entities
    .filter((entity) => entity.length > 0)
    .sort((a, b) => a.offset - b.offset)

  const optimizedEntities: MessageEntity[] = []
  let currentEntity: MessageEntity | null = null

  for (const entity of sorted) {
    if (entity.type == 'custom_emoji' || entity.type == 'date_time') {
      optimizedEntities.push(entity)

      continue
    }

    if (
      currentEntity &&
      sameKind(currentEntity, entity) &&
      ends(currentEntity) >= entity.offset
    ) {
      currentEntity.length =
        Math.max(ends(currentEntity), ends(entity)) - currentEntity.offset
    } else {
      if (currentEntity) {
        optimizedEntities.push(currentEntity)
      }

      currentEntity = { ...entity }
    }
  }

  if (currentEntity) {
    optimizedEntities.push(currentEntity)
  }

  return optimizedEntities
}

/**
 * Telegram allows entities to overlap, but markup must nest: an entity crossing the end
 * of an enclosing one is split there, otherwise toTree would repeat the overlapped text.
 */
const nestEntities = (entities: MessageEntity[]) => {
  const queue = [...entities].sort(compareEntities)
  const nested: MessageEntity[] = []
  const open: MessageEntity[] = []

  for (let entity = queue.shift(); entity; entity = queue.shift()) {
    while (open.length && ends(open[open.length - 1]!) <= entity.offset)
      open.pop()

    const parent = open[open.length - 1]
    if (parent && ends(entity) > ends(parent)) {
      const tail = {
        ...entity,
        offset: ends(parent),
        length: ends(entity) - ends(parent),
      }
      const index = queue.findIndex(
        (queued) => compareEntities(queued, tail) > 0
      )
      queue.splice(index === -1 ? queue.length : index, 0, tail)
      entity = { ...entity, length: ends(parent) - entity.offset }
    }

    nested.push(entity)
    open.push(entity)
  }

  return nested
}

const serialiseWith =
  (serialiser: typeof serialisers.HTML, escaper: typeof escapers.HTML) =>
  (message: Message): string => {
    const text = 'text' in message ? message.text : message.caption || ''
    const entities =
      'text' in message ? message.entities : message.caption_entities
    if (!entities || entities.length === 0) return escaper(text)

    const nested = nestEntities(optimizeEntities(entities))

    return serialse(toTree({ text, entities: nested }), serialiser, escaper)
  }

const toHTML = serialiseWith(serialisers.HTML, escapers.HTML)

/**
 * MarkdownV2 reads `___` as underline first, so italic closing right before underline
 * needs an empty bold entity in between: https://core.telegram.org/bots/api#markdownv2-style
 */
const toMarkdownV2 = (message: Message) =>
  serialiseWith(
    serialisers.MarkdownV2,
    escapers.MarkdownV2
  )(message).replace(/___(.*?)___/g, '___$1_**__')

export { serialisers, escapers, serialiseWith, toHTML, toMarkdownV2 }
