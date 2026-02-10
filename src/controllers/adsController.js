const { query } = require('../config/database');
const path = require('path');
const fs = require('fs').promises;


const getAds = async (req, res) => {
    try {
        const { position, limit } = req.query;
        let sql = 'SELECT * FROM ads WHERE is_active = 1 AND (start_date IS NULL OR start_date <= NOW()) AND (end_date IS NULL OR end_date >= NOW())';
        const params = [];

        if (position) {
            sql += ' AND position = ?';
            params.push(position);
        }

        sql += ' ORDER BY created_at DESC';

        if (limit) {
            sql += ' LIMIT ?';
            params.push(parseInt(limit));
        }

        const ads = await query(sql, params);

       
        if (ads.length > 0) {
            const ids = ads.map(ad => ad.id);
            query('UPDATE ads SET view_count = view_count + 1 WHERE id IN (?)', [ids]).catch(console.error);
        }

        res.json({
            success: true,
            data: ads
        });
    } catch (error) {
        console.error('Get ads error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch ads',
            error: error.message
        });
    }
};

// Get all ads (Admin)
const getAllAds = async (req, res) => {
    try {
        const ads = await query('SELECT * FROM ads ORDER BY created_at DESC');
        res.json({
            success: true,
            data: ads
        });
    } catch (error) {
        console.error('Get all ads error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch ads',
            error: error.message
        });
    }
};

// Create a new ad
const createAd = async (req, res) => {
    try {
        const { title, target_url, position, start_date, end_date, is_active } = req.body;
        
        let image_url = null;
        if (req.file) {
            image_url = `/uploads/ads/${req.file.filename}`;
        } else if (req.body.image_url) {
            image_url = req.body.image_url;
        }

        if (!image_url) {
            return res.status(400).json({
                success: false,
                message: 'Ad image is required'
            });
        }

        const sql = `
            INSERT INTO ads (title, image_url, target_url, position, start_date, end_date, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        
        const result = await query(sql, [
            title, 
            image_url, 
            target_url, 
            position || 'general', 
            start_date || null, 
            end_date || null, 
            is_active === undefined ? 1 : is_active
        ]);

        res.status(201).json({
            success: true,
            message: 'Ad created successfully',
            data: { id: result.insertId }
        });
    } catch (error) {
        console.error('Create ad error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create ad',
            error: error.message
        });
    }
};

// Update an ad
const updateAd = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, target_url, position, start_date, end_date, is_active } = req.body;

        const updates = [];
        const values = [];

        if (title !== undefined) { updates.push('title = ?'); values.push(title); }
        if (target_url !== undefined) { updates.push('target_url = ?'); values.push(target_url); }
        if (position !== undefined) { updates.push('position = ?'); values.push(position); }
        if (start_date !== undefined) { updates.push('start_date = ?'); values.push(start_date); }
        if (end_date !== undefined) { updates.push('end_date = ?'); values.push(end_date); }
        if (is_active !== undefined) { updates.push('is_active = ?'); values.push(is_active); }

        if (req.file) {
            updates.push('image_url = ?');
            values.push(`/uploads/ads/${req.file.filename}`);
            
            // Delete old image
            const [oldAd] = await query('SELECT image_url FROM ads WHERE id = ?', [id]);
            if (oldAd && oldAd.image_url) {
                const oldPath = path.join(__dirname, '../../', oldAd.image_url);
                fs.unlink(oldPath).catch(err => console.error('Failed to delete old ad image:', err.message));
            }
        }

        if (updates.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No fields to update'
            });
        }

        values.push(id);
        const sql = `UPDATE ads SET ${updates.join(', ')}, updated_at = NOW() WHERE id = ?`;
        
        await query(sql, values);

        res.json({
            success: true,
            message: 'Ad updated successfully'
        });
    } catch (error) {
        console.error('Update ad error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update ad',
            error: error.message
        });
    }
};

// Delete an ad
const deleteAd = async (req, res) => {
    try {
        const { id } = req.params;
        
        const [ad] = await query('SELECT image_url FROM ads WHERE id = ?', [id]);
        
        if (!ad) {
            return res.status(404).json({
                success: false,
                message: 'Ad not found'
            });
        }

        if (ad.image_url) {
            const imagePath = path.join(__dirname, '../../', ad.image_url);
            fs.unlink(imagePath).catch(err => console.error('Failed to delete ad image:', err.message));
        }

        await query('DELETE FROM ads WHERE id = ?', [id]);

        res.json({
            success: true,
            message: 'Ad deleted successfully'
        });

    } catch (error) {
        console.error('Delete ad error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete ad',
            error: error.message
        });
    }
};

// Track ad click
const trackClick = async (req, res) => {
    try {
        const { id } = req.params;
        console.log('Track click:', id);
        await query('UPDATE ads SET click_count = click_count + 1 WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        console.error('Track click error:', error);
        res.status(500).json({ success: false });
    }
};

module.exports = {
    getAds,
    getAllAds,
    createAd,
    updateAd,
    deleteAd,
    trackClick
};
