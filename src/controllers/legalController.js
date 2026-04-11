const { query } = require('../config/database');

const ALLOWED_LEGAL_SLUGS = ['terms', 'privacy-policy', 'about'];

// GET /legal/:slug  — Public: anyone can read
const getLegalPage = async (req, res) => {
    try {
        const { slug } = req.params;

        if (!ALLOWED_LEGAL_SLUGS.includes(slug)) {
            return res.status(400).json({ success: false, message: 'Invalid page slug' });
        }

        const pages = await query(
            'SELECT slug, title, content, meta_description, updated_at FROM pages WHERE slug = ?',
            [slug]
        );

        if (pages.length === 0) {
            return res.status(404).json({ success: false, message: 'Page not found' });
        }

        res.json({ success: true, data: pages[0] });
    } catch (error) {
        console.error('getLegalPage error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch page', error: error.message });
    }
};

// GET /legal  — Admin: list both legal pages with status
const listLegalPages = async (req, res) => {
    try {
        const pages = await query(
            `SELECT slug, title, meta_description, updated_at,
                    CHAR_LENGTH(content) as content_length
             FROM pages
             WHERE slug IN (${ALLOWED_LEGAL_SLUGS.map(() => '?').join(',')})
             ORDER BY FIELD(slug, ${ALLOWED_LEGAL_SLUGS.map(() => '?').join(',')})`,
            [...ALLOWED_LEGAL_SLUGS, ...ALLOWED_LEGAL_SLUGS]
        );

        // Build full response including pages that don't exist yet
        const result = ALLOWED_LEGAL_SLUGS.map(slug => {
            const found = pages.find(p => p.slug === slug);
            return found
                ? { ...found, exists: true }
                : { slug, title: null, meta_description: null, updated_at: null, content_length: 0, exists: false };
        });

        res.json({ success: true, data: result });
    } catch (error) {
        console.error('listLegalPages error:', error);
        res.status(500).json({ success: false, message: 'Failed to list pages', error: error.message });
    }
};

// PUT /legal/:slug  — Admin only: create or update
const upsertLegalPage = async (req, res) => {
    try {
        const { slug } = req.params;
        const { title, content, meta_description } = req.body;

        if (!ALLOWED_LEGAL_SLUGS.includes(slug)) {
            return res.status(400).json({ success: false, message: 'Invalid page slug. Allowed: ' + ALLOWED_LEGAL_SLUGS.join(', ') });
        }

        if (!title || !title.trim()) {
            return res.status(400).json({ success: false, message: 'Title is required' });
        }
        if (!content || !content.trim()) {
            return res.status(400).json({ success: false, message: 'Content is required' });
        }

        // Check if page exists
        const existing = await query('SELECT id FROM pages WHERE slug = ?', [slug]);

        if (existing.length > 0) {
            await query(
                'UPDATE pages SET title = ?, content = ?, meta_description = ?, updated_at = NOW() WHERE slug = ?',
                [title.trim(), content.trim(), meta_description?.trim() || null, slug]
            );
            res.json({ success: true, message: 'Page updated successfully' });
        } else {
            await query(
                'INSERT INTO pages (slug, title, content, meta_description) VALUES (?, ?, ?, ?)',
                [slug, title.trim(), content.trim(), meta_description?.trim() || null]
            );
            res.status(201).json({ success: true, message: 'Page created successfully' });
        }
    } catch (error) {
        console.error('upsertLegalPage error:', error);
        res.status(500).json({ success: false, message: 'Failed to save page', error: error.message });
    }
};

// DELETE /legal/:slug  — Admin only: reset/clear a page
const resetLegalPage = async (req, res) => {
    try {
        const { slug } = req.params;

        if (!ALLOWED_LEGAL_SLUGS.includes(slug)) {
            return res.status(400).json({ success: false, message: 'Invalid page slug' });
        }

        await query('DELETE FROM pages WHERE slug = ?', [slug]);
        res.json({ success: true, message: 'Page reset successfully' });
    } catch (error) {
        console.error('resetLegalPage error:', error);
        res.status(500).json({ success: false, message: 'Failed to reset page', error: error.message });
    }
};

module.exports = { getLegalPage, listLegalPages, upsertLegalPage, resetLegalPage };
