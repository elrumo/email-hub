import Parse from 'parse/node'
import type { EmailDocument } from '#shared/email/blocks'

let initialized = false

function required(name: string, value: string | undefined | null): string {
  if (!value) throw new Error(`${name} is required`)
  return value
}

export function getParseAppId(): string {
  return process.env.PARSE_APP_ID || process.env.PARSE_SERVER_APPLICATION_ID || 'email-hub'
}

export function getParseServerUrl(): string {
  return required('PARSE_SERVER_URL', process.env.PARSE_SERVER_URL)
}

export function getParseMasterKey(): string {
  return required('PARSE_MASTER_KEY', process.env.PARSE_MASTER_KEY || process.env.PARSE_SERVER_MASTER_KEY)
}

export function getParseClientKey(): string | undefined {
  return process.env.PARSE_CLIENT_KEY || process.env.PARSE_SERVER_CLIENT_KEY || undefined
}

export function initParse(): typeof Parse {
  if (!initialized) {
    Parse.initialize(getParseAppId(), getParseClientKey(), getParseMasterKey())
    Parse.serverURL = getParseServerUrl()
    initialized = true
  }
  return Parse
}

export interface AppUser {
  id: string
  email: string
  name: string | null
  passwordHash: string
  role: string
  plan: string
  planStatus: string | null
  stripeCustomerId: string | null
  stripeSubscriptionId: string | null
  lastLoginAt: number | null
  createdAt: number
  updatedAt: number
}

export interface AppSession {
  id: string
  userId: string
  expiresAt: number
  userAgent: string | null
  createdAt: number
}

export interface TemplateVariable {
  key: string
  label?: string
  defaultValue?: string
}

export interface EmailProject {
  id: string
  ownerId: string
  name: string
  document: EmailDocument
  variables: TemplateVariable[]
  createdAt: number
  updatedAt: number
}

export interface EmailChatMessage {
  id: string
  projectId: string
  role: string
  parts: unknown[]
  createdAt: number
}

export interface ApiKeyRecord {
  id: string
  ownerId: string
  name: string
  prefix: string
  hash: string
  lastUsedAt: number | null
  revokedAt: number | null
  createdAt: number
}

export interface AiUsageRecord {
  id: string
  userId: string
  projectId: string | null
  model: string | null
  promptTokens: number
  completionTokens: number
  totalTokens: number
  createdAt: number
}

function classFor(name: string) {
  return initParse().Object.extend(name)
}

function toPlain<T>(obj: Parse.Object, fields: string[]): T & { id: string } {
  const out: Record<string, unknown> = { id: obj.id }
  for (const field of fields) out[field] = obj.get(field)
  return out as T & { id: string }
}

const USER_FIELDS = ['email', 'name', 'passwordHash', 'role', 'plan', 'planStatus', 'stripeCustomerId', 'stripeSubscriptionId', 'lastLoginAt', 'createdAt', 'updatedAt']
const SESSION_FIELDS = ['userId', 'expiresAt', 'userAgent', 'createdAt']
const PROJECT_FIELDS = ['ownerId', 'name', 'document', 'variables', 'createdAt', 'updatedAt']
const MESSAGE_FIELDS = ['projectId', 'role', 'parts', 'createdAt']
const API_KEY_FIELDS = ['ownerId', 'name', 'prefix', 'hash', 'lastUsedAt', 'revokedAt', 'createdAt']
const USAGE_FIELDS = ['userId', 'projectId', 'model', 'promptTokens', 'completionTokens', 'totalTokens', 'createdAt']

export async function findUserByEmail(email: string): Promise<AppUser | null> {
  const Query = new Parse.Query(classFor('AppUser'))
  Query.equalTo('email', email.toLowerCase())
  const obj = await Query.first({ useMasterKey: true })
  return obj ? toPlain<AppUser>(obj, USER_FIELDS) : null
}

export async function findUserById(id: string): Promise<AppUser | null> {
  const Query = new Parse.Query(classFor('AppUser'))
  const obj = await Query.get(id, { useMasterKey: true }).catch(() => null)
  return obj ? toPlain<AppUser>(obj, USER_FIELDS) : null
}

export async function findUserByStripeCustomerId(customerId: string): Promise<AppUser | null> {
  const Query = new Parse.Query(classFor('AppUser'))
  Query.equalTo('stripeCustomerId', customerId)
  const obj = await Query.first({ useMasterKey: true })
  return obj ? toPlain<AppUser>(obj, USER_FIELDS) : null
}

export async function countUsers(): Promise<number> {
  const Query = new Parse.Query(classFor('AppUser'))
  return Query.count({ useMasterKey: true })
}

