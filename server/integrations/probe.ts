import https from 'node:https'
import type { Integration } from '../engine/types'

/**
 * HTTPS probe with explicit Host header + SNI — lets a flow check whether a
 * specific IP serves a given hostname (used by the failover flow to confirm an
 * IP is actually reachable before/after switching). Ported from the legacy
 * server/utils/probe.ts.
 */
function probe(
  fqdn: string,
  ip: string,
  pathPart: string,
  timeoutMs: number
): Promise<boolean> {
  return new Promise((resolve) => {
    const req = https.request(
      {
        host: ip,
        port: 443,
        path: pathPart || '/',
        method: 'GET',
        headers: { 'Host': fqdn, 'User-Agent': 'flow-hub/2.0' },
        servername: fqdn,
        rejectUnauthorized: false,
        timeout: timeoutMs
      },
      (res) => {
        resolve(res.statusCode != null && res.statusCode < 500)
        res.resume()
      }
    )
    req.on('error', () => resolve(false))
    req.on('timeout', () => {
      req.destroy()
      resolve(false)
    })
    req.end()
  })
}

export const probeIntegration: Integration = {
  id: 'probe',
  name: 'HTTP Probe',
  icon: 'i-lucide-radio-tower',
  connectionSchema: [], // no credentials
  triggers: [],
  actions: [
    {
      id: 'httpsProbe',
      name: 'Check if a host is reachable',
      description:
        'Sends an HTTPS request to a specific IP using the given hostname, and reports whether it responded.',
      inputSchema: [
        { key: 'fqdn', label: 'Hostname', type: 'string', required: true, placeholder: 'app.example.com' },
        { key: 'ip', label: 'IP address', type: 'string', required: true, placeholder: '203.0.113.10' },
        { key: 'path', label: 'Path', type: 'string', default: '/', placeholder: '/health' },
        { key: 'timeoutMs', label: 'Timeout (ms)', type: 'number', default: 5000 }
      ],
      outputKeys: ['alive', 'ip'],
      run: async (ctx) => {
        const fqdn = String(ctx.input.fqdn ?? '')
        const ip = String(ctx.input.ip ?? '')
        const path = String(ctx.input.path ?? '/')
        const timeoutMs = Number(ctx.input.timeoutMs ?? 5000) || 5000
        const alive = await probe(fqdn, ip, path, timeoutMs)
        ctx.log(`probe ${ip} as ${fqdn}${path} → ${alive ? 'alive' : 'down'}`)
        return { alive, ip }
      }
    }
  ]
}
