const path = require('path');
const fs = require('fs');
const multer = require('multer');
const uploadsDir = path.join(__dirname, '../../uploads');
const imagesDir = path.join(uploadsDir, 'images');
const videosDir = path.join(uploadsDir, 'videos');
const documentsDir = path.join(uploadsDir, 'documents');
[uploadsDir, imagesDir, videosDir, documentsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        let uploadPath = imagesDir;
        if (file.mimetype.startsWith('video/')) {
            uploadPath = videosDir;
        } else if (file.mimetype === 'application/pdf') {
            uploadPath = documentsDir;
        }
        cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }
});
const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/gif',
        'image/webp',
        'video/mp4',
        'video/webm',
        'application/pdf'
    ];
    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Invalid file type. Only images, videos, and PDFs are allowed.'), false);
    }
};
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024
    }
});
const uploadImage = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No file uploaded'
            });
        }
        const fileUrl = `/uploads/images/${req.file.filename}`;
        res.json({
            success: true,
            message: 'Image uploaded successfully',
            data: {
                filename: req.file.filename,
                url: fileUrl,
                originalName: req.file.originalname,
                size: req.file.size,
                mimetype: req.file.mimetype
            }
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload image',
            error: error.message
        });
    }
};
const uploadMultipleImages = async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No files uploaded'
            });
        }
        const uploadedFiles = req.files.map(file => ({
            filename: file.filename,
            url: `/uploads/images/${file.filename}`,
            originalName: file.originalname,
            size: file.size,
            mimetype: file.mimetype
        }));
        res.json({
            success: true,
            message: 'Images uploaded successfully',
            data: uploadedFiles
        });
    } catch (error) {
        console.error('Upload error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload images',
            error: error.message
        });
    }
};
const deleteFile = async (req, res) => {
    try {
        const { filename, type } = req.body;
        if (!filename) {
            return res.status(400).json({
                success: false,
                message: 'Filename is required'
            });
        }
        let filePath;
        switch (type) {
            case 'video':
                filePath = path.join(videosDir, filename);
                break;
            case 'document':
                filePath = path.join(documentsDir, filename);
                break;
            default:
                filePath = path.join(imagesDir, filename);
        }
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            res.json({
                success: true,
                message: 'File deleted successfully'
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'File not found'
            });
        }
    } catch (error) {
        console.error('Delete file error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete file',
            error: error.message
        });
    }
};
module.exports = {
    upload,
    uploadImage,
    uploadMultipleImages,
    deleteFile
};
