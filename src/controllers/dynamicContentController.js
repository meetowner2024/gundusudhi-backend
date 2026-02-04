const { query } = require('../config/database');

// ============================================
// WIDGETS MANAGEMENT
// ============================================

// Get all widgets
const getAllWidgets = async (req, res) => {
    try {
        const widgets = await query(`
            SELECT w.*, 
                   (SELECT COUNT(*) FROM widget_items WHERE widget_id = w.id AND is_active = TRUE) as item_count
            FROM content_widgets w
            ORDER BY display_order ASC
        `);

        res.json({ success: true, data: widgets });
    } catch (error) {
        console.error('Get widgets error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch widgets' });
    }
};

// Get widget with items
const getWidgetWithItems = async (req, res) => {
    try {
        const { widgetType } = req.params;
        
        const [widget] = await query(
            'SELECT * FROM content_widgets WHERE widget_type = ? AND is_active = TRUE',
            [widgetType]
        );

        if (!widget) {
            return res.status(404).json({ success: false, message: 'Widget not found' });
        }

        const items = await query(
            `SELECT * FROM widget_items 
             WHERE widget_id = ? AND is_active = TRUE 
             AND (expire_at IS NULL OR expire_at > NOW())
             ORDER BY display_order ASC`,
            [widget.id]
        );

        res.json({ success: true, data: { ...widget, items } });
    } catch (error) {
        console.error('Get widget items error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch widget items' });
    }
};

// Create/Update widget item
const saveWidgetItem = async (req, res) => {
    try {
        const { id, widget_id, title, content, link, image_url, display_order, expire_at } = req.body;

        if (id) {
            // Update
            await query(
                `UPDATE widget_items SET title = ?, content = ?, link = ?, image_url = ?, 
                 display_order = ?, expire_at = ? WHERE id = ?`,
                [title, content, link, image_url, display_order || 0, expire_at, id]
            );
        } else {
            // Create
            await query(
                `INSERT INTO widget_items (widget_id, title, content, link, image_url, display_order, expire_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [widget_id, title, content, link, image_url, display_order || 0, expire_at]
            );
        }

        res.json({ success: true, message: 'Widget item saved successfully' });
    } catch (error) {
        console.error('Save widget item error:', error);
        res.status(500).json({ success: false, message: 'Failed to save widget item' });
    }
};

// Delete widget item
const deleteWidgetItem = async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM widget_items WHERE id = ?', [id]);
        res.json({ success: true, message: 'Widget item deleted successfully' });
    } catch (error) {
        console.error('Delete widget item error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete widget item' });
    }
};

// ============================================
// EDITORIALS / EDITOR'S DESK
// ============================================

const getAllEditorials = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;

        const editorials = await query(
            `SELECT * FROM editorials ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            [limit, offset]
        );

        const [countResult] = await query('SELECT COUNT(*) as total FROM editorials');

        res.json({
            success: true,
            data: {
                editorials,
                pagination: {
                    page,
                    limit,
                    total: countResult.total,
                    totalPages: Math.ceil(countResult.total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Get editorials error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch editorials' });
    }
};

const getFeaturedEditorial = async (req, res) => {
    try {
        const [editorial] = await query(
            `SELECT * FROM editorials WHERE is_featured = TRUE AND status = 'PUBLISHED' 
             ORDER BY published_at DESC LIMIT 1`
        );

        res.json({ success: true, data: editorial || null });
    } catch (error) {
        console.error('Get featured editorial error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch editorial' });
    }
};

const saveEditorial = async (req, res) => {
    try {
        const { id, title, slug, author_name, author_image, summary, content, 
                featured_image, is_featured, status } = req.body;

        if (id) {
            await query(
                `UPDATE editorials SET title = ?, slug = ?, author_name = ?, author_image = ?,
                 summary = ?, content = ?, featured_image = ?, is_featured = ?, status = ?,
                 published_at = CASE WHEN status = 'PUBLISHED' AND published_at IS NULL THEN NOW() ELSE published_at END
                 WHERE id = ?`,
                [title, slug, author_name, author_image, summary, content, featured_image, 
                 is_featured || false, status || 'DRAFT', id]
            );
        } else {
            await query(
                `INSERT INTO editorials (title, slug, author_name, author_image, summary, content, 
                 featured_image, is_featured, status, published_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'PUBLISHED' THEN NOW() ELSE NULL END)`,
                [title, slug, author_name, author_image, summary, content, featured_image, 
                 is_featured || false, status || 'DRAFT', status]
            );
        }

        res.json({ success: true, message: 'Editorial saved successfully' });
    } catch (error) {
        console.error('Save editorial error:', error);
        res.status(500).json({ success: false, message: 'Failed to save editorial' });
    }
};

// ============================================
// TRENDING TOPICS
// ============================================

const getTrendingTopics = async (req, res) => {
    try {
        const topics = await query(
            'SELECT * FROM trending_topics WHERE is_active = TRUE ORDER BY display_order ASC'
        );
        res.json({ success: true, data: topics });
    } catch (error) {
        console.error('Get trending topics error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch trending topics' });
    }
};

const saveTrendingTopic = async (req, res) => {
    try {
        const { id, name, slug, display_order, is_active } = req.body;

        if (id) {
            await query(
                'UPDATE trending_topics SET name = ?, slug = ?, display_order = ?, is_active = ? WHERE id = ?',
                [name, slug, display_order || 0, is_active !== false, id]
            );
        } else {
            await query(
                'INSERT INTO trending_topics (name, slug, display_order) VALUES (?, ?, ?)',
                [name, slug, display_order || 0]
            );
        }

        res.json({ success: true, message: 'Trending topic saved successfully' });
    } catch (error) {
        console.error('Save trending topic error:', error);
        res.status(500).json({ success: false, message: 'Failed to save trending topic' });
    }
};

const deleteTrendingTopic = async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM trending_topics WHERE id = ?', [id]);
        res.json({ success: true, message: 'Trending topic deleted successfully' });
    } catch (error) {
        console.error('Delete trending topic error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete trending topic' });
    }
};

// ============================================
// YOUTUBE VIDEOS
// ============================================

const getYoutubeVideos = async (req, res) => {
    try {
        const { category, daily_only } = req.query;
        
        let sql = 'SELECT * FROM youtube_videos WHERE is_active = TRUE';
        const params = [];

        if (category) {
            sql += ' AND category = ?';
            params.push(category);
        }

        if (daily_only === 'true') {
            sql += ' AND is_daily_video = TRUE';
        }

        sql += ' ORDER BY display_order ASC, published_at DESC';

        const videos = await query(sql, params);
        res.json({ success: true, data: videos });
    } catch (error) {
        console.error('Get youtube videos error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch videos' });
    }
};

