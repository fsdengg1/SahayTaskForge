const express = require('express');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { asyncHandler } = require('../utils/asyncHandler');
const production = require('../services/productionService');

const router = express.Router();
router.use(authenticate);

const view = authorize('production.view', 'projects.view', 'dashboard.management');
const edit = authorize('production.edit', 'dashboard.management');

router.get('/', view, asyncHandler(async (req, res) => {
  res.json(await production.listTracking(req.user));
}));

router.post('/', edit, asyncHandler(async (req, res) => {
  res.status(201).json(await production.createRecord(req.body, req.user));
}));

router.get('/:id/history', view, asyncHandler(async (req, res) => {
  res.json(await production.history(req.params.id));
}));

router.patch('/:id', edit, asyncHandler(async (req, res) => {
  res.json(await production.updateRecord(req.params.id, req.body, req.user));
}));

router.delete('/:id', edit, asyncHandler(async (req, res) => {
  res.json(await production.archiveRecord(req.params.id, req.user));
}));

module.exports = router;
