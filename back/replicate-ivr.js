const mysql = require('mysql2/promise');

(async () => {
    const db = await mysql.createConnection({
        host: 'localhost',
        user: 'cron',
        password: '1234',
        database: 'asterisk'
    });

    // Get source flow from PRUEBAS
    const [flows] = await db.execute(
        'SELECT flow_json FROM gescall_ivr_flows WHERE campaign_id = ?',
        ['PRUEBAS']
    );

    if (!flows.length) {
        console.log('ERROR: No PRUEBAS flow found');
        process.exit(1);
    }

    const flowJson = flows[0].flow_json;
    console.log('Source flow from PRUEBAS loaded');

    // Get active campaigns that don't have an IVR flow yet
    const [camps] = await db.execute(
        `SELECT vc.campaign_id, vc.campaign_name
     FROM vicidial_campaigns vc
     WHERE vc.active = 'Y'
       AND vc.campaign_id != 'PRUEBAS'
       AND vc.campaign_id NOT IN (SELECT campaign_id FROM gescall_ivr_flows)`
    );

    console.log(`\nCampaigns to add: ${camps.length}`);

    for (const c of camps) {
        await db.execute(
            'INSERT INTO gescall_ivr_flows (campaign_id, flow_json, is_active) VALUES (?, ?, 1)',
            [c.campaign_id, flowJson]
        );
        console.log(`  ✓ ${c.campaign_id} - ${c.campaign_name}`);
    }

    // Show all IVR flows
    const [all] = await db.execute(
        'SELECT campaign_id, is_active FROM gescall_ivr_flows ORDER BY campaign_id'
    );
    console.log(`\nTotal IVR flows: ${all.length}`);
    all.forEach(r => console.log(`  ${r.is_active ? '✓' : '✗'} ${r.campaign_id}`));

    await db.end();
    process.exit(0);
})();
