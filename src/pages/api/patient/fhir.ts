import { getSession } from 'next-auth/react'
import { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'

function safeDate(d?: Date | string | null){
  if (!d) return undefined
  const dt = typeof d === 'string' ? new Date(d) : d
  if (Number.isNaN(dt.getTime())) return undefined
  return dt.toISOString()
}

function tagVerified(entity:any){
  // try to detect if entity is AI-generated vs verified
  if (!entity) return { verification: 'unknown' }
  if (entity.status && typeof entity.status === 'string') return { verification: entity.status }
  return { verification: 'unknown' }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse){
  try {
    const session = await getSession({ req })
    if (!session) return res.status(401).json({ error: 'unauthenticated' })
    const user = (session as any).user
    const role = user.role

    // Only patient may export their own via this endpoint
    if (role !== 'PATIENT') return res.status(403).json({ error: 'forbidden' })

    const patient = await prisma.patient.findUnique({ where: { userId: user.id }, include: { user: true, documents: { include: { processing: true, extractions: true } }, timelines: true, summaries: true, consultations: true, ayushAssessments: true } })
    if (!patient) return res.status(404).json({ error: 'patient_not_found' })

  // Build FHIR bundle
  const resources:any[] = []

  // Patient resource
  const patientRes:any = {
    resourceType: 'Patient',
    id: patient.id,
    identifier: [],
    name: patient.user?.name ? [{ text: patient.user.name }] : undefined,
    gender: patient.gender || undefined,
    birthDate: patient.dob ? (new Date(patient.dob)).toISOString().slice(0,10) : undefined
  }
  if (patient.abhaId) patientRes.identifier.push({ system: 'https://abdm.gov.in/abha', value: patient.abhaId })
  resources.push(patientRes)

  // Documents -> DocumentReference
  for (const doc of patient.documents || []){
    const dr:any = {
      resourceType: 'DocumentReference',
      id: doc.id,
      status: 'current',
      type: { text: doc.category || doc.title },
      date: doc.documentDate ? safeDate(doc.documentDate) : safeDate(doc.uploadedAt),
      content: [{ attachment: { url: doc.url, title: doc.title } }],
      subject: { reference: `Patient/${patient.id}` },
      extension: [ { url: 'http://example.org/fhir/StructureDefinition/source-record-id', valueString: doc.id } ]
    }
    // include extraction metadata if present
    if (doc.extractions && doc.extractions.length) dr.extension.push({ url: 'http://example.org/fhir/StructureDefinition/extractions', valueString: JSON.stringify(doc.extractions) })
    if (doc.processing && doc.processing.length) dr.extension.push({ url: 'http://example.org/fhir/StructureDefinition/processing', valueString: JSON.stringify(doc.processing) })
    resources.push(dr)
  }

  // Timelines -> Condition / Observation / MedicationStatement
  for (const t of patient.timelines || []){
    const common:any = { resourceType: 'Observation', id: t.id, status: 'final', code: { text: t.title }, subject: { reference: `Patient/${patient.id}` }, effectiveDateTime: safeDate(t.date), note: [{ text: t.details || '' }], extension: [] }
    if (t.sourceDocumentId) common.extension.push({ url: 'http://example.org/fhir/StructureDefinition/source-document-id', valueString: t.sourceDocumentId })
    if (t.entryType === 'DIAGNOSIS'){
      const cond:any = { resourceType: 'Condition', id: t.id, code: { text: t.title }, subject: { reference: `Patient/${patient.id}` }, recordedDate: safeDate(t.date), note: [{ text: t.details || '' }], extension: common.extension }
      resources.push(cond)
    } else if (t.entryType === 'MEDICINE'){
      const med:any = { resourceType: 'MedicationStatement', id: t.id, subject: { reference: `Patient/${patient.id}` }, effectiveDateTime: safeDate(t.date), note: [{ text: t.details || '' }], extension: common.extension }
      resources.push(med)
    } else {
      resources.push(common)
    }
  }

  // Summaries -> Composition (with provenance)
  for (const s of patient.summaries || []){
    const comp:any = { resourceType: 'Composition', id: s.id, status: 'final', type: { text: 'Medical summary' }, subject: { reference: `Patient/${patient.id}` }, date: safeDate(s.createdAt), title: s.provider || 'AI/Service generated summary', section: [{ title: 'Patient summary', text: { status: 'generated', div: s.patientSummary || '' } }], extension: [{ url: 'http://example.org/fhir/StructureDefinition/summary-status', valueString: s.status || '' }] }
    resources.push(comp)
  }

  // AYUSH assessments -> Observation
  for (const a of patient.ayushAssessments || []){
    const obs:any = { resourceType: 'Observation', id: a.id, status: 'final', code: { text: 'AYUSH assessment' }, subject: { reference: `Patient/${patient.id}` }, effectiveDateTime: safeDate(a.createdAt), note: [{ text: a.note || '' }], extension: [{ url: 'http://example.org/fhir/StructureDefinition/ayush', valueString: JSON.stringify({ prakriti: a.prakriti, vikriti: a.vikriti }) }] }
    resources.push(obs)
  }

  // Encounters from consultations
  for (const c of patient.consultations || []){
    const enc:any = { resourceType: 'Encounter', id: c.id, status: c.status === 'IN_PROGRESS' ? 'in-progress' : 'finished', subject: { reference: `Patient/${patient.id}` }, period: c.scheduledAt ? { start: safeDate(c.scheduledAt) } : undefined }
    resources.push(enc)
  }

  // Build bundle
  const bundle = { resourceType: 'Bundle', type: 'document', entry: resources.map(r=>({ resource: r })) }
  // record audit
  await prisma.accessAudit.create({ data: { actorId: user.id, actorRole: 'PATIENT', patientId: patient.id, action: 'FHIR_EXPORT', note: 'Patient exported FHIR bundle' } })
  res.setHeader('Content-Type', 'application/fhir+json')
  return res.status(200).send(JSON.stringify(bundle))
  } catch (err) {
    console.error('patient fhir export error', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
