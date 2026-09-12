const { PrismaClient, Role, HospitalDoctorStatus } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

const demoAccounts = [
  {
    email: 'patient@mediosk.demo',
    password: 'Patient@123',
    name: 'Demo Patient',
    role: Role.PATIENT,
    profile: (userId) =>
      prisma.patient.upsert({
        where: { userId },
        update: {},
        create: { userId }
      })
  },
  {
    email: 'doctor@mediosk.demo',
    password: 'Doctor@123',
    name: 'Demo Doctor',
    role: Role.DOCTOR,
    profile: (userId) =>
      prisma.doctor.upsert({
        where: { userId },
        update: {},
        create: { userId }
      })
  },
  {
    email: 'hospital@mediosk.demo',
    password: 'Hospital@123',
    name: 'Demo Hospital',
    role: Role.HOSPITAL,
    profile: (userId) =>
      prisma.hospital.upsert({
        where: { userId },
        update: {},
        create: { userId }
      })
  }
]

async function main() {
  const profiles = {}

  // Create or update demo accounts and their profiles.
  for (const account of demoAccounts) {
    const hashedPassword = await bcrypt.hash(account.password, 12)

    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: {
        name: account.name,
        role: account.role,
        hashedPassword
      },
      create: {
        email: account.email,
        name: account.name,
        role: account.role,
        hashedPassword
      }
    })

    const profile = await account.profile(user.id)

    profiles[account.email] = profile
  }

  const doctor = profiles['doctor@mediosk.demo']
  const hospital = profiles['hospital@mediosk.demo']

  // Link the demo doctor to the demo hospital.
  const relationship = await prisma.hospitalDoctor.findFirst({
    where: {
      hospitalId: hospital.id,
      doctorId: doctor.id
    }
  })

  if (relationship) {
    await prisma.hospitalDoctor.update({
      where: {
        id: relationship.id
      },
      data: {
        status: HospitalDoctorStatus.ACTIVE
      }
    })

    console.log('Demo Doctor is already linked; relationship set to ACTIVE.')
  } else {
    await prisma.hospitalDoctor.create({
      data: {
        hospitalId: hospital.id,
        doctorId: doctor.id,
        status: HospitalDoctorStatus.ACTIVE
      }
    })

    console.log('Demo Doctor linked to Demo Hospital as ACTIVE.')
  }

  console.log('Demo accounts and hospital-doctor relationship seeded.')
}

main()
  .then(() => console.log('Seed completed successfully.'))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())