/**
 * Contact Extraction Service
 * 
 * Handles extraction of contact information from:
 * - Business card images (using GPT-4o Vision)
 * - Email signatures (using pattern matching and NLP)
 * 
 * Returns structured contact data: name, title, company, email, phone, address, website
 */

import { OpenAIClient, AzureKeyCredential } from '@azure/openai';
import fs from 'fs/promises';

const client = process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY
    ? new OpenAIClient(
        process.env.AZURE_OPENAI_ENDPOINT,
        new AzureKeyCredential(process.env.AZURE_OPENAI_API_KEY)
    )
    : null;

const deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-4-vision';

/**
 * Extract contact information from a business card image using GPT-4o Vision
 * @param {string} imagePath - Path to the business card image
 * @param {string} mimeType - MIME type of the image
 * @returns {Promise<Object>} Extracted contact information
 */
export async function extractFromBusinessCard(imagePath, mimeType) {
    if (!client) {
        return {
            success: false,
            error: 'Azure OpenAI client not configured',
            requiresManualEntry: true
        };
    }

    try {
        // Read image file and convert to base64
        const imageBuffer = await fs.readFile(imagePath);
        const base64Image = imageBuffer.toString('base64');

        // Determine media type
        let mediaType;
        if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
            mediaType = 'image/jpeg';
        } else if (mimeType === 'image/png') {
            mediaType = 'image/png';
        } else if (mimeType === 'image/gif') {
            mediaType = 'image/gif';
        } else if (mimeType === 'image/webp') {
            mediaType = 'image/webp';
        } else {
            mediaType = mimeType;
        }

        // Call GPT-4o Vision to extract business card data
        const response = await client.getChatCompletions(deploymentName, [
            {
                role: 'system',
                content: `You are an expert at extracting business card information. 
                Extract the following fields from the business card image:
                - Company Name (or organization)
                - Contact Name (first and last name)
                - Title/Role (job title)
                - Email address
                - Phone number (preferably mobile or direct)
                - Physical address (if visible)
                - Website (if visible)
                
                Return a JSON object with these fields. Use null for missing fields.
                Confidence levels: high, medium, low.
                
                Example response format:
                {
                    "companyName": "string",
                    "contactName": "string",
                    "title": "string",
                    "email": "string",
                    "phone": "string",
                    "address": "string",
                    "website": "string",
                    "confidence": "high|medium|low",
                    "notes": "Any extraction notes or ambiguities"
                }`
            },
            {
                role: 'user',
                content: [
                    {
                        type: 'image_url',
                        imageUrl: {
                            url: `data:${mediaType};base64,${base64Image}`
                        }
                    },
                    {
                        type: 'text',
                        text: 'Please extract all contact information from this business card.'
                    }
                ]
            }
        ], {
            maxTokens: 1024,
            temperature: 0.5 // Lower temperature for more deterministic extraction
        });

        const content = response.choices[0].message.content;
        
        // Parse JSON response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return {
                success: false,
                error: 'Failed to parse business card data',
                rawContent: content,
                requiresManualEntry: true
            };
        }

        const extractedData = JSON.parse(jsonMatch[0]);

        return {
            success: true,
            source: 'business_card',
            data: {
                companyName: extractedData.companyName || null,
                contactName: extractedData.contactName || null,
                title: extractedData.title || null,
                email: extractedData.email || null,
                phone: extractedData.phone || null,
                address: extractedData.address || null,
                website: extractedData.website || null
            },
            confidence: extractedData.confidence || 'medium',
            notes: extractedData.notes || null
        };
    } catch (error) {
        console.error('Business card extraction error:', error);
        return {
            success: false,
            error: error.message,
            requiresManualEntry: true
        };
    }
}

/**
 * Extract contact information from email signature text
 * @param {string} emailSignatureText - The email signature text
 * @returns {Promise<Object>} Extracted contact information
 */
