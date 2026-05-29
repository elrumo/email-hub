import type { FlowDraft, FlowStep } from '~/types'
import { newStepId } from '~/composables/builder'

export interface FlowExample {
  id: string
  name: string
  description: string
  icon: string
  trigger: string
  level: 'Starter' | 'Intermediate' | 'Advanced'
  tags: string[]
  requires?: string[]
  stepCount: number
}

interface FlowExampleDefinition extends FlowExample {
  buildDraft: () => FlowDraft
}

function cronDaily(timeOfDay: string) {
  return {
    mode: 'cron',
    cron: `${timeOfDay.slice(3, 5)} ${timeOfDay.slice(0, 2)} * * *`,
    timezone: 'UTC',
    builder: {
      mode: 'cron',
      preset: 'daily',
      timeOfDay,
      timezone: 'UTC'
    }
  }
}

function browserNotify(title: string, body: string, url = '/flows'): FlowStep {
  return {
    id: newStepId('notify'),
    type: 'action',
    integrationId: 'browser',
    actionId: 'notify',
    input: { title, body, url }
  }
}

const FLOW_EXAMPLE_DEFINITIONS: FlowExampleDefinition[] = [
  {
    id: 'api-down-alert',
    name: 'API down alert',
    description: 'Ping a health endpoint on every check and push a browser alert when it starts failing.',
    icon: 'i-lucide-activity',
    trigger: 'Ping trigger',
    level: 'Starter',
    tags: ['Monitoring', 'No connection'],
    stepCount: 3,
    buildDraft: () => ({
      name: 'API down alert',
      description: 'Alert me when the API stops responding normally.',
      enabled: true,
      definition: {
        trigger: {
          integrationId: 'ping',
          triggerId: 'responseMatches',
          config: {
            url: 'https://example.com/health',
            method: 'GET',
            timeoutMs: 5000,
            fireWhen: 'notOk'
          }
        },
        steps: [
          { id: newStepId('cooldown'), type: 'state', op: 'cooldownGate', key: 'alerts:api-down', amount: 300000, onFail: 'stop' },
          browserNotify('API alert', 'Health check failed for {{ trigger.url }} (status {{ trigger.status }}).'),
          { id: newStepId('stamp'), type: 'state', op: 'stampNow', key: 'alerts:api-down' }
        ],
        notifyOnRun: 'failure'
      }
    })
  },
  {
    id: 'daily-ops-reminder',
    name: 'Daily ops reminder',
    description: 'Run every morning and push a checklist reminder to every browser that has notifications enabled.',
    icon: 'i-lucide-clock-3',
    trigger: 'Daily schedule',
    level: 'Starter',
    tags: ['Schedule', 'No connection'],
    stepCount: 1,
    buildDraft: () => ({
      name: 'Daily ops reminder',
      description: 'Send the team a quick reminder to review backups, certs, and overnight alerts.',
      enabled: true,
      definition: {
        trigger: {
          integrationId: 'core',
          triggerId: 'cron',
          config: cronDaily('09:00')
        },
        steps: [
          browserNotify('Morning checklist', 'Check backups, overnight alerts, and anything still in maintenance.')
        ],
        notifyOnRun: 'never'
      }
    })
  },
  {
    id: 'release-webhook',
    name: 'Release webhook listener',
    description: 'Receive a webhook from GitHub, CI, or another service and fan the event out as a browser notification.',
    icon: 'i-lucide-webhook',
    trigger: 'Webhook',
    level: 'Starter',
    tags: ['Webhook', 'No connection'],
    stepCount: 1,
    buildDraft: () => ({
      name: 'Release webhook listener',
      description: 'Catch an inbound webhook and broadcast it to browsers.',
      enabled: true,
      definition: {
        trigger: {
          integrationId: 'core',
          triggerId: 'webhook',
          config: { webhookSecret: 'replace-me-with-a-secret' }
        },
        steps: [
          browserNotify('Webhook received', 'A release event arrived. Open the run details to inspect the webhook payload.')
        ],
        notifyOnRun: 'failure'
      }
    })
  },
  {
    id: 'kuma-discord-alert',
    name: 'Kuma to Discord alert',
    description: 'When an Uptime Kuma monitor goes down, pause for a cooldown window and then post to Discord.',
    icon: 'i-lucide-bell',
    trigger: 'Kuma monitor down',
    level: 'Intermediate',
    tags: ['Monitoring', 'Discord'],
    requires: ['Uptime Kuma connection', 'Notifications connection'],
    stepCount: 3,
    buildDraft: () => ({
      name: 'Kuma to Discord alert',
      description: 'Post a Discord alert when a named Uptime Kuma monitor is down.',
      enabled: true,
      definition: {
        trigger: {
          integrationId: 'kuma',
          triggerId: 'monitorDown',
          connectionId: null,
          config: { monitor: 'api-prod' }
        },
        steps: [
          { id: newStepId('cooldown'), type: 'state', op: 'cooldownGate', key: 'alerts:kuma-api-prod', amount: 300000, onFail: 'stop' },
          {
            id: newStepId('discord'),
            type: 'action',
            integrationId: 'notify',
            actionId: 'discord',
            connectionId: null,
            input: { text: 'Kuma reports {{ trigger.monitor }} as down. Investigate before customer traffic is affected.' }
          },
          { id: newStepId('stamp'), type: 'state', op: 'stampNow', key: 'alerts:kuma-api-prod' }
        ],
        notifyOnRun: 'failure'
      }
    })
  },
  {
    id: 'front-door-routine',
    name: 'Front door routine',
    description: 'React to a Home Assistant entity state and turn on a light or trigger another service call.',
    icon: 'i-simple-icons-homeassistant',
    trigger: 'Home Assistant state',
    level: 'Intermediate',
    tags: ['Home Assistant', 'Smart home'],
    requires: ['Home Assistant connection'],
    stepCount: 2,
    buildDraft: () => ({
      name: 'Front door routine',
      description: 'When the front door opens after dark, turn on the entryway light and send a push.',
      enabled: true,
      definition: {
        trigger: {
          integrationId: 'homeassistant',
          triggerId: 'entityStateMatches',
          connectionId: null,
          config: { entityId: 'binary_sensor.front_door', op: 'eq', value: 'on' }
        },
        steps: [
          {
            id: newStepId('ha'),
            type: 'action',
            integrationId: 'homeassistant',
            actionId: 'callService',
            connectionId: null,
            input: { domain: 'light', service: 'turn_on', entityId: 'light.entryway' }
          },
          browserNotify('Front door opened', 'The front door routine ran and turned on the entryway light.')
        ],
        notifyOnRun: 'never'
      }
    })
  },
  {
    id: 'dns-failover',
    name: 'DNS failover',
    description: 'When a monitor is down, confirm the active IP is failing, probe backups, and swap Bunny DNS to a healthy target.',
    icon: 'i-lucide-waypoints',
    trigger: 'Kuma monitor down',
    level: 'Advanced',
    tags: ['Failover', 'Bunny DNS'],
    requires: ['Uptime Kuma connection', 'Bunny connection'],
    stepCount: 8,
    buildDraft: () => ({
      name: 'DNS failover',
      description: 'Confirm the active IP is down, then fail the Bunny DNS record over to a healthy backup.',
      enabled: true,
      definition: {
        trigger: {
          integrationId: 'kuma',
          triggerId: 'monitorDown',
          connectionId: null,
          config: { monitor: 'app-prod' }
        },
        steps: [
          { id: newStepId('fails'), type: 'state', op: 'increment', key: 'fails:app-prod' },
          { id: newStepId('threshold'), type: 'state', op: 'thresholdGate', key: 'fails:app-prod', amount: 2, onFail: 'stop' },
          { id: newStepId('cooldown'), type: 'state', op: 'cooldownGate', key: 'lastSwitch:app-prod', amount: 300000, onFail: 'stop' },
          {
            id: newStepId('list'),
            type: 'action',
            integrationId: 'bunny',
            actionId: 'listRecords',
            connectionId: null,
            input: { zoneId: 'zone-id', recordName: '@' }
          },
          {
            id: newStepId('probeActive'),
            type: 'action',
            integrationId: 'probe',
            actionId: 'httpsProbe',
            input: { fqdn: 'app.example.com', ip: '{{ steps.list.activeIp }}', path: '/health' }
          },
          { id: newStepId('stillDown'), type: 'condition', expr: { all: [{ left: '{{ steps.probeActive.alive }}', op: 'falsy' }] }, onFail: 'stop' },
          {
            id: newStepId('swap'),
            type: 'forEach',
            items: '{{ steps.list.records }}',
            as: 'rec',
            steps: [
              {
                id: newStepId('probeBackup'),
                type: 'action',
                integrationId: 'probe',
                actionId: 'httpsProbe',
                input: { fqdn: 'app.example.com', ip: '{{ rec.item.ip }}', path: '/health' }
              },
              {
                id: newStepId('flip'),
                type: 'action',
                integrationId: 'bunny',
                actionId: 'swapActive',
                connectionId: null,
                input: { zoneId: 'zone-id', fromRecordId: '{{ steps.list.records.0.id }}', toRecordId: '{{ rec.item.id }}' },
                when: { all: [{ left: '{{ steps.probeBackup.alive }}', op: 'truthy' }, { left: '{{ rec.item.disabled }}', op: 'truthy' }] }
              }
            ],
            breakWhen: { all: [{ left: '{{ steps.probeBackup.alive }}', op: 'truthy' }, { left: '{{ rec.item.disabled }}', op: 'truthy' }] }
          },
          { id: newStepId('stamp'), type: 'state', op: 'stampNow', key: 'lastSwitch:app-prod' }
        ],
        notifyOnRun: 'failure'
      }
    })
  },
  {
    id: 'rustfs-failover',
    name: 'RustFS storage failover',
    description: 'Swap Parse app credentials, redeploy both Dokploy apps, and then repoint Bunny hostnames to the backup server.',
    icon: 'i-lucide-server-cog',
    trigger: 'Kuma monitor down',
    level: 'Advanced',
    tags: ['Dokploy', 'Failover'],
    requires: ['Uptime Kuma connection', '2 Dokploy connections', 'Bunny connection'],
    stepCount: 7,
    buildDraft: () => ({
      name: 'RustFS storage failover',
      description: 'When RustFS1 goes down, switch both Parse apps to the backup RustFS environment and repoint Bunny.',
      enabled: true,
      definition: {
        trigger: {
          integrationId: 'kuma',
          triggerId: 'monitorDown',
          connectionId: null,
          config: { monitor: 'rustfs1' }
        },
        steps: [
          { id: newStepId('cooldown'), type: 'state', op: 'cooldownGate', key: 'lastFailover', amount: 300000, onFail: 'stop' },
          {
            id: newStepId('env1'),
            type: 'action',
            integrationId: 'dokploy',
            actionId: 'saveEnvironment',
            connectionId: null,
            input: { applicationId: 'parse-app-1', env: '{{ trigger.backupEnv }}' }
          },
          {
            id: newStepId('deploy1'),
            type: 'action',
            integrationId: 'dokploy',
            actionId: 'redeploy',
            connectionId: null,
            input: { applicationId: 'parse-app-1', title: 'RustFS failover' }
          },
          {
            id: newStepId('env2'),
            type: 'action',
            integrationId: 'dokploy',
            actionId: 'saveEnvironment',
            connectionId: null,
            input: { applicationId: 'parse-app-2', env: '{{ trigger.backupEnv }}' }
          },
          {
            id: newStepId('deploy2'),
            type: 'action',
            integrationId: 'dokploy',
            actionId: 'redeploy',
            connectionId: null,
            input: { applicationId: 'parse-app-2', title: 'RustFS failover' }
          },
          {
            id: newStepId('dns1'),
            type: 'action',
            integrationId: 'bunny',
            actionId: 'swapActive',
            connectionId: null,
            input: { zoneId: 'zone-id', fromRecordId: 'primary-files-record', toRecordId: 'backup-files-record' }
          },
          {
            id: newStepId('dns2'),
            type: 'action',
            integrationId: 'bunny',
            actionId: 'swapActive',
            connectionId: null,
            input: { zoneId: 'zone-id', fromRecordId: 'primary-files2-record', toRecordId: 'backup-files2-record' }
          }
        ],
        notifyOnRun: 'failure'
      }
    })
  }
]

export const flowExamples: FlowExample[] = FLOW_EXAMPLE_DEFINITIONS.map(({ buildDraft: _buildDraft, ...example }) => example)

export function getFlowExample(id: string | null | undefined): FlowExample | null {
  if (!id) return null
  return flowExamples.find(example => example.id === id) ?? null
}

export function buildFlowExampleDraft(id: string | null | undefined): FlowDraft | null {
  if (!id) return null
  return FLOW_EXAMPLE_DEFINITIONS.find(example => example.id === id)?.buildDraft() ?? null
}
