const fs = require('fs');

let content = fs.readFileSync('src/components/admin/AdminUnifiedPanel.tsx', 'utf8');

const replacement = `// 1. Dashboard Stats Component
export const AdminDashboardStats: React.FC = () => {
  const [stats, setStats] = useState<any>(null);
  const [expandedCard, setExpandedCard] = useState<'users' | 'testers' | null>(null);

  const loadStats = async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    try {
      const { data } = await supabase?.rpc('admin_get_dashboard_stats', {
        p_admin_email: user.email,
      }) || { data: null };
      if (data?.success) {
        setStats(data.stats);
      }
    } catch (e) {}
  };

  useEffect(() => {
    loadStats();
    
    // Configurar actualización en tiempo real simple mediante polling cada 30 segundos
    // para reflejar "a medida que otros usuarios se registren"
    const interval = setInterval(loadStats, 30000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="animate-fade-in space-y-6">
      <h2 className="text-lg font-bold flex items-center gap-2">
        <Activity className="h-5 w-5 text-ice-light" />
        Telemetría y Estado General
      </h2>
      
      {stats ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div 
            className={\`bg-surface-2 rounded-xl p-4 border transition-all cursor-pointer \${expandedCard === 'users' ? 'border-ice-primary shadow-elevation-2 col-span-2 md:col-span-3' : 'border-white/[0.08] hover:border-white/[0.2]'}\`}
            onClick={() => setExpandedCard(expandedCard === 'users' ? null : 'users')}
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="text-xs text-neutral-400">Usuarios Totales (Haz click)</div>
                <div className="text-2xl font-bold mt-1">{stats.total_users}</div>
              </div>
            </div>
            
            {expandedCard === 'users' && stats.users_list && (
              <div className="mt-4 pt-4 border-t border-white/[0.08] max-h-60 overflow-y-auto pr-2">
                <table className="w-full text-left text-xs text-neutral-300">
                  <thead>
                    <tr className="text-neutral-500">
                      <th className="pb-2 font-medium">Email</th>
                      <th className="pb-2 font-medium">Rol</th>
                      <th className="pb-2 font-medium text-right">Registro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {stats.users_list.map((u: any, i: number) => (
                      <tr key={i} className="hover:bg-white/[0.02]">
                        <td className="py-2">{u.email}</td>
                        <td className="py-2">
                          <span className="bg-surface-3 px-2 py-0.5 rounded text-[10px]">{u.role}</span>
                        </td>
                        <td className="py-2 text-right">{new Date(u.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          
          <div 
            className={\`bg-surface-2 rounded-xl p-4 border transition-all cursor-pointer \${expandedCard === 'testers' ? 'border-ice-light shadow-elevation-2 col-span-2 md:col-span-3' : 'border-white/[0.08] hover:border-white/[0.2]'}\`}
            onClick={() => setExpandedCard(expandedCard === 'testers' ? null : 'testers')}
          >
            <div className="flex justify-between items-start">
              <div>
                <div className="text-xs text-neutral-400">Testers Activos (Haz click)</div>
                <div className="text-2xl font-bold mt-1 text-ice-light">{stats.active_testers}</div>
              </div>
            </div>
            
            {expandedCard === 'testers' && stats.testers_list && (
              <div className="mt-4 pt-4 border-t border-white/[0.08] max-h-60 overflow-y-auto pr-2">
                <table className="w-full text-left text-xs text-neutral-300">
                  <thead>
                    <tr className="text-neutral-500">
                      <th className="pb-2 font-medium">Email del Tester</th>
                      <th className="pb-2 font-medium text-right">Vencimiento</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.05]">
                    {stats.testers_list.map((t: any, i: number) => (
                      <tr key={i} className="hover:bg-white/[0.02]">
                        <td className="py-2 text-ice-light">{t.email}</td>
                        <td className="py-2 text-right text-neutral-400">{new Date(t.expires_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          
          <div className={\`bg-surface-2 rounded-xl p-4 border border-white/[0.08] \${expandedCard ? 'hidden md:block' : ''}\`}>
            <div className="text-xs text-neutral-400">Códigos Activos</div>
            <div className="text-2xl font-bold mt-1 text-studio-mint">{stats.active_codes}</div>
          </div>
          <div className={\`bg-surface-2 rounded-xl p-4 border border-white/[0.08] \${expandedCard ? 'hidden md:block' : ''}\`}>
            <div className="text-xs text-neutral-400">Códigos Pendientes</div>
            <div className="text-2xl font-bold mt-1 text-coach-rose">{stats.pending_codes}</div>
          </div>
          <div className={\`bg-surface-2 rounded-xl p-4 border border-white/[0.08] \${expandedCard ? 'hidden md:block' : ''}\`}>
            <div className="text-xs text-neutral-400">Sesiones (24h)</div>
            <div className="text-2xl font-bold mt-1 text-blue-400">{stats.recent_sessions}</div>
          </div>
          <div className={\`bg-surface-2 rounded-xl p-4 border border-white/[0.08] \${expandedCard ? 'hidden md:block' : ''}\`}>
            <div className="text-xs text-neutral-400">Errores (24h)</div>
            <div className="text-2xl font-bold mt-1 text-danger">{stats.recent_errors}</div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-neutral-400">Cargando estadísticas...</div>
      )}`;

const oldStart = '// 1. Dashboard Stats Component';
const oldEnd = `      <div className="mt-8 bg-surface-2 rounded-xl p-4 border border-white/[0.08]">`;

const idx1 = content.indexOf(oldStart);
const idx2 = content.indexOf(oldEnd);

if (idx1 !== -1 && idx2 !== -1) {
    const newContent = content.substring(0, idx1) + replacement + '\n' + content.substring(idx2);
    fs.writeFileSync('src/components/admin/AdminUnifiedPanel.tsx', newContent, 'utf8');
} else {
    console.log("Could not replace AdminDashboardStats");
}
