import { Escaper } from './types'

/** escapeHTML borrowed from https://github.com/feathers-studio/hyperactive/blob/bbd67beace6744c4b8b48637a96c2daed416ebde/hyper/util.ts */
export const HTML: Escaper = (() => {
  const escapables = {
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
  }

  const toEscape = /<|>|&/g

  return (s) =>
    s.replace(toEscape, (r) => escapables[r as keyof typeof escapables] || r)
})()

export const MarkdownV2: Escaper = (() => {
  const escapables = {
    _: '\\_',
    '*': '\\*',
    '[': '\\[',
    ']': '\\]',
    '(': '\\(',
    ')': '\\)',
    '~': '\\~',
    '`': '\\`',
    '>': '\\>',
    '#': '\\#',
    '+': '\\+',
    '-': '\\-',
    '=': '\\=',
    '|': '\\|',
    '{': '\\{',
    '}': '\\}',
    '.': '\\.',
    '!': '\\!',
    '\\': '\\\\',
  }

  const toEscape = new RegExp(
    '[' + Object.values(escapables).join('') + ']',
    'g'
  )

  return (s) =>
    s.replace(toEscape, (r) => escapables[r as keyof typeof escapables] || r)
})()

/** Value of a double-quoted HTML attribute, e.g. `href` */
export const HTMLAttribute: Escaper = (s) => HTML(s).replace(/"/g, '&quot;')

/** URL part of a MarkdownV2 inline link: only `)` and `\` must be escaped there */
export const MarkdownV2URL: Escaper = (s) => s.replace(/[)\\]/g, '\\$&')
