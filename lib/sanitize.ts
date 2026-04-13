/**
 * Strip dangerous HTML tags and attributes from user input.
 */
export function sanitizeHtml(text: string): string {
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, "")
    .replace(/<object[\s\S]*?<\/object>/gi, "")
    .replace(/<embed[\s\S]*?>/gi, "")
    .replace(/<link[\s\S]*?>/gi, "")
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "")
    .replace(/javascript\s*:/gi, "")
}

/**
 * Validate email format.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/**
 * Truncate string to max length.
 */
export function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) : str
}
