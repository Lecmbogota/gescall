const pg = require('../config/pgDatabase');

async function run() {
    try {
        await pg.query(`
            CREATE TABLE IF NOT EXISTS gescall_campaigns_prefixes (
                id SERIAL PRIMARY KEY,
                country_name VARCHAR(100) NOT NULL,
                prefix VARCHAR(10) NOT NULL UNIQUE,
                country_code VARCHAR(5) NOT NULL,
                is_active BOOLEAN DEFAULT true,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await pg.query(`
            INSERT INTO gescall_campaigns_prefixes (country_name, prefix, country_code) VALUES
                ('México', '52', 'MX'),
                ('Colombia', '57', 'CO'),
                ('Estados Unidos', '1', 'US'),
                ('España', '34', 'ES'),
                ('Argentina', '54', 'AR'),
                ('Chile', '56', 'CL'),
                ('Perú', '51', 'PE'),
                ('Ecuador', '593', 'EC'),
                ('Venezuela', '58', 'VE'),
                ('Guatemala', '502', 'GT'),
                ('Honduras', '504', 'HN'),
                ('El Salvador', '503', 'SV'),
                ('Costa Rica', '506', 'CR'),
                ('Panamá', '507', 'PA'),
                ('República Dominicana', '1809', 'DO'),
                ('Bolivia', '591', 'BO'),
                ('Paraguay', '595', 'PY'),
                ('Uruguay', '598', 'UY'),
                ('Brasil', '55', 'BR'),
                ('Canadá', '1', 'CA')
            ON CONFLICT (prefix) DO NOTHING;
        `);

        console.log("Database updated successfully");
        process.exit(0);
    } catch (e) {
        console.error("Error:", e);
        process.exit(1);
    }
}

run();
