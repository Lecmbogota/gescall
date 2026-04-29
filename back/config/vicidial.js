require('dotenv').config();

module.exports = {
  apiUrl: process.env.VICIDIAL_API_URL || 'http://localhost/vicidial/non_agent_api.php',
  apiUser: process.env.VICIDIAL_API_USER || '6666',
  apiPass: process.env.VICIDIAL_API_PASS || '1234',
  source: process.env.VICIDIAL_SOURCE || 'admin_panel',
};
