const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const {
    getAds,
    getAllAds,
    createAd,
    updateAd,
    deleteAd,
    trackClick
} = require('../controllers/adsController');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../../uploads/ads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `ad-${uniqueSuffix}${path.extname(file.originalname)}`);
    }
});

const fileFilter = (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only JPEG, PNG, WebP, and GIF images are allowed'), false);
    }
};

const upload = multer({
    storage: storage,
    fileFilter: fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Public routes
router.get('/', getAds);
router.post('/:id/click', trackClick);

// Admin routes 
router.get('/admin/all', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), getAllAds);
router.post('/', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), upload.single('image'), createAd);
router.put('/:id', authenticateToken, authorizeRoles('ADMIN', 'EDITOR'), upload.single('image'), updateAd);
router.delete('/:id', authenticateToken, authorizeRoles('ADMIN'), deleteAd);

module.exports = router;
