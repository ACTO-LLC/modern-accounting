# Business Card & Email Signature Extraction Feature

## Overview

This feature enables users to automatically create customer and vendor records by uploading business card images or pasting email signatures into the Modern Accounting chat interface. Using GPT-4o Vision for image processing and advanced pattern matching for email signatures, the system intelligently extracts contact information and creates records with minimal manual effort.

## Features

### 1. Business Card Extraction (Image-Based)
- **Upload**: Users drop a business card image (.jpg, .png, .gif, .webp) into the chat
- **AI Processing**: GPT-4o Vision extracts all visible contact information
- **Data Extracted**:
  - Company Name
  - Contact Name (first and last)
  - Job Title/Role
  - Email Address
  - Phone Number
  - Physical Address
  - Website URL

### 2. Email Signature Extraction (Text-Based)
- **Input**: Users paste an email signature from an email or message
- **Pattern Matching**: Advanced regex and NLP patterns extract structured contact data
- **Data Extracted**:
  - Company/Organization Name
  - Contact Name
  - Job Title
  - Email Address
  - Phone Number (multiple formats supported)
  - Physical Address
  - Website URL

### 3. Duplicate Detection
Before creating new records, the system checks for existing customers or vendors:
- Search by email address (exact match)
- Search by name (partial match)
- Search by company name (partial match)
- Shows potential duplicates to user for confirmation

### 4. Smart Record Creation
- **Automatic**: Creates customer or vendor records without requiring additional form fields
- **Guided**: AI asks clarifying questions when needed (e.g., "Is this a customer or vendor?")
- **Feedback**: Immediate confirmation with direct links to view the created record

## Architecture

### New Files Created

#### 1. `chat-api/src/services/contact-extractor.js`
Core extraction service with four main functions:

**`extractFromBusinessCard(imagePath, mimeType)`**
- Calls GPT-4o Vision API with base64-encoded image
- Returns structured JSON with extracted fields
- Includes confidence score (high/medium/low)
- Error handling for image processing failures

**`extractFromEmailSignature(emailSignatureText)`**
- Uses regex patterns to extract contact information
- Handles multiple phone number formats (US, international)
- Extracts website URLs and email addresses
- Calculates confidence based on fields found
- Returns structured JSON data

**`checkForDuplicates(contact, mcp)`**
- Searches existing customers and vendors
- Returns array of potential matches with match details
- Supports email, name, and company name matching
- Integrates with DAB MCP for database queries

**`formatContactForCreation(extractedData, type)`**
- Normalizes extracted data for database insertion
- Handles type-specific fields (e.g., 1099 flag for vendors)
- Preserves metadata about extraction source and confidence

### Modified Files

#### 1. `chat-api/server.js`

**New Imports**:
```javascript
import {
    extractFromBusinessCard,
    extractFromEmailSignature,
    checkForDuplicates,
    formatContactForCreation
} from './src/services/contact-extractor.js';
```

**New File Storage Map**:
```javascript
const fileStorage = new Map(); // Tracks uploaded files for tool access
```

**New Tools** (Added to tools array):
- `extract_from_business_card` - Extract from uploaded image
- `extract_from_email_signature` - Extract from pasted text
- `create_customer_from_contact` - Create customer record
- `create_vendor_from_contact` - Create vendor record

**New Execution Functions**:
- `executeExtractFromBusinessCard()` - Handles business card extraction
- `executeExtractFromEmailSignature()` - Handles email signature extraction
- `executeCreateCustomerFromContact()` - Creates customer from extracted data
- `executeCreateVendorFromContact()` - Creates vendor from extracted data

**Enhanced File Processing**:
- `processUploadedFile()` now stores file references in `fileStorage` Map
- Files remain accessible by fileId for extraction tools

**System Prompt Updates**:
- Added detailed section on BUSINESS CARD extraction workflow
- Added detailed section on EMAIL SIGNATURE extraction workflow
- Documented auto-creation workflow and duplicate checking
- Updated FILE PROCESSING instructions

## Usage Workflow

### Scenario 1: Upload Business Card Image

```
User: [drops business_card.jpg into chat]
Chat: Processing your business card image...

AI (extracts via GPT-4o Vision)
AI: I found the following contact information:
- **Name**: John Smith
- **Company**: Acme Corporation
- **Title**: Sales Director
- **Email**: john.smith@acme.com
- **Phone**: (555) 123-4567
- **Address**: 123 Business St, New York, NY 10001

Is this a **Customer** or **Vendor**?

User: Customer

AI (checks for duplicates by email)
AI: ✓ No existing records found.

Creating customer...
✓ Created customer 'Acme Corporation'
Contact: John Smith | john.smith@acme.com | (555) 123-4567

[View Customers] or Would you like to add another contact?
```

