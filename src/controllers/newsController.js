const fs = require('fs');
const path = require('path');
const { query, transaction } = require('../config/database');

const createArticle = async (req, res) => {
    try {
        const {
            title,
            slug,
            summary,
            content,
            section_id,
            subsection_id,
            featured_image,
            is_premium,
            is_breaking,
            is_featured,
            is_trending,
            is_hero,
            status,
            tags,
            placements,
            district_id,
            city,
            state
        } = req.body;

        if (!title || !slug || !content || !section_id) {
            return res.status(400).json({
                success: false,
                message: 'Title, slug, content, and section are required'
            });
        }

        const result = await transaction(async (connection) => {
            let resolvedDistrictId = null;
            if (district_id) {
                 const [dist] = await connection.execute('SELECT id FROM districts WHERE name = ? OR id = ? LIMIT 1', [district_id, district_id]);
                 if (dist.length > 0) resolvedDistrictId = dist[0].id;
            }

            let finalTags = [];
            if (Array.isArray(tags)) finalTags = [...tags];
            else if (typeof tags === 'string' && tags.trim()) finalTags = tags.split(',').map(t => t.trim());
            // City is now a column, but we can still add it as a tag for backward compatibility or search if desired
            if (city) finalTags.push(city);

            const [articleResult] = await connection.execute(
                `INSERT INTO news_articles 
                 (title, slug, summary, content, section_id, subsection_id, author_id, 
                  featured_image, is_premium, is_breaking, is_featured, is_trending, is_hero, district_id, city, state, status, published_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    title,
                    slug,
                    summary || null,
                    content,
                    section_id,
                    subsection_id || null,
                    req.user.id,
                    featured_image || null,
                    is_premium || false,
                    is_breaking || false,
                    is_featured || false,
                    is_trending || false,
                    is_hero || false,
                    resolvedDistrictId,
                    city || null,
                    state || null,
                    status || 'DRAFT',
                    status === 'PUBLISHED' ? new Date() : null
                ]
            );

            const articleId = articleResult.insertId;

            if (finalTags.length > 0) {
                for (const tagName of finalTags) {
                    if(!tagName) continue;
                    const [existingTag] = await connection.execute(
                        'SELECT id FROM news_tags WHERE name = ?',
                        [tagName]
                    );

                    let tagId;
                    if (existingTag.length > 0) {
                        tagId = existingTag[0].id;
                    } else {
                        const tagSlug = tagName.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
                        const [newTag] = await connection.execute(
                            'INSERT INTO news_tags (name, slug) VALUES (?, ?)',
                            [tagName, tagSlug]
                        );
                        tagId = newTag.insertId;
                    }

                    await connection.execute(
                        'INSERT INTO news_article_tags (news_article_id, tag_id) VALUES (?, ?)',
                        [articleId, tagId]
                    );
                }
            }

            if (resolvedDistrictId) {
                await connection.execute(
                    'INSERT INTO news_districts (news_article_id, district_id) VALUES (?, ?)',
                    [articleId, resolvedDistrictId]
                );
            }

            if (placements && Array.isArray(placements) && placements.length > 0) {
                for (const placement of placements) {
                    await connection.execute(
                        'INSERT INTO news_placements (news_article_id, position) VALUES (?, ?)',
                        [articleId, placement]
                    );
                }
            }

            return articleId;
        });

        res.status(201).json({
            success: true,
            message: 'Article created successfully',
            data: {
                id: result,
                title,
                slug
            }
        });
    } catch (error) {
        console.error('Create article error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create article',
            error: error.message
        });
    }
};

const getArticles = async (req, res) => {
    try {
        const {
            section,
            subsection,
            status,
            is_premium,
            is_breaking,
            is_featured,
            is_trending,
            is_hero,
            district_id,
            city,
            state,
            page = 1,
            limit = 20,
            search,
            sortBy = 'createdAt',
            order = 'desc',
            date
        } = req.query;

        const offset = (page - 1) * limit;
        const conditions = [];
        const values = [];

        if (section) {
            conditions.push('s.slug = ?');
            values.push(section);
        }

        if (subsection) {
            conditions.push('sub.slug = ?');
            values.push(subsection);
        }

        const isAdmin = req.user && ['ADMIN', 'EDITOR'].includes(req.user.role);

        if (date) {
            conditions.push('DATE(a.published_at) = ?');
            values.push(date);
        }

        if (isAdmin) {
             if (status && status !== 'all') {
                 conditions.push('a.status = ?');
                 values.push(status);
             }
        } else {
             conditions.push('a.status = ?');
             values.push('PUBLISHED');
        }

        if (is_premium !== undefined) {
            conditions.push('a.is_premium = ?');
            values.push(is_premium === 'true');
        }

        if (is_breaking !== undefined) {
            conditions.push('a.is_breaking = ?');
            values.push(is_breaking === 'true');
        }

        if (is_featured !== undefined) {
            conditions.push('a.is_featured = ?');
            values.push(is_featured === 'true');
        }

        if (is_trending !== undefined) {
            conditions.push('a.is_trending = ?');
            values.push(is_trending === 'true');
        }

        if (is_hero !== undefined) {
            conditions.push('a.is_hero = ?');
            values.push(is_hero === 'true');
        }

        if (district_id) {
             conditions.push('a.district_id = ?');
             values.push(district_id);
        }

        if (city) {
            conditions.push('a.city = ?');
            values.push(city);
        }

        if (state) {
            conditions.push('a.state = ?');
            values.push(state);
        }

        if (search) {
            conditions.push('(a.title LIKE ? OR a.summary LIKE ? OR a.content LIKE ?)');
            const searchPattern = `%${search}%`;
            values.push(searchPattern, searchPattern, searchPattern);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        
        const allowedSortColumns = {
            'createdAt': 'a.created_at',
            'title': 'a.title',
            'views_count': 'a.views_count',
            'published_at': 'a.published_at'
        };
        const sortColumn = allowedSortColumns[sortBy] || 'a.created_at';
        const sortDirection = order.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        const orderByClause = `ORDER BY ${sortColumn} ${sortDirection}`;

        const countQuery = `
            SELECT COUNT(*) as total
            FROM news_articles a
            LEFT JOIN sections s ON a.section_id = s.id
            LEFT JOIN subsections sub ON a.subsection_id = sub.id
            ${whereClause}
        `;

        const [countResult] = await query(countQuery, values);
        const total = countResult.total;

        const articlesQuery = `
            SELECT 
                a.id, a.title, a.slug, a.summary, a.featured_image,
                a.is_premium, a.is_breaking, a.is_featured, a.is_trending, a.is_hero, 
                a.district_id, a.city, a.state, a.status,
                a.published_at, a.views_count, a.created_at,
                s.name as section_name, s.slug as section_slug,
                sub.name as subsection_name, sub.slug as subsection_slug,
                u.name as author_name,
                (SELECT JSON_ARRAYAGG(t.name)
                 FROM news_article_tags nat
                 JOIN news_tags t ON nat.tag_id = t.id
                 WHERE nat.news_article_id = a.id) as tags
            FROM news_articles a
            LEFT JOIN sections s ON a.section_id = s.id
            LEFT JOIN subsections sub ON a.subsection_id = sub.id
            LEFT JOIN users u ON a.author_id = u.id
            ${whereClause}
            ${orderByClause}
            LIMIT ? OFFSET ?
        `;

        const queryValues = [...values, parseInt(limit), parseInt(offset)];
        const articles = await query(articlesQuery, queryValues);

        res.json({
            success: true,
            data: {
                articles,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    totalPages: Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Get articles error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch articles',
            error: error.message
        });
    }
};

const getArticleById = async (req, res) => {
    try {
        const { id } = req.params;
        const articles = await query(
            `SELECT 
                a.*, 
                s.name as section_name,
                sub.name as subsection_name,
                (SELECT JSON_ARRAYAGG(t.name)
                 FROM news_article_tags nat
                 JOIN news_tags t ON nat.tag_id = t.id
                 WHERE nat.news_article_id = a.id) as tags,
                (SELECT JSON_ARRAYAGG(np.position)
                 FROM news_placements np
                 WHERE np.news_article_id = a.id) as placements
            FROM news_articles a
            LEFT JOIN sections s ON a.section_id = s.id
            LEFT JOIN subsections sub ON a.subsection_id = sub.id
            WHERE a.id = ?`,
            [id]
        );

        if (articles.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Article not found'
            });
        }

        res.json({
            success: true,
            data: articles[0]
        });
    } catch (error) {
        console.error('Get article error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch article',
            error: error.message
        });
    }
};

const getArticleBySlug = async (req, res) => {
    try {
        const { slug } = req.params;
        const articles = await query(
            `SELECT 
                a.*, 
                s.name as section_name, s.slug as section_slug,
                sub.name as subsection_name, sub.slug as subsection_slug,
                u.name as author_name, u.email as author_email,
                (SELECT JSON_ARRAYAGG(t.name)
                 FROM news_article_tags nat
                 JOIN news_tags t ON nat.tag_id = t.id
                 WHERE nat.news_article_id = a.id) as tags
            FROM news_articles a
            LEFT JOIN sections s ON a.section_id = s.id
            LEFT JOIN subsections sub ON a.subsection_id = sub.id
            LEFT JOIN users u ON a.author_id = u.id
            WHERE a.slug = ? AND a.status = 'PUBLISHED'`,
            [slug]
        );

        if (articles.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Article not found'
            });
        }

        await query(
            'UPDATE news_articles SET views_count = views_count + 1 WHERE id = ?',
            [articles[0].id]
        );

        if (req.user) {
            await query(
                'INSERT INTO article_views (article_id, user_id, ip_address) VALUES (?, ?, ?)',
                [articles[0].id, req.user.id, req.ip]
            );
        }

        res.json({
            success: true,
            data: articles[0]
        });
    } catch (error) {
        console.error('Get article error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch article',
            error: error.message
        });
    }
};

const updateArticle = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            title,
            slug,
            summary,
            content,
            section_id,
            subsection_id,
            featured_image,
            is_premium,
            is_breaking,
            is_featured,
            status,
            tags,
            placements,
            district_id,
            city,
            state,
            is_trending,
            is_hero
        } = req.body;

        await transaction(async (connection) => {
            const updates = [];
            const values = [];

            if (title !== undefined && title !== null) { updates.push('title = ?'); values.push(title); }
            if (slug !== undefined && slug !== null) { updates.push('slug = ?'); values.push(slug); }
            if (summary !== undefined) { updates.push('summary = ?'); values.push(summary); }
            if (content !== undefined && content !== null) { updates.push('content = ?'); values.push(content); }
            if (section_id !== undefined && section_id !== null) { updates.push('section_id = ?'); values.push(section_id); }
            if (subsection_id !== undefined) { updates.push('subsection_id = ?'); values.push(subsection_id); }
            if (featured_image !== undefined) { updates.push('featured_image = ?'); values.push(featured_image); }
            if (is_premium !== undefined) { updates.push('is_premium = ?'); values.push(is_premium); }
            if (is_breaking !== undefined) { updates.push('is_breaking = ?'); values.push(is_breaking); }
            if (is_featured !== undefined) { updates.push('is_featured = ?'); values.push(is_featured); }
            if (status !== undefined) {
                updates.push('status = ?');
                values.push(status);
                if (status === 'PUBLISHED') {
                    updates.push('published_at = ?');
                    values.push(new Date());
                }
            }
            if (is_trending !== undefined) { updates.push('is_trending = ?'); values.push(is_trending); }
            if (is_hero !== undefined) { updates.push('is_hero = ?'); values.push(is_hero); }
            
            if (district_id !== undefined) {
                 let dId = district_id;
                 if (district_id && isNaN(district_id)) {
                      const [d] = await connection.execute('SELECT id FROM districts WHERE name = ? LIMIT 1', [district_id]);
                      if (d.length > 0) dId = d[0].id;
                 }
                 updates.push('district_id = ?');
                 values.push(dId);
            }

            if (city !== undefined) {
                updates.push('city = ?');
                values.push(city);
            }

            if (state !== undefined) {
                updates.push('state = ?');
                values.push(state);
            }

            if (updates.length > 0) {
                values.push(id);
                await connection.execute(
                    `UPDATE news_articles SET ${updates.join(', ')} WHERE id = ?`,
                    values
                );
            }

            if (tags && Array.isArray(tags)) {
                await connection.execute('DELETE FROM news_article_tags WHERE news_article_id = ?', [id]);
                for (const tagName of tags) {
                    const [existingTag] = await connection.execute('SELECT id FROM news_tags WHERE name = ?', [tagName]);
                    let tagId;
                    if (existingTag.length > 0) {
                        tagId = existingTag[0].id;
                    } else {
                        const tagSlug = tagName.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
                        const [newTag] = await connection.execute('INSERT INTO news_tags (name, slug) VALUES (?, ?)', [tagName, tagSlug]);
                        tagId = newTag.insertId;
                    }
                    await connection.execute('INSERT INTO news_article_tags (news_article_id, tag_id) VALUES (?, ?)', [id, tagId]);
                }
            }

            if (placements && Array.isArray(placements)) {
                await connection.execute('DELETE FROM news_placements WHERE news_article_id = ?', [id]);
                for (const placement of placements) {
                    await connection.execute('INSERT INTO news_placements (news_article_id, position) VALUES (?, ?)', [id, placement]);
                }
            }
        });

        res.json({
            success: true,
            message: 'Article updated successfully'
        });
    } catch (error) {
        console.error('Update article error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update article',
            error: error.message
        });
    }
};

const deleteArticle = async (req, res) => {
    try {
        const { id } = req.params;

        // Get article details first to find the image path
        const [article] = await query('SELECT featured_image FROM news_articles WHERE id = ?', [id]);
        
        await transaction(async (connection) => {
            await connection.execute('DELETE FROM news_article_tags WHERE news_article_id = ?', [id]);
            await connection.execute('DELETE FROM news_placements WHERE news_article_id = ?', [id]);
            await connection.execute('DELETE FROM article_views WHERE article_id = ?', [id]);
            await connection.execute('DELETE FROM news_articles WHERE id = ?', [id]);
        });

        // Delete image file after successful DB deletion
        if (article && article.featured_image) {
            const imagePath = article.featured_image;
            // imagePath is like /uploads/images/filename.jpg
            // We need to resolve it relative to the project root
            // __dirname is src/controllers. Project root is ../../
            const fullPath = path.join(__dirname, '../../', imagePath);
            
            fs.unlink(fullPath, (err) => {
                if (err) {
                    console.error('Failed to delete image file:', fullPath, err.message);
                    // We don't fail the response if file delete fails, as the article is already deleted from DB
                } else {
                    console.log('Deleted image file:', fullPath);
                }
            });
        }

        res.json({
            success: true,
            message: 'Article deleted successfully'
        });
    } catch (error) {
        console.error('Delete article error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete article',
            error: error.message
        });
    }
};

// --- POLLS APIs ---

const getActivePoll = async (req, res) => {
    try {
        // Ensure tables exist (Lazy Init for Demo compatibility)
        await query(`CREATE TABLE IF NOT EXISTS polls (id INT AUTO_INCREMENT PRIMARY KEY, question TEXT, type VARCHAR(20) DEFAULT 'POLL', is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
        
        // Auto-migration: Check if 'type' column exists
        const pollColumns = await query("SHOW COLUMNS FROM polls LIKE 'type'");
        if (pollColumns.length === 0) {
            await query("ALTER TABLE polls ADD COLUMN type VARCHAR(20) DEFAULT 'POLL'");
        }
        
        await query(`CREATE TABLE IF NOT EXISTS poll_options (id INT AUTO_INCREMENT PRIMARY KEY, poll_id INT, option_text VARCHAR(255), votes_count INT DEFAULT 0, FOREIGN KEY (poll_id) REFERENCES polls(id) ON DELETE CASCADE)`);
        await query(`CREATE TABLE IF NOT EXISTS poll_votes (id INT AUTO_INCREMENT PRIMARY KEY, poll_id INT, user_id INT, ip_address VARCHAR(45), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);
        
        // Auto-migration: Check if 'user_id' column exists
        const voteColumns = await query("SHOW COLUMNS FROM poll_votes LIKE 'user_id'");
        if (voteColumns.length === 0) {
            await query("ALTER TABLE poll_votes ADD COLUMN user_id INT");
        }

        const polls = await query('SELECT * FROM polls WHERE is_active = TRUE ORDER BY created_at DESC LIMIT 1');
        
        if (!polls || polls.length === 0) {
            return res.json({ success: true, data: null });
        }
        
        const poll = polls[0];
        const options = await query('SELECT * FROM poll_options WHERE poll_id = ?', [poll.id]);
        
        res.json({
            success: true,
            data: { ...poll, options }
        });
    } catch (error) {
        console.error('Get Active Poll Error:', error);
        res.status(500).json({ success: false, message: 'Failed to get poll', error: error.message });
    }
};

const createPoll = async (req, res) => {
    try {
        const { question, options, type } = req.body;
        if (!question || !options || !Array.isArray(options) || options.length < 2) {
             return res.status(400).json({ success: false, message: 'Question and at least 2 options required' });
        }

        await transaction(async (connection) => {
             // Deactivate previous active polls
             await connection.execute('UPDATE polls SET is_active = FALSE WHERE is_active = TRUE');
             
             // Create new poll
             const [result] = await connection.execute('INSERT INTO polls (question, type, is_active) VALUES (?, ?, TRUE)', [question, type || 'POLL']);
             const pollId = result.insertId;

             // Add options
             for (const opt of options) {
                 await connection.execute('INSERT INTO poll_options (poll_id, option_text) VALUES (?, ?)', [pollId, opt]);
             }
        });

        res.status(201).json({ success: true, message: 'Poll created successfully' });
    } catch (error) {
        console.error('Create Poll Error:', error);
        res.status(500).json({ success: false, message: 'Failed to create poll', error: error.message });
    }
};

const votePoll = async (req, res) => {
    try {
        const { id } = req.params;
        const { optionId, userId } = req.body;
        const ip = req.ip || req.connection.remoteAddress;
        
        if (!optionId) return res.status(400).json({ success: false, message: 'Option ID required' });

        await transaction(async (connection) => {
             // Update vote count
             await connection.execute('UPDATE poll_options SET votes_count = votes_count + 1 WHERE id = ? AND poll_id = ?', [optionId, id]);
             
             // Log vote (optional tracking)
             await connection.execute('INSERT INTO poll_votes (poll_id, user_id, ip_address) VALUES (?, ?, ?)', [id, userId || null, ip]);
        });
        
        res.json({ success: true, message: 'Vote recorded' });
    } catch (error) {
        console.error('Vote Error:', error);
        res.status(500).json({ success: false, message: 'Failed to vote', error: error.message });
    }
};

const deletePoll = async (req, res) => {
    try {
        const { id } = req.params;
        await transaction(async (connection) => {
            const [poll] = await connection.execute('SELECT id FROM polls WHERE id = ?', [id]);
            if (poll.length === 0) {
                 throw new Error('Poll not found');
            }

            // Manually delete related data to be safe regardless of FK constraints
            await connection.execute('DELETE FROM poll_votes WHERE poll_id = ?', [id]);
            await connection.execute('DELETE FROM poll_options WHERE poll_id = ?', [id]);
            await connection.execute('DELETE FROM polls WHERE id = ?', [id]);
        });
        
        res.json({ success: true, message: 'Poll deleted successfully' });
    } catch (error) {
        console.error('Delete Poll Error:', error);
        if (error.message === 'Poll not found') {
            return res.status(404).json({ success: false, message: 'Poll not found' });
        }
        res.status(500).json({ success: false, message: 'Failed to delete poll', error: error.message });
    }
};

module.exports = {
    createArticle,
    getArticles,
    getArticleBySlug,
    updateArticle,
    deleteArticle,
    getArticleById,
    getActivePoll,
    createPoll,
    votePoll,
    deletePoll
};
