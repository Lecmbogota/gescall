const serverUrl = process.env.PUBLIC_API_BASE_URL || 'https://gescall.balenthi.com';

const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: 'Gescall Public API',
    version: '1.1.0',
  },
  servers: [
    { url: serverUrl },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
      },
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
      },
    },
  },
  security: [
    { ApiKeyAuth: [] },
  ],
  paths: {
    '/api/public/v1/auth/login': {
      post: {
        summary: 'Login',
        description: 'Autenticación para obtener un API Key.',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['username', 'password'],
                properties: {
                  username: {
                    type: 'string',
                    description: 'Usuario para autenticación',
                  },
                  password: {
                    type: 'string',
                    description: 'Contraseña para autenticación',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Login exitoso - Se genera un nuevo API Key único con expiración de 90 días',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    api_key: { type: 'string', description: 'API Key único generado para este login. Válido por 90 días.' },
                    expires_at: { type: 'string', format: 'date-time', description: 'Fecha y hora de expiración del API Key (90 días desde la creación)' },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
          400: { description: 'Datos inválidos' },
          401: { description: 'Credenciales inválidas' },
          500: { description: 'Error del servidor' },
        },
      },
    },
    '/api/public/v1/campaigns': {
      post: {
        summary: 'Crear campaña',
        description: 'Crea una nueva campaña .',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['campaign_name', 'playback_mode'],
                properties: {
                  campaign_name: {
                    type: 'string',
                    description: 'Nombre de la campaña',
                  },
                  playback_mode: {
                    type: 'string',
                    enum: ['tts', 'static_audio'],
                    description: 'Modo de reproducción: tts para texto a voz, static_audio para audio estático',
                  },
                  user_group_list: {
                    type: 'string',
                    description: '(Opcional) ID del user group list. Si no se proporciona, la campaña se asigna al grupo por defecto. Si se proporciona, la campaña se asigna a ese grupo. Si el grupo no existe, se crea automáticamente.',
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Campaña creada exitosamente',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    campaign_id: { type: 'string', description: 'ID de campaña generado automáticamente' },
                    playback_mode: { type: 'string', enum: ['tts', 'static_audio'] },
                  },
                },
              },
            },
          },
          400: { description: 'Datos inválidos' },
          404: { description: 'Template campaign no encontrado' },
        },
      },
    },
    '/api/public/v1/campaigns/{campaign_id}/status': {
      post: {
        summary: 'Cambiar estado de campaña',
        parameters: [{ name: 'campaign_id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: {
                    type: 'integer',
                    enum: [0, 1],
                    description: '1 = Activo, 0 = Inactivo'
                  },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Estado actualizado' } },
      },
    },
    '/api/public/v1/campaigns/{campaign_id}/playback': {
      put: {
        summary: 'Configurar reproducción (TTS o audio estático)',
        parameters: [{ name: 'campaign_id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['playback_mode'],
                properties: {
                  playback_mode: { type: 'string', enum: ['tts', 'static_audio'] },
                  audio_filename: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Playback actualizado' } },
      },
      get: {
        summary: 'Consultar configuración de reproducción',
        parameters: [{ name: 'campaign_id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Playback actual' } },
      },
    },
    '/api/public/v1/lists/import': {
      post: {
        summary: 'Importar Contactos',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file', 'list_name', 'campaign_id'],
                properties: {
                  file: { type: 'string', format: 'binary', description: 'Archivo CSV con los leads' },
                  list_name: { type: 'string', description: 'Nombre de la nueva lista' },
                  campaign_id: { type: 'string', description: 'ID de la campaña a asociar' },
                  list_id: { type: 'string', description: '(Opcional) ID específico para la lista' },
                  active: { type: 'string', enum: ['Y', 'N'], default: 'Y' },
                  list_description: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Contactos importados' } },
      },
    },


    '/api/public/v1/reports/call-summary': {
      post: {
        summary: 'Resumen de llamadas',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['campaigns', 'startDatetime', 'endDatetime'],
                properties: {
                  campaigns: { type: 'array', items: { type: 'string' } },
                  startDatetime: { type: 'string' },
                  endDatetime: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Resumen' } },
      },
    },
    '/api/public/v1/audio': {
      get: {
        summary: 'Listar audios',
        responses: { 200: { description: 'Listado de audios' } },
      },
    },
    '/api/public/v1/audio/upload': {
      post: {
        summary: 'Subir audio',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['audio', 'campaign'],
                properties: {
                  audio: { type: 'string', format: 'binary' },
                  campaign: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Audio cargado' } },
      },
    },
    '/api/public/v1/calls': {
      post: {
        summary: 'Enviar llamada (External Dial)',
        description: 'Fuerza a un agente logueado a marcar un número inmediatamente. (Requires Agent Context)',
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['phone_number', 'campaign_id'],
                properties: {
                  phone_number: { type: 'string', description: 'Número a marcar (ej: 3001234567)' },
                  phone_code: { type: 'string', default: '57', description: 'Código de país' },
                  campaign_id: { type: 'string', description: 'ID de campaña para la llamada.' }
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Llamada iniciada',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    message: { type: 'string' },
                    data: { type: 'object' }
                  }
                }
              }
            }
          },
          400: { description: 'Error en parámetros o agente no disponible' },
          500: { description: 'Error del servidor' },
        },
      },
    },
  },
};

module.exports = swaggerSpec;
