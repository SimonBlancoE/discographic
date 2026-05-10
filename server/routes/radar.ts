import express from 'express';
import { requireAuth } from '../middleware/auth.js';
import { getRadarForUser } from '../db.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  res.json(getRadarForUser(req.session.userId));
});

export default router;
