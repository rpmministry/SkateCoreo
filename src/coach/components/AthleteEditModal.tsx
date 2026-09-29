/**
 * AthleteEditModal.tsx — Formulario de Registro y Edición de Atleta
 *
 * Integra cálculo automático en vivo de:
 *   fecha de nacimiento → edad calculada → categoría oficial del Reglamento 2026
 *
 * Reutiliza las reglas oficiales sin tablas divergentes.
 */

import React, { useState, useEffect } from 'react';
import { User, Calendar, Award, Shield, Phone, Camera, X, AlertCircle } from 'lucide-react';
import { CoachAthlete } from '../types';
import {
  calculateCategoryDetails,
  getDescripcionCategoria,
} from '../services/categoryService';
import {
  CategoriaReglamento,
  EFICIENCIAS_DISPONIBLES,
  EficienciaReglamento,
} from '../../constants/reglamento';

interface AthleteEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<CoachAthlete> & { firstName: string; lastName: string; birthDate: string }) => Promise<void>;
  initialData?: CoachAthlete | null;
}

const CATEGORIAS_OFICIALES: CategoriaReglamento[] = ['TOT', 'MINI', 'ESPOIR', 'CADET', 'MAYOR'];

export const AthleteEditModal: React.FC<AthleteEditModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialData,
}) => {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState('2014-05-15');
  const [gender, setGender] = useState<'female' | 'male' | 'other'>('female');
  const [categoryAuto, setCategoryAuto] = useState(true);
  const [category, setCategory] = useState<CategoriaReglamento>('ESPOIR');
  const [eficiencia, setEficiencia] = useState<EficienciaReglamento>('BÁSICA');
  const [club, setClub] = useState('');
  const [trainerName, setTrainerName] = useState('');
  const [specialty, setSpecialty] = useState('Libre');
  const [level, setLevel] = useState('Federado');
  const [technicalNotes, setTechnicalNotes] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [emergencyContact, setEmergencyContact] = useState('');
  const [photoDataUrl, setPhotoDataUrl] = useState<string | undefined>(undefined);

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Inicializar campos al abrir
  useEffect(() => {
    if (initialData) {
      setFirstName(initialData.firstName || initialData.name.split(' ')[0] || '');
      setLastName(initialData.lastName || initialData.name.split(' ').slice(1).join(' ') || '');
      setBirthDate(initialData.birthDate || '2014-05-15');
      setGender(initialData.gender || 'female');
      setCategoryAuto(initialData.categoryAuto !== undefined ? initialData.categoryAuto : true);
      setCategory((initialData.category as CategoriaReglamento) || 'ESPOIR');
      setEficiencia(initialData.eficiencia || 'BÁSICA');
      setClub(initialData.club || '');
      setTrainerName(initialData.trainerName || '');
      setSpecialty(initialData.specialty || 'Libre');
      setLevel(initialData.level || 'Federado');
      setTechnicalNotes(initialData.technicalNotes || '');
      setGuardianName(initialData.contactInfo?.guardianName || '');
      setPhone(initialData.contactInfo?.phone || '');
      setEmail(initialData.contactInfo?.email || '');
      setEmergencyContact(initialData.contactInfo?.emergencyContact || '');
      setPhotoDataUrl(initialData.photoDataUrl);
    } else {
      setFirstName('');
      setLastName('');
      setBirthDate('2014-05-15');
      setGender('female');
      setCategoryAuto(true);
      setCategory('ESPOIR');
      setEficiencia('BÁSICA');
      setClub('');
      setTrainerName('');
      setSpecialty('Libre');
      setLevel('Federado');
      setTechnicalNotes('');
      setGuardianName('');
      setPhone('');
      setEmail('');
      setEmergencyContact('');
      setPhotoDataUrl(undefined);
    }
  }, [initialData, isOpen]);

  // Recalcular categoría en vivo al cambiar la fecha de nacimiento
  const calcDetails = calculateCategoryDetails(birthDate);

  useEffect(() => {
    if (categoryAuto) {
      setCategory(calcDetails.category);
    }
  }, [birthDate, categoryAuto, calcDetails.category]);

  if (!isOpen) return null;

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      alert('La foto debe pesar menos de 2 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (evt) => {
      setPhotoDataUrl(evt.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim()) {
      setError('El nombre de la patinadora o patinador es obligatorio.');
      return;
    }
    if (!birthDate) {
      setError('La fecha de nacimiento es obligatoria.');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave({
        ...(initialData ? { id: initialData.id, created_at: initialData.created_at } : {}),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        name: `${firstName.trim()} ${lastName.trim()}`.trim(),
        birthDate,
        age: calcDetails.exactAge,
        gender,
        categoryAuto,
        category: categoryAuto ? calcDetails.category : category,
        eficiencia,
        club: club.trim() || undefined,
        trainerName: trainerName.trim() || undefined,
        specialty,
        level,
        technicalNotes,
        contactInfo: {
          guardianName: guardianName.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          emergencyContact: emergencyContact.trim() || undefined,
        },
        photoDataUrl,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Error al guardar atleta.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto animate-fade-in">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-2xl bg-neon-surface border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-5 my-6 text-white"
      >
        {/* Cabecera */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-2xl bg-cyan/15 text-cyan ring-1 ring-cyan/30">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black tracking-tight text-white">
                {initialData ? 'Editar Expediente de Atleta' : 'Registrar Nueva Patinadora / Patinador'}
              </h3>
              <p className="text-[11px] text-slate-400">
                Ficha deportiva con cálculo automático de categoría según fecha de nacimiento.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl hover:bg-white/10 text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-950/80 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Avatar y Nombres */}
          <div className="flex flex-col sm:flex-row items-center gap-4 p-3 rounded-2xl bg-white/[0.02] border border-white/5">
            <div className="relative group shrink-0">
              <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
                {photoDataUrl ? (
                  <img src={photoDataUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-8 h-8 text-slate-500" />
                )}
              </div>
              <label className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 rounded-2xl cursor-pointer transition-opacity">
                <Camera className="w-5 h-5 text-white" />
                <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
              </label>
            </div>

            <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-400 font-bold mb-1">Nombres *</label>
                <input
                  type="text"
                  required
                  placeholder="ej. María"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full bg-neon-canvas border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan text-xs font-semibold"
                />
              </div>

              <div>
                <label className="block text-slate-400 font-bold mb-1">Apellidos</label>
                <input
                  type="text"
                  placeholder="ej. Andrade Sánchez"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full bg-neon-canvas border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan text-xs font-semibold"
                />
              </div>
            </div>
          </div>

          {/* Fecha de Nacimiento y Categoría Automática */}
          <div className="p-4 rounded-2xl bg-cyan/[0.04] border border-cyan/20 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-cyan font-bold mb-1 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Fecha de Nacimiento *
                </label>
                <input
                  type="date"
                  required
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="w-full bg-neon-canvas border border-cyan/30 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan text-xs font-mono"
                />
              </div>

              <div>
                <label className="block text-cyan font-bold mb-1 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Award className="w-3.5 h-3.5" />
                    Categoría Oficial 2026
                  </span>
                  <label className="text-[10px] text-slate-400 font-normal flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={categoryAuto}
                      onChange={(e) => setCategoryAuto(e.target.checked)}
                      className="rounded accent-cyan"
                    />
                    <span>Automática</span>
                  </label>
                </label>

                {categoryAuto ? (
                  <div className="w-full bg-neon-canvas/80 border border-cyan/30 rounded-xl px-3 py-2 text-white text-xs font-mono flex items-center justify-between">
                    <span className="font-bold text-amber-300">{calcDetails.category}</span>
                    <span className="text-[11px] text-slate-400">({calcDetails.categoryDescription})</span>
                  </div>
                ) : (
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as CategoriaReglamento)}
                    className="w-full bg-neon-canvas border border-amber-400/40 rounded-xl px-3 py-2 text-white outline-none focus:border-amber-400 text-xs font-mono font-bold text-amber-300"
                  >
                    {CATEGORIAS_OFICIALES.map((c) => (
                      <option key={c} value={c}>
                        {c} · {getDescripcionCategoria(c)}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Diagnóstico en vivo de edad y próximo cambio */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] border-t border-cyan/15 text-slate-300">
              <div>
                Edad calculada:{' '}
                <strong className="text-white font-mono font-bold">{calcDetails.exactAge} años</strong>
                <span className="text-slate-500 ml-1.5">(deportiva {calcDetails.sportsAge} años)</span>
              </div>

              {calcDetails.nextCategory && (
                <div className={`${calcDetails.isUpcomingChangeWithin90Days ? 'text-amber-400 font-bold' : 'text-slate-400'}`}>
                  Próximo cambio a <span className="text-cyan font-mono">{calcDetails.nextCategory}</span>: en{' '}
                  <strong className="font-mono">{calcDetails.daysUntilNextCategory}</strong> días ({calcDetails.nextCategoryChangeDate})
                </div>
              )}
            </div>
          </div>

          {/* Información deportiva */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 font-medium mb-1 flex items-center gap-1">
                <Shield className="w-3 h-3" />
                Nivel Eficiencia:
              </label>
              <select
                value={eficiencia}
                onChange={(e) => setEficiencia(e.target.value as EficienciaReglamento)}
                className="w-full bg-neon-canvas border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan text-xs"
              >
                {EFICIENCIAS_DISPONIBLES.map((eff) => (
                  <option key={eff} value={eff}>
                    {eff}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">Especialidad:</label>
              <select
                value={specialty}
                onChange={(e) => setSpecialty(e.target.value)}
                className="w-full bg-neon-canvas border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan text-xs"
              >
                <option value="Libre">Libre (Single)</option>
                <option value="Danza">Danza</option>
                <option value="Solo Dance">Solo Dance</option>
                <option value="Figuras Obligatorias">Figuras Obligatorias (Escuela)</option>
                <option value="Parejas">Parejas de Artístico</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">Nivel Competitivo:</label>
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="w-full bg-neon-canvas border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan text-xs"
              >
                <option value="Iniciación">Iniciación</option>
                <option value="Federado">Federado Regional</option>
                <option value="Nacional">Nacional</option>
                <option value="Internacional">Internacional / Selección</option>
              </select>
            </div>
          </div>

          {/* Club y Entrenador */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 font-medium mb-1">Club / Escuela:</label>
              <input
                type="text"
                placeholder="ej. Club Patinaje Artístico Barcelona"
                value={club}
                onChange={(e) => setClub(e.target.value)}
                className="w-full bg-neon-canvas border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan text-xs"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-medium mb-1">Entrenador/a Responsable:</label>
              <input
                type="text"
                placeholder="ej. Mauricio Andrade"
                value={trainerName}
                onChange={(e) => setTrainerName(e.target.value)}
                className="w-full bg-neon-canvas border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan text-xs"
              />
            </div>
          </div>

          {/* Contacto & Emergencia */}
          <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/5 space-y-2.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Phone className="w-3 h-3 text-cyan" />
              Contacto y Representante
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-slate-500 font-medium mb-1">Madre / Padre / Tutor:</label>
                <input
                  type="text"
                  placeholder="Nombre del apoderado"
                  value={guardianName}
                  onChange={(e) => setGuardianName(e.target.value)}
                  className="w-full bg-neon-canvas border border-white/10 rounded-xl px-3 py-1.5 text-white outline-none focus:border-cyan text-xs"
                />
              </div>

              <div>
                <label className="block text-slate-500 font-medium mb-1">Teléfono / WhatsApp:</label>
                <input
                  type="tel"
                  placeholder="+34 600 000 000"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-neon-canvas border border-white/10 rounded-xl px-3 py-1.5 text-white outline-none focus:border-cyan text-xs font-mono"
                />
              </div>
            </div>
          </div>

          {/* Observaciones técnicas */}
          <div className="text-xs">
            <label className="block text-slate-400 font-medium mb-1">Observaciones Técnicas y Deportivas:</label>
            <textarea
              rows={3}
              placeholder="Notas sobre estilo, saltos favoritos, objetivos de temporada, etc."
              value={technicalNotes}
              onChange={(e) => setTechnicalNotes(e.target.value)}
              className="w-full bg-neon-canvas border border-white/10 rounded-xl px-3 py-2 text-white outline-none focus:border-cyan text-xs"
            />
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/10 text-slate-300 text-xs font-semibold transition-all"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="px-5 py-2.5 rounded-xl bg-cyan text-neon-canvas font-black text-xs shadow-glow-cyan hover:bg-cyan/90 transition-all disabled:opacity-50 interactive-tap"
          >
            {isSaving ? 'Guardando...' : initialData ? 'Guardar Cambios' : 'Registrar Atleta'}
          </button>
        </div>
      </form>
    </div>
  );
};
