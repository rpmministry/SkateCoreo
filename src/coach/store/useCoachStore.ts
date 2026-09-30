/**
 * useCoachStore.ts — Gestor de Estado Zustand para el Panel de Entrenadores
 *
 * Mantiene el estado reactivo desacoplado del resto de la aplicación:
 *  - Lista y filtrado de atletas (soporta cientos de patinadores)
 *  - Ficha deportiva activa (expediente del atleta)
 *  - Coreografías y versiones asociadas (.coreo)
 *  - Estado de almacenamiento y sincronización con nube personal
 */

import { create } from 'zustand';
import {
  CoachAthlete,
  CoachChoreography,
  CoachProfile,
  CloudProviderId,
  StorageSummary,
  CoachChoreographyVersion,
  CoachEvaluation,
} from '../types';
import { coachDb } from '../services/coachDb';
import { storageManager } from '../services/storage/StorageManager';
import { calculateCategoryDetails } from '../services/categoryService';

export type CoachTab = 'dashboard' | 'athletes' | 'dossier' | 'storage' | 'backup' | 'settings' | 'technical_panel';

export interface CoachStoreState {
  // Estado
  profile: CoachProfile | null;
  athletes: CoachAthlete[];
  selectedAthlete: CoachAthlete | null;
  selectedChoreography: CoachChoreography | null;
  athleteChoreographies: CoachChoreography[];
  athleteEvaluations: CoachEvaluation[];
  selectedEvaluation: CoachEvaluation | null;
  evaluationTargetAthlete: CoachAthlete | null;
  evaluationTargetChoreography: CoachChoreography | null;
  storageSummary: StorageSummary | null;
  activeCoachTab: CoachTab;
  isLoading: boolean;
  searchQuery: string;
  categoryFilter: string;
  clubFilter: string;
  statusMessage: { text: string; isError?: boolean } | null;

  // Acciones
  loadInitialData: () => Promise<void>;
  setActiveCoachTab: (tab: CoachTab) => void;
  setSearchQuery: (query: string) => void;
  setCategoryFilter: (category: string) => void;
  setClubFilter: (club: string) => void;
  setStatusMessage: (msg: { text: string; isError?: boolean } | null) => void;

  // Gestión de Atletas
  selectAthlete: (athlete: CoachAthlete | null) => Promise<void>;
  createOrUpdateAthlete: (data: Partial<CoachAthlete> & { firstName: string; lastName: string; birthDate: string }) => Promise<CoachAthlete>;
  deleteAthlete: (athleteId: string) => Promise<void>;

  // Panel Técnico y Evaluaciones
  startEvaluationForAthlete: (athlete: CoachAthlete, choreo?: CoachChoreography) => void;
  loadEvaluationsForAthlete: (athleteId: string) => Promise<CoachEvaluation[]>;
  saveEvaluation: (evaluation: CoachEvaluation) => Promise<CoachEvaluation>;
  deleteEvaluation: (evaluationId: string) => Promise<void>;
  selectEvaluation: (evaluation: CoachEvaluation | null) => void;

  // Gestión de Coreografías y Archivos .coreo
  loadChoreographiesForAthlete: (athleteId: string) => Promise<void>;
  saveChoreographyToDossier: (params: {
    athleteId: string;
    title: string;
    programType: string;
    year?: number;
    durationMs: number;
    pointsCount: number;
    hasAudio: boolean;
    audioFileName?: string;
    coreoBlob: Blob;
    isNewVersion?: boolean;
    versionNotes?: string;
    device?: string;
  }) => Promise<{ choreography: CoachChoreography; version: CoachChoreographyVersion }>;
  deleteChoreography: (choreoId: string) => Promise<void>;

  // Almacenamiento & Nube
  refreshStorageSummary: () => Promise<void>;
  connectCloudProvider: (providerId: CloudProviderId) => Promise<boolean>;
  disconnectCloudProvider: (providerId: CloudProviderId) => Promise<void>;
  syncAthleteToCloud: (athleteId: string) => Promise<{ success: boolean; message: string }>;
  syncAllToCloud: () => Promise<void>;
  updateProfile: (profile: Partial<CoachProfile>) => Promise<void>;
}

