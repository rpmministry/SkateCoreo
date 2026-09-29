/**
 * CoachSettingsView.tsx — Configuración del Entrenador
 *
 * Datos del perfil, club, preferencias de sincronización y estado general.
 */

import React, { useState } from 'react';
import { User, Building2, Mail, Phone, Settings, Save, Check } from 'lucide-react';
import { useCoachStore } from '../store/useCoachStore';

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
        <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
          <Settings className="w-6 h-6 text-cyan" />
          Ajustes del Entrenador
        </h2>
        <p className="text-xs text-slate-400">
          Personaliza tu perfil técnico y tus datos de contacto para las fichas y exportaciones.
        </p>
      </div>

      <form onSubmit={handleSave} className="p-6 rounded-3xl bg-neon-surface border border-white/10 shadow-soft-elevation space-y-4">
        {isSaved && (
          <div className="p-3 rounded-2xl bg-mint/15 border border-mint/30 text-mint text-xs flex items-center gap-2">
            <Check className="w-4 h-4" />
            <span>Perfil actualizado con éxito.</span>
          </div>
        )}

        <div className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-400 font-bold mb-1 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-cyan" />
              Nombre del Entrenador / Entrenadora:
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej. Mauricio Andrade"
              className="w-full bg-neon-canvas border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan text-xs font-semibold"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-bold mb-1 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-cyan" />
              Correo Electrónico de Contacto:
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="entrenador@club.com"
              className="w-full bg-neon-canvas border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan text-xs"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-bold mb-1 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-cyan" />
              Club / Asociación Deportiva Principal:
            </label>
            <input
              type="text"
              value={club}
              onChange={(e) => setClub(e.target.value)}
              placeholder="ej. Club Patinaje Artístico"
              className="w-full bg-neon-canvas border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan text-xs"
            />
          </div>

          <div>
            <label className="block text-slate-400 font-bold mb-1 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-cyan" />
              Teléfono de Contacto:
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+34 600 000 000"
              className="w-full bg-neon-canvas border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan text-xs font-mono"
            />
          </div>

          <div className="pt-2 border-t border-white/5">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoSync}
                onChange={(e) => setAutoSync(e.target.checked)}
                className="rounded accent-cyan"
              />
              <span className="text-slate-300 font-medium">
                Sincronización automática de fichas al conectar con la nube
              </span>
            </label>
          </div>
        </div>

        <div className="flex justify-end pt-3 border-t border-white/10">
          <button
            type="submit"
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-cyan text-neon-canvas font-black text-xs shadow-glow-cyan hover:bg-cyan/90 transition-all interactive-tap"
          >
            <Save className="w-4 h-4" />
            <span>Guardar Ajustes</span>
          </button>
        </div>
      </form>
    </div>
  );
};