### Scenario 2: Paste Email Signature

```
User: Here's a vendor contact from an email:

John Anderson
Senior Account Manager
TechSupply Inc.
john.anderson@techsupply.com
+1 (555) 987-6543
www.techsupply.com

Chat: I'll extract the contact information from this email signature...

AI (extracts via pattern matching):
Found: John Anderson, TechSupply Inc., john.anderson@techsupply.com, +1 (555) 987-6543

Is this a **Customer** or **Vendor**?

User: Vendor. Also check if they're a 1099 vendor.

AI: I'll create this as a vendor record. Regarding the 1099 status - I'll set it as false by default, but you can update it later if needed.

✓ Created vendor 'TechSupply Inc.'
Contact: John Anderson | john.anderson@techsupply.com | +1 (555) 987-6543

[View Vendors]
```

### Scenario 3: Duplicate Detection

```
User: [uploads business card for "ABC Corp"]

AI (extracts and finds duplicate):
I found existing records that might match:
1. **ABC Corporation** (Customer)
   - Email: contact@abc-corp.com
   - Phone: (555) 111-2222

This could be the same company. Should I:
- Create a NEW contact anyway
- Link to the existing customer
- Or is this a different company?
```

## Data Models

### Business Card Extraction Result
```json
{
  "success": true,
  "source": "business_card",
  "data": {
    "companyName": "Acme Inc.",
    "contactName": "Jane Doe",
    "title": "VP of Sales",
    "email": "jane@acme.com",
    "phone": "(555) 123-4567",
    "address": "123 Main St, Springfield, IL 60601",
    "website": "www.acme.com"
  },
  "confidence": "high",
  "notes": "Card had some glare but all text readable"
}
```

### Email Signature Extraction Result
```json
{
  "success": true,
  "source": "email_signature",
  "data": {
    "companyName": "Tech Solutions LLC",
    "contactName": "Robert Chen",
    "title": "Senior Engineer",
    "email": "rchen@techsolutions.com",
    "phone": "(555) 987-6543",
    "address": "456 Tech Blvd, San Francisco, CA 94105",
    "website": "www.techsolutions.com"
  },
  "confidence": "high",
  "notes": "Email signature parsing - may require verification"
}
```

### Duplicate Check Result
```json
{
  "duplicatesFound": true,
  "duplicates": [
    {
      "type": "customer",
      "id": "cust-123",
      "name": "Acme Corporation",
      "email": "contact@acme.com",
      "phone": "(555) 111-2222",
      "matchedField": "email"
    }
  ]
}
```

## Technical Implementation Details

### GPT-4o Vision Integration
- **Model**: Uses Azure OpenAI deployment (gpt-4-vision)
- **Input**: Base64-encoded image with structured extraction prompt
- **Output**: JSON with confidence levels
- **Temperature**: Set to 0.5 for deterministic extraction

### Email Pattern Matching
- **Email**: RFC 5322 compliant pattern
- **Phone**: Supports US, international, and various delimiters
- **Website**: Matches http/https URLs and domain patterns
- **Titles**: Recognizes 30+ common job titles
- **Address**: Extracts multi-line address blocks

### Duplicate Detection Strategy
1. **Primary**: Exact email match (highest confidence)
2. **Secondary**: Exact name match in company/contact fields
3. **Tertiary**: Partial company name match
4. **Returns**: All potential matches with match type identified

### Database Integration
- Uses existing DAB MCP `createRecord` for customer/vendor creation
- Stores `CreatedFrom: 'contact_extraction'` metadata
- Preserves extraction source and confidence in custom fields

## Error Handling

### Business Card Extraction Failures
- Unclear/low-quality image → Returns `requiresManualEntry: true`
- OCR fails → Suggests manual entry or image improvement
- JSON parsing fails → Shows raw extracted text for user verification

### Email Signature Extraction Failures
- No patterns matched → Returns error with `requiresManualEntry: true`
- Incomplete data → Proceeds with confidence: 'low'
- Invalid formats → Suggests manual entry

### Duplicate Conflicts
- Exact email match found → Blocks creation, asks for confirmation
- Name/company matches → Shows potential duplicates, allows override
- User can confirm `skip_duplicate_check: true` to bypass

