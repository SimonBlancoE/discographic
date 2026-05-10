import express from 'express';
import db, { getRadarForUser } from '../db.js';
import { getDiscogsClientForUser, requireAuth } from '../middleware/auth.js';
import { syncRadarWantlist } from '../services/radarWantlist.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  const userId = req.session.userId as number;
  res.json(getRadarForUser(userId));
});

router.post('/sync', async (req, res, next) => {
  try {
    const userId = req.session.userId as number;
    const discogs = getDiscogsClientForUser(req);
    const wantlistRows = await discogs.getAllWantlist();
    const result = syncRadarWantlist(db, userId, wantlistRows);

    res.json({
      radar: getRadarForUser(userId),
      result,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
