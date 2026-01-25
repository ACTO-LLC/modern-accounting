import sql from 'mssql';
import { v4 as uuidv4 } from 'uuid';
import {
  UserOnboarding,
  UserFeatureProgress,
  ExperienceLevel
} from './types/feature.js';

let pool: sql.ConnectionPool | null = null;

export async function getPool(): Promise<sql.ConnectionPool> {
  if (pool && pool.connected) {
    return pool;
  }

  const config: sql.config = {
    server: process.env.DB_SERVER?.split(',')[0] || 'localhost',
    port: parseInt(process.env.DB_SERVER?.split(',')[1] || '14330'),
    database: process.env.DB_NAME || 'AccountingDB',
    user: process.env.DB_USER || 'sa',
    password: process.env.DB_PASSWORD || '',
    options: {
      encrypt: false,
      trustServerCertificate: process.env.DB_TRUST_CERT === 'true'
    }
  };

  pool = await sql.connect(config);
  return pool;
}

export async function ensureTablesExist(): Promise<void> {
  const p = await getPool();

  // Create UserOnboarding table if not exists
  await p.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'UserOnboarding')
    BEGIN
      CREATE TABLE UserOnboarding (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        UserId UNIQUEIDENTIFIER NOT NULL UNIQUE,
        ExperienceLevel VARCHAR(20) NULL,
        PrimaryGoal VARCHAR(50) NULL,
        ShowAllFeatures BIT DEFAULT 0,
        OnboardingCompleted BIT DEFAULT 0,
        CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
        UpdatedAt DATETIME2 DEFAULT GETUTCDATE()
      );
      CREATE INDEX IX_UserOnboarding_UserId ON UserOnboarding(UserId);
    END
  `);

  // Create UserFeatureProgress table if not exists
  await p.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'UserFeatureProgress')
    BEGIN
      CREATE TABLE UserFeatureProgress (
        Id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        UserId UNIQUEIDENTIFIER NOT NULL,
        FeatureKey VARCHAR(50) NOT NULL,
        Status VARCHAR(20) DEFAULT 'locked',
        UnlockedAt DATETIME2 NULL,
        StartedAt DATETIME2 NULL,
        CompletedAt DATETIME2 NULL,
        CurrentStep INT NULL,
        TotalSteps INT NULL,
        CONSTRAINT UQ_UserFeatureProgress UNIQUE(UserId, FeatureKey)
      );
      CREATE INDEX IX_UserFeatureProgress_UserId ON UserFeatureProgress(UserId);
    END
  `);
}

// User Onboarding functions
export async function getUserOnboarding(userId: string): Promise<UserOnboarding | null> {
  const p = await getPool();
  const result = await p.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`
      SELECT Id, UserId, ExperienceLevel, PrimaryGoal, ShowAllFeatures,
             OnboardingCompleted, CreatedAt, UpdatedAt
      FROM UserOnboarding
      WHERE UserId = @userId
    `);

  if (result.recordset.length === 0) return null;

  const row = result.recordset[0];
  return {
    id: row.Id,
    userId: row.UserId,
    experienceLevel: row.ExperienceLevel,
    primaryGoal: row.PrimaryGoal,
    showAllFeatures: row.ShowAllFeatures,
    onboardingCompleted: row.OnboardingCompleted,
    createdAt: row.CreatedAt,
    updatedAt: row.UpdatedAt
  };
}

