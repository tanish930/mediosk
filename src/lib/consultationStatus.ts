const JOINABLE = new Set(['READY', 'SCHEDULED', 'IN_PROGRESS'])

export function canJoinConsultation(status?: string | null): boolean {
  return Boolean(status && JOINABLE.has(status))
}

export function consultationStatusLabel(status?: string | null): string {
  switch (status) {
    case 'IN_PROGRESS': return 'In Progress'
    case 'READY': return 'Ready'
    case 'SCHEDULED': return 'Scheduled'
    case 'REQUESTED': return 'Waiting for Doctor'
    case 'PENDING': return 'Waiting for Doctor'
    case 'COMPLETED': return 'Completed'
    case 'CANCELLED': return 'Cancelled'
    case '':
    case null:
    case undefined: return 'Unknown'
    default: return status
  }
}