const getDailyVideo = async (req, res) => {
    try {
        const [video] = await query(
            `SELECT * FROM youtube_videos WHERE is_daily_video = TRUE AND is_active = TRUE 
             ORDER BY published_at DESC LIMIT 1`
        );
        res.json({ success: true, data: video || null });
    } catch (error) {
        console.error('Get daily video error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch daily video' });
    }
};

const saveYoutubeVideo = async (req, res) => {
    try {
        const { id, title, youtube_id, description, thumbnail_url, category, 
                is_daily_video, display_order } = req.body;

        // Auto-generate thumbnail if not provided
        const thumbnail = thumbnail_url || `https://img.youtube.com/vi/${youtube_id}/0.jpg`;

        if (id) {
            await query(
                `UPDATE youtube_videos SET title = ?, youtube_id = ?, description = ?, 
                 thumbnail_url = ?, category = ?, is_daily_video = ?, display_order = ?
                 WHERE id = ?`,
                [title, youtube_id, description, thumbnail, category, 
                 is_daily_video || false, display_order || 0, id]
            );
        } else {
            await query(
                `INSERT INTO youtube_videos (title, youtube_id, description, thumbnail_url, 
                 category, is_daily_video, display_order, published_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
                [title, youtube_id, description, thumbnail, category, 
                 is_daily_video || false, display_order || 0]
            );
        }

        res.json({ success: true, message: 'Video saved successfully' });
    } catch (error) {
        console.error('Save youtube video error:', error);
        res.status(500).json({ success: false, message: 'Failed to save video' });
    }
};

const deleteYoutubeVideo = async (req, res) => {
    try {
        const { id } = req.params;
        await query('DELETE FROM youtube_videos WHERE id = ?', [id]);
        res.json({ success: true, message: 'Video deleted successfully' });
    } catch (error) {
        console.error('Delete youtube video error:', error);
        res.status(500).json({ success: false, message: 'Failed to delete video' });
    }
};

// ============================================
// ADVERTISEMENTS
// ============================================

const getAdvertisements = async (req, res) => {
    try {
        const { position } = req.query;
        
        let sql = `SELECT * FROM advertisements WHERE is_active = TRUE 
                   AND (start_date IS NULL OR start_date <= NOW())
                   AND (end_date IS NULL OR end_date >= NOW())`;
        const params = [];

        if (position) {
            sql += ' AND position = ?';
            params.push(position);
        }

        sql += ' ORDER BY display_order ASC';

        const ads = await query(sql, params);
        res.json({ success: true, data: ads });
    } catch (error) {
        console.error('Get advertisements error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch advertisements' });
    }
};

const saveAdvertisement = async (req, res) => {
    try {
        const { id, name, position, ad_type, image_url, link_url, html_content,
                adsense_code, width, height, start_date, end_date, display_order } = req.body;

        if (id) {
            await query(
                `UPDATE advertisements SET name = ?, position = ?, ad_type = ?, image_url = ?,
                 link_url = ?, html_content = ?, adsense_code = ?, width = ?, height = ?,
                 start_date = ?, end_date = ?, display_order = ? WHERE id = ?`,
                [name, position, ad_type, image_url, link_url, html_content, adsense_code,
                 width, height, start_date, end_date, display_order || 0, id]
            );
        } else {
            await query(
                `INSERT INTO advertisements (name, position, ad_type, image_url, link_url,
                 html_content, adsense_code, width, height, start_date, end_date, display_order)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [name, position, ad_type || 'image', image_url, link_url, html_content,
                 adsense_code, width, height, start_date, end_date, display_order || 0]
            );
        }

        res.json({ success: true, message: 'Advertisement saved successfully' });
    } catch (error) {
        console.error('Save advertisement error:', error);
        res.status(500).json({ success: false, message: 'Failed to save advertisement' });
    }
};

