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
    const { limit = 6, date } = req.query;
    const dateFilter = date ? " AND DATE(na.published_at) = ?" : "";
    const dateParams = date ? [date] : [];
    if (sectionSlug === "district" || sectionSlug === "districts") {
      const news = await query(
        `SELECT na.id, na.title, na.slug, na.summary, na.featured_image, na.published_at,
                        na.is_premium, na.views_count, d.name as district_name
                 FROM news_articles na
                 LEFT JOIN districts d ON na.district_id = d.id
                 WHERE na.status = 'PUBLISHED' AND na.district_id IS NOT NULL ${dateFilter}
                 ORDER BY na.published_at DESC
                 LIMIT ?`,
        [...dateParams, parseInt(limit)],
      );
      return res.json({
        success: true,
        data: {
          section: {
            id: 0,
            name: "District News",
            slug: "districts",
            icon: "map-pin",
          },
          articles: news,
        },
      });
    }
    const section = await query(
      "SELECT id, name, slug, icon FROM sections WHERE slug = ? AND is_active = TRUE",
      [sectionSlug],
    );
    if (section.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Section not found",
      });
    }
    let news = await query(
      `SELECT na.id, na.title, na.slug, na.summary, na.featured_image, na.published_at,
                    na.is_premium, na.views_count
             FROM news_articles na
             WHERE na.section_id = ? AND na.status = 'PUBLISHED'
             ${dateFilter}
             ORDER BY na.published_at DESC
             LIMIT ?`,
      [section[0].id, ...dateParams, parseInt(limit)],
    );
    res.json({
      success: true,
      data: {
        section: section[0],
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
module.exports = {
  getPageLayout,
  getHomepageData,
  getNewsByPosition,
  getSectionNews,
  getDistrictNews,
};
