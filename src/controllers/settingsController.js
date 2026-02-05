const { query } = require('../config/database');
const getSiteSettings = async (req, res) => {
    try {
        const settings = await query(
            `SELECT setting_key, setting_value FROM site_settings WHERE is_active = TRUE`
        );
        const settingsObj = {};
        settings.forEach(s => {
            try {
                settingsObj[s.setting_key] = JSON.parse(s.setting_value);
            } catch {
                settingsObj[s.setting_key] = s.setting_value;
            }
        });
        res.json({
            success: true,
            data: settingsObj
        });
    } catch (error) {
        console.error('Get site settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch site settings',
            error: error.message
        });
    }
};
const getHeaderConfig = async (req, res) => {
    try {
        const settings = await query(
            `SELECT setting_value FROM site_settings WHERE setting_key = 'header_config' AND is_active = TRUE`
        );
        if (settings.length === 0) {
            return res.json({
                success: true,
                data: {
                    logo: '/logo.png',
                    logoText: 'గుండుసూది',
                    tagline: 'వార్తా పత్రిక',
                    showMarketTicker: true,
                    showDateTime: true,
                    showSocialLinks: true,
                    breakingNews: {
                        show: true,
                        mode: 'AUTO', // 'AUTO' or 'CUSTOM'
                        customText: ''
                    },
                    marketTicker: {
                        show: true,
                        mode: 'AUTO', // 'AUTO' or 'CUSTOM'
                        customItems: [
                            { symbol: "GOLD (10g)", price: "62500", change: "120", isUp: true },
                            { symbol: "SILVER (1kg)", price: "74200", change: "-350", isUp: false },
                            { symbol: "NIFTY 50", price: "21850", change: "85.5", isUp: true }
                        ]
                    },
                    headerTopLinks: [
                        { title: 'E-Paper', url: '#' },
                        { title: 'About Us', url: '/about' },
                        { title: 'Contact', url: '/contact' }
                    ],
                    socialLinks: {
                        facebook: '#',
                        twitter: '#',
                        youtube: '#',
                        instagram: '#'
                    }
                }
            });
        }
        res.json({
            success: true,
            data: JSON.parse(settings[0].setting_value)
        });
    } catch (error) {
        console.error('Get header config error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch header config',
            error: error.message
        });
    }
};
const updateHeaderConfig = async (req, res) => {
    try {
        const config = req.body;
        const configJson = JSON.stringify(config);
        const existing = await query(
            `SELECT id FROM site_settings WHERE setting_key = 'header_config'`
        );
        if (existing.length > 0) {
            await query(
                `UPDATE site_settings SET setting_value = ? WHERE setting_key = 'header_config'`,
                [configJson]
            );
        } else {
            await query(
                `INSERT INTO site_settings (setting_key, setting_value, setting_type) VALUES ('header_config', ?, 'json')`,
                [configJson]
            );
        }
        res.json({
            success: true,
            message: 'Header configuration updated successfully'
        });
    } catch (error) {
        console.error('Update header config error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update header config',
            error: error.message
        });
    }
};
const getFooterConfig = async (req, res) => {
    try {
        const settings = await query(
            `SELECT setting_value FROM site_settings WHERE setting_key = 'footer_config' AND is_active = TRUE`
        );
        if (settings.length === 0) {
            return res.json({
                success: true,
                data: {
                    aboutText: 'గుండుసూది is your trusted source for Telugu news...',
                    newsLinks: [
                        { title: 'State News', url: '/news' },
                        { title: 'National', url: '/news/national' },
                        { title: 'World', url: '/news/world' },
                        { title: 'Politics', url: '/news' },
                        { title: 'Business', url: '/news/business' }
                    ],
                    featureLinks: [
                        { title: 'Editorials', url: '/blogs' },
                        { title: 'Sunday Magazine', url: '/magazines' },
                        { title: 'Visual Stories', url: '/shorts' },
                        { title: 'Sports', url: '/news/sports' }
                    ],
                    contactInfo: {
                        email: 'editors@gundusudhi.com',
                        phone: '+91 987 654 3210',
                        address: '123 Journalism Avenue, Media City, Press District - 500001'
                    },
                    subscriptionText: 'Get the day\'s top headlines delivered to your inbox every morning.',
                    socialLinks: {
                        facebook: '#',
                        twitter: '#',
                        youtube: '#',
                        instagram: '#'
                    },
                    bottomLinks: [
                        { title: 'Privacy Policy', url: '#' },
                        { title: 'Terms of Service', url: '#' },
                        { title: 'Advertise with us', url: '#' },
                        { title: 'Archives', url: '#' }
                    ],
                    copyright: '© 2024 Gundusudhi Media Group. All rights reserved.'
                }
            });
        }
        res.json({
            success: true,
            data: JSON.parse(settings[0].setting_value)
        });
    } catch (error) {
        console.error('Get footer config error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch footer config',
            error: error.message
        });
    }
};
const updateFooterConfig = async (req, res) => {
    try {
        const config = req.body;
        const configJson = JSON.stringify(config);
        const existing = await query(
            `SELECT id FROM site_settings WHERE setting_key = 'footer_config'`
        );
        if (existing.length > 0) {
            await query(
                `UPDATE site_settings SET setting_value = ? WHERE setting_key = 'footer_config'`,
                [configJson]
            );
        } else {
            await query(
                `INSERT INTO site_settings (setting_key, setting_value, setting_type) VALUES ('footer_config', ?, 'json')`,
                [configJson]
            );
        }
        res.json({
            success: true,
            message: 'Footer configuration updated successfully'
        });
    } catch (error) {
        console.error('Update footer config error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update footer config',
            error: error.message
        });
    }
};
const getNavigationMenu = async (req, res) => {
    try {
        const sections = await query(
            `SELECT s.id, s.name, s.slug, s.icon,
                    (SELECT JSON_ARRAYAGG(
                        JSON_OBJECT('id', sub.id, 'name', sub.name, 'slug', sub.slug)
                    ) FROM subsections sub WHERE sub.section_id = s.id AND sub.is_active = TRUE ORDER BY sub.display_order) as subsections
             FROM sections s
             WHERE s.is_active = TRUE
             ORDER BY s.display_order`
        );
        res.json({
            success: true,
            data: sections
        });
    } catch (error) {
        console.error('Get navigation menu error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch navigation menu',
            error: error.message
        });
    }
};
module.exports = {
    getSiteSettings,
    getHeaderConfig,
    updateHeaderConfig,
    getFooterConfig,
    updateFooterConfig,
    getNavigationMenu
};
