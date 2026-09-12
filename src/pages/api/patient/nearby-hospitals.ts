import { getSession } from 'next-auth/react'
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { prisma } from '../../../lib/prisma'
import { findNearbyHospitals } from '../../../lib/maps'

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

  try{
    let results: any[] = []

    // If coordinates are explicitly provided and we are expected to find nearby via maps API:
    if (lat && lng && !q) {
      try {
        results = await findNearbyHospitals(lat, lng, q, radius || 5000, 10)
      } catch (err) {
        console.error('maps API error, falling back to database', err)
      }
    }

    // If external maps API didn't return anything or if it's a fallback search (no lat/lng or manual query):
    if (results.length === 0) {
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

      results = dbHospitals.map(h => ({
        id: h.id,
        name: h.user?.name || 'Registered Hospital',
        address: h.address || 'Address not provided'
      }))
    }

    return res.json({ hospitals: results })
  }catch(e:any){
    console.error('nearby-hospitals error', e)
    return res.status(500).json({ error: 'provider_error', message: e?.message })
  }
}