const trackAdClick = async (req, res) => {
    try {
        const { id } = req.params;
        await query('UPDATE advertisements SET clicks = clicks + 1 WHERE id = ?', [id]);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false });
    }
};

// ============================================
// DISTRICTS
// ============================================

const getDistricts = async (req, res) => {
    try {
        const districts = await query(
            'SELECT * FROM districts WHERE is_active = TRUE ORDER BY display_order ASC'
        );
        res.json({ success: true, data: districts });
    } catch (error) {
        console.error('Get districts error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch districts' });
    }
};

const getDistrictNews = async (req, res) => {
    try {
        const { slug } = req.params;
        const limit = parseInt(req.query.limit) || 10;

        const [district] = await query('SELECT * FROM districts WHERE slug = ?', [slug]);
        
        if (!district) {
            return res.status(404).json({ success: false, message: 'District not found' });
        }

        const news = await query(
            `SELECT na.* FROM news_articles na
             INNER JOIN news_districts nd ON na.id = nd.news_article_id
             WHERE nd.district_id = ? AND na.status = 'PUBLISHED'
             ORDER BY na.published_at DESC LIMIT ?`,
            [district.id, limit]
        );

        res.json({ success: true, data: { district, news } });
    } catch (error) {
        console.error('Get district news error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch district news' });
    }
};

// ============================================
// NEWS PLACEMENTS
// ============================================

const getNewsByPlacement = async (req, res) => {
    try {
        const { position } = req.params;
        const limit = parseInt(req.query.limit) || 5;

        const news = await query(
            `SELECT na.*, s.name as section_name, s.slug as section_slug
             FROM news_articles na
             LEFT JOIN sections s ON na.section_id = s.id
             INNER JOIN news_placements np ON na.id = np.news_article_id
             WHERE np.position = ? AND np.is_active = TRUE AND na.status = 'PUBLISHED'
             AND (np.start_date IS NULL OR np.start_date <= NOW())
             AND (np.end_date IS NULL OR np.end_date >= NOW())
             ORDER BY np.display_order ASC, na.published_at DESC
             LIMIT ?`,
            [position, limit]
        );

        res.json({ success: true, data: news });
    } catch (error) {
        console.error('Get news by placement error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch news' });
    }
};

const setNewsPlacement = async (req, res) => {
    try {
        const { news_article_id, position, display_order, start_date, end_date } = req.body;

        // Check if placement exists
        const [existing] = await query(
            'SELECT id FROM news_placements WHERE news_article_id = ? AND position = ?',
            [news_article_id, position]
        );

        if (existing) {
            await query(
                `UPDATE news_placements SET display_order = ?, start_date = ?, end_date = ?, is_active = TRUE
                 WHERE id = ?`,
                [display_order || 0, start_date, end_date, existing.id]
            );
        } else {
            await query(
                `INSERT INTO news_placements (news_article_id, position, display_order, start_date, end_date)
                 VALUES (?, ?, ?, ?, ?)`,
                [news_article_id, position, display_order || 0, start_date, end_date]
            );
        }

        res.json({ success: true, message: 'Placement saved successfully' });
    } catch (error) {
        console.error('Set news placement error:', error);
        res.status(500).json({ success: false, message: 'Failed to save placement' });
    }
};

