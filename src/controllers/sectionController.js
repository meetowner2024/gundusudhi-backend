const { query } = require("../config/database");
const getAllSections = async (req, res) => {
  try {
    const sections = await query(
      `SELECT s.*, 
                    (SELECT JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'id', sub.id,
                            'name', sub.name,
                            'slug', sub.slug,
                            'description', sub.description,
                            'display_order', sub.display_order
                        )
                    )
                    FROM subsections sub 
                    WHERE sub.section_id = s.id AND sub.is_active = TRUE
                    ORDER BY sub.display_order) as subsections
             FROM sections s
             WHERE s.is_active = TRUE
             ORDER BY s.display_order`,
    );
    res.json({
      success: true,
      data: sections,
    });
  } catch (error) {
    console.error("Get sections error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch sections",
      error: error.message,
    });
  }
};
const createSection = async (req, res) => {
  try {
    const { name, slug, description, display_order, icon } = req.body;
    if (!name || !slug) {
      return res.status(400).json({
        success: false,
        message: "Name and slug are required",
      });
    }
    const result = await query(
      `INSERT INTO sections (name, slug, description, display_order, icon) 
             VALUES (?, ?, ?, ?, ?)`,
      [name, slug, description || null, display_order || 0, icon || null],
    );
    res.status(201).json({
      success: true,
      message: "Section created successfully",
      data: {
        id: result.insertId,
        name,
        slug,
      },
    });
  } catch (error) {
    console.error("Create section error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create section",
      error: error.message,
    });
  }
};
const updateSection = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, description, display_order, icon, is_active } =
      req.body;
    const updates = [];
    const values = [];
    if (name !== undefined) {
      updates.push("name = ?");
      values.push(name);
    }
    if (slug !== undefined) {
      updates.push("slug = ?");
      values.push(slug);
    }
    if (description !== undefined) {
      updates.push("description = ?");
      values.push(description);
    }
    if (display_order !== undefined) {
      updates.push("display_order = ?");
      values.push(display_order);
    }
    if (icon !== undefined) {
      updates.push("icon = ?");
      values.push(icon);
    }
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      values.push(is_active);
    }
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update",
      });
    }
    values.push(id);
    await query(
      `UPDATE sections SET ${updates.join(", ")} WHERE id = ?`,
      values,
    );
    res.json({
      success: true,
      message: "Section updated successfully",
    });
  } catch (error) {
    console.error("Update section error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update section",
      error: error.message,
    });
  }
};
const deleteSection = async (req, res) => {
  try {
    const { id } = req.params;
    await query("DELETE FROM sections WHERE id = ?", [id]);
    res.json({
      success: true,
      message: "Section deleted successfully",
    });
  } catch (error) {
    console.error("Delete section error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete section",
      error: error.message,
    });
  }
};
const createSubsection = async (req, res) => {
  try {
    const { section_id, name, slug, description, display_order } = req.body;
    if (!section_id || !name || !slug) {
      return res.status(400).json({
        success: false,
        message: "Section ID, name, and slug are required",
      });
    }
    const result = await query(
      `INSERT INTO subsections (section_id, name, slug, description, display_order) 
             VALUES (?, ?, ?, ?, ?)`,
      [section_id, name, slug, description || null, display_order || 0],
    );
    res.status(201).json({
      success: true,
      message: "Subsection created successfully",
      data: {
        id: result.insertId,
        section_id,
        name,
        slug,
      },
    });
  } catch (error) {
    console.error("Create subsection error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create subsection",
      error: error.message,
    });
  }
};
const updateSubsection = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, slug, description, display_order, is_active } = req.body;
    const updates = [];
    const values = [];
    if (name !== undefined) {
      updates.push("name = ?");
      values.push(name);
    }
    if (slug !== undefined) {
      updates.push("slug = ?");
      values.push(slug);
    }
    if (description !== undefined) {
      updates.push("description = ?");
      values.push(description);
    }
    if (display_order !== undefined) {
      updates.push("display_order = ?");
      values.push(display_order);
    }
    if (is_active !== undefined) {
      updates.push("is_active = ?");
      values.push(is_active);
    }
    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No fields to update",
      });
    }
    values.push(id);
    await query(
      `UPDATE subsections SET ${updates.join(", ")} WHERE id = ?`,
      values,
    );
    res.json({
      success: true,
      message: "Subsection updated successfully",
    });
  } catch (error) {
    console.error("Update subsection error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update subsection",
      error: error.message,
    });
  }
};
const deleteSubsection = async (req, res) => {
  try {
    const { id } = req.params;
    await query("DELETE FROM subsections WHERE id = ?", [id]);
    res.json({
      success: true,
      message: "Subsection deleted successfully",
    });
  } catch (error) {
    console.error("Delete subsection error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete subsection",
      error: error.message,
    });
  }
};
module.exports = {
  getAllSections,
  createSection,
  updateSection,
  deleteSection,
  createSubsection,
  updateSubsection,
  deleteSubsection,
};
