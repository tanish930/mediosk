export interface DocumentAccessContext {
  role: string
  documentPatientId: string
  actorPatientId?: string
  assignedToDoctor?: boolean
  consentGranted?: boolean
}

export function canReadDocument(ctx: DocumentAccessContext): boolean {
  if (ctx.role === 'PATIENT') {
    return Boolean(ctx.actorPatientId && ctx.actorPatientId === ctx.documentPatientId)
  }
  if (ctx.role === 'DOCTOR') {
    return Boolean(ctx.assignedToDoctor || ctx.consentGranted)
  }
  return false
}

export interface SessionAccessContext {
  session: { patientId: string } | null | undefined
  patientId: string
}

export function canAccessSession(ctx: SessionAccessContext): boolean {
  return Boolean(ctx.session && ctx.session.patientId === ctx.patientId)
}