const removeNewsPlacement = async (req, res) => {
    try {
        const { news_article_id, position } = req.body;
        await query(
            'DELETE FROM news_placements WHERE news_article_id = ? AND position = ?',
            [news_article_id, position]
        );
        res.json({ success: true, message: 'Placement removed successfully' });
    } catch (error) {
        console.error('Remove news placement error:', error);
        res.status(500).json({ success: false, message: 'Failed to remove placement' });
    }
};

// ============================================
// KEY HIGHLIGHTS
// ============================================

const getKeyHighlights = async (req, res) => {
    try {
        const { news_article_id } = req.query;
        
        let sql = 'SELECT * FROM key_highlights WHERE is_active = TRUE';
        const params = [];

        if (news_article_id) {
            sql += ' AND news_article_id = ?';
            params.push(news_article_id);
        }

        sql += ' ORDER BY display_order ASC';

        const highlights = await query(sql, params);
        res.json({ success: true, data: highlights });
    } catch (error) {
        console.error('Get key highlights error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch highlights' });
    }
};

const saveKeyHighlight = async (req, res) => {
    try {
        const { id, news_article_id, text, display_order } = req.body;

        if (id) {
            await query(
                'UPDATE key_highlights SET text = ?, display_order = ? WHERE id = ?',
                [text, display_order || 0, id]
            );
        } else {
            await query(
                'INSERT INTO key_highlights (news_article_id, text, display_order) VALUES (?, ?, ?)',
                [news_article_id, text, display_order || 0]
            );
        }

        res.json({ success: true, message: 'Highlight saved successfully' });
    } catch (error) {
        console.error('Save key highlight error:', error);
        res.status(500).json({ success: false, message: 'Failed to save highlight' });
    }
};

// ============================================
// COMPREHENSIVE HOMEPAGE DATA
// ============================================