export async function createUser(data: Omit<AppUser, 'id'>): Promise<AppUser> {
  const Obj = classFor('AppUser')
  const obj = new Obj()
  Object.entries(data).forEach(([k, v]) => obj.set(k, v))
  await obj.save(null, { useMasterKey: true })
  return toPlain<AppUser>(obj, USER_FIELDS)
}

export async function updateUser(id: string, patch: Partial<Omit<AppUser, 'id' | 'createdAt'>>): Promise<AppUser> {
  const Obj = classFor('AppUser')
  const obj = Obj.createWithoutData(id)
  Object.entries(patch).forEach(([k, v]) => obj.set(k, v))
  obj.set('updatedAt', Date.now())
  await obj.save(null, { useMasterKey: true })
  const fresh = await findUserById(id)
  if (!fresh) throw new Error('User not found after update')
  return fresh
}

export async function createSessionRecord(data: Omit<AppSession, 'id'> & { id?: string }): Promise<AppSession> {
  const Obj = classFor('AppSession')
  const obj = data.id ? Obj.createWithoutData(data.id) : new Obj()
  Object.entries(data).forEach(([k, v]) => {
    if (k !== 'id') obj.set(k, v)
  })
  await obj.save(null, { useMasterKey: true })
  return toPlain<AppSession>(obj, SESSION_FIELDS)
}

export async function findSession(id: string): Promise<AppSession | null> {
  const Query = new Parse.Query(classFor('AppSession'))
  const obj = await Query.get(id, { useMasterKey: true }).catch(() => null)
  return obj ? toPlain<AppSession>(obj, SESSION_FIELDS) : null
}

export async function deleteSession(id: string): Promise<void> {
  const Obj = classFor('AppSession')
  const obj = Obj.createWithoutData(id)
  await obj.destroy({ useMasterKey: true }).catch(() => {})
}

export async function pruneExpiredSessionRecords(now: number): Promise<void> {
  let deleted = 0
  do {
    const Query = new Parse.Query(classFor('AppSession'))
    Query.lessThan('expiresAt', now)
    Query.limit(1000)
    const rows = await Query.find({ useMasterKey: true })
    deleted = rows.length
    if (deleted) await Parse.Object.destroyAll(rows, { useMasterKey: true })
  } while (deleted >= 1000)
}

export async function countProjectsForOwner(ownerId: string): Promise<number> {
  const Query = new Parse.Query(classFor('EmailProject'))
  Query.equalTo('ownerId', ownerId)
  return Query.count({ useMasterKey: true })
}

export async function createProject(data: Omit<EmailProject, 'id'>): Promise<EmailProject> {
  const Obj = classFor('EmailProject')
  const obj = new Obj()
  Object.entries(data).forEach(([k, v]) => obj.set(k, v))
  await obj.save(null, { useMasterKey: true })
  return toPlain<EmailProject>(obj, PROJECT_FIELDS)
}

export async function getProject(id: string): Promise<EmailProject | null> {
  const Query = new Parse.Query(classFor('EmailProject'))
  const obj = await Query.get(id, { useMasterKey: true }).catch(() => null)
  return obj ? toPlain<EmailProject>(obj, PROJECT_FIELDS) : null
}

export async function listProjects(ownerId: string): Promise<EmailProject[]> {
  const Query = new Parse.Query(classFor('EmailProject'))
  Query.equalTo('ownerId', ownerId)
  Query.descending('updatedAt')
  Query.limit(1000)
  const rows = await Query.find({ useMasterKey: true })
  return rows.map((obj: Parse.Object) => toPlain<EmailProject>(obj, PROJECT_FIELDS))
}

export async function updateProject(id: string, patch: Partial<Omit<EmailProject, 'id' | 'ownerId' | 'createdAt'>>): Promise<EmailProject> {
  const Obj = classFor('EmailProject')
  const obj = Obj.createWithoutData(id)
  Object.entries(patch).forEach(([k, v]) => obj.set(k, v))
  obj.set('updatedAt', Date.now())
  await obj.save(null, { useMasterKey: true })
  const fresh = await getProject(id)
  if (!fresh) throw new Error('Project not found after update')
  return fresh
}

export async function deleteProject(id: string): Promise<void> {
  const Obj = classFor('EmailProject')
  await Obj.createWithoutData(id).destroy({ useMasterKey: true })
}

export async function createChatMessage(data: Omit<EmailChatMessage, 'id'> & { id?: string }): Promise<EmailChatMessage> {
  const Obj = classFor('EmailChatMessage')
  const obj = data.id ? Obj.createWithoutData(data.id) : new Obj()
  Object.entries(data).forEach(([k, v]) => {
    if (k !== 'id') obj.set(k, v)
  })
  await obj.save(null, { useMasterKey: true })
  return toPlain<EmailChatMessage>(obj, MESSAGE_FIELDS)
}

