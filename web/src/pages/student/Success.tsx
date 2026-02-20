// @ts-nocheck
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Layout from "../../components/ui/Layout";

interface SuccessState {
  moduleCode?: string;
  title?: string;
}

function Success() {
  const navigate = useNavigate();
  const { sessionId } = useParams<{ sessionId: string }>();
  const state = useLocation().state as SuccessState | null;

  return (
    <Layout>
      <div className="flex items-center justify-center px-6 text-text-primary">
        <div className="w-full max-w-md space-y-4 rounded-md border border-stroke-subtle bg-surface p-8 text-center shadow-subtle">
          <div className="space-y-2">
            <span className="text-xs font-semibold uppercase tracking-[0.3em] text-brand-primary">RollCall</span>
            <h1 className="text-2xl font-semibold">Attendance recorded</h1>
            <p className="text-sm text-text-muted">
              {state?.moduleCode} {state?.title ? `• ${state.title}` : ""}
            </p>
          </div>
          <p className="text-sm text-text-muted">You may close this page.</p>
          <button
            type="button"
            className="w-full rounded-md bg-brand-primary px-4 py-2 text-sm font-semibold text-white transition hover:opacity-95"
            onClick={() => navigate(`/s/${sessionId}`)}
          >
            Submit again
          </button>
        </div>
      </div>
    </Layout>
  );
}

export default Success;
