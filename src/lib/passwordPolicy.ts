export interface PasswordPolicy {
  minLength: number
  requireUppercase: boolean
  requireLowercase: boolean
  requireDigit: boolean
}

export const PASSWORD_POLICY: PasswordPolicy = {
  minLength: 8,
  requireUppercase: true,
  requireLowercase: true,
  requireDigit: true,
}

export function validatePassword(password: string): string | null {
  if (!password) return 'Password is required.'
  if (password.length < PASSWORD_POLICY.minLength)
    return `Password must be at least ${PASSWORD_POLICY.minLength} characters long.`
  if (PASSWORD_POLICY.requireUppercase && !/[A-Z]/.test(password))
    return 'Password must include at least one uppercase letter.'
  if (PASSWORD_POLICY.requireLowercase && !/[a-z]/.test(password))
    return 'Password must include at least one lowercase letter.'
  if (PASSWORD_POLICY.requireDigit && !/[0-9]/.test(password))
    return 'Password must include at least one digit.'
  return null
}

export function passwordHelpText(): string {
  const parts: string[] = [`at least ${PASSWORD_POLICY.minLength} characters`]
  if (PASSWORD_POLICY.requireUppercase) parts.push('an uppercase letter')
  if (PASSWORD_POLICY.requireLowercase) parts.push('a lowercase letter')
  if (PASSWORD_POLICY.requireDigit) parts.push('a number')
  if (parts.length === 1) return parts[0]
  const last = parts.pop()
  return `${parts.join(', ')} and ${last}`
}