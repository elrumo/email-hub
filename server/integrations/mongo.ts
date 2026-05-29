import { MongoClient } from 'mongodb'
import type { Integration } from '../engine/types'

/**
 * MongoDB. Unlike the HTTP integrations, Mongo holds a live connection, so this
 * uses the engine's `client` factory: the pool creates ONE `MongoClient` per
 * connection and reuses it across actions, tearing it down when idle (see
 * server/engine/clientPool.ts). Actions read the client off `ctx.client`.
 */
function db(ctx: { client: unknown, connection: { config: Record<string, unknown> } | null }) {
  const client = ctx.client as MongoClient | null
  if (!client) throw new Error('Mongo client unavailable (no connection?)')
  const dbName = String(ctx.connection?.config.database ?? '')
  return dbName ? client.db(dbName) : client.db()
}

/** Parse the JSON-ish filter/doc inputs; empty → {}. */
function parseJson(value: unknown, what: string): Record<string, unknown> {
  const s = String(value ?? '').trim()
  if (!s) return {}
  try {
    const parsed = JSON.parse(s)
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
    throw new Error('not an object')
  } catch {
    throw new Error(`${what} must be valid JSON, e.g. {"status":"down"}`)
  }
}

export const mongoIntegration: Integration = {
  id: 'mongo',
  name: 'MongoDB',
  img: 'https://www.mongodb.com/assets/images/global/favicon.ico',
  connectionSchema: [
    { key: 'uri', label: 'Connection URI', type: 'secret', required: true, placeholder: 'mongodb+srv://user:pass@cluster/...', help: 'A standard MongoDB connection string.' },
    { key: 'database', label: 'Default database', type: 'string', help: 'Used when an action doesn\'t specify one. Optional if the URI includes a db.' }
  ],
  client: {
    connect: async (config, signal) => {
      const uri = String(config.uri ?? '')
      if (!uri) throw new Error('Mongo connection has no URI')
      const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 })
      // honour the engine abort if it fires during the initial connect
      const onAbort = () => {
        void client.close().catch(() => {})
      }
      signal.addEventListener('abort', onAbort, { once: true })
      try {
        await client.connect()
      } finally {
        signal.removeEventListener('abort', onAbort)
      }
      return client
    },
    disconnect: async (client) => {
      await (client as MongoClient).close()
    },
    idleMs: 120_000
  },
  testConnection: async (config, signal) => {
    const uri = String(config.uri ?? '')
    if (!uri) return { ok: false, message: 'Connection URI is required' }
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 6000 })
    const onAbort = () => {
      void client.close().catch(() => {})
    }
    signal.addEventListener('abort', onAbort, { once: true })
    try {
      await client.connect()
      await client.db(String(config.database ?? '') || undefined).command({ ping: 1 })
      return { ok: true, message: 'Connected — ping succeeded' }
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not reach MongoDB'
      return { ok: false, message: /auth/i.test(msg) ? 'Authentication failed' : msg }
    } finally {
      signal.removeEventListener('abort', onAbort)
      await client.close().catch(() => {})
    }
  },
  triggers: [],
  actions: [
    {
      id: 'find',
      name: 'Find documents',
      description: 'Returns documents from a collection matching a filter.',
      needsConnection: true,
      inputSchema: [
        { key: 'collection', label: 'Collection', type: 'string', required: true },
        { key: 'filter', label: 'Filter (JSON)', type: 'string', placeholder: '{ "status": "down" }', help: 'Empty matches everything.' },
        { key: 'limit', label: 'Limit', type: 'number', default: 50 }
      ],
      outputKeys: ['documents', 'count'],
      run: async (ctx) => {
        const coll = db(ctx).collection(String(ctx.input.collection ?? ''))
        const filter = parseJson(ctx.input.filter, 'Filter')
        const limit = Math.max(0, Number(ctx.input.limit ?? 50)) || 50
        const documents = await coll.find(filter, { limit }).toArray()
        ctx.log(`mongo find ${ctx.input.collection}: ${documents.length} doc(s)`)
        return { documents, count: documents.length }
      }
    },
    {
      id: 'countDocuments',
      name: 'Count documents',
      description: 'Counts documents in a collection matching a filter.',
      needsConnection: true,
      inputSchema: [
        { key: 'collection', label: 'Collection', type: 'string', required: true },
        { key: 'filter', label: 'Filter (JSON)', type: 'string', placeholder: '{ }' }
      ],
      outputKeys: ['count'],
      run: async (ctx) => {
        const coll = db(ctx).collection(String(ctx.input.collection ?? ''))
        const count = await coll.countDocuments(parseJson(ctx.input.filter, 'Filter'))
        ctx.log(`mongo count ${ctx.input.collection}: ${count}`)
        return { count }
      }
    },
    {
      id: 'insertOne',
      name: 'Insert a document',
      description: 'Inserts one document into a collection.',
      needsConnection: true,
      inputSchema: [
        { key: 'collection', label: 'Collection', type: 'string', required: true },
        { key: 'document', label: 'Document (JSON)', type: 'string', required: true, placeholder: '{ "event": "failover", "at": 0 }' }
      ],
      outputKeys: ['insertedId', 'inserted'],
      run: async (ctx) => {
        const coll = db(ctx).collection(String(ctx.input.collection ?? ''))
        const res = await coll.insertOne(parseJson(ctx.input.document, 'Document'))
        ctx.log(`mongo insert ${ctx.input.collection}: ${res.insertedId}`)
        return { insertedId: String(res.insertedId), inserted: res.acknowledged }
      }
    },
    {
      id: 'updateOne',
      name: 'Update a document',
      description: 'Updates the first document matching a filter ($set).',
      needsConnection: true,
      inputSchema: [
        { key: 'collection', label: 'Collection', type: 'string', required: true },
        { key: 'filter', label: 'Filter (JSON)', type: 'string', required: true, placeholder: '{ "_id": "..." }' },
        { key: 'set', label: 'Fields to set (JSON)', type: 'string', required: true, placeholder: '{ "status": "up" }' },
        { key: 'upsert', label: 'Create if missing', type: 'boolean', default: false }
      ],
      outputKeys: ['matched', 'modified', 'upsertedId'],
      run: async (ctx) => {
        const coll = db(ctx).collection(String(ctx.input.collection ?? ''))
        const res = await coll.updateOne(
          parseJson(ctx.input.filter, 'Filter'),
          { $set: parseJson(ctx.input.set, 'Fields to set') },
          { upsert: Boolean(ctx.input.upsert) }
        )
        ctx.log(`mongo update ${ctx.input.collection}: matched ${res.matchedCount}, modified ${res.modifiedCount}`)
        return { matched: res.matchedCount, modified: res.modifiedCount, upsertedId: res.upsertedId ? String(res.upsertedId) : null }
      }
    },
    {
      id: 'deleteOne',
      name: 'Delete a document',
      description: 'Deletes the first document matching a filter.',
      needsConnection: true,
      inputSchema: [
        { key: 'collection', label: 'Collection', type: 'string', required: true },
        { key: 'filter', label: 'Filter (JSON)', type: 'string', required: true }
      ],
      outputKeys: ['deleted'],
      run: async (ctx) => {
        const coll = db(ctx).collection(String(ctx.input.collection ?? ''))
        const res = await coll.deleteOne(parseJson(ctx.input.filter, 'Filter'))
        ctx.log(`mongo delete ${ctx.input.collection}: ${res.deletedCount}`)
        return { deleted: res.deletedCount }
      }
    }
  ]
}
