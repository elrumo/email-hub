/**
 * The OpenAPI 3.1 document describing Postcard's public REST API. Served at
 * /api/openapi.json and rendered as interactive docs in the app. Kept hand-
 * authored (rather than generated) so the contract is explicit and stable.
 */
export function buildOpenApiDocument(appUrl: string): Record<string, unknown> {
  const server = appUrl || 'http://localhost:3000'
  return {
    openapi: '3.1.0',
    info: {
      title: 'Postcard API',
      version: '1.0.0',
      description:
        'Fetch the rendered HTML of your Postcard email projects, create new ones (from a template or an AI prompt), and send emails — with optional mustache variable substitution. Authenticate with a personal API key as a Bearer token.'
    },
    servers: [{ url: `${server}/api/v1` }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          description: 'A personal API key, e.g. `Authorization: Bearer pc_live_…`'
        }
      },
      schemas: {
        ProjectSummary: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: ['string', 'null'], description: 'free-text description' },
            tags: { type: 'array', items: { type: 'string' }, description: 'user-defined labels' },
            subject: { type: 'string' },
            variables: { type: 'array', items: { $ref: '#/components/schemas/TemplateVariable' } },
            projectId: { type: ['string', 'null'], description: 'id of the containing project' },
            folderId: { type: ['string', 'null'] },
            updatedAt: { type: 'integer', description: 'epoch ms' },
            createdAt: { type: 'integer', description: 'epoch ms' }
          }
        },
        TemplateDetail: {
          allOf: [
            { $ref: '#/components/schemas/ProjectSummary' },
            {
              type: 'object',
              properties: {
                projectName: { type: ['string', 'null'], description: 'name of the containing project' },
                document: { type: 'object', description: 'the structured block document (only with include=full)' },
                html: { type: 'string', description: 'rendered, email-safe HTML (only with include=full)' }
              }
            }
          ]
        },
        TemplateList: {
          type: 'object',
          properties: {
            projectId: { type: ['string', 'null'], description: 'the project scoped to, or null for the root (all projects)' },
            projectName: { type: ['string', 'null'] },
            include: { type: 'string', enum: ['metadata', 'full'] },
            count: { type: 'integer' },
            templates: { type: 'array', items: { $ref: '#/components/schemas/TemplateDetail' } }
          }
        },
        TemplateVariable: {
          type: 'object',
          properties: {
            key: { type: 'string' },
            label: { type: 'string' },
            defaultValue: { type: 'string' }
          }
        },
        ProjectHtml: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            subject: { type: 'string' },
            html: { type: 'string', description: 'rendered, email-safe HTML' }
          }
        },
        Error: {
          type: 'object',
          properties: { error: { type: 'string' } }
        }
      }
    },
    paths: {
      '/projects': {
        get: {
          summary: 'List your email projects',
          operationId: 'listProjects',
          responses: {
            200: {
              description: 'Array of project summaries',
              content: {
                'application/json': {
                  schema: { type: 'array', items: { $ref: '#/components/schemas/ProjectSummary' } }
                }
              }
            },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
          }
        },
        post: {
          summary: 'Create an email project',
          description:
            'Create a new email project. Pass `prompt` to have Postcard AI design the whole email from your brief (counts against your plan\'s monthly AI allowance), `templateId` to start from a predefined template, or neither for a blank canvas.',
          operationId: 'createProject',
          requestBody: {
            required: false,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'project name (defaults to the email subject)' },
                    description: { type: 'string', description: 'optional free-text description' },
                    tags: { type: 'array', items: { type: 'string' }, description: 'optional user-defined labels' },
                    templateId: { type: 'string', description: 'a predefined template id' },
                    prompt: { type: 'string', description: 'an AI brief, e.g. "a welcome email for a coffee subscription"' }
                  }
                }
              }
            }
          },
          responses: {
            201: { description: 'The created project', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectSummary' } } } },
            402: { description: 'Plan limit reached (projects or AI messages)', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            502: { description: 'The assistant could not produce an email' }
          }
        }
      },
      '/send': {
        post: {
          summary: 'Send an email',
          description:
            'Send an email to up to 50 recipients — either raw HTML supplied in the request body, or one of your stored projects rendered with `variables` substituted into its `{{ mustache }}` placeholders. Requires the server to have SMTP configured.',
          operationId: 'sendEmail',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['to'],
                  properties: {
                    to: {
                      oneOf: [
                        { type: 'string', format: 'email' },
                        { type: 'array', items: { type: 'string', format: 'email' }, maxItems: 50 }
                      ]
                    },
                    subject: { type: 'string', description: 'required with raw html; defaults to the project subject otherwise' },
                    html: { type: 'string', description: 'raw email HTML (alternative to projectId)' },
                    text: { type: 'string', description: 'optional plain-text alternative' },
                    projectId: { type: 'string', description: 'send a stored project (alternative to html)' },
                    variables: {
                      type: 'object',
                      additionalProperties: { type: 'string' },
                      description: 'values substituted into the project\'s mustache placeholders'
                    }
                  }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Delivery summary',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      sent: { type: 'integer' },
                      failed: { type: 'array', items: { type: 'string' } },
                      subject: { type: 'string' }
                    }
                  }
                }
              }
            },
            422: { description: 'Validation error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            503: { description: 'SMTP not configured on this server' }
          }
        }
      },
      '/projects/{id}': {
        get: {
          summary: 'Get one project (metadata + variables)',
          operationId: 'getProject',
          parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
          responses: {
            200: { description: 'Project summary', content: { 'application/json': { schema: { $ref: '#/components/schemas/ProjectSummary' } } } },
            404: { description: 'Not found' }
          }
        }
      },
      '/templates': {
        get: {
          summary: 'List templates from a project (or the root)',
          description:
            'List every template (email document) you own. Pass `projectId` to scope to a single project; omit it (or pass `root`) to get every template across all your projects — the root that holds them all. `include=metadata` (default) returns lightweight metadata and ids; `include=full` also returns each template\'s structured `document` and rendered `html` (with each variable\'s default value substituted).',
          operationId: 'listTemplates',
          parameters: [
            { name: 'projectId', in: 'query', required: false, schema: { type: 'string' }, description: 'a project id, or `root`/omitted for all projects' },
            { name: 'include', in: 'query', required: false, schema: { type: 'string', enum: ['metadata', 'full'], default: 'metadata' } }
          ],
          responses: {
            200: { description: 'The matching templates', content: { 'application/json': { schema: { $ref: '#/components/schemas/TemplateList' } } } },
            401: { description: 'Unauthorized', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            404: { description: 'Project not found' },
            422: { description: 'Invalid include value', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
          }
        }
      },
      '/projects/{id}/html': {
        get: {
          summary: 'Render one project to HTML',
          description:
            'Returns the rendered email HTML. Supply variable values as query params (e.g. `?firstName=Ada`) to substitute the template\'s `{{ mustache }}` placeholders; undeclared values fall back to each variable\'s default. Pass `?format=html` to receive raw `text/html` instead of JSON.',
          operationId: 'renderProjectHtml',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
            { name: 'format', in: 'query', required: false, schema: { type: 'string', enum: ['json', 'html'] } }
          ],
          responses: {
            200: {
              description: 'Rendered HTML',
              content: {
                'application/json': { schema: { $ref: '#/components/schemas/ProjectHtml' } },
                'text/html': { schema: { type: 'string' } }
              }
            },
            404: { description: 'Not found' }
          }
        }
      }
    }
  }
}
