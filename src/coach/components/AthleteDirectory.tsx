/**
 * AthleteDirectory.tsx — Directorio y Buscador de Atletas
 *
 * Filtros rápidos por:
 *  - Nombre / Apellidos
 *  - Categoría oficial (TOT, MINI, ESPOIR, CADET, MAYOR)
 *  - Club / Federación
 *  - Nivel competitivo
 *
 * Diseñado con alta eficiencia para 10, 50, 100 o cientos de patinadores.
 */

import React, { useState, useMemo } from 'react';
import {
  Users,
  Search,
  UserPlus,
  Compass,
  ArrowRight,
  Trash2,
} from 'lucide-react';
import { CoachAthlete } from '../types';
import { useCoachStore } from '../store/useCoachStore';
import { CategoriaReglamento } from '../../constants/reglamento';
import { AthleteEditModal } from './AthleteEditModal';
import { Badge, Button, EmptyState } from '../../components/ui';

interface AthleteDirectoryProps {
  onSelectAthlete: (athlete: CoachAthlete) => void;
  onCreateChoreography: (athlete: CoachAthlete) => void;
}

const CATEGORIAS_OFICIALES: (CategoriaReglamento | 'ALL')[] = [
  'ALL',
  'TOT',
  'MINI',
  'ESPOIR',
  'CADET',
  'MAYOR',
];

