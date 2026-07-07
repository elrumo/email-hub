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
  /** containing Project (null on legacy rows until adopted) */
  projectId: string | null
  /** containing Folder within the project (null = project root) */
  folderId: string | null
  /** public share link token (null = not shared) */
  shareToken: string | null
  /** 'view' = anyone with the link; 'edit' = signed-in users with the link */
  shareMode: string | null
  /** last editor (client tab id) — used to suppress echo in live sync */
  lastActorId: string | null
  createdAt: number
  updatedAt: number
}

/** A project: the top-level container users organise their emails into. */
export interface ProjectContainer {
  id: string
  ownerId: string
  name: string
  /** user ids with full view/edit access to everything in the project */
  memberIds: string[]
  /** public share link token (null = not shared) */
  shareToken: string | null
  /** 'view' | 'edit' — link access level for the whole project */
  shareMode: string | null
  createdAt: number
  updatedAt: number
}

/** A folder inside a project; folders can nest via parentId. */
export interface ProjectFolder {
  id: string
  ownerId: string
  projectId: string
  parentId: string | null
  name: string
  createdAt: number
  updatedAt: number
}

/** A point-in-time snapshot of one email, for the History panel. */
export interface EmailVersion {
  id: string
  /** the EmailProject this version belongs to */
  projectId: string
  /** email name at snapshot time */
  name: string
  document: EmailDocument
  variables: TemplateVariable[]
  /** what produced the snapshot: 'ai' | 'manual' | 'restore' */
  cause: string
  createdAt: number
}

