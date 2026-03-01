const admin = require('firebase-admin');

// Usage: set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON and run
// node functions/scripts/seedOfferings.js

if (!admin.apps.length) admin.initializeApp();
const db = admin.firestore();

async function seed() {
  const moduleId = process.argv[2] || 'INF101';
  const offerings = [
    { academicYear: '2026', term: 'Semester 1', moduleId, programme: 'CS' },
    { academicYear: '2026', term: 'Semester 2', moduleId, programme: 'CS' },
  ];

  for (const off of offerings) {
    const ref = await db.collection('offerings').add(off);
    console.log('Created offering', ref.id);
    // create groups A and B
    await db.collection('groups').add({ offeringId: ref.id, label: 'A', yearLevel: 1 });
    await db.collection('groups').add({ offeringId: ref.id, label: 'B', yearLevel: 1 });
  }

  console.log('Seeding done');
}

seed().catch((err) => { console.error(err); process.exit(1); });
