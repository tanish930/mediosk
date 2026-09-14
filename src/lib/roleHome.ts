export function roleHomePath(role: string | null | undefined): string | null {
  switch (role) {
    case 'PATIENT':
      return '/dashboard/patient'
    case 'DOCTOR':
      return '/dashboard/doctor'
    case 'HOSPITAL':
      return '/dashboard/hospital'
    default:
      return null
  }
}