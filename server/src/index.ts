import 'dotenv/config'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { rateLimit } from 'express-rate-limit'
import { Server } from 'socket.io'
import { z } from 'zod'
import { PrismaClient } from '@prisma/client'

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
})
const env = envSchema.parse(process.env)
const prisma = new PrismaClient()
const app = express()
const httpServer = createServer(app)
const io = new Server(httpServer, {
  cors: { origin: env.FRONTEND_URL, methods: ['GET', 'POST'] },
})

app.disable('x-powered-by')
app.use(cors({ origin: env.FRONTEND_URL, methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'Authorization'] }))
app.use(express.json({ limit: '32kb' }))
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false }))

type TokenPayload = { userId: string }
type SocketPlayer = { id: string; username: string; x: number; z: number; yaw: number; team: 'VANGUARD' | 'WARDEN' }
const lobbyPlayers = new Map<string, Map<string, SocketPlayer>>()
const socketLobby = new Map<string, string>()
const socketIdentity = new Map<string, string>()
const lastInputAt = new Map<string, number>()

function signToken(userId: string) {
  return jwt.sign({ userId } satisfies TokenPayload, env.JWT_SECRET, { expiresIn: '8h' })
}

function authUserId(authorization: string | undefined) {
  if (!authorization?.startsWith('Bearer ')) return null
  try {
    const payload = jwt.verify(authorization.slice(7), env.JWT_SECRET)
    if (typeof payload === 'string' || typeof payload.userId !== 'string') return null
    return payload.userId
  } catch {
    return null
  }
}

const registerSchema = z.object({
  username: z.string().trim().min(3).max(24).regex(/^[A-Za-z0-9_]+$/),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(72).refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes.'),
})
const loginSchema = z.object({
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(72).refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 UTF-8 bytes.'),
})
const matchSchema = z.object({
  mode: z.enum(['TRAINING', 'PRACTICE']),
  result: z.enum(['WIN', 'LOSS']),
  kills: z.number().int().min(0).max(100),
  durationSeconds: z.number().int().min(0).max(3600),
})
const publicProfile = <T extends { id: string; username: string; email: string; rating: number; wins: number; losses: number; kills: number; deaths: number }>(user: T) => ({
  id: user.id, username: user.username, email: user.email,
  rating: user.rating, wins: user.wins, losses: user.losses, kills: user.kills, deaths: user.deaths,
})

app.get('/api/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`
    return res.json({ status: 'ok', database: 'ok' })
  } catch (error) {
    console.error('Database health check failed', error)
    return res.json({ status: 'degraded', database: 'unavailable' })
  }
})

app.post('/api/auth/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid registration data.' })
  const { username, email, password } = parsed.data
  const passwordHash = await bcrypt.hash(password, 12)
  try {
    const user = await prisma.user.create({ data: { username, email, passwordHash } })
    return res.status(201).json({ token: signToken(user.id), profile: publicProfile(user) })
  } catch (error) {
    if (isUniqueConstraint(error)) return res.status(409).json({ error: 'That email or operator name is already registered.' })
    throw error
  }
})

app.post('/api/auth/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid sign-in data.' })
  const user = await prisma.user.findUnique({ where: { email: parsed.data.email } })
  if (!user || !await bcrypt.compare(parsed.data.password, user.passwordHash)) {
    return res.status(401).json({ error: 'Email or password is incorrect.' })
  }
  return res.json({ token: signToken(user.id), profile: publicProfile(user) })
})

app.get('/api/profile', async (req, res) => {
  const userId = authUserId(req.header('authorization'))
  if (!userId) return res.status(401).json({ error: 'Authentication required.' })
  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return res.status(401).json({ error: 'Account no longer exists.' })
  return res.json({ profile: publicProfile(user) })
})

app.get('/api/matches', async (req, res) => {
  const userId = authUserId(req.header('authorization'))
  if (!userId) return res.status(401).json({ error: 'Authentication required.' })
  const matches = await prisma.match.findMany({
    where: { userId }, orderBy: { createdAt: 'desc' }, take: 20,
    select: { id: true, mode: true, result: true, kills: true, durationSeconds: true, verified: true, createdAt: true },
  })
  return res.json({ matches })
})

app.post('/api/matches', async (req, res) => {
  const userId = authUserId(req.header('authorization'))
  if (!userId) return res.status(401).json({ error: 'Authentication required.' })
  const parsed = matchSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'Invalid match data.' })
  const match = await prisma.match.create({ data: { ...parsed.data, userId, verified: false } })
  return res.status(201).json({ match: { ...match, createdAt: match.createdAt.toISOString() } })
})

app.use((_req, res) => res.status(404).json({ error: 'Endpoint not found.' }))

function isUniqueConstraint(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002'
}

io.use((socket, next) => {
  const token = socket.handshake.auth.token
  if (typeof token !== 'string') return next(new Error('Authentication required.'))
  try {
    const payload = jwt.verify(token, env.JWT_SECRET)
    if (typeof payload === 'string' || typeof payload.userId !== 'string') return next(new Error('Invalid session.'))
    socket.data.userId = payload.userId
    next()
  } catch {
    next(new Error('Invalid or expired session.'))
  }
})

