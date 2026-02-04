const express = require('express');
const router = express.Router();
const newsController = require('../controllers/newsController');
const { authenticateToken, authorizeRoles, optionalAuth } = require('../middleware/auth');

// Public routes
router.get('/', optionalAuth, newsController.getArticles);
router.get('/id/:id', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), newsController.getArticleById);
router.get('/:slug', newsController.getArticleBySlug);

// Admin/Editor routes
router.post('/', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), newsController.createArticle);
router.put('/:id', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), newsController.updateArticle);
router.delete('/:id', authenticateToken, authorizeRoles('ADMIN'), newsController.deleteArticle);

module.exports = router;
