// @ts-nocheck
import { FormEvent, useEffect, useState } from "react";
import { addDoc, collection, deleteDoc, doc, onSnapshot, query } from "firebase/firestore";
import { db, auth } from "../../firebase";
import { User } from "firebase/auth";
import PageHeader from "../../components/PageHeader";

interface Module {
  id: string;
  moduleCode: string;
  moduleName?: string;
}

function Modules() {
  const user: User | null = auth.currentUser;
  const [modules, setModules] = useState<Module[]>([]);
  const [moduleCode, setModuleCode] = useState("");
  const [moduleName, setModuleName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    const modulesRef = collection(db, "modules");
    const unsubscribe = onSnapshot(query(modulesRef), (snapshot) => {
      const data = snapshot.docs
        .filter((docSnap) => docSnap.data().lecturerId === user.uid)
        .map((docSnap) => ({
          id: docSnap.id,
          moduleCode: docSnap.data().moduleCode as string,
          moduleName: (docSnap.data().moduleName as string) || ""
        }));
      setModules(data);
    });
    return () => unsubscribe();
  }, [user]);

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
      <PageHeader title="Modules" description="Organise the classes you deliver this term." showBack={false} />

      <section className="rounded-md border border-stroke-subtle bg-surface p-6 shadow-subtle">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Add module</h2>
        <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-muted">Module code</label>
            <input
              className="w-full rounded-md border border-stroke-subtle px-4 py-3 text-base focus:border-brand-primary focus:outline-none"
              value={moduleCode}
              onChange={(event) => setModuleCode(event.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-text-muted">Module name</label>
            <input
              className="w-full rounded-md border border-stroke-subtle px-4 py-3 text-base focus:border-brand-primary focus:outline-none"
              value={moduleName}
              onChange={(event) => setModuleName(event.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="md:col-span-2 flex items-center justify-between">
            {error && <p className="text-sm text-accent-error">{error}</p>}
            <div className="ml-auto flex gap-3">
              <button
                type="submit"
                className="rounded-lg bg-brand-primary px-5 py-3 text-base font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:bg-stroke-strong"
                disabled={loading}
              >
                {loading ? "Saving..." : "Save module"}
              </button>
            </div>
          </div>
        </form>
      </section>

      <section className="rounded-md border border-stroke-subtle bg-surface p-6 shadow-subtle">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-text-primary">Module catalogue</h2>
            <p className="text-sm text-text-muted">Manage the modules available for attendance tracking.</p>
          </div>
        </div>
        <div className="mt-4 overflow-hidden rounded-md border border-stroke-subtle">
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
                  <td className="px-4 py-2 text-text-muted">{mod.moduleName || "—"}</td>
                  <td className="px-4 py-2 text-text-muted">--</td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        className="rounded-md border border-stroke-subtle px-3 py-1 text-xs font-medium text-text-muted transition hover:bg-surfaceAlt"
                        onClick={() => handleDelete(mod.id)}
                      >
                        Remove
                      </button>
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
      </section>
    </div>
  );
}

export default Modules;
