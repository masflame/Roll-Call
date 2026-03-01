// @ts-nocheck
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../../components/ui/Layout";
import { auth, db } from "../../firebase";
import { 
  doc, 
  getDoc, 
  query, 
  collection, 
  where, 
  getDocs, 
  onSnapshot, 
  orderBy 
} from "firebase/firestore";
import {
  Users,
  Shield,
  Mail,
  Clock,
  Calendar,
  User,
  FileText,
  AlertCircle,
  CheckCircle,
  XCircle,
  ChevronRight,
  ArrowLeft,
  Copy,
  ExternalLink,
  Activity,
  Globe,
  Smartphone,
  Laptop,
  BookOpen,
  Filter,
  Search,
  RefreshCw,
  Download
} from "lucide-react";

function roleLabel(r: string) {
  switch (r) {
    case "CO_LECTURER":
      return "Co-lecturer";
    case "TA":
      return "Teaching Assistant";
    case "READ_ONLY":
      return "Read-only";
    default:
      return r;
  }
}

function roleDescription(r: string) {
  switch (r) {
    case "CO_LECTURER":
      return "Can create sessions, manage attendance, and invite others";
    case "TA":
      return "Can create sessions and manage attendance";
    case "READ_ONLY":
      return "Can view sessions and attendance only";
    default:
      return "";
  }
}

function roleIcon(r: string) {
  switch (r) {
    case "CO_LECTURER":
      return Shield;
    case "TA":
      return Users;
    case "READ_ONLY":
      return BookOpen;
    default:
      return Users;
  }
}

function RoleBadge({ role }: { role: string }) {
  const Icon = roleIcon(role);
  const colors = {
    CO_LECTURER: "bg-purple-100 text-purple-700 border-purple-200",
    TA: "bg-blue-100 text-blue-700 border-blue-200",
    READ_ONLY: "bg-gray-100 text-gray-700 border-gray-200"
  };
  
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border ${colors[role] || colors.READ_ONLY}`}>
      <Icon className="h-3 w-3" />
      {roleLabel(role)}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors = {
    ACTIVE: "bg-emerald-100 text-emerald-700 border-emerald-200",
    PENDING: "bg-amber-100 text-amber-700 border-amber-200",
    REVOKED: "bg-red-100 text-red-700 border-red-200",
    EXPIRED: "bg-gray-100 text-gray-700 border-gray-200",
    LEFT: "bg-gray-100 text-gray-700 border-gray-200"
  };
  
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border ${colors[status] || colors.PENDING}`}>
      {status}
    </span>
  );
}

