export const ACTIVE_MEMBERS_WITH_ACTIVITIES = `
SELECT DISTINCT u.ID, mi.firstname, mi.lastname, u.user_email as email, mi.phone_home, mi.phone_mobile, mu.startdate as start_date, mu.enddate as end_date, ml.name as membership_type,
um.meta_value REGEXP '(^|[[:<:]])26($|[[:>:]])' AS 'badminton',
um.meta_value REGEXP '(^|[[:<:]])29($|[[:>:]])' AS 'caving',
um.meta_value REGEXP '(^|[[:<:]])30($|[[:>:]])' AS 'climbing',
um.meta_value REGEXP '(^|[[:<:]])31($|[[:>:]])' AS 'coasteering',
um.meta_value REGEXP '(^|[[:<:]])32($|[[:>:]])' AS 'cycling',
um.meta_value REGEXP '(^|[[:<:]])14($|[[:>:]])' AS 'kayaking',
um.meta_value REGEXP '(^|[[:<:]])52($|[[:>:]])' AS 'members_night',
um.meta_value REGEXP '(^|[[:<:]])33($|[[:>:]])' AS 'mountain_biking',
um.meta_value REGEXP '(^|[[:<:]])151($|[[:>:]])' AS 'mountain_sports',
um.meta_value REGEXP '(^|[[:<:]])10($|[[:>:]])' AS 'road_cycling',
um.meta_value REGEXP '(^|[[:<:]])36($|[[:>:]])' AS 'social',
um.meta_value REGEXP '(^|[[:<:]])204($|[[:>:]])' AS 'sup',
um.meta_value REGEXP '(^|[[:<:]])53($|[[:>:]])' AS 'surfing',
um.meta_value REGEXP '(^|[[:<:]])27($|[[:>:]])' AS 'tennis',
um.meta_value REGEXP '(^|[[:<:]])45($|[[:>:]])' AS 'trips',
um.meta_value REGEXP '(^|[[:<:]])47($|[[:>:]])' AS 'trips_overseas',
um.meta_value REGEXP '(^|[[:<:]])46($|[[:>:]])' AS 'trips_uk',
um.meta_value REGEXP '(^|[[:<:]])11($|[[:>:]])' AS 'walking',
um.meta_value REGEXP '(^|[[:<:]])38($|[[:>:]])' AS 'water_sports',
um.meta_value REGEXP '(^|[[:<:]])39($|[[:>:]])' AS 'windsurfing',
um.meta_value
FROM wp_users u
LEFT JOIN wp_usermeta um ON u.ID = um.user_id
LEFT JOIN wp_pmpro_memberships_users mu ON u.ID = mu.user_id
LEFT JOIN wp_pmpro_membership_levels ml ON mu.membership_id = ml.id
LEFT JOIN members_import mi ON u.ID = mi.user_id
WHERE mu.membership_id > 0 AND
(NOW() BETWEEN mu.startdate AND mu.enddate) AND
mu.status = 'active' AND
um.meta_key='emailcategories'
ORDER BY mi.firstname, mi.lastname
`;
