const { query } = require("../config/database");

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
      [pageSlug],
    );
    if (layouts.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Page layout not found",
      });
    }
    res.json({
      success: true,
      data: layouts[0],
    });
  } catch (error) {
    console.error("Get page layout error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch page layout",
      error: error.message,
    });
  }
};

const getHomepageData = async (req, res) => {
  try {
    const { date } = req.query;
    const dateFilter = date ? " AND DATE(published_at) = ?" : "";
    const dateFilterWithAlias = date ? " AND DATE(na.published_at) = ?" : "";
    const dateParams = date ? [date] : [];
    const breakingNews = await query(
      `SELECT id, title, slug, summary, featured_image, published_at
             FROM news_articles
             WHERE status = 'PUBLISHED' AND is_breaking = TRUE${dateFilter}
             ORDER BY published_at DESC
             LIMIT 5`,
      [...dateParams],
    );
    const heroNews = await query(
      `SELECT na.id, na.title, na.slug, na.summary, na.featured_image, na.published_at,
                    s.name as section_name, s.slug as section_slug
             FROM news_articles na
             LEFT JOIN sections s ON na.section_id = s.id
             WHERE na.status = 'PUBLISHED' AND na.is_featured = TRUE${dateFilterWithAlias}
             ORDER BY na.published_at DESC
             LIMIT 6`,
      [...dateParams],
    );
    const leftSidebarNews = await query(
      `SELECT na.id, na.title, na.slug, na.summary, na.featured_image, na.published_at,
                    s.name as section_name, s.slug as section_slug
             FROM news_articles na
             LEFT JOIN sections s ON na.section_id = s.id
             WHERE na.status = 'PUBLISHED'${dateFilterWithAlias}
             ORDER BY na.views_count DESC
             LIMIT 5`,
      [...dateParams],
    );
    const rightSidebarNews = await query(
      `SELECT na.id, na.title, na.slug, na.summary, na.featured_image, na.published_at,
                    s.name as section_name, s.slug as section_slug
             FROM news_articles na
             LEFT JOIN sections s ON na.section_id = s.id
             WHERE na.status = 'PUBLISHED'${dateFilterWithAlias}
             ORDER BY na.published_at DESC
             LIMIT 5`,
      [...dateParams],
    );
    const sections = await query(
      `SELECT id, name, slug, icon FROM sections WHERE is_active = TRUE ORDER BY display_order`,
    );
    const sectionNews = {};
    for (const section of sections) {
      const news = await query(
        `SELECT id, title, slug, summary, featured_image, published_at
                 FROM news_articles
                 WHERE section_id = ? AND status = 'PUBLISHED'${dateFilter}
                 ORDER BY published_at DESC
                 LIMIT 6`,
        [section.id, ...dateParams],
      );
      sectionNews[section.slug] = {
        section: section,
        articles: news,
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
        sections,
      },
    });
  } catch (error) {
    console.error("Get homepage data error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch homepage data",
      error: error.message,
    });
  }
};

const getNewsByPosition = async (req, res) => {
  try {
    const { position, limit = 10, date } = req.query;
    const dateFilter = date ? " AND DATE(na.published_at) = ?" : "";
    const dateParams = date ? [date] : [];
    let orderBy = "na.published_at DESC";
    let where = "na.status = 'PUBLISHED'";
    switch (position) {
      case "hero":
        where += " AND na.is_featured = TRUE";
        break;
      case "breaking":
        where += " AND na.is_breaking = TRUE";
        break;
      case "trending":
        orderBy = "na.views_count DESC";
        break;
      case "latest":
      default:
        orderBy = "na.published_at DESC";
    }
    const news = await query(
      `SELECT na.id, na.title, na.slug, na.summary, na.featured_image, na.published_at,
                    na.is_premium, na.is_breaking, na.is_featured, na.views_count,
                    s.name as section_name, s.slug as section_slug
             FROM news_articles na
             LEFT JOIN sections s ON na.section_id = s.id
             WHERE ${where}${dateFilter}
             ORDER BY ${orderBy}
             LIMIT ?`,
      [...dateParams, parseInt(limit)],
    );
    res.json({
      success: true,
      data: news,
    });
  } catch (error) {
    console.error("Get news by position error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch news",
      error: error.message,
    });
  }
};

