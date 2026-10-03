// ─── SANOMIN API server (MERN backend) ─────────────────────────────────────
// Express 4 + Mongoose 8 + MongoDB 8. Port 3010 (hard-coded per mini-service
// convention). The Next.js frontend proxies /api/* here via a rewrite.
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import simpleRoutes from './routes/simple'
import attendanceRoutes from './routes/attendance'
import paymentRoutes from './routes/payments'
import payrollRoutes from './routes/payroll'
import expenseRoutes from './routes/expenses'
import peopleRoutes from './routes/people'
import analyticsRoutes from './routes/analytics'
import kioskRoutes from './routes/kiosk'

const PORT = Number(process.env.PORT) || 3010
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/sanomin'

const app = express()
app.use(cors())
app.use(express.json({ limit: '8mb' }))

// simple request log (dev visibility)
app.use((req, _res, next) => {
  if (req.path !== '/api/health') console.log(`[api] ${req.method} ${req.path}`)
  next()
})

app.use('/api', simpleRoutes)
app.use('/api/attendance', attendanceRoutes)
app.use('/api/payments', paymentRoutes)
app.use('/api/payroll', payrollRoutes)
app.use('/api/expenses', expenseRoutes)
app.use('/api/kiosk', kioskRoutes)          // ← new
app.use('/api', peopleRoutes)
app.use('/api', analyticsRoutes)

// 404 for unknown API paths
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API route not found' })
})

// error middleware → same { error } shape the frontend expects
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Mongoose duplicate-key → 400 like Prisma P2002 handling did
  if (err?.code === 11000) {
    return res.status(400).json({ error: 'Duplicate value: ' + JSON.stringify(err.keyValue || {}) })
  }
  // Mongoose CastError → happens when a string can't be cast to ObjectId.
  // This almost always means a corrupted reference (e.g. "null", "", or a
  // truncated hex string stored in a ref field). Log the details so we can
  // find the offending document, then return a 400.
  if (err?.name === 'CastError') {
    console.error('[api] CastError:', JSON.stringify({
      message: err.message,
      path: err.path,
      value: err.value,
      kind: err.kind,
      model: err.model?.modelName ?? null,
    }))
    return res.status(400).json({
      error: 'Invalid reference: ' + (err.path ?? 'unknown field'),
    })
  }
  console.error('[api] error:', err?.message || err)
  res.status(500).json({ error: err?.message || 'Internal server error' })
})

mongoose
  .connect(MONGODB_URI)
  .then(() => {
    console.log(`[api] MongoDB connected → ${MONGODB_URI}`)
    app.listen(PORT, '0.0.0.0', () => {
  console.log(`[api] SANOMIN API server listening on http://0.0.0.0:${PORT}`)
})  })
  .catch((e) => {
    console.error('[api] MongoDB connection failed:', e.message)
    process.exit(1)
  })
