const express = require('express');
const router = express.Router();
const newsController = require('../controllers/newsController');
const { authenticateToken, authorizeRoles, optionalAuth } = require('../middleware/auth');
const { trackActivity } = require('../middleware/activityTracker');

router.get('/', optionalAuth, newsController.getArticles);

// Poll routes (Must be before /:slug to avoid conflict)
router.get('/polls/active', optionalAuth, newsController.getActivePoll);
router.post('/polls', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), newsController.createPoll);
router.post('/polls/:id/vote', optionalAuth, newsController.votePoll);
router.delete('/polls/:id', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), newsController.deletePoll);

router.get('/id/:id', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), newsController.getArticleById);
router.get('/:slug', optionalAuth, trackActivity('VIEW', 'article'), newsController.getArticleBySlug);
router.post('/', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), newsController.createArticle);
router.put('/:id', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), newsController.updateArticle);
router.delete('/:id', authenticateToken, authorizeRoles('ADMIN'), newsController.deleteArticle);

module.exports = router;