function InfoCard({ icon: Icon, title, value, subtitle, className = "" }: any) {
  return (
    <div className={`bg-gray-50 rounded-lg p-4 ${className}`}>
      <div className="flex items-start gap-3">
        <div className="bg-white rounded-lg p-2 shadow-sm">
          <Icon className="h-4 w-4 text-gray-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-500">{title}</p>
          <p className="text-sm font-medium text-gray-900 mt-1 truncate">{value}</p>
          {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
        </div>
      </div>
    </div>
  );
}

function AuditLogEntry({ log }: { log: any }) {
  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    
    return date.toLocaleString();
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'DELEGATE_LEFT':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'DELEGATE_JOINED':
        return <CheckCircle className="h-4 w-4 text-emerald-500" />;
      case 'ACCESS_REVOKED':
        return <Shield className="h-4 w-4 text-amber-500" />;
      case 'SESSION_STARTED':
        return <Activity className="h-4 w-4 text-blue-500" />;
      default:
        return <FileText className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className="p-4 hover:bg-gray-50 transition-colors">
      <div className="flex items-start gap-3">
        <div className="bg-gray-100 rounded-lg p-2 mt-0.5">
          {getActionIcon(log.action)}
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-900">{log.action}</h4>
            <span className="text-xs text-gray-500">{formatTime(log.createdAt)}</span>
          </div>
          
          <div className="mt-1 space-y-1">
            <p className="text-xs text-gray-600">
              <span className="font-medium">Actor:</span> {log.actorUid || 'System'} 
              {log.actorRole && ` (${roleLabel(log.actorRole)})`}
            </p>
            
            {log.targetId && (
              <p className="text-xs text-gray-600">
                <span className="font-medium">Target:</span> {log.targetId}
              </p>
            )}
            
            {log.meta && Object.keys(log.meta).length > 0 && (
              <div className="mt-2 bg-gray-100 rounded p-2">
                <p className="text-xs font-mono text-gray-700 break-all">
                  {JSON.stringify(log.meta, null, 2)}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InviteCard({ invite }: { invite: any }) {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    const link = `${window.location.origin}/accept-invite?inviteId=${invite.id}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isExpired = invite.expiresAt && new Date(invite.expiresAt) < new Date();

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className="bg-blue-100 rounded-lg p-2">
            <Mail className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-900">{invite.granteeEmail}</h4>
            <div className="flex items-center gap-2 mt-1">
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                isExpired 
                  ? 'bg-red-100 text-red-700' 
                  : 'bg-emerald-100 text-emerald-700'
              }`}>
                {isExpired ? 'Expired' : 'Active'}
              </span>
              {invite.acceptedAt && (
                <span className="text-xs text-gray-500">
                  Accepted: {invite.acceptedAt?.toDate 
                    ? invite.acceptedAt.toDate().toLocaleDateString() 
                    : new Date(invite.acceptedAt).toLocaleDateString()}
                </span>
              )}
            </div>
            {invite.expiresAt && (
              <p className="text-xs text-gray-500 mt-2">
                Expires: {invite.expiresAt?.toDate 
                  ? invite.expiresAt.toDate().toLocaleString() 
                  : new Date(invite.expiresAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>

        <button
          onClick={handleCopyLink}
          className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          {copied ? (
            <>
              <CheckCircle className="h-3 w-3 text-emerald-500" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy Link
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default function SharedAccessManage() {
  const { accessId } = useParams();
  const navigate = useNavigate();
  const user = auth.currentUser;

  const [access, setAccess] = useState<any | null>(null);
  const [invites, setInvites] = useState<any[]>([]);
  const [audits, setAudits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [auditFilter, setAuditFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (!accessId) return;
    
    let mounted = true;
    
    const loadData = async () => {
      try {
        // Load access document
        const aRef = doc(db, "moduleAccess", accessId);
        const aSnap = await getDoc(aRef);
        
        if (!aSnap.exists()) {
          if (mounted) setLoading(false);
          return;
        }
        
        const a = { id: aSnap.id, ...(aSnap.data() as any) };
        if (!mounted) return;
        setAccess(a);

        // Load invites
        const q = query(collection(db, "invites"), where("accessId", "==", accessId));
        const snap = await getDocs(q);
        const arr: any[] = [];
        snap.forEach((d) => arr.push({ id: d.id, ...(d.data() as any) }));
        if (!mounted) return;
        setInvites(arr);
        
        setLoading(false);
      } catch (e) {
        console.error("Error loading access data:", e);
        if (mounted) setLoading(false);
      }
    };

    loadData();

    return () => { mounted = false; };
  }, [accessId]);

  // Audit logs: owner-wide and access-specific
  useEffect(() => {
    if (!accessId || !user) return;

    // Owner-wide logs
    const ownerQ = query(
      collection(db, "auditLogs"), 
      where("ownerUid", "==", user.uid), 
      orderBy("createdAt", "desc")
    );
    
    const ownerUnsub = onSnapshot(ownerQ, (snap) => {
      const arr: any[] = [];
      snap.forEach((d) => arr.push({ id: d.id, ...(d.data() as any), _source: 'owner' }));
      setAudits((prev) => {
        const map = new Map(prev.map(p => [p.id, p]));
        arr.forEach(r => map.set(r.id, r));
        return Array.from(map.values())
          .sort((a, b) => {
            const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return bTime - aTime;
          });
      });
    });

    // Access-specific logs (meta.accessId)
    const accessQ1 = query(
      collection(db, "auditLogs"), 
      where("meta.accessId", "==", accessId), 
      orderBy("createdAt", "desc")
    );
    
    // Access-specific logs (targetId)
    const accessQ2 = query(
      collection(db, "auditLogs"), 
      where("targetId", "==", accessId), 
      orderBy("createdAt", "desc")
    );

    const accessUnsub1 = onSnapshot(accessQ1, (snap) => {
      const arr: any[] = [];
      snap.forEach((d) => arr.push({ id: d.id, ...(d.data() as any), _source: 'access' }));
      setAudits((prev) => {
        const map = new Map(prev.map(p => [p.id, p]));
        arr.forEach(r => map.set(r.id, r));
        return Array.from(map.values())
          .sort((a, b) => {
            const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return bTime - aTime;
          });
      });
    });

    const accessUnsub2 = onSnapshot(accessQ2, (snap) => {
      const arr: any[] = [];
      snap.forEach((d) => arr.push({ id: d.id, ...(d.data() as any), _source: 'access' }));
      setAudits((prev) => {
        const map = new Map(prev.map(p => [p.id, p]));
        arr.forEach(r => map.set(r.id, r));
        return Array.from(map.values())
          .sort((a, b) => {
            const aTime = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
            const bTime = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
            return bTime - aTime;
          });
      });
    });

    return () => { 
      ownerUnsub(); 
      accessUnsub1(); 
      accessUnsub2(); 
    };
  }, [accessId, user]);

  const filteredAudits = audits.filter(log => {
    if (auditFilter !== 'all' && log.action !== auditFilter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        (log.action || '').toLowerCase().includes(term) ||
        (log.actorUid || '').toLowerCase().includes(term) ||
        JSON.stringify(log.meta || {}).toLowerCase().includes(term)
      );
    }
    return true;
  });

  const uniqueActions = [...new Set(audits.map(log => log.action))];

  if (!accessId) {
    return (
      <Layout>
        <div className="mx-0 w-full max-w-full px-0 py-6">
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Invalid Access</h2>
            <p className="text-sm text-gray-500">No access ID specified.</p>
            <button
              onClick={() => navigate('/settings/shared-access')}
              className="mt-4 inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Return to Shared Access
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  if (loading) {
    return (
      <Layout>
        <div className="mx-0 w-full max-w-full px-0 py-6">
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <div className="flex items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
            </div>
            <p className="text-sm text-gray-500 text-center mt-4">Loading access details...</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (!access) {
    return (
      <Layout>
        <div className="mx-0 w-full max-w-full px-0 py-6">
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Access Not Found</h2>
            <p className="text-sm text-gray-500">This shared access may have been deleted.</p>
            <button
              onClick={() => navigate('/settings/shared-access')}
              className="mt-4 inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Return to Shared Access
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  const Icon = roleIcon(access.role);

  return (
    <Layout>
      <div className="mx-0 w-full max-w-full px-0 py-6">
        {/* Header with back button */}
        <button
          onClick={() => navigate('/settings/shared-access')}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Shared Access
        </button>

        {/* Main Content */}
        <div className="space-y-6">
          {/* Access Details Card */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="bg-gray-900 rounded-lg p-2">
                    <Users className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h1 className="text-xl font-semibold text-gray-900">Access Management</h1>
                    <p className="text-sm text-gray-500 mt-0.5">ID: {access.id}</p>
                  </div>
                </div>
                <StatusBadge status={access.status} />
              </div>
            </div>

            <div className="p-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <InfoCard
                  icon={User}
                  title="Grantee"
                  value={access.granteeName || access.granteeEmail || access.granteeUid || 'Pending'}
                  subtitle={access.granteeEmail && access.granteeEmail !== access.granteeName ? access.granteeEmail : undefined}
                />
                
                <InfoCard
                  icon={Icon}
                  title="Role"
                  value={roleLabel(access.role)}
                  subtitle={roleDescription(access.role)}
                />
                
                <InfoCard
                  icon={BookOpen}
                  title="Scope"
                  value={access.scope?.modules ? `${access.scope.modules.length} module(s)` : 'All modules'}
                />
                
                {access.expiresAt && (
                  <InfoCard
                    icon={Calendar}
                    title="Expires"
                    value={access.expiresAt?.toDate 
                      ? access.expiresAt.toDate().toLocaleDateString() 
                      : new Date(access.expiresAt).toLocaleDateString()}
                  />
                )}
                
                <InfoCard
                  icon={Clock}
                  title="Created"
                  value={access.createdAt?.toDate 
                    ? access.createdAt.toDate().toLocaleDateString() 
                    : 'Unknown'}
                />
                
                {access.lastUsedAt && (
                  <InfoCard
                    icon={Activity}
                    title="Last Used"
                    value={access.lastUsedAt?.toDate 
                      ? access.lastUsedAt.toDate().toLocaleString() 
                      : new Date(access.lastUsedAt).toLocaleString()}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Invites Card */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
              <h2 className="text-base font-semibold text-gray-900">Invites</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Invitation links sent for this access
              </p>
            </div>

            <div className="p-6">
              {invites.length === 0 ? (
                <div className="text-center py-8">
                  <div className="bg-gray-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-3">
                    <Mail className="h-6 w-6 text-gray-400" />
                  </div>
                  <p className="text-sm text-gray-500">No invites sent yet</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Invites will appear here when you share access
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {invites.map((invite) => (
                    <InviteCard key={invite.id} invite={invite} />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Audit Logs Card */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="border-b border-gray-200 bg-gray-50 px-6 py-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Audit Logs</h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Complete history of actions related to this access
                  </p>
                </div>
                
                <div className="flex items-center gap-2">
                  <select
                    value={auditFilter}
                    onChange={(e) => setAuditFilter(e.target.value)}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
                  >
                    <option value="all">All Actions</option>
                    {uniqueActions.map(action => (
                      <option key={action} value={action}>{action}</option>
                    ))}
                  </select>
                  
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search logs..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8 pr-4 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-900"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
              {filteredAudits.length === 0 ? (
                <div className="p-8 text-center">
                  <Activity className="h-8 w-8 text-gray-400 mx-auto mb-3" />
                  <p className="text-sm text-gray-500">No audit logs found</p>
                  {searchTerm && (
                    <p className="text-xs text-gray-400 mt-1">
                      Try adjusting your filters
                    </p>
                  )}
                </div>
              ) : (
                filteredAudits.map((log) => (
                  <AuditLogEntry key={log.id} log={log} />
                ))
              )}
            </div>

            <div className="border-t border-gray-200 bg-gray-50 px-6 py-3">
              <p className="text-xs text-gray-500">
                Showing {filteredAudits.length} of {audits.length} total logs
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}