io.on('connection', (socket) => {
  const userId = socket.data.userId as string
  void prisma.user.findUnique({ where: { id: userId }, select: { username: true } }).then((user) => {
    if (user) socketIdentity.set(socket.id, user.username)
    else socket.disconnect(true)
  }).catch((error: unknown) => {
    console.error('Could not resolve socket identity', error)
    socket.disconnect(true)
  })

  socket.on('lobby:create', (ack: (value: { code?: string; error?: string }) => void) => {
    if (typeof ack !== 'function') return
    if (!socketIdentity.has(socket.id)) return ack({ error: 'Operator profile is not ready.' })
    if (socketLobby.has(socket.id)) return ack({ error: 'Leave your current lobby first.' })
    const code = randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()
    lobbyPlayers.set(code, new Map())
    joinLobby(socket, code, userId, socketIdentity.get(socket.id)!, ack)
  })

  socket.on('lobby:join', (rawCode: unknown, ack: (value: { code?: string; error?: string }) => void) => {
    if (typeof ack !== 'function') return
    if (typeof rawCode !== 'string' || !/^[A-Z0-9]{6}$/.test(rawCode)) return ack({ error: 'Enter a valid six-character lobby code.' })
    if (!socketIdentity.has(socket.id)) return ack({ error: 'Operator profile is not ready.' })
    if (socketLobby.has(socket.id)) return ack({ error: 'Leave your current lobby first.' })
    const players = lobbyPlayers.get(rawCode)
    if (!players) return ack({ error: 'Lobby not found.' })
    if (players.size >= 10) return ack({ error: 'Lobby is full.' })
    joinLobby(socket, rawCode, userId, socketIdentity.get(socket.id)!, ack)
  })

  socket.on('player:input', (input: unknown) => {
    const code = socketLobby.get(socket.id)
    const players = code ? lobbyPlayers.get(code) : undefined
    const player = players?.get(socket.id)
    if (!code || !players || !player || !input || typeof input !== 'object') return
    const parsed = z.object({
      forward: z.number().min(-1).max(1),
      strafe: z.number().min(-1).max(1),
      yaw: z.number().min(-Math.PI * 8).max(Math.PI * 8),
    }).safeParse(input)
    if (!parsed.success) return
    const now = Date.now()
    const lastInput = lastInputAt.get(socket.id) ?? now - 50
    const elapsed = now - lastInput
    if (elapsed < 45) return
    lastInputAt.set(socket.id, now)
    const { forward, strafe, yaw } = parsed.data
    const inputLength = Math.hypot(forward, strafe)
    const normalizedForward = inputLength > 1 ? forward / inputLength : forward
    const normalizedStrafe = inputLength > 1 ? strafe / inputLength : strafe
    const step = 5 * Math.min(elapsed / 1000, 0.05)
    player.x = Math.max(-25, Math.min(25, player.x - Math.sin(yaw) * normalizedForward * step + Math.cos(yaw) * normalizedStrafe * step))
    player.z = Math.max(-16, Math.min(16, player.z - Math.cos(yaw) * normalizedForward * step - Math.sin(yaw) * normalizedStrafe * step))
    player.yaw = yaw
  })

  socket.on('lobby:leave', () => leaveLobby(socket.id))
  socket.on('disconnect', () => {
    socketIdentity.delete(socket.id)
    lastInputAt.delete(socket.id)
    leaveLobby(socket.id)
  })
})

function joinLobby(
  socket: import('socket.io').Socket,
  code: string,
  userId: string,
  username: string,
  ack: (value: { code?: string; error?: string }) => void,
) {
  const players = lobbyPlayers.get(code)
  if (!players) return ack({ error: 'Lobby no longer exists.' })
  const team: SocketPlayer['team'] = players.size % 2 === 0 ? 'VANGUARD' : 'WARDEN'
  players.set(socket.id, { id: userId, username, x: team === 'VANGUARD' ? -20 : 20, z: 12, yaw: 0, team })
  socket.join(code)
  socketLobby.set(socket.id, code)
  ack({ code })
  io.to(code).emit('lobby:state', { code, players: [...players.values()] })
}

function leaveLobby(socketId: string) {
  const code = socketLobby.get(socketId)
  if (!code) return
  socketLobby.delete(socketId)
  const players = lobbyPlayers.get(code)
  players?.delete(socketId)
  io.to(code).emit('lobby:state', { code, players: [...(players?.values() ?? [])] })
  if (players?.size === 0) lobbyPlayers.delete(code)
}

const snapshotTimer = setInterval(() => {
  for (const [code, players] of lobbyPlayers) {
    io.to(code).emit('game:snapshot', { players: [...players.values()], serverTime: Date.now() })
  }
}, 50)

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled API error', error)
  if (!res.headersSent) res.status(500).json({ error: 'An unexpected server error occurred.' })
})

httpServer.listen(env.PORT, () => {
  console.log(`Breachline API listening on http://localhost:${env.PORT}`)
})

async function shutdown() {
  clearInterval(snapshotTimer)
  io.close()
  await prisma.$disconnect()
  httpServer.close(() => process.exit(0))
}
process.once('SIGINT', () => { void shutdown() })
process.once('SIGTERM', () => { void shutdown() })
