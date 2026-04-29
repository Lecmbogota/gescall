const express = require('express');
const router = express.Router();

// ==================== CAMPAIGNS ====================


router.get('/api/campaigns/ids', async (req, res) => {
    /*  
        #swagger.tags = ['Campaigns']
        #swagger.description = 'Obtener un listado plano de todos los IDs (Strings) de las campañas activas.'
        #swagger.security = [{ "apiKeyAuth": [] }]
    */
});

// ==================== CONSOLIDATED REPORTS ====================

router.post('/api/campaigns/consolidated', async (req, res) => {
    /*  #swagger.tags = ['Campaigns']
        #swagger.description = 'Obtener registros de logs detallados de llamadas filtrados por campaña y fechas.'
        #swagger.parameters['body'] = {
            in: 'body',
            description: 'Filtros para los registros de campañas',
            required: true,
            schema: {
                $campaigns: ['DEMOCOL'],
                $startDatetime: '2026-03-01 00:00:00',
                $endDatetime: '2026-03-04 23:59:59',
            }
        }
        #swagger.security = [{ "apiKeyAuth": [] }]
    */
});

router.post('/api/campaigns/consolidated-stats', async (req, res) => {
    /*  #swagger.tags = ['Campaigns']
        #swagger.description = 'Obtener métricas consolidadas / reportes estadísticos de campañas.'
        #swagger.parameters['body'] = {
            in: 'body',
            description: 'Filtros de fechas e IDs de campaña',
            required: true,
            schema: {
                campaigns: ['DEMOCOL'],
                $startDatetime: '2026-03-01 00:00:00',
                $endDatetime: '2026-03-04 23:59:59'
            }
        }
        #swagger.security = [{ "apiKeyAuth": [] }]
    */
});

module.exports = router;
