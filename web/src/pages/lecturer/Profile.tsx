// @ts-nocheck
import { } from "react";
import { useNavigate } from "react-router-dom";
// PageHeader removed; heading now part of layout
import { auth, db } from "../../firebase";
import { useProfile } from "../../lib/hooks/useProfile";
import { PrimaryButton, Card } from "../../components/ui";

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
  const { data: profile, isLoading: loading, error } = useProfile(user?.uid);
  const navigate = useNavigate();

  // profile is provided by `useProfile` hook (React Query + local persistence)

  const fullName = profile?.displayName || `${profile?.firstName || ""} ${profile?.lastName || ""}`.trim();

  return (
    <div className="space-y-8">
      <Card>
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
      </Card>

      <Card className="shadow-none">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Compliance & Exports</h3>
            <p className="mt-1 text-sm text-text-muted">Generate audit and accreditation export bundles (CSV/PDF).</p>
          </div>
          <div>
            <PrimaryButton onClick={() => navigate("/settings/compliance")} className="!px-4 !py-2.5">Open</PrimaryButton>
          </div>
        </div>
      </Card>

      <Card className="shadow-none">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text-primary">Account</h3>
            <p className="mt-1 text-sm text-text-muted">Manage email and password for your account.</p>
          </div>
          <div>
            <PrimaryButton onClick={() => navigate("/settings/account")} className="!px-4 !py-2.5">Open</PrimaryButton>
          </div>
        </div>
      </Card>
    </div>
  );
}

export default Profile;
