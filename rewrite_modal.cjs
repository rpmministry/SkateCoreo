const fs = require('fs');

let content = fs.readFileSync('src/components/admin/AdminDashboardModal.tsx', 'utf8');

const match = content.match(/return \(\s*<div\s*role="dialog"/);
const endMatch = content.indexOf('{/* ══════════ TAB 1: LISTADO DE PAQUETES ══════════ */}');

if (!match || endMatch === -1) {
  console.log("Could not find start or end index.");
  process.exit(1);
}

const startIdx = match.index;
const endIdx = endMatch;

const replacement = `return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xl p-3 sm:p-5 animate-fade-in select-none"
    >
      <div className="relative flex flex-col w-full max-w-[1400px] h-[90vh] max-h-[900px] rounded-2xl border border-white/[0.08] bg-surface-2 shadow-elevation-2 overflow-hidden text-neutral-200">
        {/* ── Cabecera Superior del Panel ── */}
        <header className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4 bg-surface-1">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-ice-primary/20 bg-ice-primary/10 text-ice-light">
              <ShieldCheck className="h-5 w-5 stroke-[1.75]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-semibold text-white sm:text-lg">
                  Panel de Administración
                </h1>
                <span className="rounded-full border border-studio-mint/25 bg-studio-mint/15 px-2 py-0.5 text-[9px] font-mono font-medium uppercase text-studio-mint">
                  Superadmin
                </span>
              </div>
              <p className="text-xs text-neutral-400">
                Centro de control unificado: Clubes, Licencias, Usuarios, Reportes y Códigos.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="press rounded-lg p-2 text-neutral-400 hover:bg-white/[0.06] hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {/* ── CUERPO PRINCIPAL (SIDEBAR + CONTENIDO) ── */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div className="w-full sm:w-64 bg-surface-1/50 border-r border-white/[0.07] p-3 flex flex-col gap-1 overflow-y-auto hidden sm:flex shrink-0">
             <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1 px-2 mt-2">Visión General</div>
             <button
               onClick={() => setActiveTab('dashboard')}
               className={\`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors \${activeTab === 'dashboard' ? 'bg-ice-primary text-white shadow-elevation-1' : 'text-neutral-400 hover:bg-white/[0.04]'}\`}
             >
               <Activity className="h-4 w-4" /> Resumen / Dashboard
             </button>

             <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1 px-2 mt-4">Gestión Principal</div>
             <button
               onClick={() => setActiveTab('packages')}
               className={\`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors \${(activeTab === 'packages' || activeTab === 'new-package' || activeTab === 'codes') ? 'bg-ice-primary text-white shadow-elevation-1' : 'text-neutral-400 hover:bg-white/[0.04]'}\`}
             >
               <Building2 className="h-4 w-4" /> Clubes & Licencias
             </button>
             <button
               onClick={() => setActiveTab('generator')}
               className={\`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors \${activeTab === 'generator' ? 'bg-ice-primary text-white shadow-elevation-1' : 'text-neutral-400 hover:bg-white/[0.04]'}\`}
             >
               <Key className="h-4 w-4" /> Generador de Códigos
             </button>
             
             <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1 px-2 mt-4">Usuarios & Seguridad</div>
             <button
               onClick={() => { setActiveTab('users'); loadUsersList && void loadUsersList(); }}
               className={\`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors \${activeTab === 'users' ? 'bg-ice-primary text-white shadow-elevation-1' : 'text-neutral-400 hover:bg-white/[0.04]'}\`}
             >
               <Users className="h-4 w-4" /> Usuarios & Roles
             </button>
             <button
               onClick={() => { setActiveTab('audit'); loadAuditLogs && void loadAuditLogs(); }}
               className={\`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors \${activeTab === 'audit' ? 'bg-ice-primary text-white shadow-elevation-1' : 'text-neutral-400 hover:bg-white/[0.04]'}\`}
             >
               <ShieldCheck className="h-4 w-4" /> Actividad & Auditoría
             </button>
             
             <div className="text-[10px] font-bold text-neutral-500 uppercase tracking-wider mb-1 px-2 mt-4">Configuración & Reportes</div>
             <button
               onClick={() => setActiveTab('plans')}
               className={\`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors \${activeTab === 'plans' ? 'bg-ice-primary text-white shadow-elevation-1' : 'text-neutral-400 hover:bg-white/[0.04]'}\`}
             >
               <FileText className="h-4 w-4" /> Suscripciones & Membresías
             </button>
             <button
               onClick={() => setActiveTab('tiers')}
               className={\`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors \${activeTab === 'tiers' ? 'bg-ice-primary text-white shadow-elevation-1' : 'text-neutral-400 hover:bg-white/[0.04]'}\`}
             >
               <Percent className="h-4 w-4" /> Escala de Descuentos
             </button>
             <button
               onClick={() => setActiveTab('reports')}
               className={\`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors \${activeTab === 'reports' ? 'bg-ice-primary text-white shadow-elevation-1' : 'text-neutral-400 hover:bg-white/[0.04]'}\`}
             >
               <Download className="h-4 w-4" /> Reportes & Mantenimiento
             </button>
          </div>

          {/* ── Contenido Principal ── */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-surface-1/30">
            {activeTab === 'dashboard' && <div className="animate-fade-in"><AdminDashboardStats /></div>}
            {activeTab === 'generator' && <div className="animate-fade-in"><AdminCodeGenerator /></div>}
            {activeTab === 'reports' && <div className="animate-fade-in"><AdminReports /></div>}

            {/* ══════════ TAB 1: LISTADO DE PAQUETES ══════════ */}`;

const newContent = content.substring(0, startIdx) + replacement + content.substring(endIdx + '{/* ══════════ TAB 1: LISTADO DE PAQUETES ══════════ */}'.length);
fs.writeFileSync('src/components/admin/AdminDashboardModal.tsx', newContent, 'utf8');
console.log("Successfully replaced layout.");