/** A user-saved reusable email template. */
export interface UserTemplate {
  id: string
  ownerId: string
  name: string
  description: string
  document: EmailDocument
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
const PROJECT_FIELDS = ['ownerId', 'name', 'document', 'variables', 'projectId', 'folderId', 'shareToken', 'shareMode', 'lastActorId', 'createdAt', 'updatedAt']
const CONTAINER_FIELDS = ['ownerId', 'name', 'memberIds', 'shareToken', 'shareMode', 'createdAt', 'updatedAt']
const FOLDER_FIELDS = ['ownerId', 'projectId', 'parentId', 'name', 'createdAt', 'updatedAt']
const MESSAGE_FIELDS = ['projectId', 'role', 'parts', 'createdAt']
const VERSION_FIELDS = ['projectId', 'name', 'document', 'variables', 'cause', 'createdAt']
const USER_TEMPLATE_FIELDS = ['ownerId', 'name', 'description', 'document', 'createdAt', 'updatedAt']
const API_KEY_FIELDS = ['ownerId', 'name', 'prefix', 'hash', 'lastUsedAt', 'revokedAt', 'createdAt']

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

/**
 * Fields selected for list views: everything except the (potentially large)
 * block tree — `document` comes back as just `{ settings }`, which is all any
 * list consumer reads (the subject). Fetch a single project for full blocks.
 */
const PROJECT_LIST_SELECT = [...PROJECT_FIELDS.filter(f => f !== 'document'), 'document.settings']

export async function listProjects(ownerId: string): Promise<EmailProject[]> {
  const Query = new Parse.Query(classFor('EmailProject'))
  Query.equalTo('ownerId', ownerId)
  Query.descending('updatedAt')
  Query.select(...PROJECT_LIST_SELECT)
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

// --- Project containers & folders -------------------------------------------

export async function listContainers(ownerId: string): Promise<ProjectContainer[]> {
  const Query = new Parse.Query(classFor('ProjectContainer'))
  Query.equalTo('ownerId', ownerId)
  Query.descending('updatedAt')
  Query.limit(1000)
  const rows = await Query.find({ useMasterKey: true })
  return rows.map((obj: Parse.Object) => toPlain<ProjectContainer>(obj, CONTAINER_FIELDS))
}

export async function getContainer(id: string): Promise<ProjectContainer | null> {
  const Query = new Parse.Query(classFor('ProjectContainer'))
  const obj = await Query.get(id, { useMasterKey: true }).catch(() => null)
  return obj ? toPlain<ProjectContainer>(obj, CONTAINER_FIELDS) : null
}

export async function createContainer(data: Omit<ProjectContainer, 'id'>): Promise<ProjectContainer> {
  const Obj = classFor('ProjectContainer')
  const obj = new Obj()
  Object.entries(data).forEach(([k, v]) => obj.set(k, v))
  await obj.save(null, { useMasterKey: true })
  return toPlain<ProjectContainer>(obj, CONTAINER_FIELDS)
}

export async function updateContainer(id: string, patch: Partial<Omit<ProjectContainer, 'id' | 'ownerId' | 'createdAt'>>): Promise<ProjectContainer> {
  const Obj = classFor('ProjectContainer')
  const obj = Obj.createWithoutData(id)
  Object.entries(patch).forEach(([k, v]) => obj.set(k, v))
  obj.set('updatedAt', Date.now())
  await obj.save(null, { useMasterKey: true })
  const fresh = await getContainer(id)
  if (!fresh) throw new Error('Project not found after update')
  return fresh
}

export async function deleteContainer(id: string): Promise<void> {
  const Obj = classFor('ProjectContainer')
  await Obj.createWithoutData(id).destroy({ useMasterKey: true })
}

export async function listFolders(projectId: string): Promise<ProjectFolder[]> {
  const Query = new Parse.Query(classFor('ProjectFolder'))
  Query.equalTo('projectId', projectId)
  Query.ascending('name')
  Query.limit(1000)
  const rows = await Query.find({ useMasterKey: true })
  return rows.map((obj: Parse.Object) => toPlain<ProjectFolder>(obj, FOLDER_FIELDS))
}

export async function getFolder(id: string): Promise<ProjectFolder | null> {
  const Query = new Parse.Query(classFor('ProjectFolder'))
  const obj = await Query.get(id, { useMasterKey: true }).catch(() => null)
  return obj ? toPlain<ProjectFolder>(obj, FOLDER_FIELDS) : null
}

export async function createFolder(data: Omit<ProjectFolder, 'id'>): Promise<ProjectFolder> {
  const Obj = classFor('ProjectFolder')
  const obj = new Obj()
  Object.entries(data).forEach(([k, v]) => obj.set(k, v))
  await obj.save(null, { useMasterKey: true })
  return toPlain<ProjectFolder>(obj, FOLDER_FIELDS)
}

export async function updateFolder(id: string, patch: Partial<Omit<ProjectFolder, 'id' | 'ownerId' | 'projectId' | 'createdAt'>>): Promise<ProjectFolder> {
  const Obj = classFor('ProjectFolder')
  const obj = Obj.createWithoutData(id)
  Object.entries(patch).forEach(([k, v]) => obj.set(k, v))
  obj.set('updatedAt', Date.now())
  await obj.save(null, { useMasterKey: true })
  const fresh = await getFolder(id)
  if (!fresh) throw new Error('Folder not found after update')
  return fresh
}

export async function deleteFolder(id: string): Promise<void> {
  const Obj = classFor('ProjectFolder')
  await Obj.createWithoutData(id).destroy({ useMasterKey: true })
}

export async function findEmailByShareToken(token: string): Promise<EmailProject | null> {
  const Query = new Parse.Query(classFor('EmailProject'))
  Query.equalTo('shareToken', token)
  const obj = await Query.first({ useMasterKey: true })
  return obj ? toPlain<EmailProject>(obj, PROJECT_FIELDS) : null
}

export async function findContainerByShareToken(token: string): Promise<ProjectContainer | null> {
  const Query = new Parse.Query(classFor('ProjectContainer'))
  Query.equalTo('shareToken', token)
  const obj = await Query.first({ useMasterKey: true })
  return obj ? toPlain<ProjectContainer>(obj, CONTAINER_FIELDS) : null
}

/** All emails inside one project container (list-light: document = settings only). */
export async function listEmailsInContainer(projectId: string): Promise<EmailProject[]> {
  const Query = new Parse.Query(classFor('EmailProject'))
  Query.equalTo('projectId', projectId)
  Query.descending('updatedAt')
  Query.select(...PROJECT_LIST_SELECT)
  Query.limit(1000)
  const rows = await Query.find({ useMasterKey: true })
  return rows.map((obj: Parse.Object) => toPlain<EmailProject>(obj, PROJECT_FIELDS))
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

// --- Version history ----------------------------------------------------------

/** How many snapshots we keep per email; older ones are pruned on write. */
export const VERSIONS_KEPT_PER_EMAIL = 50

export async function createEmailVersion(data: Omit<EmailVersion, 'id'>): Promise<EmailVersion> {
  const Obj = classFor('EmailVersion')
  const obj = new Obj()
  Object.entries(data).forEach(([k, v]) => obj.set(k, v))
  await obj.save(null, { useMasterKey: true })
  // Best-effort prune: history is a convenience, never fail the write for it.
  await pruneEmailVersions(data.projectId).catch(() => {})
  return toPlain<EmailVersion>(obj, VERSION_FIELDS)
}

export async function listEmailVersions(projectId: string, limit = VERSIONS_KEPT_PER_EMAIL): Promise<EmailVersion[]> {
  const Query = new Parse.Query(classFor('EmailVersion'))
  Query.equalTo('projectId', projectId)
  Query.descending('createdAt')
  Query.limit(limit)
  const rows = await Query.find({ useMasterKey: true })
  return rows.map((obj: Parse.Object) => toPlain<EmailVersion>(obj, VERSION_FIELDS))
}

export async function getEmailVersion(id: string): Promise<EmailVersion | null> {
  const Query = new Parse.Query(classFor('EmailVersion'))
  const obj = await Query.get(id, { useMasterKey: true }).catch(() => null)
  return obj ? toPlain<EmailVersion>(obj, VERSION_FIELDS) : null
}

/** Most recent snapshot's timestamp for an email (0 = none yet). */
export async function latestEmailVersionAt(projectId: string): Promise<number> {
  const Query = new Parse.Query(classFor('EmailVersion'))
  Query.equalTo('projectId', projectId)
  Query.descending('createdAt')
  Query.select('createdAt')
  const obj = await Query.first({ useMasterKey: true })
  return obj ? Number(obj.get('createdAt') || 0) : 0
}

async function pruneEmailVersions(projectId: string): Promise<void> {
  const Query = new Parse.Query(classFor('EmailVersion'))
  Query.equalTo('projectId', projectId)
  Query.descending('createdAt')
  Query.skip(VERSIONS_KEPT_PER_EMAIL)
  Query.limit(1000)
  const stale = await Query.find({ useMasterKey: true })
  if (stale.length) await Parse.Object.destroyAll(stale, { useMasterKey: true })
}

export async function deleteEmailVersions(projectId: string): Promise<void> {
  let deleted = 0
  do {
    const Query = new Parse.Query(classFor('EmailVersion'))
    Query.equalTo('projectId', projectId)
    Query.limit(1000)
    const rows = await Query.find({ useMasterKey: true })
    deleted = rows.length
    if (deleted) await Parse.Object.destroyAll(rows, { useMasterKey: true })
  } while (deleted >= 1000)
}

// --- User templates -------------------------------------------------------------

export async function createUserTemplate(data: Omit<UserTemplate, 'id'>): Promise<UserTemplate> {
  const Obj = classFor('UserTemplate')
  const obj = new Obj()
  Object.entries(data).forEach(([k, v]) => obj.set(k, v))
  await obj.save(null, { useMasterKey: true })
  return toPlain<UserTemplate>(obj, USER_TEMPLATE_FIELDS)
}

/** List-light: skips each template's document (fetched individually on use). */
export async function listUserTemplates(ownerId: string): Promise<UserTemplate[]> {
  const Query = new Parse.Query(classFor('UserTemplate'))
  Query.equalTo('ownerId', ownerId)
  Query.descending('updatedAt')
  Query.select(...USER_TEMPLATE_FIELDS.filter(f => f !== 'document'))
  Query.limit(200)
  const rows = await Query.find({ useMasterKey: true })
  return rows.map((obj: Parse.Object) => toPlain<UserTemplate>(obj, USER_TEMPLATE_FIELDS))
}

export async function getUserTemplate(id: string): Promise<UserTemplate | null> {
  const Query = new Parse.Query(classFor('UserTemplate'))
  const obj = await Query.get(id, { useMasterKey: true }).catch(() => null)
  return obj ? toPlain<UserTemplate>(obj, USER_TEMPLATE_FIELDS) : null
}

export async function deleteUserTemplate(id: string): Promise<void> {
  const Obj = classFor('UserTemplate')
  await Obj.createWithoutData(id).destroy({ useMasterKey: true })
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

export async function listAllUsers(): Promise<AppUser[]> {
  const out: AppUser[] = []
  let skip = 0
  for (;;) {
    const Query = new Parse.Query(classFor('AppUser'))
    Query.ascending('createdAt')
    Query.skip(skip)
    Query.limit(1000)
    const rows = await Query.find({ useMasterKey: true })
    out.push(...rows.map((obj: Parse.Object) => toPlain<AppUser>(obj, USER_FIELDS)))
    if (rows.length < 1000) break
    skip += rows.length
  }
  return out
}

/** Owner id of every project, used for per-user counts in the admin view. */
export async function listProjectOwnerIds(): Promise<string[]> {
  const out: string[] = []
  let skip = 0
  for (;;) {
    const Query = new Parse.Query(classFor('EmailProject'))
    Query.select('ownerId')
    Query.skip(skip)
    Query.limit(1000)
    const rows = await Query.find({ useMasterKey: true })
    out.push(...rows.map((obj: Parse.Object) => String(obj.get('ownerId'))))
    if (rows.length < 1000) break
    skip += rows.length
  }
  return out
}

/** All AI usage rows since a timestamp (userId + tokens), for admin stats. */
export async function listAiUsageSince(since: number): Promise<Array<{ userId: string, totalTokens: number }>> {
  const out: Array<{ userId: string, totalTokens: number }> = []
  let skip = 0
  for (;;) {
    const Query = new Parse.Query(classFor('AiUsage'))
    Query.greaterThanOrEqualTo('createdAt', since)
    Query.select('userId', 'totalTokens')
    Query.skip(skip)
    Query.limit(1000)
    const rows = await Query.find({ useMasterKey: true })
    out.push(...rows.map((obj: Parse.Object) => ({
      userId: String(obj.get('userId')),
      totalTokens: Number(obj.get('totalTokens') || 0)
    })))
    if (rows.length < 1000) break
    skip += rows.length
  }
  return out
}

export interface TriggerSetting {
  id: string
  /** trigger key: welcome | purchase | inactive */
  trigger: string
  /** EmailProject id used as the template, or null when unset */
  projectId: string | null
  enabled: boolean
  /** months of no logins before the inactivity trigger fires */
  inactiveAfterMonths: number | null
  updatedAt: number
}

const TRIGGER_SETTING_FIELDS = ['trigger', 'projectId', 'enabled', 'inactiveAfterMonths', 'updatedAt']

export async function listTriggerSettings(): Promise<TriggerSetting[]> {
  const Query = new Parse.Query(classFor('TriggerSetting'))
  Query.limit(100)
  const rows = await Query.find({ useMasterKey: true })
  return rows.map((obj: Parse.Object) => toPlain<TriggerSetting>(obj, TRIGGER_SETTING_FIELDS))
}

export async function getTriggerSetting(trigger: string): Promise<TriggerSetting | null> {
  const Query = new Parse.Query(classFor('TriggerSetting'))
  Query.equalTo('trigger', trigger)
  const obj = await Query.first({ useMasterKey: true })
  return obj ? toPlain<TriggerSetting>(obj, TRIGGER_SETTING_FIELDS) : null
}

export async function upsertTriggerSetting(data: Omit<TriggerSetting, 'id' | 'updatedAt'>): Promise<TriggerSetting> {
  const Query = new Parse.Query(classFor('TriggerSetting'))
  Query.equalTo('trigger', data.trigger)
  const existing = await Query.first({ useMasterKey: true })
  const Obj = classFor('TriggerSetting')
  const obj = existing ?? new Obj()
  Object.entries(data).forEach(([k, v]) => obj.set(k, v))
  obj.set('updatedAt', Date.now())
  await obj.save(null, { useMasterKey: true })
  return toPlain<TriggerSetting>(obj, TRIGGER_SETTING_FIELDS)
}

export interface TriggerSendLog {
  id: string
  userId: string
  trigger: string
  projectId: string | null
  sentAt: number
}

export async function recordTriggerSend(data: Omit<TriggerSendLog, 'id'>): Promise<void> {
  const Obj = classFor('TriggerSendLog')
  const obj = new Obj()
  Object.entries(data).forEach(([k, v]) => obj.set(k, v))
  await obj.save(null, { useMasterKey: true })
}

/** Most recent time this trigger was sent to this user (0 = never). */
export async function lastTriggerSendAt(userId: string, trigger: string): Promise<number> {
  const Query = new Parse.Query(classFor('TriggerSendLog'))
  Query.equalTo('userId', userId)
  Query.equalTo('trigger', trigger)
  Query.descending('sentAt')
  const obj = await Query.first({ useMasterKey: true })
  return obj ? Number(obj.get('sentAt') || 0) : 0
}

/** Users whose last login (or signup) is older than the cutoff. */
export async function listUsersInactiveSince(cutoff: number): Promise<AppUser[]> {
  const users = await listAllUsers()
  return users.filter(u => (u.lastLoginAt ?? u.createdAt) < cutoff)
}

/**
 * Store an uploaded file via Parse's file adapter (GridFS in Mongo by default,
 * S3 when configured) and return its public URL. Parse prefixes the name with
 * a unique id, so collisions are impossible.
 */
export async function saveParseFile(name: string, base64: string, contentType: string): Promise<{ url: string, name: string }> {
  const P = initParse()
  const file = new P.File(name, { base64 }, contentType)
  await file.save({ useMasterKey: true })
  let url = file.url()
  // Files must be reachable by email clients / browsers: prefer the public URL.
  const publicUrl = (process.env.PARSE_PUBLIC_URL || '').replace(/\/$/, '')
  if (publicUrl && url) {
    const serverUrl = getParseServerUrl().replace(/\/$/, '')
    if (url.startsWith(serverUrl)) url = publicUrl + url.slice(serverUrl.length)
  }
  return { url, name: file.name() }
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
