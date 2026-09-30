/**
 * CoachSettingsView.tsx — Configuración del Entrenador
 *
 * Datos del perfil, club, preferencias de sincronización y estado general.
 * Alineado con IBM Carbon Design System (IBM Blue 60, superficies neutras, accesibilidad).
 */

import React, { useState } from 'react';
import { User, Building2, Mail, Phone, Settings, Save, Check } from 'lucide-react';
import { useCoachStore } from '../store/useCoachStore';
import { Button } from '../../components/ui';

export const CoachSettingsView: React.FC = () => {
  const { profile, updateProfile } = useCoachStore();

  const [name, setName] = useState(profile?.name || '');
  const [email, setEmail] = useState(profile?.email || '');
  const [club, setClub] = useState(profile?.club || '');
  const [phone, setPhone] = useState(profile?.phone || '');
  const [autoSync, setAutoSync] = useState(profile?.autoSync !== undefined ? profile.autoSync : true);
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateProfile({
      name: name.trim(),
      email: email.trim(),
      club: club.trim(),
      phone: phone.trim(),
      autoSync,
    });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };

  return (
    <div className="space-y-6 animate-fade-in text-white pb-12 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2.5">
          <Settings className="w-5 h-5 text-coach-rose stroke-[1.75]" />
          Ajustes del Entrenador
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Personaliza tu perfil técnico y tus datos de contacto para las fichas y exportaciones.
        </p>
      </div>

      <form onSubmit={handleSave} className="p-6 rounded-2xl bg-surface-1 border border-white/[0.07] shadow-subtle space-y-4">
        {isSaved && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
            <Check className="w-4 h-4" />
            <span>Perfil actualizado con éxito.</span>
          </div>
        )}

        <div className="space-y-3.5 text-xs">
          <div>
            <label className="block text-slate-300 font-medium mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-coach-rose" />
              Nombre del Entrenador / Entrenadora:
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej. Mauricio Andrade"
              className="w-full bg-surface-2 border border-white/[0.08] rounded-xl px-3 py-2 text-white outline-none focus:border-coach-rose/50 focus:ring-1 focus:ring-coach-rose/30 text-xs font-medium transition-colors"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1.5 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              Correo Electrónico de Contacto:
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="entrenador@club.com"
              className="w-full bg-surface-2 border border-white/[0.08] rounded-xl px-3 py-2 text-white outline-none focus:border-coach-rose/50 focus:ring-1 focus:ring-coach-rose/30 text-xs transition-colors"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              Club / Asociación Deportiva Principal:
            </label>
            <input
              type="text"
              value={club}
              onChange={(e) => setClub(e.target.value)}
              placeholder="ej. Club Patinaje Artístico"
              className="w-full bg-surface-2 border border-white/[0.08] rounded-xl px-3 py-2 text-white outline-none focus:border-coach-rose/50 focus:ring-1 focus:ring-coach-rose/30 text-xs transition-colors"
            />
          </div>

          <div>
            <label className="block text-slate-300 font-medium mb-1.5 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-slate-400" />
              Teléfono de Contacto:
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+34 600 000 000"
              className="w-full bg-surface-2 border border-white/[0.08] rounded-xl px-3 py-2 text-white outline-none focus:border-coach-rose/50 focus:ring-1 focus:ring-coach-rose/30 text-xs font-mono transition-colors"
            />
          </div>

          <div className="pt-2 border-t border-white/[0.06]">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(e) => setAutoSync(e.target.checked)}
                className="rounded accent-coach-rose"
              />
              <span className="text-slate-300 font-medium text-xs">
                Sincronización automática de fichas al conectar con la nube
              </span>
            </label>
          </div>
        </div>

        <div className="flex justify-end pt-3 border-t border-white/[0.06]">
          <Button
            type="submit"
            variant="coach"
            size="md"
            icon={<Save className="w-4 h-4 stroke-[2]" />}
          >
            Guardar Ajustes
          </Button>
        </div>
      </form>
    </div>
  );
};
