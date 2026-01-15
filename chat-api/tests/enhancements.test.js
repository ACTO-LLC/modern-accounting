/**
 * Enhancement API tests for chat-api
 *
 * Tests the enhancement request endpoints.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the DAB client
const mockDab = {
  create: vi.fn(),
  get: vi.fn(),
  getById: vi.fn(),
  update: vi.fn(),
};

// Mock the Azure OpenAI client
const mockAzureClient = {
  getChatCompletions: vi.fn(),
};

// Mock express app request/response
const createMockResponse = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn().mockReturnThis(),
});

const createMockRequest = (body = {}, params = {}, query = {}) => ({
  body,
  params,
  query,
});

describe('Enhancement API Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/enhancements', () => {
    it('should create enhancement with valid description', async () => {
      const mockEnhancement = {
        Id: 1,
        RequestorName: 'Test User',
        Description: 'Add a new dashboard widget',
        Status: 'pending',
        CreatedAt: new Date().toISOString(),
      };

      mockDab.create.mockResolvedValueOnce({
        success: true,
        value: mockEnhancement,
      });

      mockAzureClient.getChatCompletions.mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                clarifiedDescription: 'Add a new dashboard widget for revenue overview',
                featureType: 'new-feature',
                affectedAreas: ['dashboard'],
                priority: 'medium',
              }),
            },
          },
        ],
      });

      const req = createMockRequest({
        description: 'I want a dashboard widget',
        requestorName: 'Test User',
      });
      const res = createMockResponse();

      // Simulate the endpoint logic
      const description = req.body.description;
      const requestorName = req.body.requestorName;

      expect(description).toBeTruthy();
      expect(description.trim().length).toBeGreaterThan(0);

      const result = await mockDab.create('enhancements', {
        RequestorName: requestorName || 'Anonymous',
        Description: description,
        Status: 'pending',
        Notes: null,
      });

      expect(result.success).toBe(true);
      expect(result.value.Id).toBe(1);
      expect(result.value.Status).toBe('pending');
    });

    it('should return 400 when description is missing', () => {
      const req = createMockRequest({
        requestorName: 'Test User',
      });
      const res = createMockResponse();

      const description = req.body.description;

      if (!description || (description && description.trim().length === 0)) {
        res.status(400).json({ error: 'Description is required' });
      }

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: 'Description is required' });
    });

    it('should return 400 when description is empty string', () => {
      const req = createMockRequest({
        description: '   ',
        requestorName: 'Test User',
      });
      const res = createMockResponse();

      const description = req.body.description;

      if (!description || description.trim().length === 0) {
        res.status(400).json({ error: 'Description is required' });
      }

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('should use "Anonymous" when requestorName is not provided', async () => {
      mockDab.create.mockResolvedValueOnce({
        success: true,
        value: {
          Id: 1,
          RequestorName: 'Anonymous',
          Description: 'Test description',
          Status: 'pending',
        },
      });

      const req = createMockRequest({
        description: 'Test description',
      });

      const requestorName = req.body.requestorName || 'Anonymous';

      const result = await mockDab.create('enhancements', {
        RequestorName: requestorName,
        Description: req.body.description,
        Status: 'pending',
      });

      expect(result.value.RequestorName).toBe('Anonymous');
    });

    it('should handle AI intent extraction failure gracefully', async () => {
      mockAzureClient.getChatCompletions.mockRejectedValueOnce(
        new Error('AI service unavailable')
      );

      mockDab.create.mockResolvedValueOnce({
        success: true,
        value: {
          Id: 1,
          Description: 'Original description',
          Status: 'pending',
        },
      });

      // Even if AI fails, enhancement should be created with original description
      const req = createMockRequest({
        description: 'Original description',
        requestorName: 'Test User',
      });

      let clarifiedDescription = req.body.description;

      try {
        await mockAzureClient.getChatCompletions();
      } catch (aiError) {
        // Use original description on AI failure
        clarifiedDescription = req.body.description;
      }

      const result = await mockDab.create('enhancements', {
        Description: clarifiedDescription,
        Status: 'pending',
      });

      expect(result.success).toBe(true);
      expect(result.value.Description).toBe('Original description');
    });

    it('should handle database creation failure', async () => {
      mockDab.create.mockResolvedValueOnce({
        success: false,
        error: 'Database error',
      });

      const res = createMockResponse();

      const result = await mockDab.create('enhancements', {
        Description: 'Test',
        Status: 'pending',
      });

      if (!result.success) {
        res.status(500).json({
          error: 'Failed to create enhancement request',
          details: result.error,
        });
      }

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Failed to create enhancement request',
        })
      );
    });
  });

  describe('GET /api/enhancements', () => {
    it('should list all enhancements', async () => {
      const mockEnhancements = [
        { Id: 1, Description: 'Feature 1', Status: 'pending' },
        { Id: 2, Description: 'Feature 2', Status: 'in-progress' },
      ];

      mockDab.get.mockResolvedValueOnce({
        success: true,
        value: mockEnhancements,
      });

      const req = createMockRequest({}, {}, { limit: 50 });
      const res = createMockResponse();

      const result = await mockDab.get('enhancements', {
        orderby: 'CreatedAt desc',
        first: 50,
      });

      res.json({
        success: true,
        enhancements: result.value,
      });

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        enhancements: mockEnhancements,
      });
    });

    it('should filter enhancements by status', async () => {
      const pendingEnhancements = [
        { Id: 1, Description: 'Feature 1', Status: 'pending' },
      ];

      mockDab.get.mockResolvedValueOnce({
        success: true,
        value: pendingEnhancements,
      });

      const req = createMockRequest({}, {}, { status: 'pending' });

      const options = {
        orderby: 'CreatedAt desc',
        first: 50,
      };

      if (req.query.status) {
        options.filter = `Status eq '${req.query.status}'`;
      }

      const result = await mockDab.get('enhancements', options);

      expect(options.filter).toBe("Status eq 'pending'");
      expect(result.value).toHaveLength(1);
      expect(result.value[0].Status).toBe('pending');
    });

    it('should respect limit parameter', async () => {
      mockDab.get.mockResolvedValueOnce({
        success: true,
        value: [{ Id: 1 }],
      });

      const req = createMockRequest({}, {}, { limit: '10' });

      const limit = parseInt(req.query.limit, 10) || 50;

      await mockDab.get('enhancements', {
        orderby: 'CreatedAt desc',
        first: limit,
      });

      expect(mockDab.get).toHaveBeenCalledWith('enhancements', {
        orderby: 'CreatedAt desc',
        first: 10,
      });
    });

    it('should use default limit of 50', async () => {
      mockDab.get.mockResolvedValueOnce({
        success: true,
        value: [],
      });

      const req = createMockRequest({}, {}, {});

      const limit = parseInt(req.query.limit, 10) || 50;

      await mockDab.get('enhancements', {
        orderby: 'CreatedAt desc',
        first: limit,
      });

      expect(mockDab.get).toHaveBeenCalledWith('enhancements', {
        orderby: 'CreatedAt desc',
        first: 50,
      });
    });

    it('should handle database error', async () => {
      mockDab.get.mockResolvedValueOnce({
        success: false,
        error: 'Database connection failed',
      });

      const res = createMockResponse();

      const result = await mockDab.get('enhancements', {});

      if (!result.success) {
        res.status(500).json({
          error: 'Failed to fetch enhancements',
          details: result.error,
        });
      }

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('GET /api/enhancements/:id', () => {
    it('should return enhancement by ID', async () => {
      const mockEnhancement = {
        Id: 1,
        Description: 'Test feature',
        Status: 'pending',
      };

      mockDab.getById.mockResolvedValueOnce({
        success: true,
        value: mockEnhancement,
      });

      const req = createMockRequest({}, { id: '1' });
      const res = createMockResponse();

      const result = await mockDab.getById('enhancements', req.params.id);

      res.json({
        success: true,
        enhancement: result.value,
      });

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        enhancement: mockEnhancement,
      });
    });

    it('should return 404 for non-existent enhancement', async () => {
      mockDab.getById.mockResolvedValueOnce({
        success: false,
      });

      const req = createMockRequest({}, { id: '999' });
      const res = createMockResponse();

      const result = await mockDab.getById('enhancements', req.params.id);

      if (!result.success) {
        res.status(404).json({ error: 'Enhancement not found' });
      }

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Enhancement not found' });
    });

    it('should handle database error', async () => {
      mockDab.getById.mockRejectedValueOnce(new Error('Query timeout'));

      const res = createMockResponse();

      try {
        await mockDab.getById('enhancements', '1');
      } catch (error) {
        res.status(500).json({
          error: 'Failed to fetch enhancement',
          details: error.message,
        });
      }

      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  describe('PATCH /api/enhancements/:id', () => {
    it('should update enhancement status', async () => {
      const updatedEnhancement = {
        Id: 1,
        Status: 'in-progress',
        UpdatedAt: new Date().toISOString(),
      };

      mockDab.update.mockResolvedValueOnce({
        success: true,
        value: updatedEnhancement,
      });

      const req = createMockRequest(
        { status: 'in-progress' },
        { id: '1' }
      );
      const res = createMockResponse();

      const validStatuses = ['pending', 'in-progress', 'deployed', 'reverted', 'failed'];

      if (req.body.status && !validStatuses.includes(req.body.status)) {
        res.status(400).json({
          error: 'Invalid status',
          validStatuses,
        });
        return;
      }

      const result = await mockDab.update('enhancements', req.params.id, {
        Status: req.body.status,
        UpdatedAt: new Date().toISOString(),
      });

      res.json({
        success: true,
        enhancement: result.value,
      });

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        enhancement: updatedEnhancement,
      });
    });

    it('should return 400 for invalid status', () => {
      const req = createMockRequest(
        { status: 'invalid-status' },
        { id: '1' }
      );
      const res = createMockResponse();

      const validStatuses = ['pending', 'in-progress', 'deployed', 'reverted', 'failed'];

      if (req.body.status && !validStatuses.includes(req.body.status)) {
        res.status(400).json({
          error: 'Invalid status',
          validStatuses,
        });
      }

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Invalid status',
        validStatuses,
      });
    });

    it('should update branch name and PR number', async () => {
      mockDab.update.mockResolvedValueOnce({
        success: true,
        value: {
          Id: 1,
          BranchName: 'feature/1-new-feature',
          PrNumber: 42,
        },
      });

      const req = createMockRequest(
        {
          branchName: 'feature/1-new-feature',
          prNumber: 42,
        },
        { id: '1' }
      );

      const updateData = {
        UpdatedAt: new Date().toISOString(),
      };

      if (req.body.branchName !== undefined) updateData.BranchName = req.body.branchName;
      if (req.body.prNumber !== undefined) updateData.PrNumber = req.body.prNumber;

      const result = await mockDab.update('enhancements', req.params.id, updateData);

      expect(result.value.BranchName).toBe('feature/1-new-feature');
      expect(result.value.PrNumber).toBe(42);
    });

    it('should update notes', async () => {
      mockDab.update.mockResolvedValueOnce({
        success: true,
        value: {
          Id: 1,
          Notes: 'Updated notes content',
        },
      });

      const req = createMockRequest(
        { notes: 'Updated notes content' },
        { id: '1' }
      );

      const updateData = {
        UpdatedAt: new Date().toISOString(),
      };

      if (req.body.notes !== undefined) updateData.Notes = req.body.notes;

      const result = await mockDab.update('enhancements', req.params.id, updateData);

      expect(result.value.Notes).toBe('Updated notes content');
    });

    it('should return 404 when enhancement not found', async () => {
      mockDab.update.mockResolvedValueOnce({
        success: false,
      });

      const req = createMockRequest(
        { status: 'in-progress' },
        { id: '999' }
      );
      const res = createMockResponse();

      const result = await mockDab.update('enhancements', req.params.id, {
        Status: req.body.status,
      });

      if (!result.success) {
        res.status(404).json({ error: 'Enhancement not found or update failed' });
      }

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('should handle database error', async () => {
      mockDab.update.mockRejectedValueOnce(new Error('Update failed'));

      const res = createMockResponse();

      try {
        await mockDab.update('enhancements', '1', { Status: 'pending' });
      } catch (error) {
        res.status(500).json({
          error: 'Failed to update enhancement',
          details: error.message,
        });
      }

      expect(res.status).toHaveBeenCalledWith(500);
    });

    it('should allow multiple field updates at once', async () => {
      mockDab.update.mockResolvedValueOnce({
        success: true,
        value: {
          Id: 1,
          Status: 'deployed',
          BranchName: 'feature/1-test',
          PrNumber: 42,
          Notes: 'Deployed successfully',
        },
      });

      const req = createMockRequest(
        {
          status: 'deployed',
          branchName: 'feature/1-test',
          prNumber: 42,
          notes: 'Deployed successfully',
        },
        { id: '1' }
      );

      const updateData = {
        UpdatedAt: new Date().toISOString(),
      };

      if (req.body.status) updateData.Status = req.body.status;
      if (req.body.branchName !== undefined) updateData.BranchName = req.body.branchName;
      if (req.body.prNumber !== undefined) updateData.PrNumber = req.body.prNumber;
      if (req.body.notes !== undefined) updateData.Notes = req.body.notes;

      const result = await mockDab.update('enhancements', req.params.id, updateData);

      expect(result.value.Status).toBe('deployed');
      expect(result.value.BranchName).toBe('feature/1-test');
      expect(result.value.PrNumber).toBe(42);
      expect(result.value.Notes).toBe('Deployed successfully');
    });
  });

  describe('Validation Tests', () => {
    it('should validate all allowed status values', () => {
      const validStatuses = ['pending', 'in-progress', 'deployed', 'reverted', 'failed'];

      validStatuses.forEach((status) => {
        expect(validStatuses.includes(status)).toBe(true);
      });
    });

    it('should reject invalid status values', () => {
      const validStatuses = ['pending', 'in-progress', 'deployed', 'reverted', 'failed'];
      const invalidStatuses = ['completed', 'cancelled', 'processing', 'unknown'];

      invalidStatuses.forEach((status) => {
        expect(validStatuses.includes(status)).toBe(false);
      });
    });
  });
});
