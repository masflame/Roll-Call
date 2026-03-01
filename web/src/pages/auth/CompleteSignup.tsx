// @ts-nocheck
import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "../../firebase";
import { isSignInWithEmailLink, signInWithEmailLink, createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs, serverTimestamp } from "firebase/firestore";
import Layout from "../../components/ui/Layout";

export default function CompleteSignup() {
  const [message, setMessage] = useState("Processing sign-in...");
  const [error, setError] = useState<string | null>(null);
  const [promptEmail, setPromptEmail] = useState<string>("");
  const [needEmail, setNeedEmail] = useState(false);
  const navigate = useNavigate();
  const [needPassword, setNeedPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const ranRef = useRef(false);
  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    async function upsertLecturerByEmail(email: string, uid: string, data: any) {
      try {
        const q = query(collection(db, "lecturers"), where("email", "==", email));
        const existing = await getDocs(q);
        if (!existing.empty) {
          const ids = existing.docs.map(d => d.id);
          // If there's already a doc with the target uid, keep it and delete all other duplicates
          if (ids.includes(uid)) {
            for (const id of ids) {
              if (id === uid) continue;
              try { await deleteDoc(doc(db, "lecturers", id)); } catch (e) { /* ignore */ }
            }
            await setDoc(doc(db, "lecturers", uid), { ...data, email, createdAt: serverTimestamp() }, { merge: true });
            return;
          }
          // Otherwise pick the first existing as migratedFrom, copy into uid and remove all old docs
          const migratedFrom = ids[0];
          await setDoc(doc(db, "lecturers", uid), { ...data, email, migratedFrom, migratedAt: serverTimestamp() }, { merge: true });
          for (const id of ids) {
            try { await deleteDoc(doc(db, "lecturers", id)); } catch (e) { /* ignore */ }
          }
          return;
        }
        await setDoc(doc(db, "lecturers", uid), { ...data, email, createdAt: serverTimestamp() }, { merge: true });
      } catch (e) {
        await setDoc(doc(db, "lecturers", uid), { ...data, email, createdAt: serverTimestamp() }, { merge: true });
      }
    }

    (async () => {
      try {
        const params = new URLSearchParams(window.location.search);
        const emailParam = params.get("email");

        // Same-device flow: if registration redirected here include ?email=...
        if (emailParam) {
          // If the app already has a signed-in Firebase user (Register created it), use that UID to upsert.
          if (auth.currentUser && auth.currentUser.email === emailParam) {
            try {
              const pendingRef = doc(db, "pendingRegistrations", emailParam);
              const pendingSnap = await getDoc(pendingRef);
              const pdata = pendingSnap.exists() ? (pendingSnap.data() as any) : {};
              const displayName = pdata.displayName || `${pdata.firstName || ""} ${pdata.lastName || ""}`.trim() || undefined;
              await upsertLecturerByEmail(emailParam, auth.currentUser.uid, { firstName: pdata.firstName || "", lastName: pdata.lastName || "", displayName: pdata.displayName || displayName, department: pdata.department || "" });
              try { await deleteDoc(doc(db, "pendingRegistrations", emailParam)); } catch {}
              try { localStorage.removeItem(`pendingPasswordFor:${emailParam}`); } catch {}
              setMessage("Registration complete — redirecting...");
              setTimeout(() => navigate("/"), 900);
              return;
            } catch (e: any) {
              console.error("Error finalizing same-device signup (existing user)", e);
              setError(String(e?.message || e));
              return;
            }
          }

          // Otherwise try same-device create using stored password (legacy flow)
          const pwd = (() => { try { return localStorage.getItem(`pendingPasswordFor:${emailParam}`) || "" } catch { return "" } })();
          if (pwd) {
            const cred = await createUserWithEmailAndPassword(auth, emailParam, pwd);
            try {
              const pendingRef = doc(db, "pendingRegistrations", emailParam);
              const pendingSnap = await getDoc(pendingRef);
              const pdata = pendingSnap.exists() ? (pendingSnap.data() as any) : {};
              const displayName = pdata.displayName || `${pdata.firstName || ""} ${pdata.lastName || ""}`.trim() || undefined;
              if (displayName) await updateProfile(cred.user, { displayName });
              await upsertLecturerByEmail(emailParam, cred.user.uid, { firstName: pdata.firstName || "", lastName: pdata.lastName || "", displayName: pdata.displayName || displayName, department: pdata.department || "" });
              try { await deleteDoc(doc(db, "pendingRegistrations", emailParam)); } catch {}
              try { localStorage.removeItem(`pendingPasswordFor:${emailParam}`); } catch {}
              setMessage("Registration complete — redirecting...");
              setTimeout(() => navigate("/"), 900);
              return;
            } catch (e: any) {
              console.error("Error finalizing same-device signup", e);
              setError(String(e?.message || e));
              return;
            }
          }

          setNeedPassword(true);
          setMessage("");
          return;
        }

        // Email-link flow
        if (!isSignInWithEmailLink(auth, window.location.href)) {
          setMessage("No sign-in link found in URL");
          return;
        }

        const storedEmail = (() => { try { return localStorage.getItem("emailForSignIn") || "" } catch { return "" } })();
        if (!storedEmail) {
          setNeedEmail(true);
          setMessage("");
          return;
        }

        const cred = await signInWithEmailLink(auth, storedEmail, window.location.href);
        const user = cred.user;
        const pendingRef = doc(db, "pendingRegistrations", storedEmail);
        const pendingSnap = await getDoc(pendingRef);
        if (!pendingSnap.exists()) {
          setError("No pending registration found for this email");
          return;
        }
        const pdata = pendingSnap.data() as any;
        await upsertLecturerByEmail(storedEmail, user.uid, { firstName: pdata.firstName || "", lastName: pdata.lastName || "", displayName: pdata.displayName || `${pdata.firstName || ""} ${pdata.lastName || ""}`.trim(), department: pdata.department || "" });
        try { await deleteDoc(pendingRef); } catch {}
        setMessage("Registration complete — redirecting...");
        setTimeout(() => navigate("/"), 900);
      } catch (err: any) {
        console.error("CompleteSignup failed", err);
        setError(err?.message || String(err));
      }
    })();
  }, [navigate]);

  return (
    <Layout>
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        {error && <div className="text-sm text-red-600">{error}</div>}
        {!error && !needEmail && <div className="text-sm text-text-muted">{message}</div>}

        {needEmail && (
          <div className="mx-auto max-w-sm">
            <p className="mb-3 text-sm text-text-muted">Enter the email address you used to request the sign-in link so we can complete registration on this device.</p>
            <input value={promptEmail} onChange={(e) => setPromptEmail(e.target.value)} placeholder="you@example.com" className="w-full rounded border px-3 py-2 mb-3" />
            <div className="flex gap-2">
              <button className="rounded bg-brand-primary px-4 py-2 text-white" onClick={async () => {
                setError(null);
                setMessage("Completing sign-in...");
                try {
                  if (!promptEmail) return setError("Please enter your email");
                  const cred = await signInWithEmailLink(auth, promptEmail, window.location.href);
                  const user = cred.user;
                  const pendingRef = doc(db, "pendingRegistrations", promptEmail);
                  const pendingSnap = await getDoc(pendingRef);
                  if (!pendingSnap.exists()) {
                    setError("No pending registration found for this email");
                    return;
                  }
                  const data = pendingSnap.data() as any;
                  try {
                    await upsertLecturerByEmail(promptEmail, user.uid, {
                      firstName: data.firstName || "",
                      lastName: data.lastName || "",
                      displayName: data.displayName || "",
                      department: data.department || "",
                    });
                  } catch (e) {
                    console.error('Failed to upsert lecturer in fallback flow', e);
                  }
                  try { await deleteDoc(pendingRef); } catch (e) { /* ignore */ }
                  setMessage("Registration complete — redirecting...");
                  setTimeout(() => navigate("/"), 900);
                } catch (err: any) {
                  console.error("CompleteSignup fallback failed", err);
                  setError(err?.message || String(err));
                }
              }}>Complete registration</button>
              <button className="rounded border px-4 py-2" onClick={() => { setNeedEmail(false); setMessage("No sign-in link found in URL"); }}>Cancel</button>
            </div>
          </div>
        )}
        {needPassword && (
          <div className="mx-auto max-w-sm">
            <p className="mb-3 text-sm text-text-muted">Enter a password to finish creating your account on this device.</p>
            <input value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} type="password" placeholder="Choose a password" className="w-full rounded border px-3 py-2 mb-3" />
            <div className="flex gap-2">
              <button className="rounded bg-brand-primary px-4 py-2 text-white" onClick={async () => {
                setVerifyingPassword(true);
                setError(null);
                try {
                  const params = new URLSearchParams(window.location.search);
                  const email = params.get('email');
                  if (!email) {
                    setError("Could not determine email from link");
                    setVerifyingPassword(false);
                    return;
                  }
                  const cred = await createUserWithEmailAndPassword(auth, email, passwordInput);
                  try {
                    const pendingRef = doc(db, "pendingRegistrations", email);
                    const pendingSnap = await getDoc(pendingRef);
                    const pdata = pendingSnap.exists() ? (pendingSnap.data() as any) : {};
                    const displayName = pdata.displayName || `${pdata.firstName || ""} ${pdata.lastName || ""}`.trim() || undefined;
                    if (displayName) {
                      try { await updateProfile(cred.user, { displayName }); } catch (e) { /* ignore */ }
                    }
                  } catch (e) { /* ignore */ }
                  // upsert lecturer doc by email
                  const pendingRef = doc(db, "pendingRegistrations", email);
                  const pendingSnap = await getDoc(pendingRef);
                  const data = pendingSnap.exists() ? (pendingSnap.data() as any) : {};
                  try {
                    await upsertLecturerByEmail(email, cred.user.uid, {
                      firstName: data.firstName || "",
                      lastName: data.lastName || "",
                      displayName: data.displayName || "",
                      department: data.department || "",
                    });
                  } catch (e) {
                    console.error('Failed to upsert lecturer in password finalize flow', e);
                  }
                  try { await deleteDoc(pendingRef); } catch (e) { /* ignore */ }
                  setMessage("Registration complete — redirecting...");
                  setTimeout(() => navigate("/"), 900);
                } catch (err: any) {
                  console.error("CompleteSignup password finalize failed", err);
                  setError(err?.message || String(err));
                } finally {
                  setVerifyingPassword(false);
                }
              }} disabled={verifyingPassword || !passwordInput}>{verifyingPassword ? 'Finishing…' : 'Finish registration'}</button>
              <button className="rounded border px-4 py-2" onClick={() => { setNeedPassword(false); setMessage('No sign-in link found in URL'); }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
