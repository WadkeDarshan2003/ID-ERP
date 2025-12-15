/**
 * Express Server for Email Service
 * Run with: npm run dev:backend
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import emailRoutes from './emailRoutes';

dotenv.config({ path: '.env.local' });

const app = express();
const PORT = process.env.BACKEND_PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'Email service is running', timestamp: new Date() });
});

// Email routes
app.use('/api/email', emailRoutes);

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Server error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Email service running on http://localhost:${PORT}`);
  console.log(`📧 Email endpoint: POST http://localhost:${PORT}/api/email/send`);
});
