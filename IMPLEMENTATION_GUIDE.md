# Implementation Guide: Business Card & Email Signature Extraction

## Quick Start

### 1. Understanding the Data Flow

```
User uploads business card or pastes email signature
            ↓
Chat API receives file/text
            ↓
AI extracts structured contact data (JSON)
            ↓
System checks for duplicate records
            ↓
If duplicate found: Ask user for confirmation
If no duplicate: Ask "Customer or Vendor?"
            ↓
User confirms type
            ↓
Create customer or vendor record
            ↓
Show confirmation with link to view record
```

### 2. Key Components

#### A. Contact Extractor Service (`contact-extractor.js`)
Handles all extraction logic:
- `extractFromBusinessCard()` - GPT-4o Vision extraction
- `extractFromEmailSignature()` - Pattern-based extraction
- `checkForDuplicates()` - Database queries
- `formatContactForCreation()` - Data normalization

#### B. Server Integration (`server.js`)
- Tools definition: 4 new tools
- Execution functions: 4 handlers
- File storage: `fileStorage` Map
- System prompt: Detailed instructions for AI

#### C. Chat API Endpoints
- `/api/chat/upload` - File upload handler
- `/api/chat` - Chat endpoint with tool integration

### 3. How to Use

#### For End Users

**Business Card Flow:**
1. Drop business card image into chat
2. AI extracts information
3. Confirm if duplicate record should be created
4. Choose: Customer or Vendor
5. Record created ✓

**Email Signature Flow:**
1. Paste email signature text into chat
2. AI extracts information
3. Confirm if duplicate record should be created
4. Choose: Customer or Vendor
5. Record created ✓

#### For Developers

**Adding to a new project:**
1. Copy `contact-extractor.js` to project
2. Install dependencies (already in package.json):
   - @azure/openai (for GPT-4o Vision)
   - fs/promises (built-in)
3. Import in server: `import { ... } from './src/services/contact-extractor.js'`
4. Add tools to tools array (already done)
5. Add execution functions (already done)
6. Configure environment variables (see below)

**Testing extraction functions:**
```javascript
import {
  extractFromBusinessCard,
  extractFromEmailSignature,
  checkForDuplicates
} from './src/services/contact-extractor.js';

// Test business card
const result = await extractFromBusinessCard('/path/to/card.jpg', 'image/jpeg');
console.log(result.data); // { companyName, contactName, email, phone, ... }

// Test email signature
const emailResult = await extractFromEmailSignature(emailSignatureText);
console.log(emailResult.data);

// Test duplicates
const duplicates = await checkForDuplicates(result.data, mcp);
console.log(duplicates); // Array of potential matches
```

### 4. Configuration

**Environment Variables Required:**
```bash
# Azure OpenAI (for GPT-4o Vision)
AZURE_OPENAI_ENDPOINT=https://<your-resource>.openai.azure.com/
AZURE_OPENAI_API_KEY=<your-api-key>
AZURE_OPENAI_DEPLOYMENT=gpt-4-vision

# DAB MCP for database operations
DAB_MCP_URL=http://localhost:5000/mcp
DAB_REST_URL=http://localhost:5000/api

# UI links
APP_URL=http://localhost:5173
```

**Multer Configuration (file upload):**
- Max file size: 10MB
- Supported types: jpg, jpeg, png, gif, webp, pdf, csv, xls, xlsx
- Max files: 5 per request
- Storage: `chat-api/uploads/`

### 5. Error Handling

**Business Card Extraction Failures:**
```javascript
// Image too low quality
{
  success: false,
  error: "Failed to parse business card data",
  requiresManualEntry: true
}

// User should be guided to:
1. Try uploading a clearer image
2. Or manually enter the information
```

**Email Signature Extraction Failures:**
```javascript
// No patterns matched
{
  success: false,
  error: "No email patterns found",
  requiresManualEntry: true
}

// Suggest user manually enter or reformat
```

**Duplicate Found:**
```javascript
{
  success: false,
  duplicatesFound: true,
  duplicates: [
    {
      type: "customer",
      id: "cust-123",
      name: "Acme Corp",
      email: "contact@acme.com",
      matchedField: "email"
    }
  ],
  instruction: "To create anyway, confirm with skip_duplicate_check: true"
}
```

### 6. Database Schema

The system creates records using existing customer/vendor entities:

**Customer Record Created:**
```javascript
{
  Name: "Company Name or Contact Name",
  Email: "extracted@email.com",
  Phone: "(555) 123-4567",
  BillingAddress: "123 Main St, ...",
  ContactTitle: "Job Title",
  Website: "www.company.com",
  CreatedFrom: "contact_extraction" // Audit trail
}
```

**Vendor Record Created:**
```javascript
{
  Name: "Company Name or Contact Name",
  Email: "extracted@email.com",
  Phone: "(555) 123-4567",
  Address: "123 Main St, ...",
  ContactTitle: "Job Title",
  Website: "www.company.com",
  Is1099Vendor: false,
  CreatedFrom: "contact_extraction" // Audit trail
}
```

### 7. Tool Definitions

#### `extract_from_business_card`
```javascript
Parameters:
  file_id (required): String - The uploaded file ID

Returns:
{
  success: true,
  extracted: {
    companyName: "string",
    contactName: "string",
    title: "string",
    email: "string",
    phone: "string",
    address: "string",
    website: "string"
  },
  confidence: "high|medium|low",
  duplicates: [], // If found
  nextAction: "ask_customer_or_vendor|ask_duplicate_confirmation"
}
```

#### `extract_from_email_signature`
```javascript
Parameters:
  signature_text (required): String - Email signature to parse

Returns: Same as above
```

