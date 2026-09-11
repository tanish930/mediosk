# Mediosk Development Rules

## Project

Mediosk is an SIH 2026 project for Problem Statement 26047:

AI-Powered Patient Case-Taking & Medical History Platform.

The system supports:
- Patient portal
- Doctor portal
- Hospital portal
- AI-assisted medical document processing
- Adaptive pre-consultation
- Structured symptom reports
- Medical history timeline
- Emergency/red-flag workflow
- Doctor review and verification
- Hospital workflow
- Teleconsultation

The system assists doctors and must not replace clinical judgment.

---

## Technology Stack

- Next.js
- TypeScript
- Next.js Pages Router
- React
- Tailwind CSS
- Prisma
- PostgreSQL
- NextAuth
- Zod
- WebRTC for consultation

---

## Critical Architecture Rules

### 1. Keep the Pages Router

The project currently uses:

src/pages

Do NOT migrate the application to the App Router.

Do NOT replace the Pages Router architecture unless explicitly requested.

### 2. Preserve working WebRTC

The patient-doctor WebRTC consultation is currently working.

Do NOT modify WebRTC signaling, joining, ICE handling, or consultation media code unless the task explicitly concerns WebRTC.

If a task does not require WebRTC changes, leave it untouched.

### 3. Preserve authentication

The application uses NextAuth and role-based access.

Roles:

- PATIENT
- DOCTOR
- HOSPITAL

Do not weaken authentication or authorization to make a feature work.

Prefer secure server-side authorization.

### 4. Protect medical data

Patient medical information is sensitive.

Never expose one patient's information to another patient.

Hospital and doctor access must respect authorization and consent rules.

Do not return unnecessary medical information from APIs.

### 5. Database changes

The database uses Prisma and PostgreSQL.

Before changing the schema:

1. Inspect the existing schema.
2. Determine whether the change is actually necessary.
3. Make the smallest safe change.
4. Generate Prisma client.
5. Create a migration when appropriate.

Never delete existing production-style data or migrations.

### 6. Do not invent integrations

External integrations such as:

- ABDM
- ABHA
- ambulance services
- hospital systems
- maps
- telemedicine providers

must not be presented as real integrations unless credentials/API access actually exists.

For the prototype, use clearly labeled mock/demo workflows when necessary.

### 7. AI safety

AI-generated medical information must be clearly distinguishable from doctor-verified information.

Use the workflow:

AI Generated -> Reviewed -> Verified

AI output must assist the doctor and must not be presented as a medical diagnosis or replacement for clinical judgment.

### 8. Emergency workflow

Emergency detection should use a combination of rule-based red flags and contextual AI where implemented.

Do not silently claim that an emergency service, ambulance, hospital API, or external authority was contacted unless a real integration exists.

### 9. Small focused changes

Prefer the smallest change that correctly implements the requested feature.

Do not rewrite unrelated files.

Do not remove working functionality just to simplify implementation.

Before modifying a file, inspect the existing implementation.

### 10. Existing APIs

Reuse existing APIs and components when appropriate.

Do not create duplicate endpoints or duplicate pages when an existing implementation can be extended safely.

---

## Required Validation

After making changes, run:

npx prisma generate

npx tsc --noEmit

npm run build

If the project has relevant tests, run them as well.

Do not claim a task is complete if validation fails.

If validation fails because of an unrelated pre-existing issue, clearly report it.

---

## Git Rules

Work on a feature branch.

Do NOT push directly to main unless explicitly instructed.

Do NOT force push.

Do NOT delete branches.

Do NOT commit secrets.

Never commit:

.env
.env.local
credentials
API keys
database passwords
private tokens

Create focused commits with descriptive messages.

---

## Task Discipline

Before implementing a complex task:

1. Inspect the relevant existing code.
2. Explain the implementation plan.
3. Identify files that will change.
4. Implement only the requested feature.
5. Run validation.
6. Report changed files and validation results.

If a requirement is ambiguous, make a reasonable safe assumption and state it instead of making large architectural changes.

---

## Important Current State

The following functionality is already working and must be preserved:

Patient:
- Login
- Pre-consultation
- Consultation request

Doctor:
- Login
- Patient queue
- Assign consultation
- Case sheet
- Review/verification
- Join consultation

Teleconsultation:
- Patient and doctor can connect
- Two-way video works
- Two-way audio works
- Leave consultation works

Treat this functionality as a protected baseline.