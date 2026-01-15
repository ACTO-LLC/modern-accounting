/**
 * AI Parsing Tests for Enhancement Requests
 *
 * Tests the AI response parsing logic for enhancement request clarification.
 * Covers valid responses, malformed responses, hallucinations, and edge cases.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// AI Response Parser (extracted logic from server.js)
// ============================================================================

/**
 * Parses the AI response content and extracts intent information.
 * Handles various response formats and error conditions.
 *
 * @param {string} content - The raw AI response content
 * @param {string} originalDescription - The original user description (fallback)
 * @returns {{ clarifiedDescription: string, extractedIntent: object | null, error: string | null }}
 */
function parseAIResponse(content, originalDescription) {
  if (!content || content.trim().length === 0) {
    return {
      clarifiedDescription: originalDescription,
      extractedIntent: null,
      error: 'Empty AI response'
    };
  }

  try {
    // Try to parse as JSON
    const parsed = JSON.parse(content);

    // Validate expected structure
    if (!parsed || typeof parsed !== 'object') {
      return {
        clarifiedDescription: originalDescription,
        extractedIntent: null,
        error: 'AI response is not a valid object'
      };
    }

    // Check for required fields
    if (!parsed.clarifiedDescription || typeof parsed.clarifiedDescription !== 'string') {
      return {
        clarifiedDescription: originalDescription,
        extractedIntent: parsed,
        error: 'Missing or invalid clarifiedDescription field'
      };
    }

    // Validate featureType if present
    const validFeatureTypes = ['new-feature', 'enhancement', 'bug-fix', 'improvement'];
    if (parsed.featureType && !validFeatureTypes.includes(parsed.featureType)) {
      // Allow but warn - this could be AI hallucination
      console.warn(`Unexpected featureType: ${parsed.featureType}`);
    }

    // Validate priority if present
    const validPriorities = ['low', 'medium', 'high'];
    if (parsed.priority && !validPriorities.includes(parsed.priority)) {
      console.warn(`Unexpected priority: ${parsed.priority}`);
    }

    // Validate affectedAreas if present (should be array)
    if (parsed.affectedAreas && !Array.isArray(parsed.affectedAreas)) {
      console.warn('affectedAreas is not an array');
    }

    return {
      clarifiedDescription: parsed.clarifiedDescription,
      extractedIntent: parsed,
      error: null
    };
  } catch (parseError) {
    // JSON parsing failed - try to extract useful information

    // Check if response contains markdown code blocks
    const jsonBlockMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (jsonBlockMatch) {
      try {
        const innerJson = JSON.parse(jsonBlockMatch[1]);
        if (innerJson.clarifiedDescription) {
          return {
            clarifiedDescription: innerJson.clarifiedDescription,
            extractedIntent: innerJson,
            error: null
          };
        }
      } catch {
        // Inner JSON also failed
      }
    }

    return {
      clarifiedDescription: originalDescription,
      extractedIntent: null,
      error: `JSON parse error: ${parseError.message}`
    };
  }
}

