/**
 * Standalone smoke test for flow export/import. Run directly:
 *
 *   bun run server/flows/smoke.ts
 *
 * Round-trips the DNS-failover template (2 connections, one reused across many
 * steps, plus a nested forEach with a connection-bearing action) through
 * export → inspect → rebind, asserting the result is structurally identical to
 * the original with the importer's connection ids substituted in. Exits
 * non-zero on first failure.
 */

import { flowTemplates } from '../engine/templates'
import type { ActionStep, FlowDefinition, ForEachStep } from '../engine/types'
import { exportFlowBundle, PLACEHOLDER_RE } from './bundle'
import { inspectBundle, rebindBundle, validateFlowBundle } from './import'

let failures = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`  ✓ ${name}`)
  } else {
    failures++
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

/** collect every connectionId present in a definition (trigger + nested steps) */
function allConnIds(def: FlowDefinition): string[] {
  const out: string[] = []
  if (def.trigger?.connectionId) out.push(def.trigger.connectionId)
  const walk = (steps: FlowDefinition['steps']) => {
    for (const s of steps) {
      if (s.type === 'action' && (s as ActionStep).connectionId) out.push((s as ActionStep).connectionId!)
      else if (s.type === 'forEach') walk((s as ForEachStep).steps ?? [])
    }
  }
  walk(def.steps)
  return out
}

function main() {
  // Build a concrete flow from the DNS-failover template with real conn ids.
  const tpl = flowTemplates.find(t => t.id === 'dns-failover')!
  const realKuma = 'conn-kuma-123'
  const realBunny = 'conn-bunny-456'
  const original: FlowDefinition = tpl.build(
    { kuma: realKuma, bunny: realBunny },
    { fqdn: 'app.example.com', zoneId: '99', monitor: 'app', recordName: '@' }
  )

  console.log('1) export strips connection ids → placeholders')
  const bundle = exportFlowBundle({ name: 'My failover', description: 'x', definition: original }, { author: 'tester' })
  const exportedIds = allConnIds(bundle.definition)
  check('every conn id is now a placeholder', exportedIds.length > 0 && exportedIds.every(id => PLACEHOLDER_RE.test(id)), exportedIds.join(','))
  check('no real id leaks into the bundle', !JSON.stringify(bundle).includes(realKuma) && !JSON.stringify(bundle).includes(realBunny))
  check('two distinct slots (kuma + bunny)', bundle.requires.length === 2, JSON.stringify(bundle.requires))
  check('reused bunny conn collapsed to ONE slot', new Set(exportedIds).size === 2)
  check('connectors include kuma, bunny, probe', ['kuma', 'bunny', 'probe'].every(c => bundle.connectors.includes(c)), bundle.connectors.join(','))

  console.log('2) bundle validates')
  const v = validateFlowBundle(bundle)
  check('valid bundle passes', v.ok, v.error)
  check('rejects bad version', !validateFlowBundle({ ...bundle, bundleVersion: 9 }).ok)
  check('rejects undeclared slot', !validateFlowBundle({ ...bundle, requires: [] }).ok)

  console.log('3) inspect reports dependencies vs installed')
  const installed = new Set(['kuma', 'bunny', 'probe', 'core'])
  const insReady = inspectBundle(bundle, { has: id => installed.has(id) })
  check('ready when all installed', insReady.ready)
  const insMissing = inspectBundle(bundle, { has: id => id !== 'bunny' && installed.has(id) })
  check('not ready when bunny missing', !insMissing.ready)
  check('bunny flagged missing', insMissing.connectors.some(c => c.integrationId === 'bunny' && !c.installed))

  console.log('4) rebind → importer connection ids')
  const myKuma = 'my-kuma-A'
  const myBunny = 'my-bunny-B'
  const bindings: Record<string, string> = {}
  for (const slot of bundle.requires) bindings[slot.placeholder] = slot.integrationId === 'kuma' ? myKuma : myBunny
  const rb = rebindBundle(bundle, bindings)
  check('rebind ok', rb.ok, rb.error)
  const reboundIds = allConnIds(rb.definition!)
  check('placeholders replaced with my ids', reboundIds.every(id => id === myKuma || id === myBunny), reboundIds.join(','))
  check('no placeholder remains', !reboundIds.some(id => PLACEHOLDER_RE.test(id)))

  console.log('5) structural round-trip (shape identical modulo conn ids)')
  // Replace my ids back with the originals and compare to the source def.
  const restored = JSON.parse(
    JSON.stringify(rb.definition).split(myKuma).join(realKuma).split(myBunny).join(realBunny)
  )
  check('definition round-trips exactly', JSON.stringify(restored) === JSON.stringify(original))

  console.log('6) rebind rejects an unbound slot')
  const bad = rebindBundle(bundle, {})
  check('missing binding errors', !bad.ok && /missing connection/.test(bad.error ?? ''))

  console.log('')
  if (failures) {
    console.error(`FAILED: ${failures} check(s)`)
    process.exit(1)
  }
  console.log('All flow export/import smoke checks passed.')
}

main()