const getSectionNews = async (req, res) => {
  try {
    const { sectionSlug } = req.params;
    const { limit = 10, date, subsection, state, city, district } = req.query;
    const dateFilter = date ? " AND DATE(na.published_at) = ?" : "";
    const dateParams = date ? [date] : [];
    
    let whereClause = "na.status = 'PUBLISHED'";
    let queryParams = [];

    // Special handling for strict generic routes if query params are provided
    // This allows /state-news?state=Andhra%20Pradesh or /city?name=Vizag
    if (sectionSlug === 'state-news' && state) {
        whereClause += " AND na.state = ?";
        queryParams.push(state);
    } else if (sectionSlug === 'districts' || sectionSlug === 'district') {
        if (district) {
             // Try to match by name if district is a string, or ID if number
             // But usually district slug is passed. 
             // If this is a filter query:
             whereClause += " AND (d.name = ? OR d.slug = ?)";
             queryParams.push(district, district);
        } else {
             whereClause += " AND na.district_id IS NOT NULL";
        }
    } else if (sectionSlug === 'cities' || sectionSlug === 'city') {
        if (city) {
            whereClause += " AND na.city = ?";
            queryParams.push(city);
        } else {
             whereClause += " AND na.city IS NOT NULL";
        }
    } else {
        // Standard Section Logic
        const section = await query(
          "SELECT id, name, slug, icon FROM sections WHERE slug = ? AND is_active = TRUE",
          [sectionSlug],
        );
        
        if (section.length === 0) {
             // Fallback 1: Check if it's a District
             // Try to match by slug or name
             const district = await query("SELECT id, name, slug FROM districts WHERE slug = ? OR name = ?", [sectionSlug, sectionSlug.replace(/-/g, ' ')]);
             if (district.length > 0) {
                 const d = district[0];
                 const news = await query(
                    `SELECT na.id, na.title, na.slug, na.summary, na.featured_image, na.published_at,
                            na.is_premium, na.views_count, d.name as district_name, na.city, na.state,
                            s.name as section_name, s.slug as section_slug
                     FROM news_articles na
                     LEFT JOIN districts d ON na.district_id = d.id
                     LEFT JOIN sections s ON na.section_id = s.id
                     WHERE na.district_id = ? AND na.status = 'PUBLISHED' ${dateFilter}
                     ORDER BY na.published_at DESC
                     LIMIT ?`,
                    [d.id, ...dateParams, parseInt(limit)]
                 );
                 
                 return res.json({
                    success: true,
                    data: {
                        section: {
                            id: d.id,
                            name: d.name,
                            slug: d.slug,
                            type: 'district',
                            is_location: true
                        },
                        articles: news
                    }
                 });
             }

             // Fallback 2: Check for State (normalize slug to potential state name)
             const potentialState = sectionSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
             const knownStates = ["Andhra Pradesh", "Telangana"];
             
             // Check if it's a known state or if any article has this state
             const stateArticlesCount = await query("SELECT COUNT(*) as count FROM news_articles WHERE state = ? AND status = 'PUBLISHED'", [potentialState]);
             
             if (knownStates.some(s => s.toLowerCase() === potentialState.toLowerCase()) || stateArticlesCount[0].count > 0) {
                 const news = await query(
                    `SELECT na.id, na.title, na.slug, na.summary, na.featured_image, na.published_at,
                            na.is_premium, na.views_count, d.name as district_name, na.city, na.state,
                            s.name as section_name, s.slug as section_slug
                     FROM news_articles na
                     LEFT JOIN districts d ON na.district_id = d.id
                     LEFT JOIN sections s ON na.section_id = s.id
                     WHERE na.state = ? AND na.status = 'PUBLISHED' ${dateFilter}
                     ORDER BY na.published_at DESC
                     LIMIT ?`,
                    [potentialState, ...dateParams, parseInt(limit)]
                 );
                 return res.json({
                    success: true,
                    data: {
                        section: {
                            id: 0,
                            name: potentialState,
                            slug: sectionSlug,
                            type: 'state',
                            is_location: true
                        },
                        articles: news
                    }
                 });
             }

             // Fallback 3: Check for City (loose match)
             const citySlug = sectionSlug.replace(/-/g, ' ');
             const cityArticles = await query("SELECT COUNT(*) as count FROM news_articles WHERE city LIKE ? AND status = 'PUBLISHED'", [`%${citySlug}%`]);
             
             if (cityArticles[0].count > 0) {
                  const news = await query(
                    `SELECT na.id, na.title, na.slug, na.summary, na.featured_image, na.published_at,
                            na.is_premium, na.views_count, d.name as district_name, na.city, na.state,
                            s.name as section_name, s.slug as section_slug
                     FROM news_articles na
                     LEFT JOIN districts d ON na.district_id = d.id
                     LEFT JOIN sections s ON na.section_id = s.id
                     WHERE na.city LIKE ? AND na.status = 'PUBLISHED' ${dateFilter}
                     ORDER BY na.published_at DESC
                     LIMIT ?`,
                    [`%${citySlug}%`, ...dateParams, parseInt(limit)]
                 );
                 return res.json({
                    success: true,
                    data: {
                        section: {
                            id: 0,
                            name: citySlug.charAt(0).toUpperCase() + citySlug.slice(1),
                            slug: sectionSlug,
                            type: 'city',
                            is_location: true
                        },
                        articles: news
                    }
                 });
             }

             // Fallback 4: Check if it matches a SUBSECTION slug
             const subsectionMatch = await query(
                 `SELECT sub.*, s.slug as parent_section_slug, s.name as parent_section_name 
                  FROM subsections sub
                  JOIN sections s ON sub.section_id = s.id
                  WHERE sub.slug = ? AND sub.is_active = TRUE`,
                 [sectionSlug]
             );

             if (subsectionMatch.length > 0) {
                  const sub = subsectionMatch[0];
                  // It is a subsection. Fetch articles for this subsection.
                  const news = await query(
                    `SELECT na.id, na.title, na.slug, na.summary, na.featured_image, na.published_at,
                            na.is_premium, na.views_count, d.name as district_name, na.city, na.state,
                            s.name as section_name, s.slug as section_slug,
                            sub.name as subsection_name, sub.slug as subsection_slug
                     FROM news_articles na
                     LEFT JOIN districts d ON na.district_id = d.id
                     LEFT JOIN sections s ON na.section_id = s.id
                     LEFT JOIN subsections sub ON na.subsection_id = sub.id
                     WHERE na.subsection_id = ? AND na.status = 'PUBLISHED' ${dateFilter}
                     ORDER BY na.published_at DESC
                     LIMIT ?`,
                    [sub.id, ...dateParams, parseInt(limit)]
                  );

                  return res.json({
                    success: true,
                    data: {
                        section: {
                            id: sub.section_id,
                            name: sub.name,
                            slug: sub.slug,
                            type: 'subsection',
                            parent_slug: sub.parent_section_slug,
                            description: sub.description
                        },
                        articles: news
                    }
                  });
             }

             return res.status(404).json({
                success: false,
                message: "Section not found",
              });
        }
        
        whereClause += " AND na.section_id = ?";
        queryParams.push(section[0].id);

        if (subsection) {
            // Check if subsection exists
            const sub = await query("SELECT id FROM subsections WHERE slug = ? AND section_id = ?", [subsection, section[0].id]);
            if (sub.length > 0) {
                whereClause += " AND na.subsection_id = ?";
                queryParams.push(sub[0].id);
            } else {
                 // If subsection param is passed but not found as a subsection, 
                 // check if it matches STATE or CITY or DISTRICT names?
                 // This allows /state-news/andhra-pradesh where 'andhra-pradesh' is passed as subsection slug
                 // We need to handle this cleaner.
            }
        }
    }
    
    // NEW LOGIC: Handle "smart" subsection slug usage from frontend
    // The frontend sends /section/[subsection] -> API gets section=section, subsection=subsection(slug)
    // If the section is 'state-news', we treat subsection slug as state name
    if (sectionSlug === 'state-news' && subsection) {
         // Convert slug to likely state name (Andhra Pradesh) or check roughly
         // Simple readable format: "andhra-pradesh" -> "Andhra Pradesh"
         // But mostly we should rely on the frontend sending the correct query param or us inferring it.
         // Let's assume the component sends ?state=Andhra%20Pradesh OR we deduce it here.
         // For now, let's trust the query params added below.
    }
    
    // Actually, looking at the frontend, it calls useSectionNews(section, subsection).
    // The API call is likely /api/pages/section/${section}?subsection=${subsection}
    
    if (subsection && sectionSlug === 'state-news') {
        // Map slug 'andhra-pradesh' to 'Andhra Pradesh'
        const stateName = subsection.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        whereClause += " AND na.state = ?";
        queryParams.push(stateName);
    } else if (subsection && (sectionSlug === 'districts' || sectionSlug === 'district')) {
        whereClause += " AND (d.slug = ? OR d.name = ?)";
         queryParams.push(subsection, subsection.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')); 
    } else if (subsection && sectionSlug !== 'state-news') {
        // Normal subsection logic if not already handled above
         const sub = await query("SELECT id FROM subsections WHERE slug = ?", [subsection]);
         if (sub.length > 0) {
              whereClause += " AND na.subsection_id = ?";
              queryParams.push(sub[0].id);
         }
    }
    
    // Final generic appends
    // If state/city/district passed explicitly as query params (e.g. from filter menu)
    if (state && !whereClause.includes('na.state')) {
        whereClause += " AND na.state = ?";
        queryParams.push(state);
    }
    if (city && !whereClause.includes('na.city')) {
         whereClause += " AND na.city = ?";
         queryParams.push(city);
    }

    const news = await query(
      `SELECT na.id, na.title, na.slug, na.summary, na.featured_image, na.published_at,
                    na.is_premium, na.views_count, d.name as district_name, na.city, na.state,
                    s.name as section_name, s.slug as section_slug
             FROM news_articles na
             LEFT JOIN districts d ON na.district_id = d.id
             LEFT JOIN sections s ON na.section_id = s.id
             WHERE ${whereClause} ${dateFilter}
             ORDER BY na.published_at DESC
             LIMIT ?`,
      [...queryParams, ...dateParams, parseInt(limit)],
    );

    // Get Section details for metadata
    let sectionDetails = {
        id: 0,
        name: sectionSlug.charAt(0).toUpperCase() + sectionSlug.slice(1),
        slug: sectionSlug
    };
    
    if (sectionSlug !== 'state-news' && sectionSlug !== 'districts' && sectionSlug !== 'city') {
        const s = await query("SELECT id, name, slug, icon FROM sections WHERE slug = ?", [sectionSlug]);
        if (s.length > 0) sectionDetails = s[0];
    }

    res.json({
      success: true,
      data: {
        section: sectionDetails,
        articles: news,
      },
    });
  } catch (error) {
    console.error("Get section news error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch section news",
      error: error.message,
    });
  }
};

