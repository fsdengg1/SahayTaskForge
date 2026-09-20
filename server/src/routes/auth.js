const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { asyncHandler } = require('../utils/asyncHandler');
const { AppError } = require('../utils/errors');
const { authenticate } = require('../middleware/auth');
const authService = require('../services/authService');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again later.' },
});

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

router.post(
  '/login',
  loginLimiter,
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, 'Username and password are needed.');
    const result = await authService.login(parsed.data.username, parsed.data.password, req.ip);
    res.json(result);
  })
);

router.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    res.json({ user: await authService.me(req.user.id) });
  })
);

router.post(
  '/change-password',
  authenticate,
  asyncHandler(async (req, res) => {
    const currentPassword = req.body?.currentPassword;
    const newPassword = req.body?.newPassword;
    const user = await authService.changePassword(req.user.id, currentPassword, newPassword);
    res.json({ message: 'Password updated.', user });
  })
);

module.exports = router;
