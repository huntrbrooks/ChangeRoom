-- Migration: Add wearing_style column to clothing_items table
-- Date: 2024

-- Add wearing_style column to clothing_items table
-- This column stores how the clothing item should be worn (e.g., "backwards", "tucked_in")
ALTER TABLE clothing_items 
ADD COLUMN IF NOT EXISTS wearing_style TEXT;

-- Add comment to explain the column
COMMENT ON COLUMN clothing_items.wearing_style IS 'How the item should be worn (e.g., "backwards", "tucked_in", "zipped"). Used for try-on generation.';
