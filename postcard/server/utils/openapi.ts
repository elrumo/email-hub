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
        'Fetch the rendered HTML of your Postcard email projects, with optional mustache variable substitution. Authenticate with a personal API key as a Bearer token.'
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
            subject: { type: 'string' },
            variables: { type: 'array', items: { $ref: '#/components/schemas/TemplateVariable' } },
            updatedAt: { type: 'integer', description: 'epoch ms' }
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
