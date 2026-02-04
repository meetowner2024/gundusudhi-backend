const express = require('express');
const router = express.Router();
const { upload, uploadImage, uploadMultipleImages, deleteFile } = require('../controllers/uploadController');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');

// All upload routes require authentication
router.use(authenticateToken);
router.use(authorizeRoles('ADMIN', 'EDITOR'));

// Single image upload
router.post('/image', upload.single('image'), uploadImage);

// Multiple images upload (max 10)
router.post('/images', upload.array('images', 10), uploadMultipleImages);

// Delete file
router.delete('/file', deleteFile);

module.exports = router;