const getFullHomepageData = async (req, res) => {
    try {
        // Flash News
        // Flash News (Now fetching from actual Breaking News articles)
        const flashNews = await query(
            `SELECT id, title, summary as content, CONCAT('/news/', slug) as link, created_at, 'article' as type
             FROM news_articles
             WHERE is_breaking = TRUE AND status = 'PUBLISHED'
             ORDER BY published_at DESC LIMIT 10`
        );

        // Breaking News
        const breakingNews = await query(
            `SELECT na.id, na.title, na.slug, na.summary, na.featured_image, na.published_at,
                    s.name as section_name
             FROM news_articles na
             LEFT JOIN sections s ON na.section_id = s.id
             WHERE na.is_breaking = TRUE AND na.status = 'PUBLISHED'
             ORDER BY na.published_at DESC LIMIT 5`
        );

        // Hero Articles
        let heroMain = await query(
            `SELECT na.*, s.name as section_name FROM news_articles na
             LEFT JOIN sections s ON na.section_id = s.id
             LEFT JOIN news_placements np ON na.id = np.news_article_id AND np.position = 'hero_main'
             WHERE na.status = 'PUBLISHED' AND (np.is_active = TRUE OR na.is_featured = TRUE)
             ORDER BY CASE WHEN np.is_active = TRUE THEN 0 ELSE 1 END, na.published_at DESC
             LIMIT 5`
        );

        // Mix content if less than limit
        if (heroMain.length < 5) {
            const needed = 5 - heroMain.length;
            const currentIds = heroMain.map(n => n.id);
            const notIn = currentIds.length > 0 ? currentIds.join(',') : '0';
            
            const extras = await query(
                `SELECT na.*, s.name as section_name FROM news_articles na
                 LEFT JOIN sections s ON na.section_id = s.id
                 WHERE na.status = 'PUBLISHED' AND na.id NOT IN (${notIn})
                 ORDER BY na.published_at DESC LIMIT ?`,
                [needed]
            );
            heroMain = [...heroMain, ...extras];
        }

        // Key Highlights for main hero
        let keyHighlights = [];
        if (heroMain.length > 0) {
            keyHighlights = await query(
                'SELECT * FROM key_highlights WHERE news_article_id = ? AND is_active = TRUE ORDER BY display_order',
                [heroMain[0].id]
            );
        }

        // District Focus
        const districtFocus = await query(
            `SELECT na.id, na.title, na.slug, na.summary, na.featured_image, d.name as district_name
             FROM news_articles na
             INNER JOIN news_districts nd ON na.id = nd.news_article_id
             INNER JOIN districts d ON nd.district_id = d.id
             WHERE na.status = 'PUBLISHED'
             ORDER BY na.published_at DESC LIMIT 4`
        );

        // Regional Updates (Prioritize 'regional' tag -> Then Section 1)
        let regionalUpdates = await query(
             `SELECT na.id, na.title, na.slug, na.published_at as created_at, na.featured_image as image_url, na.summary as content
              FROM news_articles na
              WHERE na.status = 'PUBLISHED'
              AND EXISTS (
                  SELECT 1 FROM news_article_tags nat 
                  JOIN news_tags t ON nat.tag_id = t.id 
                  WHERE nat.news_article_id = na.id AND t.name = 'regional'
              )
              ORDER BY na.published_at DESC LIMIT 5`
        );

        if (regionalUpdates.length === 0) {
             // Fallback: Fetch general news from Section 1 if no 'regional' tags found
             regionalUpdates = await query(
                `SELECT id, title, slug, published_at as created_at, featured_image as image_url, summary as content
                 FROM news_articles 
                 WHERE section_id = 1 
                 AND status = 'PUBLISHED'
                 ORDER BY published_at DESC LIMIT 5`
            );
        }

        // Editor's Desk
        const [editorial] = await query(
            `SELECT * FROM editorials WHERE is_featured = TRUE AND status = 'PUBLISHED' 
             ORDER BY published_at DESC LIMIT 1`
        );

        // Trending Topics
        const trending = await query(
            'SELECT * FROM trending_topics WHERE is_active = TRUE ORDER BY display_order ASC LIMIT 8'
        );

        // Daily Video
        const [dailyVideo] = await query(
            `SELECT * FROM youtube_videos WHERE is_daily_video = TRUE AND is_active = TRUE 
             ORDER BY published_at DESC LIMIT 1`
        );

        // Sidebar Ads
        const sidebarAds = await query(
            `SELECT * FROM advertisements WHERE position LIKE '%sidebar%' AND is_active = TRUE
             AND (start_date IS NULL OR start_date <= NOW())
             AND (end_date IS NULL OR end_date >= NOW())
             ORDER BY display_order LIMIT 3`
        );

        // General Pool for mixing
        const generalPool = await query(
            `SELECT na.id, na.title, na.slug, na.summary, na.featured_image, na.published_at
             FROM news_articles na
             WHERE na.status = 'PUBLISHED'
             ORDER BY na.published_at DESC LIMIT 50`
        );

        // Section News (State, Business, Sports, Crime, Cinema)
        const sections = ['state-news', 'business', 'sports', 'crime', 'cinema'];
        const sectionNews = {};

        for (const sectionSlug of sections) {
            let news = await query(
                `SELECT na.id, na.title, na.slug, na.summary, na.featured_image, na.published_at
                 FROM news_articles na
                 INNER JOIN sections s ON na.section_id = s.id
                 WHERE s.slug = ? AND na.status = 'PUBLISHED'
                 ORDER BY na.published_at DESC LIMIT 5`,
                [sectionSlug]
            );
            
            // Mix content if less than limit
            if (news.length < 5) {
                const needed = 5 - news.length;
                const currentIds = news.map(n => n.id);
                const extras = generalPool.filter(n => !currentIds.includes(n.id)).slice(0, needed);
                news = [...news, ...extras];
            }

            sectionNews[sectionSlug] = news;
        }

        // Latest News (for right sidebar)
        const latestNews = await query(
            `SELECT id, title, slug, section_id, published_at FROM news_articles
             WHERE status = 'PUBLISHED' ORDER BY published_at DESC LIMIT 20`
        );

        res.json({
            success: true,
            data: {
                flashNews,
                breakingNews,
                heroMain,
                keyHighlights,
                districtFocus,
                regionalUpdates,
                editorial,
                trending,
                dailyVideo,
                sidebarAds,
                sectionNews,
                latestNews
            }
        });
    } catch (error) {
        console.error('Get full homepage data error:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch homepage data' });
    }
};

module.exports = {
    // Widgets
    getAllWidgets,
    getWidgetWithItems,
    saveWidgetItem,
    deleteWidgetItem,
    
    // Editorials
    getAllEditorials,
    getFeaturedEditorial,
    saveEditorial,
    
    // Trending
    getTrendingTopics,
    saveTrendingTopic,
    deleteTrendingTopic,
    
    // YouTube
    getYoutubeVideos,
    getDailyVideo,
    saveYoutubeVideo,
    deleteYoutubeVideo,
    
    // Advertisements
    getAdvertisements,
    saveAdvertisement,
    trackAdClick,
    
    // Districts
    getDistricts,
    getDistrictNews,
    
    // Placements
    getNewsByPlacement,
    setNewsPlacement,
    removeNewsPlacement,
    
    // Highlights
    getKeyHighlights,
    saveKeyHighlight,
    
    // Homepage
    getFullHomepageData
};
