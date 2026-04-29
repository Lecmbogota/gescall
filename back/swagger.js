const swaggerAutogen = require('swagger-autogen')();

const doc = {
    info: {
        title: 'GesCall API',
        description: 'API documentation for the GesCall application backend',
    },
    host: 'urlpro.cc',
    schemes: ['https'],
    securityDefinitions: {
        apiKeyAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-API-Key',
            description: 'API Key para Autenticar'
        }
    },
    security: [{ apiKeyAuth: [] }, { bearerAuth: [] }]
};

const outputFile = './swagger_output.json';
const endpointsFiles = ['./server.js', './swagger_endpoints.js'];

swaggerAutogen(outputFile, endpointsFiles, doc).then(() => {
    const fs = require('fs');
    const spec = JSON.parse(fs.readFileSync(outputFile, 'utf8'));

    for (const path in spec.paths) {
        let tag = 'Misc';

        if (path.startsWith('/api/users')) tag = 'Users';
        else if (path.startsWith('/api/roles')) tag = 'Roles';
        else if (path.startsWith('/api/campaigns')) tag = 'Campaigns';
        else if (path.startsWith('/api/leads')) tag = 'Leads';
        else if (path.startsWith('/api/lists')) tag = 'Lists';
        else if (path.startsWith('/api/agents')) tag = 'Agents';
        else if (path.startsWith('/api/audio')) tag = 'Audio';
        else if (path.startsWith('/api/callerid-pools')) tag = 'CallerID Pools';
        else if (path.startsWith('/api/schedules')) tag = 'Schedules';
        else if (path.startsWith('/api/ivr-flows')) tag = 'IVR Flows';
        else if (path.startsWith('/api/trunks')) tag = 'Trunks';
        else if (path.startsWith('/api/tickets')) tag = 'Tickets';
        else if (path.startsWith('/api/tts-nodes')) tag = 'TTS Nodes';
        else if (path.startsWith('/api/dnc')) tag = 'DNC';
        else if (path.startsWith('/api/dashboard')) tag = 'Dashboard';
        else if (path.startsWith('/api/auth')) tag = 'Auth';
        else if (path.startsWith('/api/metrics')) tag = 'Metrics';

        for (const method in spec.paths[path]) {
            if (!spec.paths[path][method].tags || spec.paths[path][method].tags.length === 0) {
                spec.paths[path][method].tags = [tag];
            }
        }
    }

    fs.writeFileSync(outputFile, JSON.stringify(spec, null, 2));
    console.log('Swagger documentation generated and tagged successfully!');
});
