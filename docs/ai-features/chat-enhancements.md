# AI Chat Enhancement Documentation

## Overview
This document describes the enhancements made to the AI chat interface to support file uploads, message editing, and improved error handling.

## Features Implemented

### 1. File Upload Support
Users can now upload files to the chat interface through multiple methods:

#### Upload Methods
- **File Picker Button**: Click the paperclip (📎) icon to select files
- **Drag & Drop**: Drag files directly onto the chat interface
- **Clipboard Paste**: Press Ctrl+V (or Cmd+V on Mac) to paste images from clipboard

#### Supported File Types
- **Images**: PNG, JPG, JPEG, GIF, WebP (for receipts, business cards, statements)
- **Documents**: PDF (bank statements, invoices)
- **Spreadsheets**: CSV, XLSX, XLS (transaction exports, data imports)

#### File Processing
- Files are automatically processed on upload
- Images are processed with OCR (Scribe.js) to extract text
- PDFs are processed with Scribe.js (supports both native text and scanned PDFs)
- Extracted text is sent to the AI along with the user's message
- File size limit: 10MB per file
- Maximum files per message: 5

### 2. Edit & Resubmit Messages
Users can now edit their previous messages and resubmit them:

#### How to Edit
- **Hover Method**: Hover over any user message to reveal an "Edit" button
- **Keyboard Shortcut**: Press the Up Arrow (↑) key when the input field is empty to edit the last message

#### Edit Behavior
- Click "Edit" to enter inline edit mode
- Modify the message text in the textarea
- Click "Save & Resubmit" to send the edited message
- The AI generates a new response based on the edited message
- Original message content is preserved in case needed for undo

### 3. Retry on Errors
When the AI encounters an error, users can retry the request:

#### Error Handling
- Error messages are displayed in plain language
- Errors show a red accent border on the left
- Retryable errors display a "Retry" button
- Clicking "Retry" resubmits the previous user message

#### Example Error Messages
- "I had trouble connecting to the server. This might be a temporary issue."
- "I had trouble reading the chart of accounts. This might be a temporary issue."

### 4. AI File Processing Tools
The AI now has tools to create records based on file content:

#### Available Tools
1. **create_customer**: Creates a new customer record
   - Parameters: name, email, phone, address
   - Use case: Business cards, email signatures

2. **create_vendor**: Creates a new vendor record
   - Parameters: name, email, phone, address, is_1099_vendor
   - Use case: Vendor invoices, business cards

3. **create_account**: Creates a new account in the chart of accounts
   - Parameters: code, name, type, subtype, description
   - Use case: Bank statements, credit card statements

#### Auto-Detection Examples
- **Bank Statement**: AI detects bank name and account details, creates bank account automatically
- **Credit Card Statement**: AI detects card issuer and last 4 digits, creates liability account
- **Business Card**: AI extracts contact info and asks if it's a customer or vendor
- **Receipt**: AI extracts merchant, amount, and suggests expense categorization

### 5. Enhanced System Prompt
The AI system prompt has been updated to include:

- Instructions for processing uploaded files
- Guidelines for auto-creating records when appropriate
- Principle: "Do first, confirm after" - reduce unnecessary confirmation prompts
- Specific handling for different document types

## Technical Implementation

### Backend (chat-api/server.js)

#### New Dependencies
```json
{
  "multer": "^2.0.2",
  "scribe.js-ocr": "^0.4.0"
}
```

**Why Scribe.js over Tesseract.js?**
- **Native PDF Support**: Scribe.js can extract text directly from PDFs (both native text and scanned), which is critical for bank statements and invoices
- **Higher Accuracy**: Generally 1-17% more accurate than Tesseract.js on complex documents (multi-column, rotated, stylized)
- **Better Layout Analysis**: Handles multi-column layouts, rotated documents, and various font styles better
- **Font Detection**: Can detect font families and styles, useful for document analysis
- **Trade-off**: Slightly larger library size and slower processing, but worth it for financial documents where accuracy matters

#### New Endpoints
- `POST /api/chat/upload`: Upload and process files
  - Returns: fileId, fileName, fileType, extractedText, metadata

#### Updated Endpoints
- `POST /api/chat`: Now accepts attachments array in request body

#### New Functions
- `initializeUploadDir()`: Creates uploads directory on startup
- `extractTextFromImage()`: Uses Scribe.js for OCR on images
- `extractTextFromPDF()`: Uses Scribe.js for PDF text extraction (native and scanned)
- `processUploadedFile()`: Processes uploaded files and extracts text
- `executeCreateCustomer()`: Creates customer records via MCP
- `executeCreateVendor()`: Creates vendor records via MCP
- `executeCreateAccount()`: Creates COA accounts via MCP

### Frontend (client/src)

#### Updated Components
1. **ChatContext.tsx**
   - Added `FileAttachment` interface
   - Added pending attachments state
   - Added methods: `addPendingAttachment`, `removePendingAttachment`, `clearPendingAttachments`
   - Added `updateMessage` for editing messages

