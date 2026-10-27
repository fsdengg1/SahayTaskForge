const express = require('express');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { asyncHandler } = require('../utils/asyncHandler');
const vendors = require('../services/vendorTrackingService');

const router = express.Router();
router.use(authenticate);

const view = authorize('vendors.view', 'procurement.view', 'projects.view', 'dashboard.management');
const edit = authorize('procurement.edit', 'vendors.edit', 'dashboard.management');

router.get('/', view, asyncHandler(async (req, res) => {
  res.json(await vendors.listTracking(req.user));
}));

router.post('/', edit, asyncHandler(async (req, res) => {
  res.status(201).json(await vendors.createRecord(req.body, req.user));
}));

router.get('/:id/history', view, asyncHandler(async (req, res) => {
  res.json(await vendors.history(req.params.id));
}));

router.get('/:id', view, asyncHandler(async (req, res) => {
  res.json(await vendors.getRecord(req.params.id));
}));

router.patch('/:id', edit, asyncHandler(async (req, res) => {
  res.json(await vendors.updateRecord(req.params.id, req.body, req.user));
}));

router.delete('/:id', edit, asyncHandler(async (req, res) => {
  res.json(await vendors.archiveRecord(req.params.id, req.user));
}));

module.exports = router;
