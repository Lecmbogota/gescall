// Simple Node client to test Vicibroker responses
// Usage: node tools/vicibroker_test_client.js

const { io } = require('socket.io-client');

const VICIBROKER_URL = 'http://209.38.233.46:8095'; // from services/vicibroker.ts
const PATH = '/ws';

function makeQueryId(name) {
  return `${name}_${Math.floor(Math.random() * 100000)}_${Date.now()}`;
}

async function run() {
  console.log('Connecting to', VICIBROKER_URL);

  const socket = io(VICIBROKER_URL, {
    path: PATH,
    transports: ['websocket', 'polling'],
    reconnection: false,
  });

  socket.on('connect', () => {
    console.log('[client] connected, id=', socket.id);

    const name = 'campaigns_status';
    const queryId = makeQueryId(name);
    const payload = { campaigns: ['LEGAXI01', 'LEGAXI03'] };

    const message = {
      type: 'query',
      name,
      payload,
      queryId,
    };

    console.log('[client] Sending query:', message);
    socket.emit('query', message);

    // Set timeout in case server doesn't respond
    const timeout = setTimeout(() => {
      console.error('[client] Timeout waiting for result');
      socket.close();
      process.exit(2);
    }, 30000);

    socket.on('result', (res) => {
      console.log('[client] Received result:');
      console.log(JSON.stringify(res, null, 2));
      console.log('[client] result.queryId ===', res.queryId);
      clearTimeout(timeout);
      socket.close();
      process.exit(0);
    });
  });

  socket.on('connect_error', (err) => {
    console.error('[client] connect_error:', err.message || err);
    process.exit(3);
  });

  socket.on('disconnect', (reason) => {
    console.log('[client] disconnected:', reason);
  });
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
