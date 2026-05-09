import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import authRoutes from './routes/auth.js'
import assessmentRoutes from './routes/assessments.js'
import behaviorRoutes from './routes/behaviors.js'
import emotionRoutes from './routes/emotions.js'
import aacRoutes from './routes/aac.js'
import reportRoutes from './routes/reports.js'
import collaborationRoutes from './routes/collaboration.js'

dotenv.config()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.use('/api/auth', authRoutes)
app.use('/api/assessments', assessmentRoutes)
app.use('/api/behaviors', behaviorRoutes)
app.use('/api/emotions', emotionRoutes)
app.use('/api/aac', aacRoutes)
app.use('/api/reports', reportRoutes)
app.use('/api/collaboration', collaborationRoutes)

app.use(
  '/api/health',
  (req: Request, res: Response): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  })
})

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app
