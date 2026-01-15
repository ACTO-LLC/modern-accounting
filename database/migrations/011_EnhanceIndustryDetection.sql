-- Migration: 011_EnhanceIndustryDetection
-- Purpose: Add Keywords column for AI-powered industry detection (Issue #77 Phase 2)
-- Date: 2026-01-15

-- ============================================================================
-- 1. ADD KEYWORDS COLUMN TO INDUSTRYTEMPLATES
-- ============================================================================
IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'IndustryTemplates' AND COLUMN_NAME = 'Keywords'
)
BEGIN
    ALTER TABLE [dbo].[IndustryTemplates]
    ADD [Keywords] NVARCHAR(MAX) NULL;
    PRINT 'Added Keywords column to IndustryTemplates';
END
ELSE
BEGIN
    PRINT 'Keywords column already exists';
END
GO

-- ============================================================================
-- 2. SEED KEYWORDS FOR EXISTING TEMPLATES
-- ============================================================================

-- IT Consulting / Professional Services
UPDATE [dbo].[IndustryTemplates]
SET [Keywords] = N'["IT", "consulting", "technology", "software", "developer", "development", "programming", "tech", "professional services", "consultant", "web development", "app development", "IT services", "managed services", "MSP", "freelance developer", "agency", "digital agency", "SaaS", "cloud services", "cybersecurity", "data analytics", "AI services", "machine learning", "DevOps", "systems integration", "technical support", "helpdesk", "network services", "infrastructure", "coding", "software engineer", "web designer", "UX", "UI"]'
WHERE [Code] = 'it_consulting';
GO
PRINT 'Updated keywords for it_consulting';
GO

-- E-commerce / Retail
UPDATE [dbo].[IndustryTemplates]
SET [Keywords] = N'["ecommerce", "e-commerce", "online store", "retail", "shop", "store", "selling", "products", "merchandise", "dropshipping", "Amazon", "Shopify", "Etsy", "eBay", "WooCommerce", "online sales", "physical products", "inventory", "wholesale", "reseller", "boutique", "clothing", "apparel", "fashion", "electronics", "home goods", "marketplace", "fulfillment", "DTC", "direct to consumer", "B2C", "seller", "vendor", "gifts", "handmade", "crafts", "jewelry"]'
WHERE [Code] = 'ecommerce_retail';
GO
PRINT 'Updated keywords for ecommerce_retail';
GO

-- Restaurant / Food Service
UPDATE [dbo].[IndustryTemplates]
SET [Keywords] = N'["restaurant", "food", "cafe", "coffee shop", "bakery", "catering", "food service", "bar", "pub", "bistro", "diner", "pizzeria", "pizza", "food truck", "fast food", "quick service", "QSR", "fine dining", "casual dining", "takeout", "delivery", "kitchen", "culinary", "chef", "meal prep", "ghost kitchen", "cloud kitchen", "brewery", "winery", "juice bar", "smoothie", "ice cream", "dessert", "sandwich shop", "sushi", "mexican", "italian", "chinese", "thai"]'
WHERE [Code] = 'restaurant_food';
GO
PRINT 'Updated keywords for restaurant_food';
GO

-- Construction / Contractors
UPDATE [dbo].[IndustryTemplates]
SET [Keywords] = N'["construction", "contractor", "builder", "trades", "plumber", "plumbing", "electrician", "electrical", "HVAC", "roofing", "roofer", "carpentry", "carpenter", "remodeling", "renovation", "home improvement", "handyman", "general contractor", "GC", "subcontractor", "masonry", "concrete", "framing", "drywall", "painting", "painter", "flooring", "landscaping", "excavation", "demolition", "commercial construction", "residential construction", "home builder", "deck", "fence", "tile", "cabinet", "kitchen remodel", "bathroom remodel"]'
WHERE [Code] = 'construction';
GO
PRINT 'Updated keywords for construction';
GO

-- General Business (fallback)
UPDATE [dbo].[IndustryTemplates]
SET [Keywords] = N'["general", "business", "startup", "small business", "SMB", "service", "services", "other", "miscellaneous", "new business", "company", "enterprise", "not sure", "unsure", "default", "basic", "simple", "standard", "regular", "typical", "normal", "generic"]'
WHERE [Code] = 'general_business';
GO
PRINT 'Updated keywords for general_business';
GO

-- ============================================================================
-- 3. VERIFY UPDATES
-- ============================================================================
SELECT Code, Name, LEN(Keywords) as KeywordLength
FROM [dbo].[IndustryTemplates]
ORDER BY SortOrder;
GO

PRINT 'Migration 011_EnhanceIndustryDetection completed successfully';
GO
