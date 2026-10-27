const express = require('express');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { asyncHandler } = require('../utils/asyncHandler');
const procurement = require('../services/procurementTrackingService');

const router = express.Router();
router.use(authenticate);

const view = authorize('procurement.view', 'projects.view', 'dashboard.management');
const edit = authorize('procurement.edit', 'dashboard.management');

router.get('/', view, asyncHandler(async (req, res) => {
  res.json(await procurement.listTracking(req.user));
}));

router.post('/', edit, asyncHandler(async (req, res) => {
  res.status(201).json(await procurement.createRecord(req.body, req.user));
}));

router.get('/:id/history', view, asyncHandler(async (req, res) => {
  res.json(await procurement.history(req.params.id));
}));

router.get('/:id', view, asyncHandler(async (req, res) => {
  res.json(await procurement.getRecord(req.params.id));
}));

router.patch('/:id', edit, asyncHandler(async (req, res) => {
  res.json(await procurement.updateRecord(req.params.id, req.body, req.user));
}));

router.delete('/:id', edit, asyncHandler(async (req, res) => {
  res.json(await procurement.archiveRecord(req.params.id, req.user));
}));

module.exports = router;
