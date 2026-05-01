const redis = require('./config/redisClient');
async function run() {
  const stateMap = await redis.hGetAll(`gescall:agent:agente1`);
  console.log(stateMap);
  process.exit();
}
run();
