// @ts-nocheck
import { useEffect, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import PageHeader from "../../components/PageHeader";
import { auth, db } from "../../firebase";

interface LecturerProfile {
  firstName?: string;
  lastName?: string;
  displayName?: string;
  email?: string;
  department?: string;
  createdAt?: string;
}

function Profile() {
  const user = auth.currentUser;
  const [profile, setProfile] = useState<LecturerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const loadProfile = async () => {
      if (!user) {
        setError("No authenticated lecturer found.");
        setLoading(false);
        return;
      }
      try {
        const ref = doc(db, "lecturers", user.uid);
        const snapshot = await getDoc(ref);
        if (!active) return;
        if (snapshot.exists()) {
          const data = snapshot.data() as LecturerProfile;
          setProfile({
            ...data,
            email: data.email || user.email || undefined,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : user.metadata?.creationTime
          });
        } else {
          setProfile({
            firstName: user.displayName?.split(" ")[0] || "",
            lastName: user.displayName?.split(" ").slice(1).join(" ") || "",
            displayName: user.displayName || "",
            email: user.email || "",
            department: "",
            createdAt: user.metadata?.creationTime || ""
          });
        }
      } catch (err: any) {
        if (!active) return;
        setError(err.message || "Failed to load profile data");
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadProfile();
    return () => {
      active = false;
    };
  }, [user]);

  const fullName = profile?.displayName || `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim();

  return (
    <div className="space-y-8">
      <PageHeader title="My profile" description="Review your lecturer details." showBack={false} />
      <section className="rounded-md border border-stroke-subtle bg-surface p-6 shadow-subtle">
        {loading ? (
          <p className="text-sm text-text-muted">Loading profile...</p>
        ) : error ? (
          <p className="text-sm text-accent-error">{error}</p>
        ) : (
          <dl className="grid gap-5 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase text-text-muted">Full name</dt>
              <dd className="mt-1 text-sm text-text-primary">{fullName || "--"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-text-muted">Email</dt>
              <dd className="mt-1 text-sm text-text-primary">{profile?.email || user?.email || "--"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-text-muted">Department</dt>
              <dd className="mt-1 text-sm text-text-primary">{profile?.department || "--"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-text-muted">Account created</dt>
              <dd className="mt-1 text-sm text-text-primary">{profile?.createdAt || "--"}</dd>
            </div>
          </dl>
        )}
      </section>
    </div>
  );
}

export default Profile;
