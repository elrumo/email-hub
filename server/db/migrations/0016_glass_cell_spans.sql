-- Bento grid moved from coarse 1–4 span units to fine grid cells (1–16), where
-- one old unit = 4 cells. Scale every existing tile's span ×4 so it keeps its
-- on-screen footprint. Sections are full-width single-row and never use w/h for
-- layout, so they are left untouched.
UPDATE `widgets` SET `w` = `w` * 4, `h` = `h` * 4 WHERE `kind` != 'section';
