/* eslint-disable no-undef */
// index.js
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import 'dotenv/config';

import { pool } from './db.js';
import { productsRouter } from './routes/products.js';
import { requestsRouter } from './routes/requests.js';
import { authRouter } from './auth.js';
import { requireAssistOrGuest, enforceDeviceFreshness } from './auth-mw.js';

const PORT = process.env.PORT || 3001;
const app = express();

app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));
app.use(cors({ origin: true, credentials: true })); // importante para cookies
app.use('/api/auth', authRouter);

app.get('/api/health', (req, res) => res.json({ ok: true }));

// Rutas de autenticación/notificación
app.use('/api', authRouter);

// Ejemplo: proteger rutas de asistente/invitado
// (Puedes aplicarlo solo a las que quieras)
app.use('/api/products', requireAssistOrGuest, enforceDeviceFreshness);

// Si tus routers ya definen rutas con "/products" dentro,
// puedes montarlos así:
app.use('/api', productsRouter);
app.use('/api', requestsRouter);

app.use('/api/auth', authRouter);

// ⚠️ temporal, solo para debug
app.get('/__routes', (req, res) => {
  const routes = [];
  const dig = (stack, prefix = '') => {
    for (const layer of stack) {
      if (layer.route?.path) {
        const methods = Object.keys(layer.route.methods).join(',').toUpperCase();
        routes.push(`${methods} ${prefix}${layer.route.path}`);
      } else if (layer.name === 'router' && layer.handle?.stack) {
        // intenta deducir el prefijo (best-effort)
        const match = (layer.regexp && layer.regexp.toString().match(/\/([a-zA-Z0-9_-]+)/)) || [];
        const pre = match[1] ? `/${match[1]}` : prefix;
        dig(layer.handle.stack, pre);
      }
    }
  };
  dig(app._router.stack);
  res.json(routes.sort());
});


// Solo iniciar el servidor si no estamos corriendo pruebas
// Solo iniciar el servidor si no estamos corriendo pruebas
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`API lista en http://0.0.0.0:${PORT}`);
  });
}
export default app;

