import { getSession } from 'next-auth/react'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../lib/prisma'

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  if (req.method !== 'GET') return res.status(405).end()
  const session = await getSession({ req })
  if (!session) return res.status(401).json({ error: 'unauthenticated' })
  const role = (session as any).user.role
  if (role !== 'PATIENT') return res.status(403).json({ error: 'forbidden' })

  const patient = await prisma.patient.findUnique({ where: { userId: (session as any).user.id } })
  if (!patient) return res.status(404).json({ error: 'patient_not_found' })

 const consultations = await prisma.consultation.findMany({
  where: {
    patientId: patient.id
  },
  include: {
    doctor: {
      include: {
        user: true
      }
    },
    hospital: {
      include: {
        user: true
      }
    }
  },
  orderBy: {
    createdAt: 'desc'
  }
})
  return res.json({ consultations })
}