import { getServerSession } from 'next-auth/next'
import { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { prisma } from '../../../lib/prisma'
import { authOptions } from '../auth/[...nextauth]'
import { detectRedFlag } from '../../../lib/redFlags'

const BodySchema = z.object({ sessionId: z.string(), createAlert: z.boolean().optional(), hospitalId: z.string().optional() })

function computeSeverityFromReport(report: any, complaint?: string, lang?: string | null) {
  // Deterministic shared multilingual red-flag scan over the report content.
  const text = [
    report.chiefComplaint || '',
    report.onsetDuration || '',
    report.character || '',
    complaint || '',
  ].join(' ')
  const detection = detectRedFlag(text, lang)
  if (detection.severity !== 'NORMAL') return detection.severity

  // If report contains explicit redFlags JSON array with entries
  try{ if (Array.isArray(report.redFlags) && report.redFlags.length>0) return 'EMERGENCY' }catch(e){}

  // fallback to severity field if present
  const sev = (report.severity||'').toLowerCase()
  if (sev.includes('severe') || sev.includes('critical')) return 'EMERGENCY'
  if (sev.includes('moderate')) return 'URGENT'
  return 'NORMAL'
}

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  const session = await getServerSession(req, res, authOptions)
  if (!session) return res.status(401).json({ error: 'unauthenticated' })

  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid' })
  const { sessionId, createAlert } = parsed.data

  const sess = await prisma.preConsultationSession.findUnique({ where: { id: sessionId }, include: { report: true } })
  if (!sess) return res.status(404).json({ error: 'session not found' })

  // ensure patient owns the session when caller is PATIENT
  if ((session as any).user.role === 'PATIENT'){
    const patient = await prisma.patient.findUnique({ where: { userId: (session as any).user.id } })
    if (!patient || patient.id !== sess.patientId) return res.status(403).json({ error: 'forbidden' })
  }

  const severity = computeSeverityFromReport(sess.report||{}, sess.complaint, sess.language)

  let alert = null
  if (createAlert && (severity === 'URGENT' || severity === 'EMERGENCY')){
    const consultation = await prisma.consultation.findFirst({ where: { sessionId: sess.id } })
    const data:any = {
      patientId: sess.patientId,
      consultationId: consultation?.id || null,
      severity,
      reason: sess.report?.chiefComplaint || sess.complaint || null,
      source: 'PRECONSULTATION',
      createdBy: (session as any).user.id
    }
    if (parsed.data.hospitalId) data.hospitalId = parsed.data.hospitalId
    alert = await prisma.emergencyAlert.create({ data })

    await prisma.accessAudit.create({ data: { actorId: (session as any).user.id, actorRole: (session as any).user.role, patientId: sess.patientId, consultationId: consultation?.id || null, action: 'EMERGENCY_ALERT_CREATED', note: severity + (parsed.data.hospitalId ? ' routed_to_hospital:'+parsed.data.hospitalId : '') } })
  }

  return res.json({ severity, alert })
}
