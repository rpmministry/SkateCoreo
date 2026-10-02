import React, { useState, useEffect } from 'react';
import { ShieldCheck, Activity, Download, Key } from 'lucide-react';
import { supabase } from '../../services/supabase';
import { useAuthStore } from '../../store/useAuthStore';
import { Button } from '../ui/Button';
import { Field } from '../ui/Field';

type PanelSection = 'dashboard' | 'generator' | 'codes' | 'reports';

export const AdminUnifiedPanel: React.FC = () => {
  const [section, setSection] = useState<PanelSection>('dashboard');
  const [stats, setStats] = useState<any>(null);
  
  // Generator State
  const [durationDays, setDurationDays] = useState<number>(30);
  const [customDays, setCustomDays] = useState<number>(30);
  const [assignedEmail, setAssignedEmail] = useState('');
  const [accessType, setAccessType] = useState('TESTER');
  const [generatedCode, setGeneratedCode] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState('');

  const loadStats = async () => {
    const user = useAuthStore.getState().user;
    if (!user) return;
    try {
      const { data } = await supabase?.rpc('admin_get_dashboard_stats', {
        p_admin_email: user.email,
      }) || { data: null, error: new Error('Supabase no inicializado') };
      if (data?.success) {
        setStats(data.stats);
      }
    } catch (e) {}
  };

  useEffect(() => {
    if (section === 'dashboard') loadStats();
  }, [section]);

  const handleGenerateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const user = useAuthStore.getState().user;
    if (!user) return;
    
    setIsGenerating(true);
    setMessage('');
    try {
      const finalDays = durationDays === -1 ? customDays : durationDays;
      const { data, error } = await supabase?.rpc('admin_generate_access_code', {
        p_admin_email: user.email,
        p_duration_days: finalDays,
        p_assigned_email: assignedEmail.trim() || null,
        p_type: accessType
      }) || { data: null, error: new Error('Supabase no inicializado') };
      
      if (error || !data?.success) {
        setMessage(data?.error || error?.message || 'Error al generar código');
      } else {
        setGeneratedCode(data.code);
        setMessage('Código generado exitosamente.');
      }
    } catch (e: any) {
      setMessage(e.message);
    }
    setIsGenerating(false);
  };

  return (
    <div className="flex h-full flex-col md:flex-row gap-4 text-white">
      {/* Sidebar (Sub-navigation) */}
      <div className="w-full md:w-64 bg-surface-1/50 rounded-xl p-3 border border-white/[0.08] flex flex-col gap-2">
        <div className="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-2 px-2">Centro de Control</div>
        <button
          onClick={() => setSection('dashboard')}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${section === 'dashboard' ? 'bg-ice-primary text-white' : 'text-neutral-400 hover:bg-white/[0.04]'}`}
        >
          <Activity className="h-4 w-4" /> Dashboard
        </button>
        <button
          onClick={() => setSection('generator')}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${section === 'generator' ? 'bg-ice-primary text-white' : 'text-neutral-400 hover:bg-white/[0.04]'}`}
        >
          <Key className="h-4 w-4" /> Generar Código
        </button>
        <button
          onClick={() => setSection('reports')}
          className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${section === 'reports' ? 'bg-ice-primary text-white' : 'text-neutral-400 hover:bg-white/[0.04]'}`}
        >
          <Download className="h-4 w-4" /> Reportes & Drive
        </button>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 bg-surface-1/30 rounded-xl border border-white/[0.08] p-4 md:p-6 overflow-y-auto">
        {section === 'dashboard' && (
          <div className="animate-fade-in space-y-6">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Activity className="h-5 w-5 text-ice-light" />
              Telemetría y Estado General
            </h2>
            
            {stats ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-surface-2 rounded-xl p-4 border border-white/[0.08]">
                  <div className="text-xs text-neutral-400">Usuarios Totales</div>
                  <div className="text-2xl font-bold mt-1">{stats.total_users}</div>
                </div>
                <div className="bg-surface-2 rounded-xl p-4 border border-white/[0.08]">
                  <div className="text-xs text-neutral-400">Testers Activos</div>
                  <div className="text-2xl font-bold mt-1 text-ice-light">{stats.active_testers}</div>
                </div>
                <div className="bg-surface-2 rounded-xl p-4 border border-white/[0.08]">
                  <div className="text-xs text-neutral-400">Códigos Activos</div>
                  <div className="text-2xl font-bold mt-1 text-studio-mint">{stats.active_codes}</div>
                </div>
                <div className="bg-surface-2 rounded-xl p-4 border border-white/[0.08]">
                  <div className="text-xs text-neutral-400">Códigos Pendientes</div>
                  <div className="text-2xl font-bold mt-1 text-coach-rose">{stats.pending_codes}</div>
                </div>
                <div className="bg-surface-2 rounded-xl p-4 border border-white/[0.08]">
                  <div className="text-xs text-neutral-400">Sesiones (24h)</div>
                  <div className="text-2xl font-bold mt-1 text-blue-400">{stats.recent_sessions}</div>
                </div>
                <div className="bg-surface-2 rounded-xl p-4 border border-white/[0.08]">
                  <div className="text-xs text-neutral-400">Errores (24h)</div>
                  <div className="text-2xl font-bold mt-1 text-danger">{stats.recent_errors}</div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-neutral-400">Cargando estadísticas...</div>
            )}
            
            <div className="mt-8 bg-surface-2 rounded-xl p-4 border border-white/[0.08]">
               <h3 className="text-sm font-bold text-white mb-2">Arquitectura de Telemetría</h3>
               <p className="text-xs text-neutral-400 mb-2">
                 La telemetría ahora está desacoplada de la base de datos principal para evitar la sobrecarga con eventos de alta frecuencia.
                 Se implementa un buffer temporal local que envía lotes a la tabla `telemetry_events`, los cuales pueden ser consolidados periódicamente a Google Drive.
               </p>
            </div>
          </div>
        )}

        {section === 'generator' && (
          <div className="animate-fade-in max-w-xl">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-6">
              <Key className="h-5 w-5 text-coach-rose" />
              Generador de Códigos de Acceso
            </h2>
            <form onSubmit={handleGenerateCode} className="space-y-4 bg-surface-2 p-5 rounded-xl border border-white/[0.08]">
              
              <div>
                <label className="text-xs font-medium text-neutral-300 mb-1 block">Tipo de Acceso</label>
                <select 
                  value={accessType} 
                  onChange={(e) => setAccessType(e.target.value)}
                  className="w-full rounded-xl border border-white/[0.08] bg-surface-3 py-2 px-3 text-sm text-white focus:border-ice-primary focus:outline-none"
                >
                  <option value="TESTER">Tester</option>
                  <option value="PREMIUM">Premium</option>
                  <option value="COACH">Entrenador</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-neutral-300 mb-1 block">Duración</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {[1, 3, 7, 15, 30, 45, 60, 90].map(days => (
                    <button
                      type="button"
                      key={days}
                      onClick={() => setDurationDays(days)}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors ${durationDays === days ? 'bg-ice-primary/20 border-ice-primary text-ice-light' : 'border-white/[0.1] text-neutral-400 hover:bg-white/[0.05]'}`}
                    >
                      {days} días
                    </button>
                  ))}
                  <button
                      type="button"
                      onClick={() => setDurationDays(-1)}
                      className={`px-3 py-1 text-xs rounded-full border transition-colors ${durationDays === -1 ? 'bg-ice-primary/20 border-ice-primary text-ice-light' : 'border-white/[0.1] text-neutral-400 hover:bg-white/[0.05]'}`}
                    >
                      Personalizado
                  </button>
                </div>
                {durationDays === -1 && (
                  <input
                    type="number"
                    min={1}
                    value={customDays}
                    onChange={(e) => setCustomDays(parseInt(e.target.value) || 1)}
                    className="w-full rounded-xl border border-white/[0.08] bg-surface-3 py-2 px-3 text-sm text-white focus:border-ice-primary focus:outline-none"
                    placeholder="Cantidad de días"
                  />
                )}
              </div>

              <Field
                id="assign-email"
                type="email"
                label="Email Asociado (Opcional)"
                value={assignedEmail}
                onChange={(e) => setAssignedEmail(e.target.value)}
                placeholder="usuario@ejemplo.com"
              />

              <Button type="submit" variant="primary" className="w-full mt-2" disabled={isGenerating}>
                {isGenerating ? 'Generando...' : 'GENERAR CÓDIGO'}
              </Button>
              
              {message && !generatedCode && (
                <div className="p-3 bg-danger/20 border border-danger/50 text-danger text-sm rounded-lg">
                  {message}
                </div>
              )}
            </form>

            {generatedCode && (
              <div className="mt-6 p-5 bg-surface-2 border border-studio-mint/40 rounded-xl space-y-3 animate-fade-in">
                <div className="flex items-center gap-2 text-studio-mint font-bold text-sm">
                  <ShieldCheck className="h-4 w-4" />
                  Código Generado y Registrado Exitosamente
                </div>
                <div className="text-2xl font-mono text-white tracking-widest bg-black/40 p-3 rounded-lg text-center border border-white/[0.05] select-all">
                  {generatedCode.code}
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-neutral-300 mt-2">
                  <div><strong>Duración:</strong> {generatedCode.duration_days} días</div>
                  <div><strong>Tipo:</strong> {generatedCode.type}</div>
                  <div><strong>Estado:</strong> {generatedCode.status}</div>
                  <div><strong>Email:</strong> {generatedCode.assigned_email || 'Ninguno'}</div>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="w-full border border-white/[0.1] mt-2"
                  onClick={() => {
                    navigator.clipboard.writeText(generatedCode.code);
                    alert('Código copiado al portapapeles');
                  }}
                >
                  Copiar al Portapapeles
                </Button>
              </div>
            )}
          </div>
        )}

        {section === 'reports' && (
          <div className="animate-fade-in space-y-6">
             <h2 className="text-lg font-bold flex items-center gap-2 mb-6">
              <Download className="h-5 w-5 text-blue-400" />
              Reportes & Almacenamiento Externo
            </h2>
            <div className="bg-surface-2 rounded-xl p-5 border border-white/[0.08]">
              <h3 className="text-sm font-semibold mb-2">Generación de Reportes bajo Demanda</h3>
              <p className="text-xs text-neutral-400 mb-4">
                Los eventos de telemetría se procesan en lotes y pueden exportarse a CSV para su almacenamiento en Google Drive (o el bucket de reportes). 
                La base de datos se mantiene ligera.
              </p>
              
              <div className="flex flex-wrap gap-3">
                <Button variant="ghost" className="border border-white/[0.1]" onClick={() => alert('Exportando Reporte Diario a Drive...')}>
                  Generar Reporte Diario
                </Button>
                <Button variant="ghost" className="border border-white/[0.1]" onClick={() => alert('Exportando Reporte de Errores...')}>
                  Reporte de Errores
                </Button>
                <Button variant="ghost" className="border border-white/[0.1]" onClick={() => alert('Exportando Sincronización...')}>
                  Análisis de Sincronización
                </Button>
              </div>
            </div>
            
            <div className="bg-black/30 rounded-xl p-4 border border-white/[0.05]">
              <div className="text-xs text-neutral-500 font-mono">
                [STORAGE] skatecore_reports/Users/<br/>
                [STORAGE] skatecore_reports/Access Codes/<br/>
                [STORAGE] skatecore_reports/Sessions/<br/>
                [STORAGE] skatecore_reports/Errors/
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
