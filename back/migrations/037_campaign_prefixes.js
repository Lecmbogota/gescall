const pg = require('../config/pgDatabase');

async function up() {
    console.log('[Migration] 037_campaign_prefixes starting...');
    try {
        await pg.query(`
            CREATE TABLE IF NOT EXISTS public.gescall_campaigns_prefixes (
                id SERIAL PRIMARY KEY,
                prefix VARCHAR(10) UNIQUE NOT NULL,
                country_name VARCHAR(100) NOT NULL,
                country_code VARCHAR(10) NOT NULL,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        
        console.log('  ✓ Created gescall_campaigns_prefixes table');

        await pg.query(`
            INSERT INTO public.gescall_campaigns_prefixes (prefix, country_name, country_code) VALUES 
            ('52', 'México', 'MX'), 
            ('57', 'Colombia', 'CO'), 
            ('51', 'Perú', 'PE'), 
            ('54', 'Argentina', 'AR'), 
            ('56', 'Chile', 'CL'), 
            ('1', 'Estados Unidos', 'US'), 
            ('34', 'España', 'ES'), 
            ('593', 'Ecuador', 'EC'), 
            ('507', 'Panamá', 'PA') 
            ON CONFLICT (prefix) DO NOTHING;
        `);

        console.log('  ✓ Seeded default country prefixes');
        
        console.log('[Migration] 037_campaign_prefixes completed.');
    } catch (err) {
        console.error('Migration 037 failed:', err);
        throw err;
    }
}

if (require.main === module) {
    up().then(() => process.exit(0)).catch(() => process.exit(1));
} else {
    module.exports = { up };
}
