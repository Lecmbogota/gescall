require('dotenv').config();
const express = require('express');
const cors = require('cors');
const publicRoutes = require('./routes/public');
const { publicApiAuth } = require('./middleware/publicApiAuth');
const audioRoutes = require('./routes/audio');

const app = express();
app.set('trust proxy', 1);

const allowedOrigins = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://164.92.67.176:5173',
  'https://gescall.balenthi.com',
  'https://urlpro.cc',
  process.env.CORS_ORIGIN,
].filter(Boolean);

const corsOrigin = (origin, callback) => {
  if (!origin) return callback(null, true);
  if (allowedOrigins.includes(origin)) {
    return callback(null, origin);
  }
  return callback(null, false);
};

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'public-api',
  });
});

app.use('/api/public/audio', publicApiAuth, audioRoutes);
app.use('/api/public', publicRoutes);

const PORT = process.env.PUBLIC_API_PORT || 3002;

app.listen(PORT, () => {
  console.log(`Public API server running on port ${PORT}`);
});