## Configuration

### Environment Variables
```bash
AZURE_OPENAI_ENDPOINT=<endpoint>
AZURE_OPENAI_API_KEY=<key>
AZURE_OPENAI_DEPLOYMENT=gpt-4-vision
DAB_MCP_URL=http://localhost:5000/mcp
DAB_REST_URL=http://localhost:5000/api
APP_URL=http://localhost:5173
```

### File Upload Settings
- **Max file size**: 10MB per file (configured in multer)
- **Supported image formats**: jpg, jpeg, png, gif, webp
- **Max files per request**: 5
- **Upload directory**: `chat-api/uploads/`

## Security Considerations

### File Upload Security
- ✓ MIME type validation
- ✓ File size limits
- ✓ Stored in temporary uploads directory
- ⚠️ Consider adding virus scanning (ClamAV) for production
- ⚠️ Consider content validation (verify file headers match MIME type)

### Data Privacy
- Extracted contact data stored briefly in memory
- No permanent retention unless customer/vendor record created
- File metadata includes extraction confidence for audit trail
- Consider GDPR compliance for EU users

## Testing

### Unit Tests Needed
```javascript
// Business Card Extraction
- Test: High-quality business card image
- Test: Low-quality/angled business card
- Test: Business card with missing fields
- Test: Non-English business cards (if multi-language support needed)

// Email Signature Extraction
- Test: Standard corporate email signature
- Test: Email with multiple phone numbers
- Test: Email with international phone format
- Test: Email with special characters in company name

// Duplicate Detection
- Test: Exact email match
- Test: Partial name match
- Test: Multiple matches
- Test: No matches

// Record Creation
- Test: Create customer with all fields
- Test: Create customer with minimal fields
- Test: Create 1099 vendor
- Test: Duplicate prevention
```

### Integration Tests Needed
```javascript
- Test: Full workflow from upload to customer creation
- Test: Full workflow from email paste to vendor creation
- Test: Duplicate detection triggers confirmation flow
- Test: File storage and retrieval by fileId
```

## Future Enhancements

1. **Multi-Language Support**: Extend GPT-4o Vision to handle non-English business cards
2. **Handwriting Recognition**: Process handwritten notes and signatures
3. **Receipt/Invoice Processing**: Extract line items and auto-categorize expenses
4. **Batch Processing**: Import multiple business cards at once
5. **Contact Enrichment**: Integrate with contact database APIs for additional validation
6. **Smart Categorization**: Auto-detect industry and suggest invoice/bill templates
7. **Contact Merging**: Intelligently suggest merging duplicate contacts
8. **Mobile App**: Native image capture from phone camera
9. **Calendar Integration**: Extract meeting dates and attendees from signatures
10. **Historical Tracking**: Track extracted contacts and match rates over time

## Troubleshooting

### Issue: Business card extraction returns empty
**Solution**: Verify image is clear, well-lit, and contains readable text. Try uploading again.

### Issue: Email extraction misses some fields
**Solution**: Standard email patterns support most formats. For complex signatures, provide phone/email separately.

### Issue: Duplicate check is too aggressive
**Solution**: System allows `skip_duplicate_check: true` parameter if user is certain.

### Issue: Created record has wrong company name
**Solution**: Company name is prioritized over contact name. Edit the record to swap values if needed.

## Files Modified

1. **chat-api/src/services/contact-extractor.js** (NEW)
   - Core extraction service
   - ~500 lines

2. **chat-api/server.js**
   - Added import for contact extractor
   - Added fileStorage Map
   - Added 4 new tools to tools array
   - Added 4 new execution functions
   - Enhanced processUploadedFile()
   - Updated system prompt
   - Added 5 new cases to function dispatcher

3. **chat-api/package.json**
   - No new dependencies needed (uses existing @azure/openai)

## Deployment Checklist

- [ ] Contact extractor service deployed
- [ ] System prompt updated in all instances
- [ ] File upload directory configured
- [ ] GPT-4o Vision model verified
- [ ] Database MCP connection tested
- [ ] Duplicate detection tested end-to-end
- [ ] UI updated to show extraction status
- [ ] Documentation updated for end users
- [ ] Error handling tested for edge cases
- [ ] File cleanup scheduled (uploads directory)

## Support

For issues or questions about the business card and email signature extraction feature, please refer to:
1. Contact extraction service documentation (in-file comments)
2. System prompt guidelines (business card/email signature sections)
3. Integration test suite
4. Error logs in `chat-api/server.js`