#### `create_customer_from_contact`
```javascript
Parameters:
  name (required): String - Company or contact name
  email (optional): String
  phone (optional): String
  address (optional): String
  contact_title (optional): String
  website (optional): String
  skip_duplicate_check (optional): Boolean

Returns:
{
  success: true,
  message: "✓ Created customer 'Name'",
  customer: {
    id: "uuid",
    name: "...",
    email: "...",
    phone: "...",
    link: "http://localhost:5173/customers"
  }
}
```

#### `create_vendor_from_contact`
```javascript
Parameters:
  Same as create_customer_from_contact, plus:
  is_1099_vendor (optional): Boolean

Returns: Same format as create_customer_from_contact
```

### 8. Workflow Examples

#### Example 1: Business Card → Customer
```
User input: [Uploads business card image]

Step 1 - Extract:
  extract_from_business_card({ file_id: "abc-123" })
  Returns: { companyName: "Acme", contactName: "John Smith", email: "john@acme.com", ... }

Step 2 - Check Duplicates:
  checkForDuplicates({ contactName: "John Smith", email: "john@acme.com", ... }, mcp)
  Returns: [] (no duplicates)

Step 3 - Ask Type:
  AI: "Is this a customer or vendor?"
  User: "Customer"

Step 4 - Create:
  create_customer_from_contact({
    name: "Acme",
    email: "john@acme.com",
    phone: "(555) 123-4567",
    contact_title: "Sales Director",
    address: "123 Business St, ..."
  })
  Returns: { success: true, customer: { ... } }

Step 5 - Confirm:
  AI: "✓ Created customer 'Acme' with contact John Smith"
```

#### Example 2: Email Signature → Vendor (with duplicate)
```
User input: "Here's a vendor from email: Jane Doe, Tech Corp, jane@techcorp.com, ..."

Step 1 - Extract:
  extract_from_email_signature("Jane Doe\nTech Corp\njane@techcorp.com\n...")
  Returns: { companyName: "Tech Corp", contactName: "Jane Doe", email: "jane@techcorp.com", ... }

Step 2 - Check Duplicates:
  checkForDuplicates({ ... }, mcp)
  Returns: [{
    type: "vendor",
    id: "vend-456",
    name: "TechCorp Inc.",
    email: "jane@techcorp.com",
    matchedField: "email"
  }]

Step 3 - Duplicate Found:
  AI: "Found existing vendor 'TechCorp Inc.' with this email. Is this the same company?"
  User: "No, this is a different company"

Step 4 - Create (with skip):
  create_vendor_from_contact({
    name: "Tech Corp",
    email: "jane@techcorp.com",
    skip_duplicate_check: true
  })
  Returns: { success: true, vendor: { ... } }

Step 5 - Confirm:
  AI: "✓ Created vendor 'Tech Corp' with contact Jane Doe"
```

### 9. Confidence Levels

**High Confidence:**
- Business card: Clear image, all fields readable
- Email signature: Standard corporate format, all major fields present

**Medium Confidence:**
- Business card: Partial glare or angle, but readable
- Email signature: Some fields missing, but core info present

**Low Confidence:**
- Business card: Unclear image, multiple fields unreadable
- Email signature: Custom format, few patterns matched

### 10. Debugging Tips

**Business card not extracting?**
1. Check image quality (clear, well-lit, no rotation)
2. Verify Azure OpenAI is configured
3. Check token usage (GPT-4o Vision can be expensive)
4. Look for error in response: `rawContent` field

**Email extraction missing fields?**
1. Check email format (some corporate formats may not match patterns)
2. Verify regex patterns are correct
3. Check confidence score (lower = fewer fields matched)
4. Try reformatting or suggest manual entry

**Duplicate detection not working?**
1. Verify MCP connection to DAB
2. Check database for existing records
3. Verify email/name format matches database
4. Try broader search (e.g., contains instead of exact match)

**Records not creating?**
1. Check MCP write permissions
2. Verify customer/vendor table exists in database
3. Check for validation errors on required fields
4. Look for foreign key constraint issues

### 11. Performance Considerations

**Business Card Extraction:**
- GPT-4o Vision: ~2-3 seconds per image
- Network latency: +0.5-1 second
- Total: ~3-4 seconds per card

**Email Signature Extraction:**
- Regex matching: <100ms
- MCP database query: ~500ms per duplicate check
- Total: ~600-700ms

**Optimization Tips:**
- Cache extracted data during conversation
- Batch duplicate checks if processing multiple contacts
- Consider async extraction for bulk uploads

### 12. Security Best Practices

✓ **Implemented:**
- File type validation (MIME type)
- File size limits (10MB max)
- Temporary file cleanup

⚠️ **Recommended for Production:**
- Virus scanning (ClamAV integration)
- File header validation (verify MIME matches content)
- Rate limiting on extraction requests
- Audit logging of created records
- Encryption of file storage
- PII masking in logs

### 13. Monitoring & Logging

**Metrics to track:**
- Extraction success rate (business card vs email)
- Duplicate detection rate
- Customer/vendor creation rate
- Average extraction time
- Confidence level distribution

**Logs to monitor:**
```javascript
// Success
console.log(`Extracted from ${source}: ${confidence} confidence`);

// Error
console.error(`Extraction failed for ${fileId}: ${error.message}`);

// Duplicate
console.info(`Duplicate found: ${matchedField} matched existing record`);

// Creation
console.info(`Created ${type} from contact extraction: ${name}`);
```

## Summary

The business card and email signature extraction feature provides:
- ✓ Automated contact data extraction
- ✓ Duplicate prevention
- ✓ Seamless customer/vendor creation
- ✓ Error handling and guidance
- ✓ Audit trail with extraction source
- ✓ Confidence scoring for validation

Implementation is complete and ready for testing and deployment!
