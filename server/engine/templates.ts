import type { FlowDefinition } from './types'

/**
 * Starter flow templates — pre-built flows users can clone and edit. They double
 * as the "learnable examples" that teach the builder (the failover one reproduces
 * the legacy DNS-failover semantics from server/utils/failover.ts). Placeholders
 * like "<KUMA_CONN>" are filled in by the UI when a template is instantiated.
 */
export interface FlowTemplate {
  id: string
  name: string
  description: string
  /** which connections the user must pick when cloning, by integrationId + a label */
  requires: Array<{ integrationId: string, label: string, placeholder: string }>
  build: (conns: Record<string, string>, params: Record<string, string>) => FlowDefinition
}

/**
 * 1) Classic DNS failover: on each tick, if a Kuma monitor is DOWN, after N
 *    consecutive fails and outside the cooldown window, probe the active IP —
 *    if it's really down, find a responding backup and swap the Bunny record.
 */
const dnsFailover: FlowTemplate = {
  id: 'dns-failover',
  name: 'DNS failover (Kuma → Bunny)',
  description:
    'When an Uptime Kuma monitor reports down, confirm with a probe and fail the Bunny DNS record over to a healthy backup IP.',
  requires: [
    { integrationId: 'kuma', label: 'Uptime Kuma', placeholder: '<KUMA_CONN>' },
    { integrationId: 'bunny', label: 'Bunny DNS', placeholder: '<BUNNY_CONN>' }
  ],
  build: (c, p) => ({
    trigger: {
      integrationId: 'kuma',
      triggerId: 'monitorDown',
      connectionId: c.kuma,
      config: { monitor: p.monitor ?? '' }
    },
    steps: [
      // count this failure, only proceed once we've seen >= threshold
      { id: 'bump', type: 'state', op: 'increment', key: `fails:${p.fqdn}` },
      { id: 'thr', type: 'state', op: 'thresholdGate', key: `fails:${p.fqdn}`, amount: Number(p.failThreshold ?? 2), onFail: 'stop' },
      // respect cooldown since last switch
      { id: 'cool', type: 'state', op: 'cooldownGate', key: `lastSwitch:${p.fqdn}`, amount: Number(p.cooldownMs ?? 300000), onFail: 'stop' },
      // read current records
      { id: 'list', type: 'action', integrationId: 'bunny', actionId: 'listRecords', connectionId: c.bunny, input: { zoneId: p.zoneId, recordName: p.recordName ?? '@' } },
      // confirm the active IP is really down (don't switch on a Kuma false-positive)
      { id: 'probeActive', type: 'action', integrationId: 'probe', actionId: 'httpsProbe', input: { fqdn: p.fqdn, ip: '{{ steps.list.activeIp }}', path: p.healthPath ?? '/' } },
      { id: 'stillUp', type: 'condition', expr: { all: [{ left: '{{ steps.probeActive.alive }}', op: 'falsy' }] }, onFail: 'stop' },
      // find a responding backup and swap to it
      {
        id: 'findBackup', type: 'forEach', items: '{{ steps.list.records }}', as: 'rec',
        steps: [
          { id: 'probeBackup', type: 'action', integrationId: 'probe', actionId: 'httpsProbe', input: { fqdn: p.fqdn, ip: '{{ rec.item.ip }}', path: p.healthPath ?? '/' } },
          {
            id: 'swap', type: 'action', integrationId: 'bunny', actionId: 'swapActive', connectionId: c.bunny,
            input: { zoneId: p.zoneId, fromRecordId: '{{ steps.list.records.0.id }}', toRecordId: '{{ rec.item.id }}' },
            when: { all: [{ left: '{{ steps.probeBackup.alive }}', op: 'truthy' }, { left: '{{ rec.item.disabled }}', op: 'truthy' }] }
          }
        ],
        breakWhen: { all: [{ left: '{{ steps.probeBackup.alive }}', op: 'truthy' }, { left: '{{ rec.item.disabled }}', op: 'truthy' }] }
      },
      // record the switch + reset counter
      { id: 'stamp', type: 'state', op: 'stampNow', key: `lastSwitch:${p.fqdn}` },
      { id: 'reset', type: 'state', op: 'reset', key: `fails:${p.fqdn}` }
    ]
  })
}

/**
 * 2) RustFS storage failover: rotate the RustFS credentials in two Parse apps
 *    (one per Dokploy instance), redeploy both, then point two Bunny hostnames
 *    from the primary to the backup server. Triggered by a Kuma monitor on
 *    RustFS1 (or manually).
 */
const rustfsFailover: FlowTemplate = {
  id: 'rustfs-failover',
  name: 'RustFS storage failover',
  description:
    'When RustFS1 goes down: swap the RustFS credentials in both Parse apps, redeploy them, and repoint both file hostnames in Bunny to the backup server.',
  requires: [
    { integrationId: 'kuma', label: 'Uptime Kuma', placeholder: '<KUMA_CONN>' },
    { integrationId: 'dokploy', label: 'Dokploy #1', placeholder: '<DOKPLOY1_CONN>' },
    { integrationId: 'dokploy', label: 'Dokploy #2', placeholder: '<DOKPLOY2_CONN>' },
    { integrationId: 'bunny', label: 'Bunny DNS', placeholder: '<BUNNY_CONN>' }
  ],
  build: (c, p) => ({
    trigger: {
      integrationId: 'kuma',
      triggerId: 'monitorDown',
      connectionId: c.kuma,
      config: { monitor: p.rustfsMonitor ?? 'rustfs1' }
    },
    steps: [
      // cooldown so a flapping monitor can't thrash the failover
      { id: 'cool', type: 'state', op: 'cooldownGate', key: 'lastFailover', amount: Number(p.cooldownMs ?? 300000), onFail: 'stop' },
      // Parse on Dokploy #1: set backup RustFS creds, redeploy
      { id: 'env1', type: 'action', integrationId: 'dokploy', actionId: 'saveEnvironment', connectionId: c.dokploy1, input: { applicationId: p.parseApp1, env: '{{ trigger.backupEnv }}' } },
      { id: 'deploy1', type: 'action', integrationId: 'dokploy', actionId: 'redeploy', connectionId: c.dokploy1, input: { applicationId: p.parseApp1, title: 'RustFS failover' } },
      // Parse on Dokploy #2: same
      { id: 'env2', type: 'action', integrationId: 'dokploy', actionId: 'saveEnvironment', connectionId: c.dokploy2, input: { applicationId: p.parseApp2, env: '{{ trigger.backupEnv }}' } },
      { id: 'deploy2', type: 'action', integrationId: 'dokploy', actionId: 'redeploy', connectionId: c.dokploy2, input: { applicationId: p.parseApp2, title: 'RustFS failover' } },
      // Bunny: repoint files.macosicons.com → backup server
      { id: 'dns1', type: 'action', integrationId: 'bunny', actionId: 'swapActive', connectionId: c.bunny, input: { zoneId: p.zoneId, fromRecordId: p.files1FromId, toRecordId: p.files1ToId } },
      // Bunny: repoint files2.macosicons.com → backup server
      { id: 'dns2', type: 'action', integrationId: 'bunny', actionId: 'swapActive', connectionId: c.bunny, input: { zoneId: p.zoneId, fromRecordId: p.files2FromId, toRecordId: p.files2ToId } },
      { id: 'stamp', type: 'state', op: 'stampNow', key: 'lastFailover' }
    ]
  })
}

export const flowTemplates: FlowTemplate[] = [dnsFailover, rustfsFailover]
