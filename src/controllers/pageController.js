const { query, transaction } = require('../config/database');

// Get page layout configuration
const getPageLayout = async (req, res) => {
    try {
        const { pageSlug } = req.params;

        const layouts = await query(
            `SELECT pl.*, 
                    JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'id', ps.id,
                            'component_type', ps.component_type,
                            'component_props', ps.component_props,
                            'display_order', ps.display_order,
                            'is_active', ps.is_active
                        )
                    ) as sections
             FROM page_layouts pl
             LEFT JOIN page_sections ps ON pl.id = ps.page_layout_id AND ps.is_active = TRUE
             WHERE pl.page_slug = ? AND pl.is_active = TRUE
             GROUP BY pl.id`,
            [pageSlug]
        );

        if (layouts.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Page layout not found'
            });
        }

        res.json({
            success: true,
            data: layouts[0]
        });

    } catch (error) {
        console.error('Get page layout error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch page layout',
            error: error.message
        });
    }
};

// Get homepage data with all sections
const getHomepageData = async (req, res) => {
    try {
        // Get breaking news
        const breakingNews = await query(
            `SELECT id, title, slug, summary, featured_image, published_at
             FROM news_articles
             WHERE status = 'PUBLISHED' AND is_breaking = TRUE
             ORDER BY published_at DESC
             LIMIT 5`
        );

        // Get featured/hero news (main section)
        const heroNews = await query(
            `SELECT na.id, na.title, na.slug, na.summary, na.featured_image, na.published_at,
                    s.name as section_name, s.slug as section_slug
             FROM news_articles na
             LEFT JOIN sections s ON na.section_id = s.id
             WHERE na.status = 'PUBLISHED' AND na.is_featured = TRUE
             ORDER BY na.published_at DESC
             LIMIT 6`
        );

        // Get left sidebar news
        const leftSidebarNews = await query(
            `SELECT na.id, na.title, na.slug, na.summary, na.featured_image, na.published_at,
                    s.name as section_name, s.slug as section_slug
             FROM news_articles na
             LEFT JOIN sections s ON na.section_id = s.id
             WHERE na.status = 'PUBLISHED'
             ORDER BY na.views_count DESC
             LIMIT 5`
        );

        // Get right sidebar news
        const rightSidebarNews = await query(
            `SELECT na.id, na.title, na.slug, na.summary, na.featured_image, na.published_at,
                    s.name as section_name, s.slug as section_slug
             FROM news_articles na
             LEFT JOIN sections s ON na.section_id = s.id
             WHERE na.status = 'PUBLISHED'
             ORDER BY na.published_at DESC
             LIMIT 5`
        );

        // Get news by sections
        const sections = await query(
            `SELECT id, name, slug, icon FROM sections WHERE is_active = TRUE ORDER BY display_order`
        );

        const sectionNews = {};
        for (const section of sections) {
            const news = await query(
                `SELECT id, title, slug, summary, featured_image, published_at
                 FROM news_articles
                 WHERE section_id = ? AND status = 'PUBLISHED'
                 ORDER BY published_at DESC
                 LIMIT 6`,
                [section.id]
            );
            sectionNews[section.slug] = {
                section: section,
                articles: news
            };
        }

        res.json({
            success: true,
            data: {
                breakingNews,
                heroNews,
                leftSidebarNews,
                rightSidebarNews,
                sectionNews,
                sections
            }
        });

    } catch (error) {
        console.error('Get homepage data error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch homepage data',
            error: error.message
        });
    }
};

// Get news by position/placement
const getNewsByPosition = async (req, res) => {
    try {
        const { position, limit = 5 } = req.query;

        let orderBy = 'published_at DESC';
        let where = "status = 'PUBLISHED'";

        switch (position) {
            case 'hero':
                where += ' AND is_featured = TRUE';
                break;
            case 'breaking':
                where += ' AND is_breaking = TRUE';
                break;
            case 'trending':
                orderBy = 'views_count DESC';
                break;
            case 'latest':
            default:
                orderBy = 'published_at DESC';
        }

        const news = await query(
            `SELECT na.id, na.title, na.slug, na.summary, na.featured_image, na.published_at,
                    na.is_premium, na.is_breaking, na.is_featured, na.views_count,
                    s.name as section_name, s.slug as section_slug
             FROM news_articles na
             LEFT JOIN sections s ON na.section_id = s.id
             WHERE ${where}
             ORDER BY ${orderBy}
             LIMIT ?`,
            [parseInt(limit)]
        );

        res.json({
            success: true,
            data: news
        });

    } catch (error) {
        console.error('Get news by position error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch news',
            error: error.message
        });
    }
};

// Get section news for homepage sections
const getSectionNews = async (req, res) => {
    try {
        const { sectionSlug } = req.params;
        const { limit = 6 } = req.query;

        const section = await query(
            'SELECT id, name, slug, icon FROM sections WHERE slug = ? AND is_active = TRUE',
            [sectionSlug]
        );

        if (section.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Section not found'
            });
        }

        let news = await query(
            `SELECT na.id, na.title, na.slug, na.summary, na.featured_image, na.published_at,
                    na.is_premium, na.views_count
             FROM news_articles na
             WHERE na.section_id = ? AND na.status = 'PUBLISHED'
             ORDER BY na.published_at DESC
             LIMIT ?`,
            [section[0].id, parseInt(limit)]
        );

        // Mix content if less than limit
        if (news.length < parseInt(limit)) {
            const needed = parseInt(limit) - news.length;
            const existingIds = news.map(n => n.id);
            // Safe comma separated string for numeric IDs
            const notIn = existingIds.length > 0 ? existingIds.join(',') : '0';
            
            const extraNews = await query(
                `SELECT na.id, na.title, na.slug, na.summary, na.featured_image, na.published_at,
                        na.is_premium, na.views_count
                 FROM news_articles na
                 WHERE na.status = 'PUBLISHED' AND na.id NOT IN (${notIn})
                 ORDER BY na.published_at DESC
                 LIMIT ?`,
                [needed]
            );
            news = [...news, ...extraNews];
        }

        res.json({
            success: true,
            data: {
                section: section[0],
                articles: news
            }
        });

    } catch (error) {
        console.error('Get section news error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch section news',
            error: error.message
        });
    }
};

module.exports = {
    getPageLayout,
    getHomepageData,
    getNewsByPosition,
    getSectionNews
};