export async function extractFromEmailSignature(emailSignatureText) {
    if (!emailSignatureText || typeof emailSignatureText !== 'string') {
        return {
            success: false,
            error: 'Invalid email signature text',
            requiresManualEntry: true
        };
    }

    try {
        // Common email signature patterns
        const patterns = {
            // Email patterns
            email: /([a-zA-Z0-9._%-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
            
            // Phone patterns (US format, international, etc.)
            phone: /(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g,
            
            // Website patterns
            website: /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
            
            // Common job titles
            titles: /(?:^|\s)(CEO|CTO|CFO|COO|VP|Vice President|Manager|Director|Engineer|Designer|Developer|Consultant|Analyst|Accountant|Attorney|Doctor|Professor|Founder|President|Secretary|Treasurer)(?:\s|$)/gi
        };

        // Extract contact information
        const contactInfo = {
            email: null,
            phone: null,
            website: null,
            title: null,
            address: null
        };

        // Extract email
        const emailMatches = emailSignatureText.match(patterns.email);
        if (emailMatches && emailMatches.length > 0) {
            contactInfo.email = emailMatches[0];
        }

        // Extract phone
        const phoneMatches = emailSignatureText.match(patterns.phone);
        if (phoneMatches && phoneMatches.length > 0) {
            // Format phone number
            const phoneStr = phoneMatches[0];
            contactInfo.phone = formatPhoneNumber(phoneStr);
        }

        // Extract website
        const websiteMatches = emailSignatureText.match(patterns.website);
        if (websiteMatches && websiteMatches.length > 0) {
            // Filter out email addresses and take first valid website
            const websites = websiteMatches.filter(w => !w.includes('@'));
            if (websites.length > 0) {
                contactInfo.website = websites[0];
            }
        }

        // Extract title
        const titleMatches = emailSignatureText.match(patterns.titles);
        if (titleMatches && titleMatches.length > 0) {
            contactInfo.title = titleMatches[0].trim();
        }

        // Try to extract name (usually first few capitalized words)
        const nameMatch = emailSignatureText.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/m);
        const contactName = nameMatch ? nameMatch[1] : null;

        // Try to extract company name (commonly after title or in separate line)
        let companyName = null;
        const companyPatterns = [
            /(?:at|@)\s+([A-Z][a-zA-Z\s&]+?)(?:\n|$)/,
            /([A-Z][a-zA-Z\s&]+?)\s+(?:Inc|LLC|Ltd|Corp|Co\.?|Corporation|Company)/
        ];
        for (const pattern of companyPatterns) {
            const match = emailSignatureText.match(pattern);
            if (match) {
                companyName = match[1].trim();
                break;
            }
        }

        // Split address lines (typically after the main contact info)
        const addressLines = [];
        const lines = emailSignatureText.split('\n');
        let addressStart = false;
        
        for (const line of lines) {
            const trimmed = line.trim();
            // Skip empty lines, emails, phones, websites
            if (!trimmed || trimmed.includes('@') || trimmed.match(/\d{3}[-.\s]?\d{3}[-.\s]?\d{4}/)) {
                continue;
            }
            // Address lines are typically after title/company
            if (trimmed.match(/^\d+\s/) || trimmed.match(/^[A-Z][a-z]+/i) && addressStart) {
                addressLines.push(trimmed);
            }
            if (companyName && trimmed.includes(companyName)) {
                addressStart = true;
            }
        }

        const address = addressLines.join(', ') || null;

        return {
            success: true,
            source: 'email_signature',
            data: {
                companyName: companyName,
                contactName: contactName,
                title: contactInfo.title,
                email: contactInfo.email,
                phone: contactInfo.phone,
                address: address,
                website: contactInfo.website
            },
            confidence: calculateSignatureConfidence(contactInfo, contactName, companyName),
            notes: 'Email signature parsing - may require verification'
        };
    } catch (error) {
        console.error('Email signature extraction error:', error);
        return {
            success: false,
            error: error.message,
            requiresManualEntry: true
        };
    }
}

/**
 * Check for duplicate customers or vendors
 * @param {Object} contact - The extracted contact information
 * @param {Object} mcp - MCP client instance
 * @returns {Promise<Array>} Array of potential duplicates
 */
export async function checkForDuplicates(contact, mcp) {
    if (!mcp || !contact.email && !contact.contactName && !contact.companyName) {
        return [];
    }

    try {
        const filters = [];

        // Search by email
        if (contact.email) {
            const emailResult = await mcp.readRecords('customers', {
                filter: `Email eq '${contact.email}'`,
                first: 10
            });
            const customers = emailResult.result?.value || [];
            if (customers.length > 0) {
                return customers.map(c => ({
                    type: 'customer',
                    id: c.Id,
                    name: c.Name,
                    email: c.Email,
                    phone: c.Phone,
                    matchedField: 'email'
                }));
            }

            // Also check vendors
            const vendorResult = await mcp.readRecords('vendors', {
                filter: `Email eq '${contact.email}'`,
                first: 10
            });
            const vendors = vendorResult.result?.value || [];
            if (vendors.length > 0) {
                return vendors.map(v => ({
                    type: 'vendor',
                    id: v.Id,
                    name: v.Name,
                    email: v.Email,
                    phone: v.Phone,
                    matchedField: 'email'
                }));
            }
        }

        // Search by name
        if (contact.contactName) {
            const nameResult = await mcp.readRecords('customers', {
                filter: `contains(Name, '${contact.contactName}')`,
                first: 5
            });
            const customers = nameResult.result?.value || [];
            if (customers.length > 0) {
                return customers.map(c => ({
                    type: 'customer',
                    id: c.Id,
                    name: c.Name,
                    email: c.Email,
                    phone: c.Phone,
                    matchedField: 'name'
                }));
            }
        }

        // Search by company name
        if (contact.companyName) {
            const companyResult = await mcp.readRecords('customers', {
                filter: `contains(Name, '${contact.companyName}')`,
                first: 5
            });
            const customers = companyResult.result?.value || [];
            if (customers.length > 0) {
                return customers.map(c => ({
                    type: 'customer',
                    id: c.Id,
                    name: c.Name,
                    email: c.Email,
                    phone: c.Phone,
                    matchedField: 'company'
                }));
            }
        }

        return [];
    } catch (error) {
        console.error('Duplicate check error:', error);
        return [];
    }
}

/**
 * Normalize and format extracted contact for creation
 * @param {Object} extractedData - The extracted contact data
 * @param {string} type - 'customer' or 'vendor'
 * @returns {Object} Formatted contact data ready for database creation
 */
export function formatContactForCreation(extractedData, type = 'customer') {
    const contact = {
        // Use company name if available, otherwise contact name
        name: extractedData.companyName || extractedData.contactName || 'Unknown',
        email: extractedData.email || null,
        phone: extractedData.phone || null,
        address: extractedData.address || null
    };

    // For vendors, add 1099 flag
    if (type === 'vendor') {
        contact.is1099Vendor = false; // Default to false, can be updated manually
    }

    // Store additional metadata
    contact.metadata = {
        extractedName: extractedData.contactName,
        extractedTitle: extractedData.title,
        extractedCompany: extractedData.companyName,
        website: extractedData.website,
        extractionSource: extractedData.source || 'unknown',
        extractionConfidence: extractedData.confidence || 'medium'
    };

    return contact;
}

/**
 * Helper function to format phone numbers consistently
 * @param {string} phone - Raw phone number string
 * @returns {string} Formatted phone number
 */
function formatPhoneNumber(phone) {
    // Remove all non-digits
    const digits = phone.replace(/\D/g, '');
    
    // Format as (XXX) XXX-XXXX
    if (digits.length === 10) {
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    } else if (digits.length === 11) {
        return `+${digits[0]} (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    
    // Return as-is if can't format
    return phone;
}

/**
 * Calculate confidence score for email signature extraction
 * @param {Object} contactInfo - Extracted contact info
 * @param {string} contactName - Extracted contact name
 * @param {string} companyName - Extracted company name
 * @returns {string} Confidence level: high, medium, low
 */
function calculateSignatureConfidence(contactInfo, contactName, companyName) {
    let score = 0;
    let total = 0;

    // Check each field
    const fields = [
        contactInfo.email,
        contactInfo.phone,
        contactInfo.website,
        contactInfo.title,
        contactName,
        companyName
    ];

    fields.forEach(field => {
        total++;
        if (field) score++;
    });

    const percentage = score / total;
    if (percentage >= 0.67) return 'high';
    if (percentage >= 0.33) return 'medium';
    return 'low';
}

export default {
    extractFromBusinessCard,
    extractFromEmailSignature,
    checkForDuplicates,
    formatContactForCreation
};