const getDistrictNews = async (req, res) => {
  try {
    const { districtId } = req.params;
    const { limit = 10, date } = req.query;
    const dateFilter = date ? " AND DATE(na.published_at) = ?" : "";
    const dateParams = date ? [date] : [];
    let districtCondition = "";
    let districtParams = [];
    if (districtId && districtId !== "all") {
      districtCondition = " AND na.district_id = ?";
      districtParams = [districtId];
    } else {
      districtCondition = " AND na.district_id IS NOT NULL";
    }
    const news = await query(
      `SELECT na.id, na.title, na.slug, na.summary, na.featured_image, na.published_at,
                    na.is_premium, na.views_count, d.name as district_name
             FROM news_articles na
             LEFT JOIN districts d ON na.district_id = d.id
             WHERE na.status = 'PUBLISHED' ${districtCondition} ${dateFilter}
             ORDER BY na.published_at DESC
             LIMIT ?`,
      [...districtParams, ...dateParams, parseInt(limit)],
    );
    res.json({
      success: true,
      data: {
        articles: news,
      },
    });
  } catch (error) {
    console.error("Get district news error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch district news",
      error: error.message,
    });
  }
};

// --- New Dynamic Page Controller Functions ---

// Get a static page by slug (e.g., 'about', 'contact', 'terms') (Public)
const getStaticPage = async (req, res) => {
  try {
    const { slug } = req.params;
    const pages = await query(
      'SELECT * FROM pages WHERE slug = ?',
      [slug]
    );

    if (pages.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Page not found'
      });
    }

    res.json({
      success: true,
      data: pages[0]
    });
  } catch (error) {
    console.error('Get static page error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch page',
      error: error.message
    });
  }
};