export async function createUserOnboarding(userId: string): Promise<UserOnboarding> {
  const p = await getPool();
  const id = uuidv4();

  await p.request()
    .input('id', sql.UniqueIdentifier, id)
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`
      INSERT INTO UserOnboarding (Id, UserId)
      VALUES (@id, @userId)
    `);

  return {
    id,
    userId,
    experienceLevel: null,
    primaryGoal: null,
    showAllFeatures: false,
    onboardingCompleted: false,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

export async function updateUserOnboarding(
  userId: string,
  updates: Partial<Pick<UserOnboarding, 'experienceLevel' | 'primaryGoal' | 'showAllFeatures' | 'onboardingCompleted'>>
): Promise<void> {
  const p = await getPool();
  const request = p.request().input('userId', sql.UniqueIdentifier, userId);

  const setClauses: string[] = ['UpdatedAt = GETUTCDATE()'];

  if (updates.experienceLevel !== undefined) {
    request.input('experienceLevel', sql.VarChar(20), updates.experienceLevel);
    setClauses.push('ExperienceLevel = @experienceLevel');
  }
  if (updates.primaryGoal !== undefined) {
    request.input('primaryGoal', sql.VarChar(50), updates.primaryGoal);
    setClauses.push('PrimaryGoal = @primaryGoal');
  }
  if (updates.showAllFeatures !== undefined) {
    request.input('showAllFeatures', sql.Bit, updates.showAllFeatures);
    setClauses.push('ShowAllFeatures = @showAllFeatures');
  }
  if (updates.onboardingCompleted !== undefined) {
    request.input('onboardingCompleted', sql.Bit, updates.onboardingCompleted);
    setClauses.push('OnboardingCompleted = @onboardingCompleted');
  }

  await request.query(`
    UPDATE UserOnboarding
    SET ${setClauses.join(', ')}
    WHERE UserId = @userId
  `);
}

// User Feature Progress functions
export async function getUserFeatureProgress(userId: string): Promise<UserFeatureProgress[]> {
  const p = await getPool();
  const result = await p.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .query(`
      SELECT Id, UserId, FeatureKey, Status, UnlockedAt, StartedAt,
             CompletedAt, CurrentStep, TotalSteps
      FROM UserFeatureProgress
      WHERE UserId = @userId
    `);

  return result.recordset.map((row: any) => ({
    id: row.Id,
    userId: row.UserId,
    featureKey: row.FeatureKey,
    status: row.Status,
    unlockedAt: row.UnlockedAt,
    startedAt: row.StartedAt,
    completedAt: row.CompletedAt,
    currentStep: row.CurrentStep,
    totalSteps: row.TotalSteps
  }));
}

export async function getFeatureProgress(userId: string, featureKey: string): Promise<UserFeatureProgress | null> {
  const p = await getPool();
  const result = await p.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('featureKey', sql.VarChar(50), featureKey)
    .query(`
      SELECT Id, UserId, FeatureKey, Status, UnlockedAt, StartedAt,
             CompletedAt, CurrentStep, TotalSteps
      FROM UserFeatureProgress
      WHERE UserId = @userId AND FeatureKey = @featureKey
    `);

  if (result.recordset.length === 0) return null;

  const row = result.recordset[0];
  return {
    id: row.Id,
    userId: row.UserId,
    featureKey: row.FeatureKey,
    status: row.Status,
    unlockedAt: row.UnlockedAt,
    startedAt: row.StartedAt,
    completedAt: row.CompletedAt,
    currentStep: row.CurrentStep,
    totalSteps: row.TotalSteps
  };
}

export async function unlockFeature(userId: string, featureKey: string): Promise<void> {
  const p = await getPool();
  const id = uuidv4();

  // Upsert - update if exists, insert if not
  await p.request()
    .input('id', sql.UniqueIdentifier, id)
    .input('userId', sql.UniqueIdentifier, userId)
    .input('featureKey', sql.VarChar(50), featureKey)
    .query(`
      MERGE UserFeatureProgress AS target
      USING (SELECT @userId AS UserId, @featureKey AS FeatureKey) AS source
      ON target.UserId = source.UserId AND target.FeatureKey = source.FeatureKey
      WHEN MATCHED AND target.Status = 'locked' THEN
        UPDATE SET Status = 'unlocked', UnlockedAt = GETUTCDATE()
      WHEN NOT MATCHED THEN
        INSERT (Id, UserId, FeatureKey, Status, UnlockedAt)
        VALUES (@id, @userId, @featureKey, 'unlocked', GETUTCDATE());
    `);
}

export async function startFeature(userId: string, featureKey: string, totalSteps?: number): Promise<void> {
  const p = await getPool();

  await p.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('featureKey', sql.VarChar(50), featureKey)
    .input('totalSteps', sql.Int, totalSteps || null)
    .query(`
      UPDATE UserFeatureProgress
      SET Status = 'in_progress',
          StartedAt = GETUTCDATE(),
          CurrentStep = 1,
          TotalSteps = @totalSteps
      WHERE UserId = @userId AND FeatureKey = @featureKey
    `);
}

export async function updateFeatureStep(userId: string, featureKey: string, currentStep: number): Promise<void> {
  const p = await getPool();

  await p.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('featureKey', sql.VarChar(50), featureKey)
    .input('currentStep', sql.Int, currentStep)
    .query(`
      UPDATE UserFeatureProgress
      SET CurrentStep = @currentStep
      WHERE UserId = @userId AND FeatureKey = @featureKey
    `);
}

export async function completeFeature(userId: string, featureKey: string): Promise<void> {
  const p = await getPool();

  await p.request()
    .input('userId', sql.UniqueIdentifier, userId)
    .input('featureKey', sql.VarChar(50), featureKey)
    .query(`
      UPDATE UserFeatureProgress
      SET Status = 'completed', CompletedAt = GETUTCDATE()
      WHERE UserId = @userId AND FeatureKey = @featureKey
    `);
}

export async function unlockAllFeatures(userId: string, featureKeys: string[]): Promise<void> {
  const p = await getPool();

  for (const featureKey of featureKeys) {
    await unlockFeature(userId, featureKey);
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.close();
    pool = null;
  }
}