export const useCoachStore = create<CoachStoreState>((set, get) => ({
  profile: null,
  athletes: [],
  selectedAthlete: null,
  selectedChoreography: null,
  athleteChoreographies: [],
  athleteEvaluations: [],
  selectedEvaluation: null,
  evaluationTargetAthlete: null,
  evaluationTargetChoreography: null,
  storageSummary: null,
  activeCoachTab: 'dashboard',
  isLoading: false,
  searchQuery: '',
  categoryFilter: 'ALL',
  clubFilter: 'ALL',
  statusMessage: null,

  loadInitialData: async () => {
    set({ isLoading: true });
    try {
      await storageManager.initFromProfile();
      let athletes = await coachDb.getAllAthletes();

      // Si está vacía la base de datos de atletas del entrenador, migrar/sincronizar con skaters existentes
      if (athletes.length === 0) {
        await coachDb.syncFromExistingSkaters();
        athletes = await coachDb.getAllAthletes();
      }

      const profile = await coachDb.getProfile();
      const summary = await storageManager.getSummary();

      set({
        profile,
        athletes,
        storageSummary: summary,
        isLoading: false,
      });
    } catch (e: any) {
      set({
        isLoading: false,
        statusMessage: { text: 'Error al cargar datos del entrenador: ' + e.message, isError: true },
      });
    }
  },

  setActiveCoachTab: (tab: CoachTab) => set({ activeCoachTab: tab }),
  setSearchQuery: (query: string) => set({ searchQuery: query }),
  setCategoryFilter: (category: string) => set({ categoryFilter: category }),
  setClubFilter: (club: string) => set({ clubFilter: club }),
  setStatusMessage: (msg) => set({ statusMessage: msg }),

  selectAthlete: async (athlete: CoachAthlete | null) => {
    set({ selectedAthlete: athlete });
    if (athlete) {
      const choreos = await coachDb.getChoreographiesByAthlete(athlete.id);
      const evals = await coachDb.getEvaluationsByAthlete(athlete.id);
      set({
        athleteChoreographies: choreos,
        athleteEvaluations: evals,
        activeCoachTab: 'dossier',
      });
    } else {
      set({
        athleteChoreographies: [],
        athleteEvaluations: [],
        selectedChoreography: null,
      });
    }
  },

  startEvaluationForAthlete: (athlete: CoachAthlete, choreo?: CoachChoreography) => {
    set({
      evaluationTargetAthlete: athlete,
      evaluationTargetChoreography: choreo || null,
      activeCoachTab: 'technical_panel',
    });
  },

  loadEvaluationsForAthlete: async (athleteId: string) => {
    const evals = await coachDb.getEvaluationsByAthlete(athleteId);
    set({ athleteEvaluations: evals });
    return evals;
  },

  saveEvaluation: async (evaluation: CoachEvaluation) => {
    await coachDb.saveEvaluation(evaluation);
    const athleteId = evaluation.athleteId;
    const evals = await coachDb.getEvaluationsByAthlete(athleteId);
    set({
      athleteEvaluations: evals,
      selectedEvaluation: evaluation,
      statusMessage: { text: `Evaluación guardada y vinculada a la ficha de ${evaluation.athleteName}` },
    });
    return evaluation;
  },

  deleteEvaluation: async (evaluationId: string) => {
    await coachDb.deleteEvaluation(evaluationId);
    const sel = get().selectedAthlete;
    if (sel) {
      const evals = await coachDb.getEvaluationsByAthlete(sel.id);
      set({ athleteEvaluations: evals });
    }
  },

  selectEvaluation: (evaluation: CoachEvaluation | null) => {
    set({ selectedEvaluation: evaluation });
  },

  createOrUpdateAthlete: async (data) => {
    set({ isLoading: true });
    try {
      const calc = calculateCategoryDetails(data.birthDate);
      const isNew = !data.id;
      const id = data.id || `coach_ath_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const fullName = `${data.firstName.trim()} ${data.lastName.trim()}`.trim();

      const athlete: CoachAthlete = {
        id,
        firstName: data.firstName.trim(),
        lastName: data.lastName.trim(),
        name: fullName,
        birthDate: data.birthDate,
        age: calc.exactAge,
        category: (data.category && !data.categoryAuto) ? data.category : calc.category,
        categoryAuto: data.categoryAuto !== undefined ? data.categoryAuto : true,
        club: data.club?.trim() || undefined,
        trainerName: data.trainerName?.trim() || get().profile?.name || undefined,
        eficiencia: data.eficiencia || 'BÁSICA',
        specialty: data.specialty || 'Libre',
        level: data.level || 'Federado',
        gender: data.gender || 'female',
        technicalNotes: data.technicalNotes || '',
        contactInfo: data.contactInfo || {},
        photoDataUrl: data.photoDataUrl || (data as any).photoUrl,
        created_at: data.created_at || Date.now(),
        updated_at: Date.now(),
        syncState: 'pending_upload',
      };

      await coachDb.saveAthlete(athlete);
      const athletes = await coachDb.getAllAthletes();
      const summary = await storageManager.getSummary();

      set({
        athletes,
        selectedAthlete: athlete,
        storageSummary: summary,
        isLoading: false,
        statusMessage: { text: `Atleta "${athlete.name}" ${isNew ? 'creado' : 'actualizado'} con éxito.` },
      });

      return athlete;
    } catch (e: any) {
      set({
        isLoading: false,
        statusMessage: { text: 'Error al guardar atleta: ' + e.message, isError: true },
      });
      throw e;
    }
  },

  deleteAthlete: async (athleteId: string) => {
    try {
      const athlete = get().athletes.find((a) => a.id === athleteId);
      await coachDb.deleteAthlete(athleteId);
      const athletes = await coachDb.getAllAthletes();
      const summary = await storageManager.getSummary();

      set({
        athletes,
        selectedAthlete: get().selectedAthlete?.id === athleteId ? null : get().selectedAthlete,
        athleteChoreographies: get().selectedAthlete?.id === athleteId ? [] : get().athleteChoreographies,
        athleteEvaluations: get().selectedAthlete?.id === athleteId ? [] : get().athleteEvaluations,
        storageSummary: summary,
        statusMessage: { text: `Atleta "${athlete?.name || athleteId}" eliminado.` },
      });
    } catch (e: any) {
      set({ statusMessage: { text: 'Error al eliminar atleta: ' + e.message, isError: true } });
    }
  },

  loadChoreographiesForAthlete: async (athleteId: string) => {
    const choreos = await coachDb.getChoreographiesByAthlete(athleteId);
    set({ athleteChoreographies: choreos });
  },

  saveChoreographyToDossier: async (params) => {
    const athlete = await coachDb.getAthleteById(params.athleteId);
    if (!athlete) throw new Error('Atleta no encontrado para asociar coreografía.');

    const choreoId = `choreo_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const currentYear = params.year || new Date().getFullYear();

    // Buscar si ya existe una coreografía con el mismo título para este atleta
    const existingChoreos = await coachDb.getChoreographiesByAthlete(params.athleteId);
    const existing = existingChoreos.find((c) => c.title.toLowerCase() === params.title.toLowerCase());

    const targetChoreoId = existing ? existing.id : choreoId;
    const versionNum = existing ? (existing.versions.length + 1) : 1;
    const versionLabel = `v${versionNum}`;

    // Nombre de archivo profesional y seguro: [Nombre_Atleta]_[Titulo]_[Año]_v[N].coreo
    const safeAthlete = athlete.name.replace(/[^a-zA-Z0-9]/g, '_');
    const safeTitle = params.title.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `${safeAthlete}_${safeTitle}_${currentYear}_${versionLabel}.coreo`;

    // 1. Guardar blob binario en IndexedDB local (cero Supabase Storage)
    const blobId = `blob_${targetChoreoId}_${versionLabel}_${Date.now()}`;
    await coachDb.saveBinaryFile({
      id: blobId,
      name: fileName,
      mimeType: 'application/octet-stream',
      blob: params.coreoBlob,
      size: params.coreoBlob.size,
      savedAt: Date.now(),
      athleteId: params.athleteId,
      choreographyId: targetChoreoId,
      versionNumber: versionNum,
    });

    const newVersion: CoachChoreographyVersion = {
      versionNumber: versionNum,
      versionLabel,
      fileName,
      coreoBlobId: blobId,
      coreoBlobSize: params.coreoBlob.size,
      savedAt: Date.now(),
      notes: params.versionNotes,
      device: params.device || (typeof navigator !== 'undefined' ? navigator.userAgent : 'Web'),
      syncState: 'pending_upload',
    };

    let updatedChoreo: CoachChoreography;
    if (existing) {
      updatedChoreo = {
        ...existing,
        durationMs: params.durationMs,
        pointsCount: params.pointsCount,
        hasAudio: params.hasAudio,
        audioFileName: params.audioFileName || existing.audioFileName,
        currentVersion: versionNum,
        versions: [...existing.versions, newVersion],
        updated_at: Date.now(),
        syncState: 'pending_upload',
      };
    } else {
      updatedChoreo = {
        id: targetChoreoId,
        athleteId: params.athleteId,
        title: params.title.trim(),
        programType: params.programType || 'Libre',
        year: currentYear,
        suggestedFileName: fileName,
        category: athlete.category, // Conserva la categoría con la que fue creada
        durationMs: params.durationMs,
        pointsCount: params.pointsCount,
        hasAudio: params.hasAudio,
        audioFileName: params.audioFileName,
        versions: [newVersion],
        currentVersion: 1,
        created_at: Date.now(),
        updated_at: Date.now(),
        syncState: 'pending_upload',
      };
    }

    await coachDb.saveChoreography(updatedChoreo);
    const choreos = await coachDb.getChoreographiesByAthlete(params.athleteId);
    const summary = await storageManager.getSummary();

    set({
      athleteChoreographies: choreos,
      selectedChoreography: updatedChoreo,
      storageSummary: summary,
      statusMessage: {
        text: `Coreografía "${updatedChoreo.title}" (${versionLabel}) guardada con éxito en la ficha de ${athlete.name}.`,
      },
    });

    return { choreography: updatedChoreo, version: newVersion };
  },

  deleteChoreography: async (choreoId: string) => {
    try {
      await coachDb.deleteChoreography(choreoId);
      if (get().selectedAthlete) {
        const choreos = await coachDb.getChoreographiesByAthlete(get().selectedAthlete!.id);
        set({ athleteChoreographies: choreos });
      }
      const summary = await storageManager.getSummary();
      set({
        storageSummary: summary,
        statusMessage: { text: 'Coreografía eliminada del expediente.' },
      });
    } catch (e: any) {
      set({ statusMessage: { text: 'Error al eliminar coreografía: ' + e.message, isError: true } });
    }
  },

  refreshStorageSummary: async () => {
    const summary = await storageManager.getSummary();
    set({ storageSummary: summary });
  },

  connectCloudProvider: async (providerId: CloudProviderId) => {
    set({ isLoading: true });
    try {
      const provider = storageManager.getProvider(providerId);
      const connected = await provider.connect();
      if (connected) {
        storageManager.setActiveProvider(providerId);
        const profile = await coachDb.getProfile();
        profile.connectedStorage = providerId;
        await coachDb.saveProfile(profile);

        const summary = await storageManager.getSummary();
        set({
          profile,
          storageSummary: summary,
          isLoading: false,
          statusMessage: { text: `¡Conectado exitosamente a ${provider.name}!` },
        });
        return true;
      }
      set({ isLoading: false });
      return false;
    } catch (e: any) {
      set({
        isLoading: false,
        statusMessage: { text: `Error al conectar con la nube: ${e.message}`, isError: true },
      });
      return false;
    }
  },

  disconnectCloudProvider: async (providerId: CloudProviderId) => {
    const provider = storageManager.getProvider(providerId);
    await provider.disconnect();
    storageManager.setActiveProvider('local');

    const profile = await coachDb.getProfile();
    profile.connectedStorage = 'local';
    await coachDb.saveProfile(profile);

    const summary = await storageManager.getSummary();
    set({
      profile,
      storageSummary: summary,
      statusMessage: { text: `Desconectado de ${provider.name}. Almacenamiento local activo.` },
    });
  },

  syncAthleteToCloud: async (athleteId: string) => {
    set({ isLoading: true });
    const res = await storageManager.uploadCompleteAthleteDossier(athleteId);
    const summary = await storageManager.getSummary();
    const athletes = await coachDb.getAllAthletes();
    set({
      isLoading: false,
      storageSummary: summary,
      athletes,
      statusMessage: { text: res.message, isError: !res.success },
    });
    return res;
  },

  syncAllToCloud: async () => {
    set({ isLoading: true });
    const res = await storageManager.syncAll();
    const summary = await storageManager.getSummary();
    const athletes = await coachDb.getAllAthletes();
    set({
      isLoading: false,
      storageSummary: summary,
      athletes,
      statusMessage: {
        text: `Sincronización terminada: ${res.syncedAthletes} atletas actualizados en la nube.${
          res.errors.length > 0 ? ` (${res.errors.length} errores)` : ''
        }`,
        isError: res.errors.length > 0,
      },
    });
  },

  updateProfile: async (partial) => {
    const current = await coachDb.getProfile();
    const updated: CoachProfile = { ...current, ...partial };
    await coachDb.saveProfile(updated);
    set({ profile: updated });
  },
}));
