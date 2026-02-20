import { Firestore, FieldValue } from "firebase-admin/firestore";

type BucketCounts = { "0-1": number; "1-3": number; "3-5": number; "5-10": number; ">10": number };

const emptyBuckets = (): BucketCounts => ({ "0-1": 0, "1-3": 0, "3-5": 0, "5-10": 0, ">10": 0 });

function weekKey(d: Date) {
  // ISO week-year key like 2026-W07
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  // Thursday in current week decides the year.
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((+tmp - +yearStart) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export async function recomputeModuleStats(db: Firestore, days = 30) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const sessionsSnap = await db.collection("sessions").where("createdAt", ">=", cutoff).get();

  const modules: Map<string, any> = new Map();

  for (const sessionDoc of sessionsSnap.docs) {
    const session = sessionDoc.data() as any;
    const moduleId = session.moduleId || session.moduleCode || "unknown";

    const attendanceSnap = await sessionDoc.ref.collection("attendance").get();
    const attendanceCount = attendanceSnap.size;

    const createdAt = session.createdAt?.toDate ? session.createdAt.toDate() : new Date(session.createdAt);
    const day = createdAt.toLocaleString("en-US", { weekday: "short" });
    const hour = String(createdAt.getHours()).padStart(2, "0");
    const heatKey = `${day}_${hour}`;
    const week = weekKey(createdAt);

    // per-session metrics
    const minutes: number[] = [];
    let buckets = emptyBuckets();

    attendanceSnap.forEach((a: any) => {
      const d = a.data();
      const submittedAt = d.submittedAt?.toDate ? d.submittedAt.toDate() : d.submittedAt ? new Date(d.submittedAt) : null;
      if (!submittedAt) return;
      const mins = (submittedAt.getTime() - createdAt.getTime()) / 60000;
      minutes.push(mins);
      if (mins <= 1) buckets["0-1"]++;
      else if (mins <= 3) buckets["1-3"]++;
      else if (mins <= 5) buckets["3-5"]++;
      else if (mins <= 10) buckets["5-10"]++;
      else buckets[">10"]++;
    });

    const median = minutes.length ? minutes.sort((a, b) => a - b)[Math.floor(minutes.length / 2)] : null;

    const sessionStats = {
      sessionId: sessionDoc.id,
      moduleId,
      createdAt: FieldValue.serverTimestamp(),
      attendanceCount,
      checkinBuckets: buckets,
      medianCheckinMinutes: median,
      dayOfWeek: day,
      hourOfDay: createdAt.getHours(),
    };

    // write sessionStats
    await db.collection("sessionStats").doc(sessionDoc.id).set(sessionStats, { merge: true });

    // accumulate to module, store session-level metadata for later per-student computations
    if (!modules.has(moduleId)) {
      modules.set(moduleId, {
        sessions: 0,
        totalAttendance: 0,
        buckets: emptyBuckets(),
        medians: [] as any[],
        heatmap: {} as Record<string, { sessions: number; totalAttendance: number }> ,
        weekly: {} as Record<string, { sessions: number; totalAttendance: number }> ,
        sessionList: [] as any[],
        moduleCode: session.moduleCode || null,
        moduleTitle: session.moduleTitle || session.moduleName || null
      });
    }

    const m = modules.get(moduleId);
    m.sessions += 1;
    m.totalAttendance += attendanceCount;
    if (median !== null) m.medians.push({ sessionId: sessionDoc.id, median, day, hour: createdAt.getHours() });
    Object.keys(buckets).forEach((k) => {
      m.buckets[k as keyof BucketCounts] += buckets[k as keyof BucketCounts];
    });

    m.heatmap[heatKey] = m.heatmap[heatKey] || { sessions: 0, totalAttendance: 0 };
    m.heatmap[heatKey].sessions += 1;
    m.heatmap[heatKey].totalAttendance += attendanceCount;

    m.weekly[week] = m.weekly[week] || { sessions: 0, totalAttendance: 0 };
    m.weekly[week].sessions += 1;
    m.weekly[week].totalAttendance += attendanceCount;

    // capture attendance rows for student-level computation
    const attendanceRows: any[] = [];
    attendanceSnap.forEach((a: any) => {
      const d = a.data();
      const submittedAt = d.submittedAt?.toDate ? d.submittedAt.toDate() : d.submittedAt ? new Date(d.submittedAt) : null;
      const mins = submittedAt ? (submittedAt.getTime() - createdAt.getTime()) / 60000 : null;
      attendanceRows.push({ studentNumber: d.studentNumber, submittedAt, minutes: mins, audit: d.audit || {}, status: d.status || "Present" });
    });

    m.sessionList.push({ sessionId: sessionDoc.id, createdAt, attendanceCount, attendanceRows, windowSeconds: session.settings?.windowSeconds || 60, moduleCode: session.moduleCode || null, title: session.title || null });
  }

  // persist module stats
  for (const [moduleId, data] of modules.entries()) {
    const avgAttendance = data.sessions ? data.totalAttendance / data.sessions : 0;
    const medianCheckin = data.medians.length
      ? (data.medians.map((x: any) => x.median).sort((a: number, b: number) => a - b)[Math.floor(data.medians.length / 2)])
      : null;

    const checkinCurveTotal = ((Object.values(data.buckets) as number[]).reduce((s: number, v: number) => s + v, 0) || 1) as number;
    const checkinCurve: Record<string, number> = {};
    Object.keys(data.buckets).forEach((k) => {
      const val = Number(data.buckets[k as keyof BucketCounts] || 0);
      checkinCurve[k] = Math.round((val / checkinCurveTotal) * 10000) / 100; // percent
    });

    // compute a few quick insights
    const lowestSlot = Object.entries(data.heatmap || {}).reduce((acc: any, [k, v]) => {
      const vt = v as any;
      const avg = vt.sessions ? vt.totalAttendance / vt.sessions : 0;
      if (!acc || avg < acc.avg) return { key: k, avg };
      return acc;
    }, null as any);

    const fastestSession = (data.medians || []).reduce((acc: any, item: any) => {
      if (!item || item.median == null) return acc;
      if (!acc || item.median < acc.median) return { sessionId: item.sessionId, median: item.median };
      return acc;
    }, null as any);

    const out = {
      moduleId,
      moduleCode: data.moduleCode || moduleId,
      moduleTitle: data.moduleTitle || null,
      computedAt: FieldValue.serverTimestamp(),
      windowDays: days,
      sessionsCount: data.sessions,
      avgAttendance,
      totalAttendance: data.totalAttendance,
      medianCheckinMinutes: medianCheckin,
      checkinCurvePercent: checkinCurve,
      latenessBuckets: data.buckets,
      heatmap: data.heatmap,
      weekly: data.weekly,
      insights: {
        lowestSlot: lowestSlot ? { slot: lowestSlot.key, avg: Math.round(lowestSlot.avg * 100) / 100 } : null,
        fastestSession: fastestSession ? { sessionId: fastestSession.sessionId, median: fastestSession.median } : null
      }
    };

    // Try to find a canonical module document from sessions with explicit module fields
    try {
      const byModuleId = await db.collection("sessions").where("moduleId", "==", moduleId).limit(1).get();
      let found: any = null;
      if (!byModuleId.empty) found = byModuleId.docs[0].data();
      if (!found) {
        const byModuleCode = await db.collection("sessions").where("moduleCode", "==", moduleId).limit(1).get();
        if (!byModuleCode.empty) found = byModuleCode.docs[0].data();
      }
      if (found) {
        const mc = found.moduleCode || found.moduleId || out.moduleCode;
        const mt = found.moduleTitle || found.moduleName || null;
        out.moduleCode = mc || out.moduleCode;
        // Only set moduleTitle if an explicit module-level title/name is present (avoid session.title)
        if (mt) out.moduleTitle = mt;
      }
    } catch (e) {
      // ignore
    }

    await db.collection("moduleStats").doc(moduleId).set(out, { merge: true });

    // compute per-student metrics within window
    // build student presence map across ordered sessions
    const sessionsOrdered = (data.sessionList || []).slice().sort((a: any, b: any) => +a.createdAt - +b.createdAt);
    const studentMap: Record<string, any> = {};
    const totalSessions = sessionsOrdered.length;

    // load roster for this module (if present) to enrich student names
    const rosterSnap = await db.collection("moduleRosters").doc(moduleId).collection("students").get();
    const rosterMap: Record<string, any> = {};
    rosterSnap.forEach((r: any) => {
      const d: any = r.data();
      const sn = String(d.studentNumber || d.id || d.number || "").trim();
      if (sn) rosterMap[sn] = { name: d.name || "", surname: d.surname || "", email: d.email || "" };
    });

    for (const s of sessionsOrdered) {
      const presentSet = new Set<string>();
      for (const r of s.attendanceRows || []) {
        const sn = String(r.studentNumber || "").trim();
        if (!sn) continue;
        presentSet.add(sn);
        if (!studentMap[sn]) {
          studentMap[sn] = { studentNumber: sn, attendedCount: 0, lateCount: 0, appearances: [], lastSeenAt: null, minutes: [], name: null, surname: null, email: null };
          // seed from roster if available
          if (rosterMap[sn]) {
            studentMap[sn].name = rosterMap[sn].name || null;
            studentMap[sn].surname = rosterMap[sn].surname || null;
            studentMap[sn].email = rosterMap[sn].email || null;
          }
        }

        studentMap[sn].attendedCount += 1;
        if (typeof r.minutes === "number" && s.windowSeconds && r.minutes * 60 > s.windowSeconds) {
          studentMap[sn].lateCount += 1;
        }
        studentMap[sn].appearances.push(true);
        if (r.submittedAt) studentMap[sn].lastSeenAt = r.submittedAt;
        // prefer attendance-provided names if present
        if (!studentMap[sn].name && r.name) studentMap[sn].name = r.name;
        if (!studentMap[sn].surname && r.surname) studentMap[sn].surname = r.surname;
        if (typeof r.minutes === "number") studentMap[sn].minutes.push(r.minutes);
      }

      // mark absence for seen students: to compute streaks we need per-session falses for students who have been observed before
      for (const sn of Object.keys(studentMap)) {
        if (!presentSet.has(sn)) studentMap[sn].appearances.push(false);
      }
    }

    // persist student docs
    const batch = db.batch();
    let studentsProcessed = 0;
    for (const [sn, sdata] of Object.entries(studentMap)) {
      const appearances: boolean[] = sdata.appearances || [];
      // compute longest and current streak
      let longest = 0;
      let current = 0;
      let temp = 0;
      for (let i = 0; i < appearances.length; i++) {
        if (appearances[i]) {
          temp += 1;
          if (temp > longest) longest = temp;
        } else {
          temp = 0;
        }
      }
      // current streak: count trues from end
      for (let i = appearances.length - 1; i >= 0; i--) {
        if (appearances[i]) current += 1;
        else break;
      }

      const attended = Number(sdata.attendedCount || 0);
      const late = Number(sdata.lateCount || 0);
      const consistency = totalSessions > 0 ? Math.round((attended / totalSessions) * 10000) / 100 : 0; // percent
      const chronicLate = attended > 0 ? late / attended > 0.5 : false;
      const riskBand = consistency >= 80 ? "Green" : consistency >= 50 ? "Amber" : "Red";

      const studentDoc = {
        studentNumber: sn,
        attendedCount: attended,
        lateCount: late,
        currentStreak: current,
        longestStreak: longest,
        consistencyPercent: consistency,
        riskBand,
        chronicLate,
        lastSeenAt: sdata.lastSeenAt || null,
        computedAt: FieldValue.serverTimestamp(),
        totalSessions
      } as any;

      const docRef = db.collection("moduleStudents").doc(moduleId).collection("students").doc(sn);
      batch.set(docRef, studentDoc, { merge: true });
      studentsProcessed++;
      // Firestore batch limit handling: commit every 400 ops
      if (studentsProcessed % 400 === 0) {
        await batch.commit();
      }
    }
    await batch.commit();

    // attach count to moduleStats for convenience
    await db.collection("moduleStats").doc(moduleId).set({ studentCount: Object.keys(studentMap).length }, { merge: true });
  }

  return { modulesProcessed: modules.size };
}

