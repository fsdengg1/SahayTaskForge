const express = require('express');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/authorize');
const { upload } = require('../middleware/upload');
const { asyncHandler } = require('../utils/asyncHandler');
const projectService = require('../services/projectService');
const taskService = require('../services/taskService');
const { createDocumentFromFile } = require('../services/documentService');
const ops = require('../services/opsService');

const router = express.Router();
router.use(authenticate);

router.get(
  '/',
  authorize('projects.view'),
  asyncHandler(async (req, res) => {
    res.json(await projectService.listProjects(req.query));
  })
);

router.post(
  '/',
  authorize('projects.create'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await projectService.createProject(req.body, req.user));
  })
);

router.get(
  '/:id',
  authorize('projects.view'),
  asyncHandler(async (req, res) => {
    res.json(await projectService.getProject(req.params.id));
  })
);

router.put(
  '/:id',
  authorize('projects.edit'),
  asyncHandler(async (req, res) => {
    res.json(await projectService.updateProject(req.params.id, req.body, req.user));
  })
);

router.patch(
  '/:id/stage',
  authorize('projects.edit'),
  asyncHandler(async (req, res) => {
    res.json(await projectService.changeStage(req.params.id, req.body.stageCode, req.user, req.body.reason));
  })
);

router.patch(
  '/:id/status',
  authorize('projects.edit'),
  asyncHandler(async (req, res) => {
    res.json(await projectService.changeStatus(req.params.id, req.body.statusCode, req.body.reason, req.user));
  })
);

router.patch(
  '/:id/stages/:stageCode',
  authorize('projects.edit'),
  asyncHandler(async (req, res) => {
    res.json(await projectService.updateStageRecord(req.params.id, req.params.stageCode, req.body, req.user));
  })
);

router.get(
  '/:id/timeline',
  authorize('projects.view'),
  asyncHandler(async (req, res) => {
    res.json(await projectService.getTimeline(req.params.id));
  })
);

router.get(
  '/:id/tasks',
  authorize('tasks.view'),
  asyncHandler(async (req, res) => {
    res.json(await taskService.listTasks({ ...req.query, projectId: req.params.id }, req.user));
  })
);

router.post(
  '/:id/tasks',
  authorize('tasks.edit'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await taskService.createTask({ ...req.body, projectId: req.params.id }, req.user));
  })
);

router.post(
  '/:id/comments',
  authorize('projects.view'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await projectService.addComment(req.params.id, req.body.body, req.user));
  })
);

router.post(
  '/:id/documents',
  authorize('documents.upload'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    res.status(201).json(
      await createDocumentFromFile({
        file: req.file,
        projectId: req.params.id,
        categoryCode: req.body.categoryCode,
        userId: req.user.id,
        revision: req.body.revision,
      })
    );
  })
);

router.get(
  '/:id/closure',
  authorize('projects.view'),
  asyncHandler(async (req, res) => {
    res.json(await projectService.closurePreview(req.params.id));
  })
);

router.post(
  '/:id/close',
  authorize('projects.close'),
  asyncHandler(async (req, res) => {
    res.json(await projectService.closeProject(req.params.id, req.body.remarks, req.user));
  })
);

router.post(
  '/:id/issues',
  authorize('projects.edit'),
  asyncHandler(async (req, res) => {
    res.status(201).json(await ops.createIssue({ ...req.body, projectId: req.params.id }, req.user));
  })
);

module.exports = router;