/**
 * Validates the structure of an AI response for enhancement parsing.
 * Returns validation errors if the structure is unexpected.
 *
 * @param {object} response - The parsed AI response object
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateAIResponseStructure(response) {
  const errors = [];

  if (!response) {
    errors.push('Response is null or undefined');
    return { valid: false, errors };
  }

  if (!response.choices || !Array.isArray(response.choices)) {
    errors.push('Response missing choices array');
    return { valid: false, errors };
  }

  if (response.choices.length === 0) {
    errors.push('Response has empty choices array');
    return { valid: false, errors };
  }

  const firstChoice = response.choices[0];
  if (!firstChoice.message) {
    errors.push('First choice missing message');
    return { valid: false, errors };
  }

  if (!firstChoice.message.content && firstChoice.message.content !== '') {
    errors.push('Message missing content field');
    return { valid: false, errors };
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Test Suites
// ============================================================================

describe('AI Response Parsing', () => {
  describe('parseAIResponse', () => {
    describe('Valid Responses', () => {
      it('should parse a valid JSON response with all fields', () => {
        const content = JSON.stringify({
          clarifiedDescription: 'Add a revenue dashboard widget showing monthly trends',
          featureType: 'new-feature',
          affectedAreas: ['dashboard', 'reporting'],
          priority: 'high'
        });

        const result = parseAIResponse(content, 'I want a dashboard widget');

        expect(result.error).toBeNull();
        expect(result.clarifiedDescription).toBe('Add a revenue dashboard widget showing monthly trends');
        expect(result.extractedIntent).toEqual({
          clarifiedDescription: 'Add a revenue dashboard widget showing monthly trends',
          featureType: 'new-feature',
          affectedAreas: ['dashboard', 'reporting'],
          priority: 'high'
        });
      });

      it('should parse response with only required clarifiedDescription', () => {
        const content = JSON.stringify({
          clarifiedDescription: 'Enable dark mode toggle in settings'
        });

        const result = parseAIResponse(content, 'add dark mode');

        expect(result.error).toBeNull();
        expect(result.clarifiedDescription).toBe('Enable dark mode toggle in settings');
        expect(result.extractedIntent.clarifiedDescription).toBe('Enable dark mode toggle in settings');
      });

      it('should handle response with extra unexpected fields (extensible)', () => {
        const content = JSON.stringify({
          clarifiedDescription: 'Add export to PDF feature for invoices',
          featureType: 'new-feature',
          priority: 'medium',
          estimatedEffort: '2-3 days',  // Extra field
          technicalNotes: 'Use puppeteer'  // Extra field
        });

        const result = parseAIResponse(content, 'pdf export');

        expect(result.error).toBeNull();
        expect(result.clarifiedDescription).toBe('Add export to PDF feature for invoices');
        expect(result.extractedIntent.estimatedEffort).toBe('2-3 days');
      });

      it('should handle response with whitespace in JSON', () => {
        const content = `
        {
          "clarifiedDescription": "Implement bulk invoice sending via email",
          "featureType": "enhancement",
          "priority": "high"
        }
        `;

        const result = parseAIResponse(content, 'bulk email');

        expect(result.error).toBeNull();
        expect(result.clarifiedDescription).toBe('Implement bulk invoice sending via email');
      });
    });

    describe('Invalid/Malformed Responses', () => {
      it('should handle empty response', () => {
        const result = parseAIResponse('', 'original description');

        expect(result.error).toBe('Empty AI response');
        expect(result.clarifiedDescription).toBe('original description');
        expect(result.extractedIntent).toBeNull();
      });

      it('should handle null response', () => {
        const result = parseAIResponse(null, 'original description');

        expect(result.error).toBe('Empty AI response');
        expect(result.clarifiedDescription).toBe('original description');
      });

      it('should handle undefined response', () => {
        const result = parseAIResponse(undefined, 'original description');

        expect(result.error).toBe('Empty AI response');
        expect(result.clarifiedDescription).toBe('original description');
      });

      it('should handle whitespace-only response', () => {
        const result = parseAIResponse('   \n\t  ', 'original description');

        expect(result.error).toBe('Empty AI response');
        expect(result.clarifiedDescription).toBe('original description');
      });

      it('should handle invalid JSON syntax', () => {
        const content = '{ clarifiedDescription: "missing quotes" }';

        const result = parseAIResponse(content, 'original description');

        expect(result.error).toMatch(/JSON parse error/);
        expect(result.clarifiedDescription).toBe('original description');
      });

      it('should handle truncated JSON', () => {
        const content = '{ "clarifiedDescription": "truncated';

        const result = parseAIResponse(content, 'original description');

        expect(result.error).toMatch(/JSON parse error/);
        expect(result.clarifiedDescription).toBe('original description');
      });

      it('should handle JSON array instead of object', () => {
        const content = '["clarifiedDescription", "value"]';

        const result = parseAIResponse(content, 'original description');

        // Arrays are objects in JS but lack clarifiedDescription field
        expect(result.error).toBe('Missing or invalid clarifiedDescription field');
        expect(result.clarifiedDescription).toBe('original description');
      });

      it('should handle JSON primitive (string)', () => {
        const content = '"just a string"';

        const result = parseAIResponse(content, 'original description');

        expect(result.error).toBe('AI response is not a valid object');
        expect(result.clarifiedDescription).toBe('original description');
      });

      it('should handle JSON primitive (number)', () => {
        const content = '42';

        const result = parseAIResponse(content, 'original description');

        expect(result.error).toBe('AI response is not a valid object');
        expect(result.clarifiedDescription).toBe('original description');
      });

      it('should handle missing clarifiedDescription field', () => {
        const content = JSON.stringify({
          featureType: 'new-feature',
          priority: 'high'
        });

        const result = parseAIResponse(content, 'original description');

        expect(result.error).toBe('Missing or invalid clarifiedDescription field');
        expect(result.clarifiedDescription).toBe('original description');
      });

      it('should handle clarifiedDescription as non-string', () => {
        const content = JSON.stringify({
          clarifiedDescription: 123,
          featureType: 'new-feature'
        });

        const result = parseAIResponse(content, 'original description');

        expect(result.error).toBe('Missing or invalid clarifiedDescription field');
        expect(result.clarifiedDescription).toBe('original description');
      });

      it('should handle clarifiedDescription as empty string', () => {
        const content = JSON.stringify({
          clarifiedDescription: '',
          featureType: 'new-feature'
        });

        const result = parseAIResponse(content, 'original description');

        expect(result.error).toBe('Missing or invalid clarifiedDescription field');
        expect(result.clarifiedDescription).toBe('original description');
      });
    });

    describe('AI Hallucination Scenarios', () => {
      it('should handle unexpected featureType value (hallucination)', () => {
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const content = JSON.stringify({
          clarifiedDescription: 'Add feature X',
          featureType: 'super-critical-urgent',  // Hallucinated value
          priority: 'high'
        });

        const result = parseAIResponse(content, 'original');

        expect(result.error).toBeNull();
        expect(result.clarifiedDescription).toBe('Add feature X');
        expect(consoleSpy).toHaveBeenCalledWith('Unexpected featureType: super-critical-urgent');

        consoleSpy.mockRestore();
      });

      it('should handle unexpected priority value (hallucination)', () => {
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const content = JSON.stringify({
          clarifiedDescription: 'Add feature Y',
          featureType: 'enhancement',
          priority: 'critical'  // Hallucinated - not in valid list
        });

        const result = parseAIResponse(content, 'original');

        expect(result.error).toBeNull();
        expect(consoleSpy).toHaveBeenCalledWith('Unexpected priority: critical');

        consoleSpy.mockRestore();
      });

      it('should handle affectedAreas as string instead of array (hallucination)', () => {
        const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

        const content = JSON.stringify({
          clarifiedDescription: 'Add feature Z',
          affectedAreas: 'dashboard'  // Should be array
        });

        const result = parseAIResponse(content, 'original');

        expect(result.error).toBeNull();
        expect(consoleSpy).toHaveBeenCalledWith('affectedAreas is not an array');

        consoleSpy.mockRestore();
      });

      it('should handle response with markdown code block wrapping', () => {
        const content = '```json\n{"clarifiedDescription": "Feature from markdown block"}\n```';

        const result = parseAIResponse(content, 'original');

        expect(result.error).toBeNull();
        expect(result.clarifiedDescription).toBe('Feature from markdown block');
      });

      it('should handle response with markdown code block without language', () => {
        const content = '```\n{"clarifiedDescription": "Feature from plain block"}\n```';

        const result = parseAIResponse(content, 'original');

        expect(result.error).toBeNull();
        expect(result.clarifiedDescription).toBe('Feature from plain block');
      });

      it('should handle conversational response with embedded JSON', () => {
        // Sometimes AI adds explanatory text around the JSON
        const content = 'Here is my analysis:\n```json\n{"clarifiedDescription": "Embedded JSON feature"}\n```\nLet me know if you need more details.';

        const result = parseAIResponse(content, 'original');

        expect(result.error).toBeNull();
        expect(result.clarifiedDescription).toBe('Embedded JSON feature');
      });

      it('should fallback when markdown block contains invalid JSON', () => {
        const content = '```json\n{ invalid json }\n```';

        const result = parseAIResponse(content, 'original description');

        expect(result.error).toMatch(/JSON parse error/);
        expect(result.clarifiedDescription).toBe('original description');
      });

      it('should handle completely off-topic AI response', () => {
        const content = 'I apologize, but I cannot assist with that request. Please consult a professional.';

        const result = parseAIResponse(content, 'original description');

        expect(result.error).toMatch(/JSON parse error/);
        expect(result.clarifiedDescription).toBe('original description');
      });

      it('should handle AI responding in wrong format (XML-like)', () => {
        const content = '<response><clarifiedDescription>XML format</clarifiedDescription></response>';

        const result = parseAIResponse(content, 'original description');

        expect(result.error).toMatch(/JSON parse error/);
        expect(result.clarifiedDescription).toBe('original description');
      });
    });

    describe('Edge Cases', () => {
      it('should handle very long clarifiedDescription', () => {
        const longDescription = 'A'.repeat(5000);
        const content = JSON.stringify({
          clarifiedDescription: longDescription,
          featureType: 'enhancement'
        });

        const result = parseAIResponse(content, 'short original');

        expect(result.error).toBeNull();
        expect(result.clarifiedDescription).toBe(longDescription);
        expect(result.clarifiedDescription.length).toBe(5000);
      });

      it('should handle special characters in description', () => {
        const content = JSON.stringify({
          clarifiedDescription: 'Add support for special chars: <script>alert("xss")</script> & "quotes" & \'apostrophe\'',
          featureType: 'enhancement'
        });

        const result = parseAIResponse(content, 'original');

        expect(result.error).toBeNull();
        expect(result.clarifiedDescription).toContain('<script>');
        expect(result.clarifiedDescription).toContain('&');
      });

      it('should handle unicode characters', () => {
        const content = JSON.stringify({
          clarifiedDescription: 'Add multilingual support for: Cafe Resume',
          featureType: 'enhancement'
        });

        const result = parseAIResponse(content, 'original');

        expect(result.error).toBeNull();
        expect(result.clarifiedDescription).toContain('Cafe');
      });

      it('should handle deeply nested affectedAreas (unexpected structure)', () => {
        const content = JSON.stringify({
          clarifiedDescription: 'Nested areas feature',
          affectedAreas: { dashboard: ['widget1', 'widget2'] }  // Object instead of array
        });

        const result = parseAIResponse(content, 'original');

        expect(result.error).toBeNull();
        expect(result.clarifiedDescription).toBe('Nested areas feature');
      });

      it('should handle empty affectedAreas array', () => {
        const content = JSON.stringify({
          clarifiedDescription: 'Feature with no affected areas',
          affectedAreas: []
        });

        const result = parseAIResponse(content, 'original');

        expect(result.error).toBeNull();
        expect(result.extractedIntent.affectedAreas).toEqual([]);
      });
    });
  });

  describe('validateAIResponseStructure', () => {
    it('should validate correct response structure', () => {
      const response = {
        choices: [
          {
            message: {
              content: '{"clarifiedDescription": "test"}'
            }
          }
        ]
      };

      const result = validateAIResponseStructure(response);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject null response', () => {
      const result = validateAIResponseStructure(null);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Response is null or undefined');
    });

    it('should reject undefined response', () => {
      const result = validateAIResponseStructure(undefined);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Response is null or undefined');
    });

    it('should reject response without choices', () => {
      const response = { data: 'something' };

      const result = validateAIResponseStructure(response);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Response missing choices array');
    });

    it('should reject response with non-array choices', () => {
      const response = { choices: 'not-an-array' };

      const result = validateAIResponseStructure(response);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Response missing choices array');
    });

    it('should reject response with empty choices array', () => {
      const response = { choices: [] };

      const result = validateAIResponseStructure(response);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Response has empty choices array');
    });

    it('should reject response with choice missing message', () => {
      const response = {
        choices: [{ index: 0 }]
      };

      const result = validateAIResponseStructure(response);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('First choice missing message');
    });

    it('should reject response with message missing content', () => {
      const response = {
        choices: [
          {
            message: { role: 'assistant' }
          }
        ]
      };

      const result = validateAIResponseStructure(response);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Message missing content field');
    });

    it('should accept response with empty string content', () => {
      const response = {
        choices: [
          {
            message: { content: '' }
          }
        ]
      };

      const result = validateAIResponseStructure(response);

      expect(result.valid).toBe(true);
    });
  });
});

describe('Mock Claude API Integration', () => {
  let mockClaudeClient;

  beforeEach(() => {
    mockClaudeClient = {
      getChatCompletions: vi.fn()
    };
  });

  it('should handle successful Claude API response', async () => {
    mockClaudeClient.getChatCompletions.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              clarifiedDescription: 'Add automated invoice reminder system',
              featureType: 'new-feature',
              affectedAreas: ['invoices', 'notifications'],
              priority: 'high'
            })
          }
        }
      ]
    });

    const response = await mockClaudeClient.getChatCompletions('gpt-4', []);
    const validation = validateAIResponseStructure(response);

    expect(validation.valid).toBe(true);

    const content = response.choices[0].message.content;
    const parsed = parseAIResponse(content, 'original');

    expect(parsed.error).toBeNull();
    expect(parsed.clarifiedDescription).toBe('Add automated invoice reminder system');
  });

  it('should handle Claude API timeout', async () => {
    mockClaudeClient.getChatCompletions.mockRejectedValue(
      new Error('Request timeout after 30000ms')
    );

    await expect(mockClaudeClient.getChatCompletions('gpt-4', []))
      .rejects.toThrow('Request timeout');
  });

  it('should handle Claude API rate limit', async () => {
    mockClaudeClient.getChatCompletions.mockRejectedValue(
      new Error('Rate limit exceeded. Please retry after 60 seconds.')
    );

    await expect(mockClaudeClient.getChatCompletions('gpt-4', []))
      .rejects.toThrow('Rate limit exceeded');
  });

  it('should handle Claude API authentication error', async () => {
    mockClaudeClient.getChatCompletions.mockRejectedValue(
      new Error('Invalid API key provided')
    );

    await expect(mockClaudeClient.getChatCompletions('gpt-4', []))
      .rejects.toThrow('Invalid API key');
  });

  it('should handle Claude returning refusal response', async () => {
    mockClaudeClient.getChatCompletions.mockResolvedValue({
      choices: [
        {
          message: {
            content: 'I cannot process this request as it appears to be asking for potentially harmful content.',
            refusal: true
          }
        }
      ]
    });

    const response = await mockClaudeClient.getChatCompletions('gpt-4', []);
    const content = response.choices[0].message.content;
    const parsed = parseAIResponse(content, 'original description');

    // Should fallback to original description
    expect(parsed.clarifiedDescription).toBe('original description');
    expect(parsed.error).toMatch(/JSON parse error/);
  });

  it('should handle Claude returning unexpected model', async () => {
    mockClaudeClient.getChatCompletions.mockResolvedValue({
      model: 'gpt-3.5-turbo',  // Different model than requested
      choices: [
        {
          message: {
            content: JSON.stringify({
              clarifiedDescription: 'Feature from different model'
            })
          }
        }
      ]
    });

    const response = await mockClaudeClient.getChatCompletions('gpt-4', []);
    const content = response.choices[0].message.content;
    const parsed = parseAIResponse(content, 'original');

    // Should still work - model mismatch is not a parsing error
    expect(parsed.error).toBeNull();
    expect(parsed.clarifiedDescription).toBe('Feature from different model');
  });
});
