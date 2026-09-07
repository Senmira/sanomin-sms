// Seed announcements for SANOMIN SMS
// Run: bun run prisma/seed-announcements.ts
import { db } from '../src/lib/db'

const now = new Date()
function daysFromNow(d: number): Date {
  const dt = new Date(now)
  dt.setDate(dt.getDate() + d)
  return dt
}

async function main() {
  console.log('Seeding announcements...')
  const items = [
    {
      title: 'Annual Concert 2026 — Save the Date!',
      body: 'SANOMIN International Preschool is excited to announce our Annual Concert on Saturday, 27th September 2026 at 5:00 PM in the Main Hall. All students from Preschool, Daycare, Elocution, and Dancing programs will perform. Parents are kindly requested to confirm attendance by 20th September. Dress code details will be shared by class teachers.',
      category: 'Event',
      audience: 'All',
      priority: 'High',
      pinned: true,
      status: 'Published',
      publishDate: daysFromNow(-2),
      expiryDate: daysFromNow(25),
      authorName: 'Administrator',
    },
    {
      title: 'Term 3 Fees — Payment Reminder',
      body: 'This is a friendly reminder that Term 3 tuition fees for all programs (Preschool, Daycare, IT, Elocution, Dancing) are due by the 10th of this month. Payments can be made via Cash, Card, Bank Transfer, or Online. Please contact the accounts desk for fee statements and receipts. Late payments may incur a surcharge.',
      category: 'Payment',
      audience: 'Parents',
      priority: 'High',
      pinned: true,
      status: 'Published',
      publishDate: daysFromNow(-1),
      expiryDate: daysFromNow(10),
      authorName: 'Administrator',
    },
    {
      title: 'Staff Meeting — Wednesday 3:30 PM',
      body: 'All teaching staff (internal and external tuition teachers) are required to attend the weekly staff meeting on Wednesday at 3:30 PM in the Staff Room. Agenda: Term 3 curriculum review, upcoming concert preparations, and student progress discussion. Please bring your attendance records.',
      category: 'Meeting',
      audience: 'Teachers',
      priority: 'Normal',
      pinned: false,
      status: 'Published',
      publishDate: daysFromNow(0),
      expiryDate: daysFromNow(3),
      authorName: 'Administrator',
    },
    {
      title: 'Full Moon Poya Day — Holiday Notice',
      body: 'The preschool will be closed on the upcoming Full Moon Poya Day in observance of the public holiday. Daycare services will operate on a limited schedule (8:00 AM — 12:00 PM) for enrolled daycare students only. Regular classes will resume the following day. Please plan accordingly.',
      category: 'Holiday',
      audience: 'All',
      priority: 'Normal',
      pinned: false,
      status: 'Published',
      publishDate: daysFromNow(-3),
      expiryDate: daysFromNow(7),
      authorName: 'Administrator',
    },
    {
      title: 'Parent-Teacher Conference — Book Your Slot',
      body: 'Parent-Teacher conferences for Term 3 will be held on Friday from 2:00 PM to 5:00 PM. Each slot is 15 minutes. Please book your preferred time at the front desk or call us. This is a great opportunity to discuss your child\'s progress, strengths, and areas for development with their class teachers.',
      category: 'Event',
      audience: 'Parents',
      priority: 'Normal',
      pinned: false,
      status: 'Published',
      publishDate: daysFromNow(-1),
      expiryDate: daysFromNow(5),
      authorName: 'Administrator',
    },
    {
      title: 'New IT Lab Equipment Installed',
      body: 'We are pleased to inform that the IT Lab has been upgraded with 5 new computers and interactive learning software. IT classes (Beginners & Advanced) will now have hands-on sessions for every student. External IT teacher Mr. Ravi Bandara will conduct an orientation session this Sunday at 9:00 AM.',
      category: 'General',
      audience: 'All',
      priority: 'Low',
      pinned: false,
      status: 'Published',
      publishDate: daysFromNow(-5),
      expiryDate: daysFromNow(15),
      authorName: 'Administrator',
    },
    {
      title: 'Health & Vaccination Records Update',
      body: 'Parents are requested to submit updated health records and vaccination cards for all students by next Friday. This is a regulatory requirement for preschool licensing. Medical notes (allergies, conditions, medication) can be updated through the admin office. Please ensure emergency contact numbers are current.',
      category: 'Urgent',
      audience: 'Parents',
      priority: 'High',
      pinned: false,
      status: 'Published',
      publishDate: daysFromNow(0),
      expiryDate: daysFromNow(8),
      authorName: 'Administrator',
    },
    {
      title: 'Dancing Class Showcase — Friday',
      body: 'The Kandyan Dancing class (external teacher Mr. Kasun Nilantha) will hold a short showcase this Friday at 4:30 PM in the Dance Studio. Parents of enrolled dancing students are invited to attend and see what the children have learned this term. Duration: 30 minutes.',
      category: 'Event',
      audience: 'Parents',
      priority: 'Low',
      pinned: false,
      status: 'Published',
      publishDate: daysFromNow(-1),
      expiryDate: daysFromNow(4),
      authorName: 'Administrator',
    },
  ]

  for (const a of items) {
    await db.announcement.create({ data: a }).catch(() => null)
  }
  console.log(`Seeded ${items.length} announcements.`)
  const total = await db.announcement.count()
  console.log(`Total announcements: ${total}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
