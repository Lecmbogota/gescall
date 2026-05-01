const http = require('http');

const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL || 'http://clickhouse:8123';

async function queryClickHouse(sql, body = null) {
    return new Promise((resolve, reject) => {
        const url = new URL(CLICKHOUSE_URL);
        url.searchParams.append('query', sql);
        
        const options = {
            hostname: url.hostname,
            port: url.port,
            path: url.pathname + url.search,
            method: 'POST',
            headers: {}
        };

        if (body) {
            options.headers['Content-Type'] = 'application/x-ndjson';
            options.headers['Content-Length'] = Buffer.byteLength(body);
        }

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 400) {
                    reject(new Error(`ClickHouse Error [${res.statusCode}]: ${data}`));
                } else {
                    resolve(data);
                }
            });
        });

        req.on('error', (e) => reject(e));

        if (body) {
            req.write(body);
        }
        req.end();
    });
}

async function initClickHouse() {
    try {
        console.log('[ClickHouse] Initializing database schema...');
        
        await queryClickHouse(`
            CREATE TABLE IF NOT EXISTS gescall_call_log_archive
            (
                id String,
                lead_id UInt64,
                phone_number String,
                pool_callerid String,
                campaign_id String,
                list_id UInt64,
                call_date DateTime,
                call_status String,
                dtmf_pressed String,
                call_duration UInt32,
                uniqueid String,
                created_at DateTime,
                updated_at DateTime
            )
            ENGINE = MergeTree()
            ORDER BY (call_date, campaign_id)
            PARTITION BY toYYYYMM(call_date)
            SETTINGS index_granularity = 8192;
        `);
        
        console.log('[ClickHouse] Table gescall_call_log_archive is ready.');
    } catch (err) {
        console.error('[ClickHouse] Initialization failed (is container running?):', err.message);
    }
}

module.exports = {
    queryClickHouse,
    initClickHouse
};