export async function listChatMessages(projectId: string): Promise<EmailChatMessage[]> {
  const Query = new Parse.Query(classFor('EmailChatMessage'))
  Query.equalTo('projectId', projectId)
  Query.ascending('createdAt')
  Query.limit(1000)
  const rows = await Query.find({ useMasterKey: true })
  return rows.map((obj: Parse.Object) => toPlain<EmailChatMessage>(obj, MESSAGE_FIELDS))
}

export async function deleteChatMessages(projectId: string): Promise<void> {
  let deleted = 0
  do {
    const Query = new Parse.Query(classFor('EmailChatMessage'))
    Query.equalTo('projectId', projectId)
    Query.limit(1000)
    const rows = await Query.find({ useMasterKey: true })
    deleted = rows.length
    if (deleted) await Parse.Object.destroyAll(rows, { useMasterKey: true })
  } while (deleted >= 1000)
}

export async function countActiveApiKeys(ownerId: string): Promise<number> {
  const Query = new Parse.Query(classFor('ApiKey'))
  Query.equalTo('ownerId', ownerId)
  Query.doesNotExist('revokedAt')
  return Query.count({ useMasterKey: true })
}

export async function createApiKeyRecord(data: Omit<ApiKeyRecord, 'id'>): Promise<ApiKeyRecord> {
  const Obj = classFor('ApiKey')
  const obj = new Obj()
  Object.entries(data).forEach(([k, v]) => obj.set(k, v))
  await obj.save(null, { useMasterKey: true })
  return toPlain<ApiKeyRecord>(obj, API_KEY_FIELDS)
}

export async function getApiKeyById(id: string): Promise<ApiKeyRecord | null> {
  const Query = new Parse.Query(classFor('ApiKey'))
  const obj = await Query.get(id, { useMasterKey: true }).catch(() => null)
  return obj ? toPlain<ApiKeyRecord>(obj, API_KEY_FIELDS) : null
}

export async function listApiKeys(ownerId: string): Promise<ApiKeyRecord[]> {
  const Query = new Parse.Query(classFor('ApiKey'))
  Query.equalTo('ownerId', ownerId)
  Query.descending('createdAt')
  Query.limit(1000)
  const rows = await Query.find({ useMasterKey: true })
  return rows.map((obj: Parse.Object) => toPlain<ApiKeyRecord>(obj, API_KEY_FIELDS))
}

export async function getActiveApiKeyByHash(hash: string): Promise<ApiKeyRecord | null> {
  const Query = new Parse.Query(classFor('ApiKey'))
  Query.equalTo('hash', hash)
  Query.doesNotExist('revokedAt')
  const obj = await Query.first({ useMasterKey: true })
  return obj ? toPlain<ApiKeyRecord>(obj, API_KEY_FIELDS) : null
}

export async function revokeApiKey(id: string): Promise<void> {
  const Obj = classFor('ApiKey')
  const obj = Obj.createWithoutData(id)
  obj.set('revokedAt', Date.now())
  await obj.save(null, { useMasterKey: true })
}

export async function touchApiKey(id: string): Promise<void> {
  const Obj = classFor('ApiKey')
  const obj = Obj.createWithoutData(id)
  obj.set('lastUsedAt', Date.now())
  await obj.save(null, { useMasterKey: true })
}

export async function recordAiUsage(data: AiUsageRecord): Promise<void> {
  const Obj = classFor('AiUsage')
  const obj = new Obj()
  Object.entries(data).forEach(([k, v]) => obj.set(k, v))
  await obj.save(null, { useMasterKey: true })
}

export async function pingParse(): Promise<boolean> {
  const Query = new Parse.Query(classFor('AppUser'))
  Query.limit(1)
  await Query.find({ useMasterKey: true })
  return true
}

export async function countAiUsageSince(userId: string, since: number): Promise<number> {
  const Query = new Parse.Query(classFor('AiUsage'))
  Query.equalTo('userId', userId)
  Query.greaterThanOrEqualTo('createdAt', since)
  return Query.count({ useMasterKey: true })
}

export async function summarizeAiUsage(userId: string, since: number): Promise<{ used: number, totalTokens: number }> {
  const count = await countAiUsageSince(userId, since)
  let totalTokens = 0
  let skip = 0
  while (skip < count) {
    const Query = new Parse.Query(classFor('AiUsage'))
    Query.equalTo('userId', userId)
    Query.greaterThanOrEqualTo('createdAt', since)
    Query.select('totalTokens')
    Query.skip(skip)
    Query.limit(1000)
    const rows = await Query.find({ useMasterKey: true })
    if (!rows.length) break
    totalTokens += rows.reduce((sum: number, row: Parse.Object) => sum + Number(row.get('totalTokens') || 0), 0)
    skip += rows.length
  }
  return { used: count, totalTokens }
}
