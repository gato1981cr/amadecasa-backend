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

const app = express();
app.use(express.json());
app.use(cookieParser());
app.use(morgan('dev'));
app.use(cors({ origin: true, credentials: true })); // importante para cookies

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

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API lista en http://0.0.0.0:${port}`));
export default app;
