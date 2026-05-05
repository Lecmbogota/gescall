const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const routerPath = path.join(__dirname, '..', 'routes', 'supervisorAgents.js');
const pgPath = path.join(__dirname, '..', 'config', 'pgDatabase.js');
const redisPath = path.join(__dirname, '..', 'config', 'redisClient.js');
const permsPath = path.join(__dirname, '..', 'lib', 'supervisorAgentPermissions.js');
const servicePath = path.join(__dirname, '..', 'services', 'supervisorCallService.js');

function loadRouterWithMocks({ pg, redis, perms, service }) {
  delete require.cache[routerPath];
  require.cache[pgPath] = { id: pgPath, filename: pgPath, loaded: true, exports: pg };
  require.cache[redisPath] = { id: redisPath, filename: redisPath, loaded: true, exports: redis };
  require.cache[permsPath] = { id: permsPath, filename: permsPath, loaded: true, exports: perms };
  require.cache[servicePath] = { id: servicePath, filename: servicePath, loaded: true, exports: service };
  return require(routerPath);
}

function getPostHandler(router, routePath) {
  const layer = router.stack.find((entry) => entry.route && entry.route.path === routePath && entry.route.methods.post);
  assert.ok(layer, `No se encontró ruta POST ${routePath}`);
  return layer.route.stack[0].handle;
}

function createReqRes({ username = 'agente1', actor = 'sup1', io = { emit: () => {} } } = {}) {
  const req = {
    params: { username },
    user: { username: actor },
    app: {
      get(key) {
        return key === 'io' ? io : undefined;
      },
    },
  };
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return { req, res };
}

test('rechaza acciones cuando no tiene rol supervisor (403)', async () => {
  const router = loadRouterWithMocks({
    pg: { query: async () => ({ rows: [] }) },
    redis: { hGetAll: async () => ({}) },
    perms: { canManageSupervisorAgentActions: async () => false },
    service: {
      createSupervisorSnoop: async () => ({ success: true, data: {} }),
      applyForceReady: async () => {},
      applyRemoteLogout: async () => ({ ok: true, data: { disconnectedSockets: 0 } }),
    },
  });
  const handler = getPostHandler(router, '/:username/force-ready');
  const { req, res } = createReqRes();

  await handler(req, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'SUPERVISOR_FORBIDDEN');
  assert.equal(res.body.success, false);
});

test('spy rechaza si el agente no está ON_CALL (409)', async () => {
  let snoopCalled = false;
  const router = loadRouterWithMocks({
    pg: {
      query: async () => ({
        rows: [{ user_id: 10, username: 'agente1', active: true }],
      }),
    },
    redis: { hGetAll: async () => ({ state: 'READY' }) },
    perms: { canManageSupervisorAgentActions: async () => true },
    service: {
      createSupervisorSnoop: async () => {
        snoopCalled = true;
        return { success: true, data: {} };
      },
      applyForceReady: async () => {},
      applyRemoteLogout: async () => ({ ok: true, data: { disconnectedSockets: 0 } }),
    },
  });
  const handler = getPostHandler(router, '/:username/spy');
  const { req, res } = createReqRes();

  await handler(req, res);

  assert.equal(res.statusCode, 409);
  assert.equal(res.body.code, 'SUPERVISION_NEEDS_ON_CALL');
  assert.equal(snoopCalled, false);
});

test('spy devuelve 412 cuando falta endpoint del supervisor', async () => {
  const router = loadRouterWithMocks({
    pg: {
      query: async () => ({
        rows: [{ user_id: 10, username: 'agente1', active: true }],
      }),
    },
    redis: { hGetAll: async () => ({ state: 'ON_CALL' }) },
    perms: { canManageSupervisorAgentActions: async () => true },
    service: {
      createSupervisorSnoop: async () => ({
        success: false,
        code: 'SUPERVISOR_ENDPOINT_MISSING',
        error: 'Falta endpoint',
      }),
      applyForceReady: async () => {},
      applyRemoteLogout: async () => ({ ok: true, data: { disconnectedSockets: 0 } }),
    },
  });
  const handler = getPostHandler(router, '/:username/spy');
  const { req, res } = createReqRes();

  await handler(req, res);

  assert.equal(res.statusCode, 412);
  assert.equal(res.body.code, 'SUPERVISOR_ENDPOINT_MISSING');
  assert.equal(res.body.success, false);
});

test('force-ready exitoso cuando agente está en pausa elegible', async () => {
  let calledWith = null;
  const io = { emit: () => {} };
  const router = loadRouterWithMocks({
    pg: {
      query: async () => ({
        rows: [{ user_id: 11, username: 'agente1', active: true }],
      }),
    },
    redis: { hGetAll: async () => ({ state: 'PAUSED' }) },
    perms: { canManageSupervisorAgentActions: async () => true },
    service: {
      createSupervisorSnoop: async () => ({ success: true, data: {} }),
      applyForceReady: async (passedIo, username) => {
        calledWith = { passedIo, username };
      },
      applyRemoteLogout: async () => ({ ok: true, data: { disconnectedSockets: 0 } }),
    },
  });
  const handler = getPostHandler(router, '/:username/force-ready');
  const { req, res } = createReqRes({ io });

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.state, 'READY');
  assert.deepEqual(calledWith, { passedIo: io, username: 'agente1' });
});

test('remote-logout expone ruta nueva y ejecuta servicio', async () => {
  let calledWith = null;
  const io = { emit: () => {} };
  const router = loadRouterWithMocks({
    pg: {
      query: async () => ({
        rows: [{ user_id: 12, username: 'agente1', active: true }],
      }),
    },
    redis: { hGetAll: async () => ({ state: 'READY' }) },
    perms: { canManageSupervisorAgentActions: async () => true },
    service: {
      createSupervisorSnoop: async () => ({ success: true, data: {} }),
      applyForceReady: async () => {},
      applyRemoteLogout: async (passedIo, username, options) => {
        calledWith = { passedIo, username, options };
        return { ok: true, data: { disconnectedSockets: 1 } };
      },
    },
  });
  const handler = getPostHandler(router, '/:username/remote-logout');
  const { req, res } = createReqRes({ io });

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.state, 'OFFLINE');
  assert.equal(res.body.data.disconnectedSockets, 1);
  assert.deepEqual(calledWith, { passedIo: io, username: 'agente1', options: { hangupFirst: false } });
});
