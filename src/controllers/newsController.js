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
            mandal_name
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
            if (mandal_name) finalTags.push(mandal_name);
            const [articleResult] = await connection.execute(
                `INSERT INTO news_articles 
                 (title, slug, summary, content, section_id, subsection_id, author_id, 
                  featured_image, is_premium, is_breaking, is_featured, is_trending, is_hero, district_id, status, published_at) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
                        const tagSlug = tagName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
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
                a.district_id, a.status,
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
            is_trending,
            is_hero
        } = req.body;
        await transaction(async (connection) => {
            const updates = [];
            const values = [];
            if (title !== undefined) {
                updates.push('title = ?');
                values.push(title);
            }
            if (slug !== undefined) {
                updates.push('slug = ?');
                values.push(slug);
            }
            if (summary !== undefined) {
                updates.push('summary = ?');
                values.push(summary);
            }
            if (content !== undefined) {
                updates.push('content = ?');
                values.push(content);
            }
            if (section_id !== undefined) {
                updates.push('section_id = ?');
                values.push(section_id);
            }
            if (subsection_id !== undefined) {
                updates.push('subsection_id = ?');
                values.push(subsection_id);
            }
            if (featured_image !== undefined) {
                updates.push('featured_image = ?');
                values.push(featured_image);
            }
            if (is_premium !== undefined) {
                updates.push('is_premium = ?');
                values.push(is_premium);
            }
            if (is_breaking !== undefined) {
                updates.push('is_breaking = ?');
                values.push(is_breaking);
            }
            if (is_featured !== undefined) {
                updates.push('is_featured = ?');
                values.push(is_featured);
            }
            if (status !== undefined) {
                updates.push('status = ?');
                values.push(status);
                if (status === 'PUBLISHED') {
                    updates.push('published_at = ?');
                    values.push(new Date());
                }
            }
            if (is_trending !== undefined) {
                updates.push('is_trending = ?');
                values.push(is_trending);
            }
            if (is_hero !== undefined) {
                updates.push('is_hero = ?');
                values.push(is_hero);
            }
            if (district_id !== undefined) {
                 let dId = district_id;
                 if (district_id && isNaN(district_id)) {
                      const [d] = await connection.execute('SELECT id FROM districts WHERE name = ? LIMIT 1', [district_id]);
                      if (d.length > 0) dId = d[0].id;
                 }
                 updates.push('district_id = ?');
                 values.push(dId);
            }
            if (updates.length > 0) {
                values.push(id);
                await connection.execute(
                    `UPDATE news_articles SET ${updates.join(', ')} WHERE id = ?`,
                    values
                );
            }
            if (tags && Array.isArray(tags)) {
                await connection.execute(
                    'DELETE FROM news_article_tags WHERE news_article_id = ?',
                    [id]
                );
                for (const tagName of tags) {
                    const [existingTag] = await connection.execute(
                        'SELECT id FROM news_tags WHERE name = ?',
                        [tagName]
                    );
                    let tagId;
                    if (existingTag.length > 0) {
                        tagId = existingTag[0].id;
                    } else {
                        const tagSlug = tagName.toLowerCase().replace(/\s+/g, '-');
                        const [newTag] = await connection.execute(
                            'INSERT INTO news_tags (name, slug) VALUES (?, ?)',
                            [tagName, tagSlug]
                        );
                        tagId = newTag.insertId;
                    }
                    await connection.execute(
                        'INSERT INTO news_article_tags (news_article_id, tag_id) VALUES (?, ?)',
                        [id, tagId]
                    );
                }
            }
            if (placements && Array.isArray(placements)) {
                await connection.execute(
                    'DELETE FROM news_placements WHERE news_article_id = ?',
                    [id]
                );
                for (const placement of placements) {
                    await connection.execute(
                        'INSERT INTO news_placements (news_article_id, position) VALUES (?, ?)',
                        [id, placement]
                    );
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
        await transaction(async (connection) => {
            await connection.execute('DELETE FROM news_article_tags WHERE news_article_id = ?', [id]);
            await connection.execute('DELETE FROM news_placements WHERE news_article_id = ?', [id]);
            await connection.execute('DELETE FROM article_views WHERE article_id = ?', [id]);
            await connection.execute('DELETE FROM news_articles WHERE id = ?', [id]);
        });
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
module.exports = {
    createArticle,
    getArticles,
    getArticleBySlug,
    updateArticle,
    deleteArticle,
    getArticleById
};
