const express = require('express');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { asyncHandler } = require('../utils/asyncHandler');
const manufacturing = require('../services/manufacturingLeadService');

const router = express.Router();
router.use(authenticate);

const view = authorize('production.view', 'projects.view', 'dashboard.management');
const edit = authorize('production.edit', 'dashboard.management');

router.get('/', view, asyncHandler(async (req, res) => {
  res.json(await manufacturing.listTracking(req.user));
}));

router.post('/', edit, asyncHandler(async (req, res) => {
  res.status(201).json(await manufacturing.createRecord(req.body, req.user));
}));

router.get('/:id/history', view, asyncHandler(async (req, res) => {
  res.json(await manufacturing.history(req.params.id));
}));

router.get('/:id', view, asyncHandler(async (req, res) => {
  res.json(await manufacturing.getRecord(req.params.id));
}));

router.patch('/:id', edit, asyncHandler(async (req, res) => {
  res.json(await manufacturing.updateRecord(req.params.id, req.body, req.user));
}));

router.delete('/:id', edit, asyncHandler(async (req, res) => {
  res.json(await manufacturing.archiveRecord(req.params.id, req.user));
}));

module.exports = router;
