
-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Seed Blood Banks
INSERT INTO blood_banks (id, name, address, latitude, longitude, location, contact_number, is_active)
VALUES 
(gen_random_uuid(), 'Central Red Cross', '100 Main St', 12.9716, 77.5946, ST_SetSRID(ST_MakePoint(77.5946, 12.9716), 4326)::geography, '+1-555-0101', true),
(gen_random_uuid(), 'City General Blood Center', '250 East Park', 12.9800, 77.6000, ST_SetSRID(ST_MakePoint(77.6000, 12.9800), 4326)::geography, '+1-555-0102', true);

-- Seed Inventory (Assuming IDs above)
-- Note: In a real migration, use subqueries to find IDs
INSERT INTO blood_inventory (blood_bank_id, blood_type, units_available, last_updated)
SELECT id, 'A+', 15, now() FROM blood_banks WHERE name = 'Central Red Cross';

INSERT INTO blood_inventory (blood_bank_id, blood_type, units_available, last_updated)
SELECT id, 'O-', 5, now() FROM blood_banks WHERE name = 'City General Blood Center';
