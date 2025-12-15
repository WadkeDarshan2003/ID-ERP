/**
 * Nodemailer Configuration for Gmail
 */

import nodemailer from 'nodemailer';

const EMAIL_USER = process.env.VITE_EMAIL_USER;
const EMAIL_PASSWORD = process.env.VITE_EMAIL_PASSWORD;
const SMTP_HOST = process.env.VITE_SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = parseInt(process.env.VITE_SMTP_PORT || '587');

if (!EMAIL_USER || !EMAIL_PASSWORD) {
  console.error('❌ Email credentials not configured. Please set VITE_EMAIL_USER and VITE_EMAIL_PASSWORD in .env.local');
}

// Create transporter for Gmail
export const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: false, // use TLS
  auth: {
    user: EMAIL_USER,
    pass: EMAIL_PASSWORD,
  },
});

// Test the connection on startup
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ Nodemailer connection error:', error);
  } else {
    console.log('✅ Nodemailer is ready to send emails from:', EMAIL_USER);
  }
});

export const SENDER_EMAIL = EMAIL_USER;
export const SENDER_NAME = 'ID ERP System';
