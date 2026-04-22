const { query, transaction } = require('../config/database');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const os = require('os');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const { activityLogger } = require('../utils/logger');


const convertPdf = async (pdfPath, outputDir, outputPrefix) => {
    if (os.platform() === 'win32' || os.platform() === 'darwin') {
        const pdf = require('pdf-poppler');
        const opts = {
            format: 'png',
            out_dir: outputDir,
            out_prefix: outputPrefix,
            page: null
        };
        return pdf.convert(pdfPath, opts);
    } else {
        const outputPath = path.join(outputDir, outputPrefix);
        const command = `pdftoppm -png "${pdfPath}" "${outputPath}"`;
        console.log(`Executing Linux PDF conversion: ${command}`);
        const { stdout, stderr } = await execAsync(command);
        if (stderr) console.error('pdftoppm stderr:', stderr);
        return stdout;
    }
};
const generateSecureToken = (magazineId, pageNumber, userId, expiresIn = 300) => {
    const payload = {
        mid: magazineId,
        page: pageNumber,
        uid: userId,
        exp: Date.now() + (expiresIn * 1000),
        nonce: crypto.randomBytes(16).toString('hex')
    };
    const data = JSON.stringify(payload);
    const key = crypto.createHash('sha256').update(String(process.env.MAGAZINE_ENCRYPTION_KEY || 'secret-key')).digest();
    const cipher = crypto.createCipheriv(
        'aes-256-gcm',
        key,
        Buffer.alloc(12, 0)
    );
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${encrypted}.${authTag}`;
};
const verifySecureToken = (token) => {
    try {
        const [encrypted, authTag] = token.split('.');
        const key = crypto.createHash('sha256').update(String(process.env.MAGAZINE_ENCRYPTION_KEY || 'secret-key')).digest();
        const decipher = crypto.createDecipheriv(
            'aes-256-gcm',
            key,
            Buffer.alloc(12, 0)
        );
        decipher.setAuthTag(Buffer.from(authTag, 'hex'));
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        const payload = JSON.parse(decrypted);
        if (Date.now() > payload.exp) {
            return null;
        }
        return payload;
    } catch (error) {
        return null;
    }
};
const processPdfInBackground = async (magazineId, pdfPath, outputDir) => {
    try {
        console.log(`Starting background PDF processing for Magazine ${magazineId}...`);
        const outputPrefix = `mag-${magazineId}`;
        // Use the cross-platform helper
        await convertPdf(pdfPath, outputDir, outputPrefix);
        const files = await fs.readdir(outputDir);
        const magFiles = files.filter(f => f.startsWith(`${outputPrefix}-`) && f.endsWith('.png'));
        magFiles.sort((a, b) => {
            const pageA = parseInt(a.replace(`${outputPrefix}-`, '').replace('.png', ''));
            const pageB = parseInt(b.replace(`${outputPrefix}-`, '').replace('.png', ''));
            return pageA - pageB;
        });
        console.log(`Generated ${magFiles.length} images for Magazine ${magazineId}`);
        if (magFiles.length > 0) {
            for (let i = 0; i < magFiles.length; i++) {
                const filename = magFiles[i];
                await query(
                    `INSERT INTO magazine_pages (magazine_id, page_number, image_path, is_preview_page) 
                     VALUES (?, ?, ?, ?)`,
                    [magazineId, i + 1, `/uploads/magazines/pages/${filename}`, false]
                );
            }
            await query(
                `UPDATE magazines SET total_pages = ? WHERE id = ?`,
                [magFiles.length, magazineId]
            );
        }
        console.log(`Background processing completed for Magazine ${magazineId}: ${magFiles.length} pages.`);
    } catch (error) {
        console.error(`Background PDF processing failed for Magazine ${magazineId}:`, error);
    }
};
const uploadMagazine = async (req, res) => {
    try {
        const { 
            title, 
            description, 
            category,
            issue_date,
            is_premium = false,
            is_published = false
        } = req.body;
        if (!title) {
            return res.status(400).json({ success: false, message: 'Magazine title is required' });
        }
        let coverImageUrl = null;
        if (req.files && req.files.cover_image) {
            const coverFile = req.files.cover_image[0];
            coverImageUrl = `/uploads/magazines/covers/${coverFile.filename}`;
        }
        let pdfPath = null;
        if (req.files && req.files.pdf_file) {
            const pdfFile = req.files.pdf_file[0];
            pdfPath = pdfFile.path;
        }
        const slug = title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/(^-|-$)/g, '') + '-' + Date.now();
        const result = await query(
            `INSERT INTO magazines 
            (title, slug, description, category, issue_date, is_premium, is_published, 
             cover_image_url, pdf_source_path, created_by) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [title, slug, description, category, issue_date, is_premium === 'true' || is_premium === true ? 1 : 0, is_published === 'true' || is_published === true ? 1 : 0,
             coverImageUrl, pdfPath, req.user.id]
        );
        const magazineId = result.insertId;
        if (pdfPath) {
            const outputDir = path.join(__dirname, '../../uploads/magazines/pages');
            processPdfInBackground(magazineId, pdfPath, outputDir);
        }
        await query(
            `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
             VALUES (?, 'CREATE', 'magazine', ?, ?)`,
            [req.user.id, magazineId, JSON.stringify({ title, status: 'Processing started' })]
        );
        res.status(201).json({
            success: true,
            message: 'Magazine uploaded successfully. Processing pages in background...',
            data: {
                id: magazineId,
                slug,
                title,
                status: 'PROCESSING'
            }
        });
    } catch (error) {
        console.error('Upload magazine error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload magazine',
            error: error.message
        });
    }
};
const uploadMagazinePages = async (req, res) => {
    try {
        const { magazineId } = req.params;
        const files = req.files;
        if (!files || files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No page images uploaded'
            });
        }
        const magazines = await query(
            'SELECT id, title FROM magazines WHERE id = ?',
            [magazineId]
        );
        if (magazines.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Magazine not found'
            });
        }
        const pageValues = files.map((file, index) => [
            magazineId,
            index + 1,
            `/uploads/magazines/pages/${file.filename}`,
            false
        ]);
        for (const pageData of pageValues) {
            await query(
                `INSERT INTO magazine_pages (magazine_id, page_number, image_path, is_preview_page)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE image_path = VALUES(image_path)`,
                pageData
            );
        }
        await query(
            `UPDATE magazines SET total_pages = (
                SELECT COUNT(*) FROM magazine_pages WHERE magazine_id = ?
            ) WHERE id = ?`,
            [magazineId, magazineId]
        );
        res.json({
            success: true,
            message: `${files.length} pages uploaded successfully`,
            data: {
                magazineId,
                pagesUploaded: files.length
            }
        });
    } catch (error) {
        console.error('Upload pages error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to upload pages',
            error: error.message
        });
    }
};
const updateMagazine = async (req, res) => {
    try {
        const { id } = req.params;
        const { 
            title, 
            description, 
            category,
            issue_date,
            is_premium,
            is_published
        } = req.body;
        const updates = [];
        const values = [];
        if (title !== undefined) {
            updates.push('title = ?');
            values.push(title);
        }
        if (description !== undefined) {
            updates.push('description = ?');
            values.push(description);
        }
        if (category !== undefined) {
            updates.push('category = ?');
            values.push(category);
        }
        if (issue_date !== undefined) {
            updates.push('issue_date = ?');
            values.push(issue_date);
        }
        if (is_premium !== undefined) {
            updates.push('is_premium = ?');
            values.push(is_premium === 'true' || is_premium === true ? 1 : 0);
        }
        if (is_published !== undefined) {
            updates.push('is_published = ?');
            values.push(is_published === 'true' || is_published === true ? 1 : 0);
        }
        if (req.file) {
            updates.push('cover_image_url = ?');
            values.push(`/uploads/magazines/covers/${req.file.filename}`);
        }
        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }
        values.push(id);
        await query(
            `UPDATE magazines SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`,
            values
        );
        res.json({
            success: true,
            message: 'Magazine updated successfully'
        });
    } catch (error) {
        console.error('Update magazine error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update magazine',
            error: error.message
        });
    }
};
const deleteMagazine = async (req, res) => {
    try {
        const { id } = req.params;
        const magazineData = await query(
            'SELECT pdf_source_path, cover_image_url FROM magazines WHERE id = ?',
            [id]
        );
        if (magazineData.length === 0) {
            return res.status(404).json({ success: false, message: 'Magazine not found' });
        }
        const pagesData = await query(
            'SELECT image_path FROM magazine_pages WHERE magazine_id = ?',
            [id]
        );
        const filesToDelete = [];
        const mag = magazineData[0];
        if (mag.pdf_source_path) filesToDelete.push(mag.pdf_source_path);
        if (mag.cover_image_url) {
            filesToDelete.push(path.join(__dirname, '../../', mag.cover_image_url)); 
        }
        pagesData.forEach(page => {
            if (page.image_path) {
                filesToDelete.push(path.join(__dirname, '../../', page.image_path));
            }
        });
        await Promise.allSettled(filesToDelete.map(file => fs.unlink(file).catch(err => console.error('Failed to delete file:', file, err.message))));
        await query('DELETE FROM magazines WHERE id = ?', [id]);
        res.json({
            success: true,
            message: 'Magazine and all associated files deleted successfully'
        });
    } catch (error) {
        console.error('Delete magazine error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete magazine',
            error: error.message
        });
    }
};
const listMagazines = async (req, res) => {
    try {
        const { 
            page = 1, 
            limit = 12, 
            category,
            is_premium,
            search,
            date,
            month,
            year
        } = req.query;
        const offset = (page - 1) * limit;
        let whereConditions = ['m.is_published = TRUE'];
        const params = [];
        if (category) {
            whereConditions.push('m.category = ?');
            params.push(category);
        }
        if (date) {
            whereConditions.push('DATE(m.issue_date) = ?');
            params.push(date);
        }
        if (month) {
            whereConditions.push('MONTH(m.issue_date) = ?');
            params.push(month);
        }
        if (year) {
            whereConditions.push('YEAR(m.issue_date) = ?');
            params.push(year);
        }
        if (is_premium !== undefined) {
            whereConditions.push('m.is_premium = ?');
            params.push(is_premium === 'true');
        }
        if (search) {
            whereConditions.push('(m.title LIKE ? OR m.description LIKE ?)');
            params.push(`%${search}%`, `%${search}%`);
        }
        const whereClause = whereConditions.length > 0 
            ? 'WHERE ' + whereConditions.join(' AND ') 
            : '';
        const [countResult] = await query(
            `SELECT COUNT(*) as total FROM magazines m ${whereClause}`,
            params
        );
        const magazines = await query(
            `SELECT 
                m.id, m.title, m.slug, m.description, m.category,
                m.issue_date, m.is_premium, m.cover_image_url, 
                m.total_pages, m.view_count, m.created_at
             FROM magazines m
             ${whereClause}
             ORDER BY m.issue_date DESC, m.created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), offset]
        );
        const userSubscription = req.user?.subscription_type || 'FREE';
        const hasOnlineAccess = ['ONLINE', 'BOTH'].includes(userSubscription);
        const magazinesWithAccess = magazines.map(mag => ({
            ...mag,
            can_read: !mag.is_premium || hasOnlineAccess,
            preview_pages: mag.is_premium && !hasOnlineAccess ? 3 : null
        }));
        res.json({
            success: true,
            data: {
                magazines: magazinesWithAccess,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: countResult?.total || 0,
                    totalPages: Math.ceil((countResult?.total || 0) / limit)
                }
            }
        });
    } catch (error) {
        console.error('List magazines error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch magazines',
            error: error.message
        });
    }
};
const getMagazineDetails = async (req, res) => {
    try {
        const { slug } = req.params;
        const magazines = await query(
            `SELECT 
                m.id, m.title, m.slug, m.description, m.category,
                m.issue_date, m.is_premium, m.cover_image_url, 
                m.total_pages, m.view_count, m.created_at
             FROM magazines m
             WHERE m.slug = ? AND m.is_published = TRUE`,
            [slug]
        );
        if (magazines.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Magazine not found'
            });
        }
        const magazine = magazines[0];
        const userSubscription = req.user?.subscription_type || 'FREE';
        const hasOnlineAccess = ['ONLINE', 'BOTH'].includes(userSubscription);
        const canRead = !magazine.is_premium || hasOnlineAccess;
        let previewPages = [];
        if (magazine.is_premium && !canRead) {
            previewPages = await query(
                `SELECT page_number FROM magazine_pages 
                 WHERE magazine_id = ? AND (is_preview_page = TRUE OR page_number <= 3)
                 ORDER BY page_number`,
                [magazine.id]
            );
        }
        await query(
            'UPDATE magazines SET view_count = view_count + 1 WHERE id = ?',
            [magazine.id]
        );
        res.json({
            success: true,
            data: {
                ...magazine,
                can_read: canRead,
                preview_pages: previewPages.map(p => p.page_number),
                requires_subscription: magazine.is_premium && !canRead
            }
        });
    } catch (error) {
        console.error('Get magazine details error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch magazine details',
            error: error.message
        });
    }
};
const startReadingSession = async (req, res) => {
    try {
        const { magazineId } = req.params;
        const userId = req.user.id;
        const magazines = await query(
            `SELECT id, title, is_premium, total_pages FROM magazines 
             WHERE id = ? AND is_published = TRUE`,
            [magazineId]
        );
        if (magazines.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Magazine not found'
            });
        }
        const magazine = magazines[0];
        const userSubscription = req.user.subscription_type || 'FREE';
        const hasOnlineAccess = ['ONLINE', 'BOTH'].includes(userSubscription);
        if (magazine.is_premium && !hasOnlineAccess) {
            return res.status(403).json({
                success: false,
                message: 'Premium subscription required to read this magazine',
                requires_subscription: true
            });
        }
        const sessionId = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
        await query(
            `INSERT INTO magazine_reading_sessions 
             (session_id, user_id, magazine_id, expires_at, last_page_read)
             VALUES (?, ?, ?, ?, 1)
             ON DUPLICATE KEY UPDATE 
                session_id = VALUES(session_id),
                expires_at = VALUES(expires_at),
                created_at = NOW()`,
            [sessionId, userId, magazineId, expiresAt]
        );
        await query(
            `INSERT INTO magazine_read_history (user_id, magazine_id)
             VALUES (?, ?)
             ON DUPLICATE KEY UPDATE read_count = read_count + 1, last_read_at = NOW()`,
            [userId, magazineId]
        );
        await query(
            `INSERT INTO activity_logs (user_id, action, entity_type, entity_id, details)
             VALUES (?, 'READ', 'magazine', ?, ?)`,
            [userId, magazineId, JSON.stringify({ title: magazine.title })]
        );

        activityLogger.info(`User ${userId} started reading Magazine ${magazineId} (${magazine.title})`);

        res.json({
            success: true,
            data: {
                sessionId,
                magazineId: magazine.id,
                title: magazine.title,
                totalPages: magazine.total_pages,
                expiresAt
            }
        });
    } catch (error) {
        console.error('Start reading session error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start reading session',
            error: error.message
        });
    }
};
const getMagazinePage = async (req, res) => {
    try {
        const { sessionId, pageNumber } = req.params;
        const userId = req.user.id;
        const sessions = await query(
            `SELECT rs.*, m.id as magazine_id, m.is_premium, m.total_pages
             FROM magazine_reading_sessions rs
             JOIN magazines m ON rs.magazine_id = m.id
             WHERE rs.session_id = ? AND rs.user_id = ? AND rs.expires_at > NOW()`,
            [sessionId, userId]
        );
        if (sessions.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired reading session'
            });
        }
        const session = sessions[0];
        const pageNum = parseInt(pageNumber);
        if (pageNum < 1 || pageNum > session.total_pages) {
            return res.status(400).json({
                success: false,
                message: 'Invalid page number'
            });
        }
        const pages = await query(
            `SELECT image_path FROM magazine_pages 
             WHERE magazine_id = ? AND page_number = ?`,
            [session.magazine_id, pageNum]
        );
        if (pages.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Page not found'
            });
        }
        await query(
            `UPDATE magazine_reading_sessions 
             SET last_page_read = ?, updated_at = NOW() 
             WHERE session_id = ?`,
            [pageNum, sessionId]
        );
        const pageToken = generateSecureToken(session.magazine_id, pageNum, userId, 300);
        res.json({
            success: true,
            data: {
                pageNumber: pageNum,
                totalPages: session.total_pages,
                imageUrl: `/api/v1/magazines/secure-image/${session.magazine_id}/${pageNum}?token=${pageToken}`,
                hasNext: pageNum < session.total_pages,
                hasPrev: pageNum > 1
            }
        });
    } catch (error) {
        console.error('Get magazine page error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch page',
            error: error.message
        });
    }
};
const serveSecureImage = async (req, res) => {
    try {
        const { magazineId, pageNumber } = req.params;
        const { token } = req.query;
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access token required'
            });
        }
        const payload = verifySecureToken(token);
        if (!payload) {
            return res.status(401).json({
                success: false,
                message: 'Invalid or expired access token'
            });
        }
        if (payload.mid != magazineId || payload.page != pageNumber) {
            return res.status(403).json({
                success: false,
                message: 'Token mismatch'
            });
        }
        const pages = await query(
            `SELECT image_path FROM magazine_pages 
             WHERE magazine_id = ? AND page_number = ?`,
            [magazineId, pageNumber]
        );
        if (pages.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Page not found'
            });
        }
        const imagePath = path.join(__dirname, '../../', pages[0].image_path);
        try {
            await fs.access(imagePath);
        } catch {
            return res.status(404).json({
                success: false,
                message: 'Image file not found'
            });
        }
        res.set({
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'SAMEORIGIN',
            'Content-Disposition': 'inline',
            'Content-Security-Policy': "default-src 'none'; img-src 'self'",
        });
        const imageBuffer = await fs.readFile(imagePath);
        res.send(imageBuffer);
    } catch (error) {
        console.error('Serve secure image error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to serve image',
            error: error.message
        });
    }
};
const getPreviewPages = async (req, res) => {
    try {
        const { magazineId } = req.params;
        const magazines = await query(
            `SELECT id, title, is_premium, total_pages FROM magazines 
             WHERE id = ? AND is_published = TRUE`,
            [magazineId]
        );
        if (magazines.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Magazine not found'
            });
        }
        const magazine = magazines[0];
        const previewPages = await query(
            `SELECT page_number, image_path FROM magazine_pages 
             WHERE magazine_id = ? AND (is_preview_page = TRUE OR page_number <= 3)
             ORDER BY page_number
             LIMIT 3`,
            [magazineId]
        );
        const previews = previewPages.map(page => ({
            pageNumber: page.page_number,
            imageUrl: `/api/v1/magazines/preview-image/${magazineId}/${page.page_number}`
        }));
        res.json({
            success: true,
            data: {
                magazine: {
                    id: magazine.id,
                    title: magazine.title,
                    totalPages: magazine.total_pages
                },
                previewPages: previews,
                isPreviewOnly: true,
                subscriptionRequired: magazine.is_premium
            }
        });
    } catch (error) {
        console.error('Get preview pages error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch preview pages',
            error: error.message
        });
    }
};
const servePreviewImage = async (req, res) => {
    try {
        const { magazineId, pageNumber } = req.params;
        if (parseInt(pageNumber) > 3) {
            return res.status(403).json({
                success: false,
                message: 'This page is not available for preview'
            });
        }
        const pages = await query(
            `SELECT image_path FROM magazine_pages 
             WHERE magazine_id = ? AND page_number = ?`,
            [magazineId, pageNumber]
        );
        if (pages.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Page not found'
            });
        }
        const imagePath = path.join(__dirname, '../../', pages[0].image_path);
        try {
            await fs.access(imagePath);
        } catch {
            return res.status(404).json({
                success: false,
                message: 'Image file not found'
            });
        }
        res.set({
            'Content-Type': 'image/jpeg',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'Content-Disposition': 'inline'
        });
        const imageBuffer = await fs.readFile(imagePath);
        res.send(imageBuffer);
    } catch (error) {
        console.error('Serve preview image error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to serve preview image',
            error: error.message
        });
    }
};
const adminListMagazines = async (req, res) => {
    try {
        const { page = 1, limit = 20, is_published, is_premium } = req.query;
        const offset = (page - 1) * limit;
        let whereConditions = [];
        const params = [];
        if (is_published !== undefined) {
            whereConditions.push('is_published = ?');
            params.push(is_published === 'true');
        }
        if (is_premium !== undefined) {
            whereConditions.push('is_premium = ?');
            params.push(is_premium === 'true');
        }
        const whereClause = whereConditions.length > 0 
            ? 'WHERE ' + whereConditions.join(' AND ') 
            : '';
        const magazines = await query(
            `SELECT m.*, u.name as created_by_name
             FROM magazines m
             LEFT JOIN users u ON m.created_by = u.id
             ${whereClause}
             ORDER BY m.created_at DESC
             LIMIT ? OFFSET ?`,
            [...params, parseInt(limit), offset]
        );
        const [countResult] = await query(
            `SELECT COUNT(*) as total FROM magazines ${whereClause}`,
            params
        );
        res.json({
            success: true,
            data: {
                magazines,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: countResult?.total || 0,
                    totalPages: Math.ceil((countResult?.total || 0) / limit)
                }
            }
        });
    } catch (error) {
        console.error('Admin list magazines error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch magazines',
            error: error.message
        });
    }
};
const setPreviewPages = async (req, res) => {
    try {
        const { magazineId } = req.params;
        const { pageNumbers } = req.body;
        if (!Array.isArray(pageNumbers)) {
            return res.status(400).json({
                success: false,
                message: 'pageNumbers must be an array'
            });
        }
        await query(
            'UPDATE magazine_pages SET is_preview_page = FALSE WHERE magazine_id = ?',
            [magazineId]
        );
        if (pageNumbers.length > 0) {
            await query(
                `UPDATE magazine_pages SET is_preview_page = TRUE 
                 WHERE magazine_id = ? AND page_number IN (?)`,
                [magazineId, pageNumbers]
            );
        }
        res.json({
            success: true,
            message: 'Preview pages updated successfully'
        });
    } catch (error) {
        console.error('Set preview pages error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to set preview pages',
            error: error.message
        });
    }
};
module.exports = {
    uploadMagazine,
    uploadMagazinePages,
    updateMagazine,
    deleteMagazine,
    adminListMagazines,
    setPreviewPages,
    listMagazines,
    getMagazineDetails,
    getPreviewPages,
    servePreviewImage,
    startReadingSession,
    getMagazinePage,
    serveSecureImage
};
