import { getToken } from 'next-auth/jwt'
import type { NextApiRequest, NextApiResponse } from 'next'
import { prisma } from '../../../../lib/prisma'

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET })
  if (!token) return res.status(401).json({ error: 'Unauthorized' })
  const role = token.role as string
  const userId = token.id as string
  if (!userId) return res.status(401).json({ error: 'Unauthorized' })
  if (role !== 'HOSPITAL') return res.status(403).json({ error: 'Forbidden' })

  // find hospital record for this user
  const hospital = await prisma.hospital.findUnique({ where: { userId } })
  if (!hospital) return res.status(404).json({ error: 'Hospital not found' })

  if (req.method === 'GET'){
    const alerts = await prisma.emergencyAlert.findMany({ where: { hospitalId: hospital.id }, orderBy: { createdAt: 'desc' }, include: { patient: { include: { user: true } }, consultation: true } })
    return res.json({ alerts })
  }

  res.setHeader('Allow','GET')
  res.status(405).end('Method Not Allowed')
}
