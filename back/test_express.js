const express = require('express');
const app = express();
app.use((req, res, next) => {
    console.log(`[TEST] ${req.method} ${req.url}`);
    next();
});
app.get('/test', (req, res) => res.send('ok'));
app.listen(3009, () => console.log('Listening on 3009'));
