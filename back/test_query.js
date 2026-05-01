const pg = require('./config/pgDatabase');

async function test() {
  try {
    const allowed_campaigns = "C001,C002,C003";
    let query = 'SELECT c.*, (SELECT COUNT(*) FROM gescall_campaign_agents a WHERE a.campaign_id = c.campaign_id) as agent_count FROM gescall_campaigns c';
    let params = [];
    
    const allowedIds = allowed_campaigns.split(',');
    if (allowedIds.length > 0) {
        query += ' WHERE campaign_id = ANY($1)';
        params.push(allowedIds);
    }
    
    console.log("Query:", query);
    console.log("Params:", params);
    
    const { rows } = await pg.query(query, params);
    const mappedRows = rows.map(row => ({
        ...row,
        active: row.active ? 'Y' : 'N',
        archived: row.archived || false,
        agent_count: parseInt(row.agent_count) || 0
    }));
    console.log("Result:", mappedRows);
  } catch(e) {
    console.error(e);
  }
  process.exit();
}

test();