2. **ChatInterface.tsx**
   - Added file upload UI components
   - Added drag & drop handlers
   - Added clipboard paste handler
   - Added edit mode for user messages
   - Added retry button for error messages
   - Added pending attachments preview
   - Made API URL configurable via environment variable

#### New UI Elements
- File attachment button (📎 paperclip icon)
- Drag & drop overlay
- Pending attachments preview chips
- Edit button on user messages (shown on hover)
- Inline edit textarea with save/cancel buttons
- Retry button on error messages
- File icons and thumbnails in messages

### Configuration

#### Environment Variables
Create a `.env` file in the client directory:
```
VITE_CHAT_API_URL=http://localhost:7071
```

Create a `.env` file in the chat-api directory:
```
AZURE_OPENAI_ENDPOINT=your_endpoint
AZURE_OPENAI_API_KEY=your_key
AZURE_OPENAI_DEPLOYMENT=gpt-4
DAB_MCP_URL=http://localhost:5000/mcp
APP_URL=http://localhost:5173
PORT=7071
```

## Usage Examples

### Example 1: Upload a Receipt
1. Take a photo of a receipt
2. Open the chat interface
3. Paste the image (Ctrl+V) or click the paperclip to select it
4. Type: "What category should this expense be?"
5. AI extracts text from receipt and suggests appropriate expense category

### Example 2: Create Customer from Business Card
1. Scan or photograph a business card
2. Drag and drop the image onto the chat
3. Type: "Add this as a customer"
4. AI extracts contact details and asks for confirmation
5. Click "Customer" when prompted
6. AI creates the customer record

### Example 3: Edit a Message
1. Send a message: "Show me invoices from last month"
2. Realize you meant "last quarter"
3. Press Up Arrow key or hover and click "Edit"
4. Change "month" to "quarter"
5. Click "Save & Resubmit"
6. AI generates new response with quarterly data

### Example 4: Retry on Error
1. Send a message that triggers an error
2. AI responds with error message and "Retry" button
3. Click "Retry" to resubmit the request
4. AI attempts the request again

## Testing

### Automated Tests
Run the test suite:
```bash
cd client
npx playwright test chat-enhancements.spec.ts
```

Test coverage includes:
- Opening and closing chat
- Displaying file attachment button
- Sending messages
- Edit button visibility on hover
- Quick action buttons
- Clear conversation
- Message display and formatting

### Manual Testing Checklist
- [ ] Upload image via file picker
- [ ] Drag and drop file onto chat
- [ ] Paste image from clipboard
- [ ] Edit a previous message
- [ ] Use Up arrow to edit last message
- [ ] Retry a failed message
- [ ] Upload multiple files in one message
- [ ] Remove pending attachment before sending
- [ ] Test with different file types (PNG, PDF, CSV)
- [ ] Test file size limits
- [ ] Test unsupported file types

## Security Considerations

### Current Implementation
- File type validation by MIME type
- File size limit: 10MB per file
- Maximum 5 files per request
- Files stored in `chat-api/uploads/` directory
- Unique filenames generated with timestamp + UUID

### Production Recommendations
- Implement virus scanning (e.g., ClamAV)
- Add content validation (verify file headers match MIME type)
- Implement per-type file size limits
- Add rate limiting for upload endpoint
- Consider cloud storage instead of local filesystem
- Implement file cleanup/retention policies
- Add user authentication and authorization
- Encrypt files at rest

## Future Enhancements

### Potential Improvements
1. **PDF Text Extraction**: Use PDF parsing library for better PDF support
2. **Vision API Integration**: Use GPT-4o with vision for better image understanding
3. **File Preview Modal**: Full-screen viewer for images and PDFs
4. **CSV/Excel Parsing**: Parse spreadsheet data and display in tables
5. **Progress Indicators**: Show upload progress for large files
6. **File Download**: Allow downloading attached files from messages
7. **Message History**: Persist messages and attachments to database
8. **Multi-modal Responses**: AI can respond with images or files
9. **Template Responses**: Pre-defined responses for common queries
10. **Voice Input**: Speech-to-text for voice messages

## Troubleshooting

### Common Issues

#### Upload fails with "Unsupported file type"
- Check that the file type is in the allowed list
- Verify the file has the correct MIME type

#### OCR not extracting text from image
- Ensure image quality is good (not blurry or low resolution)
- Try a different image format
- Check console logs for OCR errors

#### Edit button not appearing
- Make sure you're hovering over a user message (blue bubble)
- Edit button has opacity transition, may take a moment to appear
- Check that the message is not currently being edited

#### API URL not working
- Verify VITE_CHAT_API_URL is set correctly in .env
- Restart the development server after changing .env
- Check browser console for CORS errors

### Debug Mode
Enable debug logging in the browser console:
```javascript
localStorage.setItem('debug', 'chat:*');
```

## Support
For issues or questions, please refer to:
- GitHub Issue: ehalsey/modern-accounting#78
- Related Issues: #77 (AI Onboarding), #72 (AI Assistant)