// Create or Update a static page (Admin)
const updateStaticPage = async (req, res) => {
  try {
    const { slug } = req.params;
    const { title, content, meta_description } = req.body;

    if (!title || !content) {
      return res.status(400).json({
        success: false,
        message: 'Title and content are required'
      });
    }

    // Check if page exists
    const existing = await query('SELECT id FROM pages WHERE slug = ?', [slug]);

    if(existing.length > 0) {
        // Update
        await query(
            'UPDATE pages SET title = ?, content = ?, meta_description = ?, updated_at = NOW() WHERE slug = ?',
            [title, content, meta_description || null, slug]
        );
        res.json({
            success: true,
            message: 'Page updated successfully'
        });
    } else {
        // Create (Insert)
        await query(
            'INSERT INTO pages (slug, title, content, meta_description) VALUES (?, ?, ?, ?)',
            [slug, title, content, meta_description || null]
        );
        res.status(201).json({
            success: true,
            message: 'Page created successfully'
        });
    }

  } catch (error) {
    console.error('Update static page error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update page',
      error: error.message
    });
  }
};

// Delete a static page (Admin)
const deleteStaticPage = async (req, res) => {
    try {
        const { slug } = req.params;
        const result = await query('DELETE FROM pages WHERE slug = ?', [slug]);
        
        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                message: 'Page not found'
            });
        }

        res.json({
            success: true,
            message: 'Page deleted successfully'
        });

    } catch (error) {
        console.error('Delete static page error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete page',
            error: error.message
        });
    }
};

// List all static pages (Admin)
const listStaticPages = async (req, res) => {
    try {
        const pages = await query('SELECT slug, title, updated_at FROM pages ORDER BY title');
        res.json({
            success: true,
            data: pages
        });
    } catch (error) {
        console.error('List static pages error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to list pages',
            error: error.message
        });
    }
};

module.exports = {
  getPageLayout,
  getHomepageData,
  getNewsByPosition,
  getSectionNews,
  getDistrictNews,
  getStaticPage,
  updateStaticPage,
  deleteStaticPage,
  listStaticPages
};
