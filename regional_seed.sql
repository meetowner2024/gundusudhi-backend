-- Ensure Districts Exist (Just in case)
INSERT IGNORE INTO districts (name, slug) VALUES
('Srikakulam', 'srikakulam'),
('Kurnool', 'kurnool'),
('Sri Potti Sriramulu Nellore', 'nellore'),
('Chittoor', 'chittoor'),
('Anantapur', 'anantapur');

-- Insert 5 Regional News Items for Today
-- Assuming Section ID 1 is 'State News'
INSERT INTO news_articles (title, slug, summary, content, section_id, status, published_at, featured_image, author_id, district_id) VALUES
('Srikakulam Alert: Heavy Rains Forecasted for Next 24 Hours', 'srikakulam-rain-alert', 'IMD warning for coastal mandals implies potential waterlogging in low-lying areas.', '<p>The cyclone warning center has issued an orange alert for Srikakulam district. Fishermen are advised not to venture into the sea. Control rooms have been opened at the collectorate.</p>', 1, 'PUBLISHED', NOW(), '/uploads/images/srikakulam.jpg', 1, (SELECT id FROM districts WHERE slug='srikakulam' LIMIT 1)),

('Kurnool: Tungabhadra Dam Gates Lifted', 'kurnool-dam-gates', 'Flood water released downstream as inflow increases due to heavy rains in catchment areas.', '<p>Irrigation officials have lifted 10 gates of the Tungabhadra dam. People living along the river banks have been alerted to move to safer places.</p>', 1, 'PUBLISHED', NOW(), '/uploads/images/kurnool.jpg', 1, (SELECT id FROM districts WHERE slug='kurnool' LIMIT 1)),

('Nellore: ISRO Upcoming Launch Scheduled', 'nellore-isro-launch', 'New satellite to be launched next week from Sriharikota space center.', '<p>ISRO is gearing up for another commercial launch. The PSLV-C56 will carry 7 satellites. Rehearsals have been completed successfully at SHAR.</p>', 1, 'PUBLISHED', NOW(), '/uploads/images/nellore.jpg', 1, (SELECT id FROM districts WHERE slug='nellore' LIMIT 1)),

('Chittoor: Kanipakam Temple Brahmotsavams Begin', 'kanipakam-brahmotsavam', 'Devotees flock to the temple town for the annual festival.', '<p>The annual Brahmotsavams of Lord Varasiddhi Vinayaka Swamy at Kanipakam have commenced on a grand note. TTD officials offered silk robes to the deity.</p>', 1, 'PUBLISHED', NOW(), '/uploads/images/chittoor.jpg', 1, (SELECT id FROM districts WHERE slug='chittoor' LIMIT 1)),

('Anantapur: Kia Motors Expansion Plans Approved', 'anantapur-kia-expansion', 'New EV plant unit to be set up near Penukonda.', '<p>Kia India has received approval for its new EV manufacturing unit. This expansion is expected to generate 2000 new jobs in the district.</p>', 1, 'PUBLISHED', NOW(), '/uploads/images/anantapur.jpg', 1, (SELECT id FROM districts WHERE slug='anantapur' LIMIT 1));
