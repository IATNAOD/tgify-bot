<header>

<div align="center">
<h1 align="center">tgify</h1>

<p>Modern Telegram Bot API framework for Node.js</p>

<i>This is a fork of the Telegraf library and its continuation as I envision it. I will do my best to maintain full compatibility so that anyone who lacks certain functionality can migrate to this solution quickly and without friction.</i>

<a href="https://core.telegram.org/bots/api">
	<img src="https://img.shields.io/badge/Bot%20API-v7.1-f36caf.svg?style=flat-square" alt="Bot API Version" />
</a>
<a href="https://packagephobia.com/result?p=@tgify/tgify,node-telegram-bot-api">
	<img src="https://flat.badgen.net/packagephobia/install/@tgify/tgify" alt="install size" />
</a>
<a href="https://github.com/IATNAOD/tgify">
	<img src="https://img.shields.io/github/languages/top/IATNAOD/tgify?style=flat-square&logo=github" alt="GitHub top language" />
</a>
</div>

</header>

## Introduction

Bots are special [Telegram](https://telegram.org) accounts designed to handle messages automatically.
Users can interact with bots by sending them command messages in private or group chats.
These accounts serve as an interface for code running somewhere on your server.

Tgify is a library that makes it simple for you to develop your own Telegram bots using JavaScript or [TypeScript](https://www.typescriptlang.org/).

### Release-notes

- Version [1.0.0](https://github.com/IATNAOD/tgify/tree/main/release-notes/1.0.0.md) from 18.02.26

### Features

- Full [Telegram Bot API 7.1](https://core.telegram.org/bots/api) support
- [Excellent TypeScript typings](https://github.com/IATNAOD/tgify/releases/tag/v4.0.0)
- [Lightweight](https://packagephobia.com/result?p=@tgify/tgify,node-telegram-bot-api)
- [AWS **λ**](https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-handler.html)
  / [Firebase](https://firebase.google.com/products/functions/)
  / [Glitch](https://glitch.com/edit/#!/dashing-light)
  / [Fly.io](https://fly.io/docs/languages-and-frameworks/node)
  / Whatever ready
- `http/https/fastify/Connect.js/express.js` compatible webhooks
- Extensible

### Example

```js
const { Tgify } = require('@tgify/tgify')
const { message } = require('@tgify/tgify/filters')

const bot = new Tgify(process.env.BOT_TOKEN)
bot.start((ctx) => ctx.reply('Welcome'))
bot.help((ctx) => ctx.reply('Send me a sticker'))
bot.on(message('sticker'), (ctx) => ctx.reply('👍'))
bot.hears('hi', (ctx) => ctx.reply('Hey there'))
bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
```

The `Telegraf` class can also be used, it will replicate all the basic functionality:

```js
const { Telegraf } = require('@tgify/tgify')

const bot = new Telegraf(process.env.BOT_TOKEN)
bot.command('oldschool', (ctx) => ctx.reply('Hello'))
bot.command('hipster', Telegraf.reply('λ'))
bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
```

For additional bot examples see the new [`docs repo`](https://github.com/feathers-studio/telegraf-docs/).

### Resources

- [Getting started](#getting-started)
- [GitHub Discussions](https://github.com/IATNAOD/tgify/discussions)
- [Dependent repositories](https://libraries.io/npm/@tgify/tgify/dependent_repositories)

## Getting started

### Telegram token

To use the [Telegram Bot API](https://core.telegram.org/bots/api),
you first have to [get a bot account](https://core.telegram.org/bots)
by [chatting with BotFather](https://core.telegram.org/bots#6-botfather).

BotFather will give you a _token_, something like `123456789:AbCdefGhIJKlmNoPQRsTUVwxyZ`.

### Installation

```shellscript
$ npm install @tgify/tgify
```

or

```shellscript
$ yarn add @tgify/tgify
```

or

```shellscript
$ pnpm add @tgify/tgify
```

### `Tgify` class

[`Tgify`] instance represents your bot. It's responsible for obtaining updates and passing them to your handlers.

Start by [listening to commands](https://telegraf.js.org/classes/Telegraf-1.html#command) and [launching](https://telegraf.js.org/classes/Telegraf-1.html#launch) your bot.

### `Context` class

`ctx` you can see in every example is a [`Context`] instance.
[`Tgify`] creates one for each incoming update and passes it to your middleware.
It contains the `update`, `botInfo`, and `telegram` for making arbitrary Bot API requests,
as well as shorthand methods and getters.

This is probably the class you'll be using the most.

#### Shorthand methods

```js
import { Tgify } from '@tgify/tgify'
import { message } from '@tgify/tgify/filters'

const bot = new Tgify(process.env.BOT_TOKEN)

bot.command('quit', async (ctx) => {
  // Explicit usage
  await ctx.telegram.leaveChat(ctx.message.chat.id)

  // Using context shortcut
  await ctx.leaveChat()
})

bot.on(message('text'), async (ctx) => {
  // Explicit usage
  await ctx.telegram.sendMessage(ctx.message.chat.id, `Hello ${ctx.state.role}`)

  // Using context shortcut
  await ctx.reply(`Hello ${ctx.state.role}`)
})

bot.on('callback_query', async (ctx) => {
  // Explicit usage
  await ctx.telegram.answerCbQuery(ctx.callbackQuery.id)

  // Using context shortcut
  await ctx.answerCbQuery()
})

bot.on('inline_query', async (ctx) => {
  const result = []
  // Explicit usage
  await ctx.telegram.answerInlineQuery(ctx.inlineQuery.id, result)

  // Using context shortcut
  await ctx.answerInlineQuery(result)
})

bot.launch()

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'))
process.once('SIGTERM', () => bot.stop('SIGTERM'))
```

## Production

### Webhooks

```TS
import { Tgify } from "@tgify/tgify";
import { message } from '@tgify/tgify/filters';

const bot = new Tgify(token);

bot.on(message("text"), ctx => ctx.reply("Hello"));

// Start webhook via launch method (preferred)
bot.launch({
  webhook: {
    // Public domain for webhook; e.g.: example.com
    domain: webhookDomain,

    // Port to listen on; e.g.: 8080
    port: port,

    // Optional path to listen for.
    // `bot.secretPathComponent()` will be used by default
    path: webhookPath,

    // Optional secret to be sent back in a header for security.
    // e.g.: `crypto.randomBytes(64).toString("hex")`
    secretToken: randomAlphaNumericString,
  },
});
```

Use `createWebhook()` if you want to attach Tgify to an existing http server.

<!-- global bot, tlsOptions -->

```TS
import { createServer } from "http";

createServer(await bot.createWebhook({ domain: "example.com" })).listen(3000);
```

```TS
import { createServer } from "https";

createServer(tlsOptions, await bot.createWebhook({ domain: "example.com" })).listen(8443);
```

- [AWS Lambda example integration](https://github.com/feathers-studio/telegraf-docs/tree/master/examples/functions/aws-lambda)
- [Google Cloud Functions example integration](https://github.com/feathers-studio/telegraf-docs/blob/master/examples/functions/google-cloud-function.ts)
- [`express` example integration](https://github.com/feathers-studio/telegraf-docs/blob/master/examples/webhook/express.ts)
- [`fastify` example integration](https://github.com/feathers-studio/telegraf-docs/blob/master/examples/webhook/fastify.ts)
- [`koa` example integration](https://github.com/feathers-studio/telegraf-docs/blob/master/examples/webhook/koa.ts)
- [Cloudflare Workers integration module](https://github.com/Tsuk1ko/cfworker-middware-telegraf)
- Use [`bot.handleUpdate`](https://telegraf.js.org/classes/Telegraf-1.html#handleupdate) to write new integrations

### Error handling

If middleware throws an error or times out, Tgify calls `bot.handleError`. If it rethrows, update source closes, and then the error is printed to console and process terminates. If it does not rethrow, the error is swallowed.

Default `bot.handleError` always rethrows. You can overwrite it using `bot.catch` if you need to.

⚠️ Swallowing unknown errors might leave the process in invalid state!

ℹ️ In production, `systemd` or [`pm2`](https://www.npmjs.com/package/pm2) can restart your bot if it exits for any reason.

## Advanced topics

### Working with files

Supported file sources:

- `Existing file_id`
- `File path`
- `Url`
- `Buffer`
- `ReadStream`

Also, you can provide an optional name of a file as `filename` when you send the file.

<!-- global bot, fs -->

```js
bot.on('message', async (ctx) => {
  // resend existing file by file_id
  await ctx.replyWithSticker('123123jkbhj6b')

  // send file
  await ctx.replyWithVideo(Input.fromLocalFile('/path/to/video.mp4'))

  // send stream
  await ctx.replyWithVideo(
    Input.fromReadableStream(fs.createReadStream('/path/to/video.mp4'))
  )

  // send buffer
  await ctx.replyWithVoice(Input.fromBuffer(Buffer.alloc()))

  // send url via Telegram server
  await ctx.replyWithPhoto(Input.fromURL('https://picsum.photos/200/300/'))

  // pipe url content
  await ctx.replyWithPhoto(
    Input.fromURLStream('https://picsum.photos/200/300/?random', 'kitten.jpg')
  )
})
```

### Middleware

In addition to `ctx: Context`, each middleware receives `next: () => Promise<void>`.

As in Koa and some other middleware-based libraries,
`await next()` will call next middleware and wait for it to finish:

```TS
import { Tgify } from '@tgify/tgify';
import { message } from '@tgify/tgify/filters';

const bot = new Tgify(process.env.BOT_TOKEN);

bot.use(async (ctx, next) => {
  console.time(`Processing update ${ctx.update.update_id}`);
  await next() // runs next middleware
  // runs after next middleware finishes
  console.timeEnd(`Processing update ${ctx.update.update_id}`);
})

bot.on(message('text'), (ctx) => ctx.reply('Hello World'));
bot.launch();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
```

With this simple ability, you can:

- extract information from updates and then `await next()` to avoid disrupting other middleware,
- like [`Composer`] and [`Router`], `await next()` for updates you don't wish to handle,
- like [`session`] and [`Scenes`], [extend the context](#extending-context) by mutating `ctx` before `await next()`,
- [intercept API calls](https://github.com/telegraf/telegraf/discussions/1267#discussioncomment-254525),
- reuse [other people's code](https://www.npmjs.com/search?q=telegraf-),
- do whatever **you** come up with!

[`Tgify`]: https://telegraf.js.org/classes/Telegraf-1.html
[`Composer`]: https://telegraf.js.org/classes/Composer.html
[`Context`]: https://telegraf.js.org/classes/Context.html
[`Router`]: https://telegraf.js.org/classes/Router.html
[`session`]: https://telegraf.js.org/modules.html#session
[`Scenes`]: https://telegraf.js.org/modules/Scenes.html

### Usage with TypeScript

Tgify is written in TypeScript and therefore ships with declaration files for the entire library.
Moreover, it includes types for the complete Telegram API via the [`typegram`](https://github.com/KnorpelSenf/typegram) package.
While most types of Tgify's API surface are self-explanatory, there's some notable things to keep in mind.

#### Extending `Context`

The exact shape of `ctx` can vary based on the installed middleware.
Some custom middleware might register properties on the context object that Tgify is not aware of.
Consequently, you can change the type of `ctx` to fit your needs in order for you to have proper TypeScript types for your data.
This is done through Generics:

```ts
import { Context, Tgify } from '@tgify/tgify'

// Define your own context type
interface MyContext extends Context {
  myProp?: string
  myOtherProp?: number
}

// Create your bot and tell it about your context type
const bot = new Tgify<MyContext>('SECRET TOKEN')

// Register middleware and launch your bot as usual
bot.use((ctx, next) => {
  // Yay, `myProp` is now available here as `string | undefined`!
  ctx.myProp = ctx.chat?.first_name?.toUpperCase()
  return next()
})
// ...
```
