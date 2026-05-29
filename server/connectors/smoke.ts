/**
 * Standalone smoke test for the declarative connector pipeline. Not wired to a
 * test runner (the repo has none yet) — run directly:
 *
 *   bun run server/connectors/smoke.ts
 *
 * Exercises: validate → compile → run (with a stubbed fetch), output mapping,
 * recipe ref resolution, and the SSRF guard. Exits non-zero on first failure.
 */

import { compileConnector } from './compile'
import { exampleConnectors, telegramExample } from './examples'
import { executeRecipe, mapOutput, resolveRecipeValue } from './http'
import { isPrivateIp } from './ssrf'
import { validateConnectorDef } from './validate'

let failures = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`)
  } else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function main() {
  console.log('1) validation')
  for (const def of exampleConnectors) {
    const r = validateConnectorDef(def)
    check(`validates ${def.id}`, r.ok, r.error)
  }
  check('rejects wrong schemaVersion', !validateConnectorDef({ ...telegramExample, schemaVersion: 99 }).ok)
  check('rejects missing actions', !validateConnectorDef({ ...telegramExample, actions: [] }).ok)
  check('rejects relative url', !validateConnectorDef({
    ...telegramExample,
    actions: [{ ...telegramExample.actions[0]!, request: { method: 'GET', url: '/relative' } }]
  }).ok)

  console.log('2) ref resolution')
  const scope = { connection: { botToken: 'abc' }, input: { chatId: 42, text: 'hi {{ x }}' } }
  check('full ref keeps type (number)', resolveRecipeValue('{{input.chatId}}', scope) === 42)
  check('embedded ref → string', resolveRecipeValue('bot{{connection.botToken}}/x', scope) === 'botabc/x')
  check('object recurses', JSON.stringify(resolveRecipeValue({ a: '{{input.chatId}}' }, scope)) === '{"a":42}')

  console.log('3) output mapping')
  const result = { status: 200, ok: true, body: { result: { message_id: 7 }, items: [{ v: 1 }] }, rawText: '' }
  const mapped = mapOutput(result, { sent: '$ok', id: '$.result.message_id', first: '$.items[0].v', n: '=true' })
  check('$ok → true', mapped.sent === true)
  check('$.path → 7', mapped.id === 7)
  check('array index path → 1', mapped.first === 1)
  check('=literal → true', mapped.n === true)
  check('default mapping shape', JSON.stringify(Object.keys(mapOutput(result))) === '["status","ok","body"]')

  console.log('4) SSRF guard (pure IP classification)')
  check('169.254.169.254 is private', isPrivateIp('169.254.169.254'))
  check('10.x is private', isPrivateIp('10.1.2.3'))
  check('127.0.0.1 is private', isPrivateIp('127.0.0.1'))
  check('192.168 is private', isPrivateIp('192.168.1.1'))
  check('8.8.8.8 is public', !isPrivateIp('8.8.8.8'))
  check('::1 is private', isPrivateIp('::1'))

  console.log('5) compile → run (stubbed fetch)')
  const realFetch = globalThis.fetch
  // @ts-expect-error replacing the global fetch with a narrower stub for the test
  globalThis.fetch = async (url: string | URL, init?: RequestInit) => {
    const u = String(url)
    const body = init?.body ? JSON.parse(String(init.body)) : null
    check('templated URL has token', u.includes('/botSECRET/sendMessage'), u)
    check('json body templated (chat_id is the input value)', body?.chat_id === 'C1', JSON.stringify(body))
    return new Response(JSON.stringify({ ok: true, result: { message_id: 99 } }), {
      status: 200, headers: { 'content-type': 'application/json' }
    })
  }
  try {
    // bypass SSRF for the stub (api.telegram.org would resolve to a public IP
    // anyway, but we don't want the test to hit the network/DNS)
    process.env.NUXT_CONNECTOR_ALLOW_PRIVATE = '1'
    const integration = compileConnector(telegramExample)
    const action = integration.actions.find(a => a.id === 'sendMessage')!
    const out = await action.run({
      connection: { id: 'c', integrationId: 'x-telegram-community', name: 'n', config: { botToken: 'SECRET' } },
      input: { chatId: 'C1', text: 'hello' },
      log: () => {},
      signal: new AbortController().signal,
      client: null
    })
    check('run mapped messageId', out.messageId === 99, JSON.stringify(out))
    check('run mapped sent', out.sent === true)
    check('integration id is namespaced', integration.id === 'x-telegram-community')
    check('testConnection synthesized', typeof integration.testConnection === 'function')
  } finally {
    globalThis.fetch = realFetch
    delete process.env.NUXT_CONNECTOR_ALLOW_PRIVATE
  }

  console.log('6) SSRF blocks a private URL end-to-end')
  try {
    await executeRecipe(
      { method: 'GET', url: 'http://169.254.169.254/latest/meta-data/' },
      { connection: {}, input: {} },
      new AbortController().signal
    )
    check('blocked metadata endpoint', false, 'expected throw')
  } catch (e) {
    check('blocked metadata endpoint', /blocked/.test(String(e)))
  }

  console.log('')
  if (failures) {
    console.error(`FAILED: ${failures} check(s)`)
    process.exit(1)
  }
  console.log('All connector smoke checks passed.')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
