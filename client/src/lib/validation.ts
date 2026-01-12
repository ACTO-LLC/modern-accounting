/**
 * UUID validation regex pattern
 * Matches standard UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates that a string is a valid UUID format
 * @param id - The string to validate
 * @returns true if the string is a valid UUID, false otherwise
 */
export function isValidUUID(id: string | undefined | null): boolean {
  if (!id || typeof id !== 'string') {
    return false;
  }
  return UUID_REGEX.test(id);
}

/**
 * Validates a UUID and throws an error if invalid
 * @param id - The string to validate
 * @param fieldName - The name of the field for the error message
 * @throws Error if the ID is not a valid UUID
 */
export function validateUUID(id: string | undefined | null, fieldName: string = 'ID'): string {
  if (!isValidUUID(id)) {
    throw new Error(`Invalid ${fieldName}: must be a valid UUID format`);
  }
  return id as string;
}

/**
 * Safely formats a GUID for OData filter queries
 * Validates the GUID and returns it without quotes (DAB does not use quotes for GUIDs)
 * @param id - The GUID to format
 * @param fieldName - The name of the field for the error message
 * @returns The GUID string for use in OData filters (unquoted)
 */
export function formatGuidForOData(id: string | undefined | null, fieldName: string = 'ID'): string {
  const validatedId = validateUUID(id, fieldName);
  return validatedId;
}

/**
 * Validates that a date string is in valid format
 * @param dateStr - The date string to validate
 * @returns true if valid, false otherwise
 */
export function isValidDateString(dateStr: string | undefined | null): boolean {
  if (!dateStr || typeof dateStr !== 'string') {
    return false;
  }
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

/**
 * Validates that expirationDate is on or after issueDate
 * @param issueDate - The issue date string
 * @param expirationDate - The expiration date string
 * @returns true if expiration is on or after issue date, false otherwise
 */
export function isExpirationDateValid(issueDate: string, expirationDate: string | undefined | null): boolean {
  if (!expirationDate) {
    return true; // Expiration date is optional
  }
  if (!isValidDateString(issueDate) || !isValidDateString(expirationDate)) {
    return false;
  }
  return new Date(expirationDate) >= new Date(issueDate);
}

/**
 * Validates that an amount is a positive number
 * @param amount - The amount to validate
 * @returns true if positive, false otherwise
 */
export function isPositiveNumber(amount: number | undefined | null): boolean {
  return typeof amount === 'number' && !isNaN(amount) && amount >= 0;
}