export const AthleteDirectory: React.FC<AthleteDirectoryProps> = ({
  onSelectAthlete,
  onCreateChoreography,
}) => {
  const {
    athletes,
    searchQuery,
    setSearchQuery,
    categoryFilter,
    setCategoryFilter,
    clubFilter,
    setClubFilter,
    createOrUpdateAthlete,
    deleteAthlete,
  } = useCoachStore();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Lista única de clubes para el filtro
  const uniqueClubs = useMemo(() => {
    const set = new Set<string>();
    athletes.forEach((a) => {
      if (a.club && a.club.trim()) set.add(a.club.trim());
    });
    return Array.from(set);
  }, [athletes]);

  // Filtrado optimizado en memoria
  const filteredAthletes = useMemo(() => {
    let result = athletes;

    // Filtro por texto
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          (a.club && a.club.toLowerCase().includes(q)) ||
          (a.trainerName && a.trainerName.toLowerCase().includes(q)) ||
          (a.technicalNotes && a.technicalNotes.toLowerCase().includes(q))
      );
    }

    // Filtro por categoría
    if (categoryFilter !== 'ALL') {
      result = result.filter((a) => a.category === categoryFilter);
    }

    // Filtro por club
    if (clubFilter !== 'ALL') {
      result = result.filter((a) => a.club === clubFilter);
    }

    // Ordenar alfabéticamente
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [athletes, searchQuery, categoryFilter, clubFilter]);

  const handleDelete = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    if (window.confirm(`¿Estás seguro de eliminar a "${name}" y todo su historial técnico?`)) {
      deleteAthlete(id);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in text-white pb-12">
      {/* Cabecera y botón principal */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-normal text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-coach-rose" />
            Directorio de Atletas ({filteredAthletes.length})
          </h2>
          <p className="text-xs text-slate-400 font-normal">
            Base privada de patinadoras y patinadores de tu club o escuela.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => setIsAddModalOpen(true)}
          icon={<UserPlus className="w-4 h-4 stroke-[2]" />}
        >
          Registrar Atleta
        </Button>
      </div>

      {/* Barra de Filtros y Búsqueda */}
      <div className="p-3.5 rounded-xl bg-surface-1 border border-white/[0.06] space-y-3 shadow-subtle">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {/* Búsqueda rápida */}
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar por nombre, club o notas técnicas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-surface-2 border border-white/[0.08] rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 outline-none focus:border-ice-primary/50 focus:ring-1 focus:ring-ice-primary/20 transition-all"
            />
          </div>

          {/* Filtro por Club */}
          {uniqueClubs.length > 0 && (
            <div className="sm:w-56 shrink-0">
              <select
                value={clubFilter}
                onChange={(e) => setClubFilter(e.target.value)}
                className="w-full bg-surface-2 border border-white/[0.08] rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-ice-primary/50 transition-all"
              >
                <option value="ALL">Todos los Clubes</option>
                {uniqueClubs.map((club) => (
                  <option key={club} value={club}>
                    {club}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Píldoras de Categoría Oficial */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scroll-touch">
          <span className="text-[10px] uppercase font-semibold text-slate-500 mr-1 shrink-0">
            Categoría:
          </span>
          {CATEGORIAS_OFICIALES.map((cat) => {
            const isSelected = categoryFilter === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all shrink-0 interactive-tap border ${
                  isSelected
                    ? 'bg-surface-2 text-coach-rose border-coach-rose/30 shadow-subtle font-semibold'
                    : 'bg-surface-1 border-white/[0.06] text-slate-400 hover:text-white hover:bg-surface-2'
                }`}
              >
                {cat === 'ALL' ? 'Todas las Categorías' : cat}
              </button>
            );
          })}
        </div>
      </div>

      {/* Listado / Rejilla de Atletas */}
      {filteredAthletes.length === 0 ? (
        <EmptyState
          title="No se encontraron atletas"
          description="No hay atletas que coincidan con los filtros de búsqueda aplicados."
          icon={<Users className="w-8 h-8 text-coach-rose" />}
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setCategoryFilter('ALL');
                setClubFilter('ALL');
              }}
            >
              Limpiar filtros de búsqueda
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredAthletes.map((athlete) => (
            <div
              key={athlete.id}
              onClick={() => onSelectAthlete(athlete)}
              className="group bg-surface-1 border border-white/[0.06] rounded-xl p-4 shadow-subtle hover:border-white/[0.12] hover:bg-surface-2/60 transition-all cursor-pointer flex flex-col justify-between space-y-3"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-surface-2 border border-white/[0.06] flex items-center justify-center overflow-hidden shrink-0">
                      {athlete.photoDataUrl ? (
                        <img src={athlete.photoDataUrl} alt={athlete.name} className="w-full h-full object-cover" />
                      ) : (
                        <Users className="w-5 h-5 text-slate-500" />
                      )}
                    </div>

                    <div>
                      <h3 className="font-medium text-sm text-white group-hover:text-coach-rose transition-colors tracking-normal">
                        {athlete.name}
                      </h3>
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5 font-normal">
                        <span className="font-mono text-amber-300 font-medium">{athlete.age} años</span>
                        {athlete.club && (
                          <span className="truncate max-w-[120px]" title={athlete.club}>
                            • {athlete.club}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => handleDelete(e, athlete.id, athlete.name)}
                    className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-white/[0.06] transition-colors"
                    title="Eliminar atleta"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono p-2.5 rounded-lg bg-surface-2/60 border border-white/[0.06]">
                  <div>
                    <span className="text-slate-500 block text-[9px] uppercase tracking-wider font-sans">Categoría</span>
                    <Badge variant="amber" size="xs" className="mt-0.5 font-medium">
                      {athlete.category}
                    </Badge>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[9px] uppercase tracking-wider font-sans">Eficiencia</span>
                    <Badge variant="neutral" size="xs" className="mt-0.5 font-medium">
                      {athlete.eficiencia || 'BÁSICA'}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Botones de acción rápida */}
              <div className="flex items-center justify-between pt-2.5 border-t border-white/[0.06] text-xs">
                <span className="text-slate-400 font-normal group-hover:text-white flex items-center gap-1 transition-colors">
                  Abrir expediente
                  <ArrowRight className="w-3.5 h-3.5 text-coach-rose transition-transform group-hover:translate-x-0.5" />
                </span>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreateChoreography(athlete);
                  }}
                  icon={<Compass className="w-3.5 h-3.5" />}
                  title="Crear coreografía directamente en la Pista 2D"
                >
                  Coreografía
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal para agregar atleta */}
      <AthleteEditModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSave={async (data) => {
          await createOrUpdateAthlete(data);
        }}
      />
    </div>
  );
};
