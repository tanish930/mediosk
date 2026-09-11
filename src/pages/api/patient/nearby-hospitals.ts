import { getSession } from 'next-auth/react'
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { prisma } from '../../../lib/prisma'

const BodySchema = z.object({ lat: z.number().optional(), lng: z.number().optional(), q: z.string().optional(), radius: z.number().optional() })

export default async function handler(req:NextApiRequest,res:NextApiResponse){
  const session = await getSession({ req })
  if (!session) return res.status(401).json({ error: 'unauthenticated' })
  const role = (session as any).user?.role
  if (role !== 'PATIENT') return res.status(403).json({ error: 'forbidden' })

  if (req.method !== 'POST') return res.status(405).json({ error: 'method' })
  const parsed = BodySchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: 'invalid' })
  const { lat, lng, q, radius } = parsed.data
  if ((!lat || !lng) && !q) return res.status(400).json({ error: 'need_location_or_query' })

  try{
    // Search registered platform hospitals from the database so they have a valid Hospital.id
    // to use for Consultation.hospitalId assignments.
    const dbHospitals = await prisma.hospital.findMany({
      where: q ? {
        OR: [
          { user: { name: { contains: q, mode: 'insensitive' } } },
          { address: { contains: q, mode: 'insensitive' } }
        ]
      } : undefined,
      include: { user: true },
      take: 10
    })

    const results = dbHospitals.map(h => ({
      id: h.id,
      name: h.user?.name || 'Registered Hospital',
      address: h.address || 'Address not provided',
      // We don't have lat/lng stored for demo hospitals by default,
      // but this ensures the ID is a valid foreign key.
    }))

    return res.json({ hospitals: results })
  }catch(e:any){
    console.error('nearby-hospitals error', e)
    return res.status(500).json({ error: 'provider_error', message: e?.message })
  }
}
