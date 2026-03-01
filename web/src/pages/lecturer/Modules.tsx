// @ts-nocheck
import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addDoc, collection, deleteDoc, doc, onSnapshot, query, where } from "firebase/firestore";
import { getDelegateMode } from "../../lib/delegate";
import { db, auth } from "../../firebase";
import { Card, PrimaryButton, SecondaryButton, Input } from "../../components/ui";
import { User } from "firebase/auth";
// PageHeader intentionally removed from page (handled by layout)

interface Module {
  id: string;
  moduleCode: string;
  moduleName?: string;
}

function Modules() {
  const user: User | null = auth.currentUser;
  // delegate override
  const delegateMode = getDelegateMode();
  const ownerOverride = delegateMode ? delegateMode.ownerUid : null;
  const [modules, setModules] = useState<Module[]>([]);
  const [moduleCode, setModuleCode] = useState("");
  const [moduleName, setModuleName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!user && !ownerOverride) return;
    const modulesRef = collection(db, "modules");
    const q = ownerOverride ? query(modulesRef, where("lecturerId", "==", ownerOverride)) : query(modulesRef);
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs
        .filter((docSnap) => {
          if (ownerOverride) return true;
          return docSnap.data().lecturerId === user.uid;
        })
        .map((docSnap) => ({
          id: docSnap.id,
          moduleCode: docSnap.data().moduleCode as string,
          moduleName: (docSnap.data().moduleName as string) || ""
        }));
      setModules(data);
    });
    return () => unsubscribe();
  }, [user, ownerOverride]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      await addDoc(collection(db, "modules"), {
        lecturerId: user.uid,
        moduleCode,
        moduleName,
        createdAt: new Date().toISOString()
      });
      setModuleCode("");
      setModuleName("");
    } catch (err: any) {
      setError(err.message || "Failed to add module");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteDoc(doc(db, "modules", id));
  };

  return (
      <div className="space-y-8">
      

      <Card>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Add module</h2>
        <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-muted">Module code</label>
            <Input
              value={moduleCode}
              onChange={(event: any) => setModuleCode(event.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-muted">Module name</label>
            <Input
              value={moduleName}
              onChange={(event: any) => setModuleName(event.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="md:col-span-2 flex items-center justify-between">
            {error && <p className="text-sm text-accent-error">{error}</p>}
            <div className="ml-auto flex gap-3">
              <PrimaryButton type="submit" disabled={loading}>{loading ? "Saving..." : "Save module"}</PrimaryButton>
            </div>
          </div>
        </form>
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Module catalogue</h2>
            <p className="text-sm text-text-muted">Manage the modules available for attendance tracking.</p>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto rounded-md border border-stroke-subtle">
          <table className="min-w-full divide-y divide-stroke-subtle text-sm">
            <thead className="bg-surfaceAlt text-xs uppercase text-text-muted">
              <tr>
                <th className="px-4 py-2 text-left">Module code</th>
                <th className="px-4 py-2 text-left">Module name</th>
                <th className="px-4 py-2 text-left">Sessions</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stroke-subtle">
              {modules.map((mod) => (
                <tr key={mod.id} className="hover:bg-surfaceAlt/60">
                  <td className="px-4 py-2 font-medium text-text-primary">{mod.moduleCode}</td>
                  <td className="px-4 py-2 text-text-muted">
                    <div className="max-w-[220px] sm:max-w-[400px] overflow-x-auto whitespace-nowrap">{mod.moduleName || "—"}</div>
                  </td>
                  <td className="px-4 py-2 text-text-muted">--</td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex items-center gap-2">
                      <SecondaryButton onClick={() => handleDelete(mod.id)} className="!px-3 !py-1 !text-xs">Remove</SecondaryButton>
                      <SecondaryButton onClick={() => navigate(`/offerings/manage?moduleId=${mod.id}`)} className="!px-3 !py-1 !text-xs">Configure</SecondaryButton>
                    </div>
                  </td>
                </tr>
              ))}
              {modules.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-text-muted">
                    No modules recorded yet. Add your first module above.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export default Modules;
