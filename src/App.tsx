import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  AlertTriangle,
  Building2,
  BriefcaseBusiness,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Clock,
  CornerRightUp,
  Crown,
  Download,
  Edit2,
  Filter,
  Gavel,
  GripHorizontal,
  GripVertical,
  History,
  Layers3,
  Link2,
  Maximize2,
  Minimize2,
  Moon,
  Network,
  Plus,
  Presentation,
  RotateCcw,
  Save,
  Search,
  Sun,
  Tags,
  Trash2,
  Upload,
  User,
  UserMinus,
  Users,
  Workflow,
  X,
} from 'lucide-react';

type RoleType =
  | 'Management'
  | 'Administrativo'
  | 'Operativo'
  | 'Arquitectura'
  | 'Externo'
  | 'Asesor'
  | 'Finanzas'
  | 'RRHH'
  | 'Legal'
  | 'Marketing'
  | 'Ventas'
  | 'Logística'
  | 'Tecnología';

type EntityType = 'empresa' | 'proyecto' | 'licitacion' | 'tarea';
type ThemeMode = 'dark' | 'light';
type CommitmentStatus = 'Pendiente' | 'En Progreso' | 'Completado' | 'Riesgo';

type TagColorKey = 'slate' | 'red' | 'orange' | 'amber' | 'emerald' | 'cyan' | 'blue' | 'violet' | 'pink';

interface CustomTag {
  id: string;
  label: string;
  color: TagColorKey;
}

interface Person {
  id: string;
  name: string;
  role: RoleType;
  category: string;
  email: string;
  phone: string;
  notes: string;
  skills: string[];
  customTags: CustomTag[];
  supervisor: string;
  managerId?: string;
}

// SSoT: a Position (Puesto) belongs to an Entity and exists independently of any
// Person. `assignedPersonId` is null while the position is vacant — the position
// itself is never removed just because nobody currently occupies it.
interface Position {
  id: string;
  title: string;
  department: string;
  fte: number; // fraction of full-time dedication, e.g. 1 = 100%, 0.5 = 50%
  assignedPersonId: string | null;
  // Specific functions/tasks assigned to whoever occupies this seat in this
  // entity. A task is "done" when it starts with TASK_DONE_PREFIX.
  tasks: string[];
  // Calendar/commitment tracking for this seat's deliverable, independent of the
  // entity-level dates below (e.g. a position can have its own delivery date
  // inside a longer-running project).
  startDate?: string; // YYYY-MM-DD
  dueDate?: string; // YYYY-MM-DD
  commitmentStatus?: CommitmentStatus;
}

interface BoardEntity {
  id: string;
  type: EntityType;
  name: string;
  description: string;
  code?: string;
  client?: string;
  budgetUsd?: string;
  closeDate?: string;
  status?: string;
  positions?: Position[];
  // Calendar/commitment tracking — startDate/dueDate feed the Calendario modal,
  // commitmentStatus is the coarse enum shown as a badge (distinct from the
  // free-text `status` field above, which already holds licitación-specific
  // labels like "Retiro DIVAE").
  startDate?: string; // YYYY-MM-DD
  dueDate?: string; // YYYY-MM-DD
  commitmentStatus?: CommitmentStatus;
}

interface Assignment {
  id: string;
  personId: string;
  entityId: string;
  taskText: string;
}

interface ReportConnection {
  id: string;
  sourcePersonId: string;
  targetPersonId: string;
  label: string;
}

interface HoldingMember {
  id: string;
  level: 0 | 1;
  name: string;
  role: string;
  notes: string;
}

interface BoardState {
  people: Person[];
  entities: BoardEntity[];
  entitiesOrder: string[];
  assignments: Assignment[];
  connections: ReportConnection[];
  holdingMembers: HoldingMember[];
}

interface ToastMessage {
  id: number;
  message: string;
  type: 'success' | 'info' | 'warning';
}

interface ConnectionLine {
  id: string;
  sourcePersonId: string;
  targetPersonId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
}

// A saved point-in-time copy of the full board — "Histórico de Procesos". Stored
// separately from the live board so restoring one is a swap, not a merge.
interface BoardSnapshot {
  id: string;
  name: string;
  notes: string;
  createdAt: string; // ISO datetime
  state: BoardState;
}

const STORAGE_KEY = 'horizontal-board-state-v1';
const LEGACY_STORAGE_KEY = 'holding-organigrama-employees-v1';
const THEME_STORAGE_KEY = 'theme';
const SNAPSHOTS_STORAGE_KEY = 'horizontal-board-snapshots-v1';

const ENTITY_META: Record<EntityType, { label: string; icon: React.ElementType; className: string }> = {
  empresa: {
    label: 'Empresa',
    icon: Building2,
    className: 'from-blue-500 to-cyan-500 border-blue-400/30',
  },
  proyecto: {
    label: 'Proyecto',
    icon: BriefcaseBusiness,
    className: 'from-emerald-500 to-teal-500 border-emerald-400/30',
  },
  licitacion: {
    label: 'Licitación',
    icon: Gavel,
    className: 'from-amber-500 to-orange-500 border-amber-400/30',
  },
  tarea: {
    label: 'Tarea',
    icon: ClipboardList,
    className: 'from-fuchsia-500 to-violet-500 border-fuchsia-400/30',
  },
};

// Explicit hierarchy order for the swimlane rows: Empresas -> Proyectos -> Licitaciones -> Tareas.
const LEVEL_ORDER: EntityType[] = ['empresa', 'proyecto', 'licitacion', 'tarea'];

const LEVEL_META: Record<EntityType, { title: string; noun: string; bg: string; border: string; text: string }> = {
  empresa: { title: 'Nivel 1 · Empresas', noun: 'empresas', bg: 'bg-blue-100 dark:bg-blue-950/60', border: 'border-blue-300 dark:border-blue-800', text: 'text-blue-800 dark:text-blue-300' },
  proyecto: { title: 'Nivel 2 · Proyectos', noun: 'proyectos', bg: 'bg-emerald-100 dark:bg-emerald-950/60', border: 'border-emerald-300 dark:border-emerald-800', text: 'text-emerald-800 dark:text-emerald-300' },
  licitacion: { title: 'Nivel 3 · Licitaciones', noun: 'licitaciones', bg: 'bg-orange-100 dark:bg-orange-950/60', border: 'border-orange-300 dark:border-orange-800', text: 'text-orange-800 dark:text-orange-300' },
  tarea: { title: 'Nivel 4 · Tareas', noun: 'tareas', bg: 'bg-purple-100 dark:bg-purple-950/60', border: 'border-purple-300 dark:border-purple-800', text: 'text-purple-800 dark:text-purple-300' },
};

const ROLE_BADGES: Record<RoleType, { bg: string; border: string; text: string; dot: string }> = {
  Management: { bg: 'bg-blue-100 dark:bg-blue-900/80', border: 'border-blue-300 dark:border-blue-700', text: 'text-blue-800 dark:text-blue-200', dot: 'bg-blue-700 dark:bg-blue-300' },
  Administrativo: { bg: 'bg-emerald-100 dark:bg-emerald-900/80', border: 'border-emerald-300 dark:border-emerald-700', text: 'text-emerald-800 dark:text-emerald-200', dot: 'bg-emerald-700 dark:bg-emerald-300' },
  Operativo: { bg: 'bg-amber-100 dark:bg-amber-900/80', border: 'border-amber-300 dark:border-amber-700', text: 'text-amber-800 dark:text-amber-200', dot: 'bg-amber-700 dark:bg-amber-300' },
  Arquitectura: { bg: 'bg-purple-100 dark:bg-purple-900/80', border: 'border-purple-300 dark:border-purple-700', text: 'text-purple-800 dark:text-purple-200', dot: 'bg-purple-700 dark:bg-purple-300' },
  Externo: { bg: 'bg-gray-100 dark:bg-gray-800', border: 'border-gray-300 dark:border-gray-600', text: 'text-gray-800 dark:text-gray-200', dot: 'bg-gray-700 dark:bg-gray-300' },
  Asesor: { bg: 'bg-indigo-100 dark:bg-indigo-900/80', border: 'border-indigo-300 dark:border-indigo-700', text: 'text-indigo-800 dark:text-indigo-200', dot: 'bg-indigo-700 dark:bg-indigo-300' },
  Finanzas: { bg: 'bg-lime-100 dark:bg-lime-900/80', border: 'border-lime-300 dark:border-lime-700', text: 'text-lime-800 dark:text-lime-200', dot: 'bg-lime-700 dark:bg-lime-300' },
  RRHH: { bg: 'bg-rose-100 dark:bg-rose-900/80', border: 'border-rose-300 dark:border-rose-700', text: 'text-rose-800 dark:text-rose-200', dot: 'bg-rose-700 dark:bg-rose-300' },
  Legal: { bg: 'bg-violet-100 dark:bg-violet-900/80', border: 'border-violet-300 dark:border-violet-700', text: 'text-violet-800 dark:text-violet-200', dot: 'bg-violet-700 dark:bg-violet-300' },
  Marketing: { bg: 'bg-pink-100 dark:bg-pink-900/80', border: 'border-pink-300 dark:border-pink-700', text: 'text-pink-800 dark:text-pink-200', dot: 'bg-pink-700 dark:bg-pink-300' },
  Ventas: { bg: 'bg-cyan-100 dark:bg-cyan-900/80', border: 'border-cyan-300 dark:border-cyan-700', text: 'text-cyan-800 dark:text-cyan-200', dot: 'bg-cyan-700 dark:bg-cyan-300' },
  Logística: { bg: 'bg-orange-100 dark:bg-orange-900/80', border: 'border-orange-300 dark:border-orange-700', text: 'text-orange-800 dark:text-orange-200', dot: 'bg-orange-700 dark:bg-orange-300' },
  Tecnología: { bg: 'bg-sky-100 dark:bg-sky-900/80', border: 'border-sky-300 dark:border-sky-700', text: 'text-sky-800 dark:text-sky-200', dot: 'bg-sky-700 dark:bg-sky-300' },
};

const ROLE_OPTIONS = Object.keys(ROLE_BADGES) as RoleType[];

type FunctionalAreaKey = 'admin' | 'arquitectura' | 'producto' | 'operativo';

// Groups the Holding's RoleType values into the functional areas shown by the
// "Organigrama por Áreas" view. Every RoleType must land in exactly one area —
// Cúpula & Dirección General is rendered separately from `holdingMembers`
// (Damir Solar, Rafael Valenzuela), not from `board.people`.
const FUNCTIONAL_AREAS: { key: FunctionalAreaKey; title: string; roles: RoleType[] }[] = [
  { key: 'admin', title: 'Administrativo, Finanzas y RRHH', roles: ['Administrativo', 'Finanzas', 'RRHH', 'Legal'] },
  { key: 'arquitectura', title: 'Arquitectura e ITO', roles: ['Arquitectura', 'Tecnología'] },
  { key: 'producto', title: 'Producto & Management', roles: ['Management', 'Marketing', 'Ventas', 'Asesor'] },
  { key: 'operativo', title: 'Operativo & Logística', roles: ['Operativo', 'Logística', 'Externo'] },
];

// Arranges a functional area's people into a flat, depth-annotated list so the
// "Organigrama por Áreas" view can render manager -> report chains as an
// indented tree without full SVG connector math. Cycle-safe: a managerId loop
// just falls back to rendering the person at the root.
function buildAreaTree(peopleInArea: Person[]): { person: Person; depth: number }[] {
  const idsInArea = new Set(peopleInArea.map((person) => person.id));
  const childrenByManager = new Map<string, Person[]>();
  const roots: Person[] = [];

  peopleInArea.forEach((person) => {
    const managerInArea = person.managerId && idsInArea.has(person.managerId) ? person.managerId : null;
    if (managerInArea) {
      childrenByManager.set(managerInArea, [...(childrenByManager.get(managerInArea) || []), person]);
    } else {
      roots.push(person);
    }
  });

  const result: { person: Person; depth: number }[] = [];
  const visited = new Set<string>();
  const walk = (person: Person, depth: number) => {
    if (visited.has(person.id)) return;
    visited.add(person.id);
    result.push({ person, depth });
    (childrenByManager.get(person.id) || []).forEach((child) => walk(child, depth + 1));
  };
  roots.forEach((person) => walk(person, 0));
  peopleInArea.forEach((person) => {
    if (!visited.has(person.id)) walk(person, 0);
  });

  return result;
}

// High-contrast pill colors for custom tags — same bg-100/dark:bg-900 formula as
// ROLE_BADGES so tags stay legible in both Modo Claro and Modo Oscuro.
const TAG_COLOR_STYLES: Record<TagColorKey, { bg: string; border: string; text: string }> = {
  slate: { bg: 'bg-slate-200 dark:bg-slate-800', border: 'border-slate-400 dark:border-slate-600', text: 'text-slate-900 dark:text-slate-100' },
  red: { bg: 'bg-red-100 dark:bg-red-900/80', border: 'border-red-300 dark:border-red-700', text: 'text-red-800 dark:text-red-200' },
  orange: { bg: 'bg-orange-100 dark:bg-orange-900/80', border: 'border-orange-300 dark:border-orange-700', text: 'text-orange-800 dark:text-orange-200' },
  amber: { bg: 'bg-amber-100 dark:bg-amber-900/80', border: 'border-amber-300 dark:border-amber-700', text: 'text-amber-800 dark:text-amber-200' },
  emerald: { bg: 'bg-emerald-100 dark:bg-emerald-900/80', border: 'border-emerald-300 dark:border-emerald-700', text: 'text-emerald-800 dark:text-emerald-200' },
  cyan: { bg: 'bg-cyan-100 dark:bg-cyan-900/80', border: 'border-cyan-300 dark:border-cyan-700', text: 'text-cyan-800 dark:text-cyan-200' },
  blue: { bg: 'bg-blue-100 dark:bg-blue-900/80', border: 'border-blue-300 dark:border-blue-700', text: 'text-blue-800 dark:text-blue-200' },
  violet: { bg: 'bg-violet-100 dark:bg-violet-900/80', border: 'border-violet-300 dark:border-violet-700', text: 'text-violet-800 dark:text-violet-200' },
  pink: { bg: 'bg-pink-100 dark:bg-pink-900/80', border: 'border-pink-300 dark:border-pink-700', text: 'text-pink-800 dark:text-pink-200' },
};

const TAG_COLOR_OPTIONS = Object.keys(TAG_COLOR_STYLES) as TagColorKey[];

// Common FTE (Full-Time Equivalent) dedication levels offered when creating a
// Position or assigning someone to one. Stored as a 0-1 fraction on Position.
const FTE_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: '100%' },
  { value: 0.75, label: '75%' },
  { value: 0.5, label: '50%' },
  { value: 0.25, label: '25%' },
];

function formatFte(fte: number) {
  return `${Math.round(fte * 100)}%`;
}

// Position tasks are plain strings; a task is marked "done" by prefixing it with
// this marker so the shape stays `tasks: string[]` (no extra fields to migrate).
const TASK_DONE_PREFIX = '✔ ';

function isTaskDone(task: string) {
  return task.startsWith(TASK_DONE_PREFIX);
}

function taskLabel(task: string) {
  return isTaskDone(task) ? task.slice(TASK_DONE_PREFIX.length) : task;
}

function toggleTaskDoneMarker(task: string) {
  return isTaskDone(task) ? taskLabel(task) : `${TASK_DONE_PREFIX}${task}`;
}

const SUGGESTED_TAGS = ['RRHH', 'Licitaciones', 'ITO', 'Dirección', 'Legal', 'Finanzas', 'Tecnología', 'Logística'];

const COMMITMENT_STATUS_OPTIONS: CommitmentStatus[] = ['Pendiente', 'En Progreso', 'Completado', 'Riesgo'];

function isCommitmentStatus(value: unknown): value is CommitmentStatus {
  return typeof value === 'string' && (COMMITMENT_STATUS_OPTIONS as string[]).includes(value);
}

// Parses a "DD/MM/YYYY" string (the format used across the July licitación
// planillas) into an ISO "YYYY-MM-DD" date. Several closeDate values are
// placeholders like "Contrato" or "Esperando" rather than real dates — those
// return null and simply don't get a calendar entry.
function parseDdMmYyyyToIso(value: string): string | undefined {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
  if (!match) return undefined;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

// Whole-day difference between `dateIso` and today (negative = overdue). Both
// sides are normalized to local midnight so the result doesn't drift by ±1
// depending on what time of day it's computed.
function daysUntil(dateIso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateIso}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

interface DueUrgency {
  label: string;
  tone: 'red' | 'orange' | 'green' | 'slate';
}

// Drives the badge coloring used on the Calendario modal and on entity/position
// cards: an explicit "Completado" always reads green, an explicit "Riesgo"
// always reads red, otherwise the badge is derived purely from how many days
// remain until `dueDate` (red < today, orange <= 7 days, green beyond that).
function getDueUrgency(dueDate: string | undefined, commitmentStatus: CommitmentStatus | undefined): DueUrgency {
  if (commitmentStatus === 'Completado') return { label: 'Completado', tone: 'green' };
  if (!dueDate) return { label: commitmentStatus || 'Sin fecha', tone: 'slate' };

  const days = daysUntil(dueDate);
  if (commitmentStatus === 'Riesgo') {
    return { label: days < 0 ? `En riesgo · vencido hace ${Math.abs(days)}d` : `En riesgo · ${days}d`, tone: 'red' };
  }
  if (days < 0) return { label: `Vencido hace ${Math.abs(days)}d`, tone: 'red' };
  if (days === 0) return { label: 'Vence hoy', tone: 'orange' };
  if (days <= 7) return { label: `${days}d restantes`, tone: 'orange' };
  return { label: `${days}d restantes`, tone: 'green' };
}

const URGENCY_TONE_STYLES: Record<DueUrgency['tone'], string> = {
  red: 'border-red-400/60 bg-red-500/15 text-red-200',
  orange: 'border-orange-400/60 bg-orange-500/15 text-orange-200',
  green: 'border-emerald-400/60 bg-emerald-500/15 text-emerald-200',
  slate: 'border-slate-600 bg-slate-800/60 text-slate-300',
};

function DueDateBadge({ dueDate, commitmentStatus }: { dueDate: string; commitmentStatus?: CommitmentStatus }) {
  const urgency = getDueUrgency(dueDate, commitmentStatus);
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold ${URGENCY_TONE_STYLES[urgency.tone]}`}>
      {urgency.tone === 'red' && <AlertTriangle className="h-2.5 w-2.5" />}
      {urgency.tone === 'orange' && <Clock className="h-2.5 w-2.5" />}
      {urgency.tone === 'green' && <CheckCircle2 className="h-2.5 w-2.5" />}
      {urgency.label}
    </span>
  );
}

function getTagColorStyle(color: TagColorKey) {
  return TAG_COLOR_STYLES[color] || TAG_COLOR_STYLES.slate;
}

const JULY_LICITATION_ENTITIES: BoardEntity[] = [
  {
    id: 'lic-17-2026-ambulancias-combate',
    type: 'licitacion',
    code: '17-2026',
    client: 'EJERCITO',
    name: '[17-2026] Ambulancias de Combate - EJERCITO',
    budgetUsd: 'USD 13.557.150',
    closeDate: '07/08/2026',
    status: 'Retiro DIVAE',
    description: 'Presupuesto: USD 13.557.150 | Cierre: 07/08/2026 | Estado: Retiro DIVAE',
    dueDate: parseDdMmYyyyToIso('07/08/2026'),
  },
  {
    id: 'lic-21-2026-adquisicion-vehiculos',
    type: 'licitacion',
    code: '21-2026',
    client: 'EJERCITO',
    name: '[21-2026] Adquisicion de Vehiculos - EJERCITO',
    budgetUsd: 'USD 4.197.166',
    closeDate: '14/09/2026',
    status: 'Por Email',
    description: 'Presupuesto: USD 4.197.166 | Cierre: 14/09/2026 | Estado: Por Email',
    dueDate: parseDdMmYyyyToIso('14/09/2026'),
  },
  {
    id: 'lic-11-2025-municion-556-ss109',
    type: 'licitacion',
    code: '11-2025',
    client: 'EJERCITO',
    name: '[11-2025] Adq. Municion 5,56 SS109 - EJERCITO',
    budgetUsd: 'USD 2.184.000',
    closeDate: 'Contrato',
    status: 'Fabricacion',
    description: 'Presupuesto: USD 2.184.000 | Cierre: Contrato | Estado: Fabricacion',
    dueDate: parseDdMmYyyyToIso('Contrato'),
  },
  {
    id: 'lic-45-2024-cadenas-grupos-carpa',
    type: 'licitacion',
    code: '45-2024',
    client: 'EJERCITO',
    name: '[45-2024] Cadenas, Grupos Elec. y Carpa Sanidad - EJERCITO',
    budgetUsd: 'USD 898.450',
    closeDate: 'Esperando',
    status: 'Prorroga CTO',
    description: 'Presupuesto: USD 898.450 | Cierre: Esperando | Estado: Prorroga CTO',
    dueDate: parseDdMmYyyyToIso('Esperando'),
  },
  {
    id: 'lic-23-2026-kits-mantenimiento-vehiculos',
    type: 'licitacion',
    code: '23-2026',
    client: 'EJERCITO',
    name: '[23-2026] Kits Mantenimiento Vehiculos Campaña - EJERCITO',
    budgetUsd: 'USD 414.242,84',
    closeDate: '08/09/2026',
    status: 'Por Email',
    description: 'Presupuesto: USD 414.242,84 | Cierre: 08/09/2026 | Estado: Por Email',
    dueDate: parseDdMmYyyyToIso('08/09/2026'),
  },
  {
    id: 'lic-20-2026-kit-kim-f1',
    type: 'licitacion',
    code: '20-2026',
    client: 'EJERCITO',
    name: '[20-2026] Kit KIM F1 Tipo A y B - EJERCITO',
    budgetUsd: 'USD 314.369,24',
    closeDate: '25/08/2026',
    status: 'Resp. por Email',
    description: 'Presupuesto: USD 314.369,24 | Cierre: 25/08/2026 | Estado: Resp. por Email',
    dueDate: parseDdMmYyyyToIso('25/08/2026'),
  },
  {
    id: 'lic-19-2026-montana-lautaro-ii',
    type: 'licitacion',
    code: '19-2026',
    client: 'EJERCITO',
    name: '[19-2026] Equipamiento de Montaña "Lautaro II" - EJERCITO',
    budgetUsd: 'USD 84.353',
    closeDate: '05/08/2026',
    status: 'Resp. por Email',
    description: 'Presupuesto: USD 84.353 | Cierre: 05/08/2026 | Estado: Resp. por Email',
    dueDate: parseDdMmYyyyToIso('05/08/2026'),
  },
  {
    id: 'lic-1238177-arriendo-vehiculos-seguridad',
    type: 'licitacion',
    code: '1238177',
    client: 'MUNI PROVIDENCIA',
    name: '[1238177] Arriendo Vehiculos Seguridad - MUNI PROVIDENCIA',
    closeDate: '07/08/2026',
    status: 'Portal',
    description: 'Cierre: 07/08/2026 | Estado: Portal',
    dueDate: parseDdMmYyyyToIso('07/08/2026'),
  },
  {
    id: 'lic-rfi-chalecos-antibalas-l5',
    type: 'licitacion',
    code: 'RFI',
    client: 'CARABINEROS',
    name: '[RFI] Chalecos Antibalas L5 - CARABINEROS',
    closeDate: '24/07/2026',
    status: 'Por Email',
    description: 'Cierre: 24/07/2026 | Estado: Por Email',
    dueDate: parseDdMmYyyyToIso('24/07/2026'),
  },
];

const JULY_LICITATION_IDS = JULY_LICITATION_ENTITIES.map((entity) => entity.id);

const INITIAL_STATE: BoardState = {
  entities: [
    {
      id: 'entity-cramick',
      type: 'empresa',
      name: 'Cramick S.A.',
      description: 'Licitaciones de defensa y logística militar.',
      positions: [
        { id: 'pos-cramick-1', title: 'Jefe de Proyecto', department: 'Dirección', fte: 1, assignedPersonId: 'person-2', tasks: ['Coordinar cronograma general', 'Aprobación de facturas'] },
        { id: 'pos-cramick-2', title: 'Encargado de Licitaciones', department: 'Comercial', fte: 0.5, assignedPersonId: null, tasks: [] },
      ],
    },
    {
      id: 'entity-centurion',
      type: 'empresa',
      name: 'Centurion Armors SpA',
      description: 'Equipamiento táctico, blindaje y seguridad avanzada.',
      positions: [
        { id: 'pos-centurion-1', title: 'Jefe de Compras', department: 'Operaciones', fte: 1, assignedPersonId: 'person-8', tasks: ['Cotizar seguros', 'Supervisar avance en terreno'] },
        { id: 'pos-centurion-2', title: 'Analista de Contratos', department: 'Legal', fte: 0.25, assignedPersonId: null, tasks: [] },
      ],
    },
    { id: 'entity-bedrock', type: 'empresa', name: 'Bedrock S.A.', description: 'Servicios gastronómicos y operaciones de restauración.' },
    { id: 'entity-alpha', type: 'proyecto', name: 'Proyecto Alpha', description: 'Mesa horizontal para coordinación transversal.' },
    ...JULY_LICITATION_ENTITIES,
    { id: 'entity-nomina', type: 'tarea', name: 'Cierre de Nómina', description: 'Situaciones, notas y pendientes operativos.' },
  ],
  entitiesOrder: ['entity-cramick', 'entity-centurion', 'entity-bedrock', 'entity-alpha', ...JULY_LICITATION_IDS, 'entity-nomina'],
  people: [
    { id: 'person-1', name: 'Javier Alonso Farfán Santibáñez', role: 'Arquitectura', category: 'ITO', email: 'j.farfan@cramick.cl', phone: '+56 9 8765 4321', notes: 'Asesor externo para proyectos de diseño.', skills: ['Diseño estructural', 'Revisión de planos'], customTags: [{ id: 'tag-1', label: 'ITO', color: 'cyan' }], supervisor: '' },
    { id: 'person-2', name: 'Carlos Amunátegui Bustos', role: 'Management', category: 'Producto', email: 'c.amunategui@cramick.cl', phone: '+56 9 1234 5678', notes: 'Lidera desarrollo de productos tácticos.', skills: ['Gestión de producto', 'Liderazgo de equipos'], customTags: [{ id: 'tag-2', label: 'Dirección', color: 'blue' }], supervisor: '' },
    { id: 'person-3', name: 'Christian Alberto Araya Cheuquepil', role: 'Administrativo', category: 'Administración', email: 'c.araya@cramick.cl', phone: '+56 9 2233 4455', notes: 'Soporte ejecutivo y coordinación administrativa.', skills: ['Coordinación administrativa'], customTags: [{ id: 'tag-3', label: 'RRHH', color: 'amber' }], supervisor: 'Coordinado por Carlos Amunátegui' },
    { id: 'person-4', name: 'Aleksandar Plazinic Plazinic', role: 'Asesor', category: 'Defensa', email: 'a.plazinic@cramick.cl', phone: '+56 9 5566 7788', notes: 'Certificaciones y estándares de defensa.', skills: ['Certificaciones de defensa'], customTags: [{ id: 'tag-4', label: 'Legal', color: 'violet' }], supervisor: '' },
    { id: 'person-5', name: 'Eloin Rojas Carrasco', role: 'Logística', category: 'Inventario', email: 'e.rojas@cramick.cl', phone: '+56 9 9988 7766', notes: 'Control de vestuario y equipo militar.', skills: ['Control de inventario'], customTags: [{ id: 'tag-5', label: 'Logística', color: 'orange' }], supervisor: '' },
    { id: 'person-6', name: 'María Victoria Valderas Sánchez', role: 'RRHH', category: 'Coordinación', email: 'mv.valderas@cramick.cl', phone: '+56 9 3344 5566', notes: 'Agenda comercial y adquisiciones.', skills: ['Gestión de personas', 'Negociación'], customTags: [{ id: 'tag-6', label: 'RRHH', color: 'amber' }], supervisor: '' },
    { id: 'person-7', name: 'Santiago Hernandes Barbara', role: 'Ventas', category: 'Licitaciones', email: 's.hernandes@centurion.cl', phone: '+56 9 4433 2211', notes: 'Licitaciones de blindaje corporal.', skills: ['Licitaciones públicas'], customTags: [{ id: 'tag-7', label: 'Licitaciones', color: 'emerald' }], supervisor: '' },
    { id: 'person-8', name: 'Marko Jovovic Jovovic', role: 'Management', category: 'Compras', email: 'm.jovovic@centurion.cl', phone: '+56 9 7766 5544', notes: 'Adquisiciones internacionales y contratos.', skills: ['Negociación de contratos'], customTags: [], supervisor: '' },
  ],
  assignments: [
    { id: 'assign-1', personId: 'person-1', entityId: 'entity-cramick', taskText: 'Revisar planos estructurales y apoyar criterios técnicos.' },
    { id: 'assign-2', personId: 'person-2', entityId: 'entity-cramick', taskText: 'Coordinar estrategia de producto.' },
    { id: 'assign-3', personId: 'person-3', entityId: 'entity-cramick', taskText: 'Centralizar información administrativa.' },
    { id: 'assign-4', personId: 'person-4', entityId: 'entity-cramick', taskText: 'Validar estándares de defensa.' },
    { id: 'assign-5', personId: 'person-5', entityId: 'entity-cramick', taskText: 'Controlar inventarios y entregas.' },
    { id: 'assign-6', personId: 'person-6', entityId: 'entity-cramick', taskText: 'Coordinar nómina y documentos.' },
    { id: 'assign-7', personId: 'person-7', entityId: 'entity-centurion', taskText: 'Gestionar propuestas comerciales.' },
    { id: 'assign-8', personId: 'person-8', entityId: 'entity-centurion', taskText: 'Gestionar compras y proveedores.' },
    { id: 'assign-9', personId: 'person-2', entityId: 'entity-alpha', taskText: 'Liderar seguimiento horizontal del proyecto.' },
    { id: 'assign-10', personId: 'person-3', entityId: 'entity-nomina', taskText: 'Registrar pendientes y situaciones del cierre.' },
  ],
  connections: [
    { id: 'conn-1', sourcePersonId: 'person-3', targetPersonId: 'person-2', label: 'Reporta avances administrativos' },
    { id: 'conn-2', sourcePersonId: 'person-7', targetPersonId: 'person-8', label: 'Coordina licitación y compras' },
  ],
  holdingMembers: [
    { id: 'holding-0', level: 0, name: 'Damir Solar', role: 'Dueño', notes: 'Radicado en el extranjero (10 meses al año).' },
    { id: 'holding-1', level: 1, name: 'Rafael Valenzuela Munita', role: 'Asesor Financiero y del Directorio', notes: 'Nexo principal para la toma de decisiones del Holding.' },
  ],
};

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getRoleBadge(role: RoleType) {
  return ROLE_BADGES[role] || ROLE_BADGES.Operativo;
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function isValidBoardState(value: unknown): value is BoardState {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BoardState>;
  return (
    Array.isArray(candidate.people) &&
    Array.isArray(candidate.entities) &&
    Array.isArray(candidate.assignments) &&
    Array.isArray(candidate.connections)
  );
}

// `skills` / `customTags` / `supervisor` / `managerId` were introduced after boards were already
// saved/exported. Backfill them so older stored/imported people keep working.
function normalizePerson(person: Partial<Person> & { id: string; name: string }): Person {
  const rawTags = Array.isArray(person.customTags) ? person.customTags : [];

  return {
    id: person.id,
    name: person.name,
    role: person.role && ROLE_OPTIONS.includes(person.role) ? person.role : 'Operativo',
    category: person.category || 'General',
    email: person.email || '',
    phone: person.phone || '',
    notes: person.notes || '',
    skills: Array.isArray(person.skills) ? person.skills.filter((skill): skill is string => typeof skill === 'string') : [],
    customTags: rawTags
      .filter((tag) => Boolean(tag) && typeof tag === 'object' && typeof tag.label === 'string')
      .map((tag) => ({
        id: tag.id || createId('tag'),
        label: tag.label,
        color: tag.color && TAG_COLOR_OPTIONS.includes(tag.color) ? tag.color : 'slate',
      })),
    supervisor: typeof person.supervisor === 'string' ? person.supervisor : '',
    managerId: typeof person.managerId === 'string' ? person.managerId : '',
  };
}

// `positions` was introduced after entities were already saved/exported/JSON'd, and
// FTE is only meaningful as a fraction in (0, 1]. Backfill/clamp so older or
// hand-edited entities keep working.
function normalizePosition(position: Partial<Position> & { id?: string }): Position {
  return {
    id: position.id || createId('position'),
    title: typeof position.title === 'string' && position.title.trim() ? position.title : 'Puesto sin título',
    department: typeof position.department === 'string' ? position.department : '',
    fte: typeof position.fte === 'number' && position.fte > 0 && position.fte <= 1 ? position.fte : 1,
    assignedPersonId: typeof position.assignedPersonId === 'string' ? position.assignedPersonId : null,
    tasks: Array.isArray(position.tasks) ? position.tasks.filter((task): task is string => typeof task === 'string') : [],
    startDate: typeof position.startDate === 'string' && position.startDate ? position.startDate : undefined,
    dueDate: typeof position.dueDate === 'string' && position.dueDate ? position.dueDate : undefined,
    commitmentStatus: isCommitmentStatus(position.commitmentStatus) ? position.commitmentStatus : undefined,
  };
}

// `holdingMembers`, `entitiesOrder`, the extended Person fields and per-entity
// `positions` were introduced after boards were already saved/exported. Backfill
// them so older stored/imported states keep working without losing data.
function normalizeBoardState(state: BoardState): BoardState {
  const persistedOrder = Array.isArray(state.entitiesOrder) ? state.entitiesOrder : [];
  const replacedLicitacionIds = new Set(['entity-ejercito', ...JULY_LICITATION_IDS]);
  const rawEntities = [
    ...state.entities.filter((entity) => !replacedLicitacionIds.has(entity.id)),
    ...JULY_LICITATION_ENTITIES,
  ];
  const existingEntityIds = new Set(rawEntities.map((entity) => entity.id));
  const orderWithoutReplacedLicitaciones = [
    ...(persistedOrder.length > 0 ? persistedOrder : state.entities.map((entity) => entity.id)),
  ].filter((entityId) => !replacedLicitacionIds.has(entityId) && existingEntityIds.has(entityId));
  const taskIndex = orderWithoutReplacedLicitaciones.indexOf('entity-nomina');
  const normalizedOrder = [
    ...(taskIndex >= 0 ? orderWithoutReplacedLicitaciones.slice(0, taskIndex) : orderWithoutReplacedLicitaciones),
    ...JULY_LICITATION_IDS,
    ...(taskIndex >= 0 ? orderWithoutReplacedLicitaciones.slice(taskIndex) : []),
  ];

  const rawPeople = state.people.map(normalizePerson);
  const peopleIds = new Set(rawPeople.map((person) => person.id));
  const managerByConnection = new Map<string, string>();
  state.connections.forEach((connection) => {
    if (!managerByConnection.has(connection.sourcePersonId)) {
      managerByConnection.set(connection.sourcePersonId, connection.targetPersonId);
    }
  });
  const people = rawPeople.map((person) => {
    const managerId = person.managerId || managerByConnection.get(person.id) || '';
    return {
      ...person,
      managerId: managerId && managerId !== person.id && peopleIds.has(managerId) ? managerId : '',
    };
  });
  const entities = rawEntities.map((entity) => ({
    ...entity,
    commitmentStatus: isCommitmentStatus(entity.commitmentStatus) ? entity.commitmentStatus : undefined,
    positions: (Array.isArray(entity.positions) ? entity.positions : [])
      .map(normalizePosition)
      // A position whose assigned person no longer exists (e.g. deleted from
      // another device before this JSON was exported) goes vacant, not deleted.
      .map((position) =>
        position.assignedPersonId && !peopleIds.has(position.assignedPersonId)
          ? { ...position, assignedPersonId: null }
          : position
      ),
  }));
  const validConnections = state.connections.filter(
    (connection) => peopleIds.has(connection.sourcePersonId) && peopleIds.has(connection.targetPersonId)
  );
  const existingConnectionKeys = new Set(validConnections.map((connection) => `${connection.sourcePersonId}:${connection.targetPersonId}`));
  const managerConnections = people
    .filter((person) => person.managerId && !existingConnectionKeys.has(`${person.id}:${person.managerId}`))
    .map((person) => ({
      id: createId('conn'),
      sourcePersonId: person.id,
      targetPersonId: person.managerId as string,
      label: 'Reporta a',
    }));

  return {
    ...state,
    entities,
    entitiesOrder: normalizedOrder,
    assignments: state.assignments.filter((assignment) => assignment.entityId !== 'entity-ejercito'),
    connections: [...validConnections, ...managerConnections],
    people,
    holdingMembers: Array.isArray(state.holdingMembers) && state.holdingMembers.length > 0
      ? state.holdingMembers
      : INITIAL_STATE.holdingMembers,
  };
}

function loadState(): BoardState {
  if (typeof window === 'undefined') return normalizeBoardState(INITIAL_STATE);

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (isValidBoardState(parsed)) {
        return normalizeBoardState(parsed);
      }
    }

    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const legacyEmployees = JSON.parse(legacy) as Array<{ id: string; name: string; role: RoleType; companyId: string; email?: string; phone?: string; notes?: string }>;
      if (Array.isArray(legacyEmployees)) {
        const entities = INITIAL_STATE.entities;
        const people = legacyEmployees.map((employee) =>
          normalizePerson({
            id: employee.id.replace('emp', 'person'),
            name: employee.name,
            role: ROLE_OPTIONS.includes(employee.role) ? employee.role : 'Operativo',
            category: 'Migrado',
            email: employee.email || '',
            phone: employee.phone || '',
            notes: employee.notes || '',
          })
        );
        const companyMap: Record<string, string> = {
          cramick: 'entity-cramick',
          centurion: 'entity-centurion',
          bedrock: 'entity-bedrock',
        };
        const assignments = legacyEmployees.map((employee) => ({
          id: createId('assign'),
          personId: employee.id.replace('emp', 'person'),
          entityId: companyMap[employee.companyId] || 'entity-cramick',
          taskText: employee.notes || '',
        }));

        return {
          people,
          entities,
          entitiesOrder: entities.map((entity) => entity.id),
          assignments,
          connections: [],
          holdingMembers: INITIAL_STATE.holdingMembers,
        };
      }
    }
  } catch {
    return normalizeBoardState(INITIAL_STATE);
  }

  return normalizeBoardState(INITIAL_STATE);
}

function loadTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  return storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'dark';
}

function isValidSnapshot(value: unknown): value is BoardSnapshot {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<BoardSnapshot>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.name === 'string' &&
    typeof candidate.createdAt === 'string' &&
    isValidBoardState(candidate.state)
  );
}

function loadSnapshots(): BoardSnapshot[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = window.localStorage.getItem(SNAPSHOTS_STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter(isValidSnapshot) : [];
  } catch {
    return [];
  }
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const cleanQuery = query.trim();
  if (!cleanQuery) return <>{text}</>;

  const escapedQuery = cleanQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${escapedQuery})`, 'gi'));

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === cleanQuery.toLowerCase() ? (
          <mark key={`${part}-${index}`} className="rounded bg-amber-300/20 px-0.5 text-amber-100">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

function RoleBadge({ role }: { role: RoleType }) {
  const colors = getRoleBadge(role);

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-semibold ${colors.bg} ${colors.border} ${colors.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${colors.dot}`} />
      {role}
    </span>
  );
}

function ManagerLine({ managerName, dense = false }: { managerName?: string; dense?: boolean }) {
  if (!managerName) return null;

  return (
    <p className={`mt-1 inline-flex min-w-0 items-center gap-1 font-semibold text-sky-300/85 ${dense ? 'text-[10px]' : 'text-[11px]'}`}>
      <CornerRightUp className="h-3 w-3 shrink-0" />
      <span className="truncate">Reporta a: {managerName}</span>
    </p>
  );
}

// Two modes:
// - Interactive (`showToggle`): collapsed by default to a single primary badge
//   (first skill, else first tag) plus a "+N más" pill that expands/collapses
//   the rest — skills, tags and the supervisor line — on click. Driven by the
//   `expanded` flag lifted to App so a global header toggle and per-card clicks
//   share the same state.
// - Static (`limit`, no `showToggle`): the original fixed truncation, kept for
//   contexts where a nested toggle button isn't valid (e.g. the Mind Map's
//   person entries, which are themselves buttons) or a full always-on listing
//   (the person detail panel, `limit` omitted).
function PersonBadges({
  person,
  limit,
  expanded = true,
  onToggleExpand,
  showToggle = false,
}: {
  person: Person;
  limit?: number;
  expanded?: boolean;
  onToggleExpand?: () => void;
  showToggle?: boolean;
}) {
  const skills = person.skills || [];
  const tags = person.customTags || [];
  const hasSupervisor = Boolean(person.supervisor);
  const totalBadges = skills.length + tags.length;
  const totalItems = totalBadges + (hasSupervisor ? 1 : 0);

  if (totalItems === 0) return null;

  const canToggle = showToggle && totalItems > 1;
  const isCollapsed = canToggle && !expanded;

  const toggleControl = canToggle ? (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onToggleExpand?.();
      }}
      className="inline-flex items-center gap-0.5 rounded-full border border-slate-700 bg-slate-950 px-2 py-0.5 text-[9px] font-bold text-slate-300 transition-colors hover:border-indigo-500/50 hover:text-indigo-300"
      title={isCollapsed ? 'Mostrar todas las etiquetas' : 'Colapsar etiquetas'}
    >
      {isCollapsed ? `+${totalItems - 1} más` : 'Menos'}
      {isCollapsed ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronUp className="h-2.5 w-2.5" />}
    </button>
  ) : null;

  if (isCollapsed) {
    const firstSkill = skills[0];
    const firstTag = !firstSkill ? tags[0] : undefined;
    const firstTagColors = firstTag ? getTagColorStyle(firstTag.color) : null;

    return (
      <div className="mt-2 flex flex-wrap items-center gap-1.5 transition-all duration-200">
        {firstSkill && (
          <span className="inline-flex items-center rounded-full border border-indigo-300 bg-indigo-100 px-2 py-0.5 text-[9px] font-bold text-indigo-800 dark:border-indigo-700 dark:bg-indigo-900/80 dark:text-indigo-200">
            {firstSkill}
          </span>
        )}
        {!firstSkill && firstTag && firstTagColors && (
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold ${firstTagColors.bg} ${firstTagColors.border} ${firstTagColors.text}`}>
            {firstTag.label}
          </span>
        )}
        {toggleControl}
      </div>
    );
  }

  const visibleSkillCount = limit === undefined ? skills.length : Math.min(skills.length, limit);
  const visibleTagCount = limit === undefined ? tags.length : Math.max(0, Math.min(tags.length, limit - visibleSkillCount));
  const visibleSkills = skills.slice(0, visibleSkillCount);
  const visibleTags = tags.slice(0, visibleTagCount);
  const hiddenCount = totalBadges - visibleSkills.length - visibleTags.length;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 transition-all duration-200">
      {visibleSkills.map((skill) => (
        <span
          key={skill}
          className="inline-flex items-center rounded-full border border-indigo-300 bg-indigo-100 px-2 py-0.5 text-[9px] font-bold text-indigo-800 dark:border-indigo-700 dark:bg-indigo-900/80 dark:text-indigo-200"
        >
          {skill}
        </span>
      ))}
      {visibleTags.map((tag) => {
        const colors = getTagColorStyle(tag.color);
        return (
          <span key={tag.id} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold ${colors.bg} ${colors.border} ${colors.text}`}>
            {tag.label}
          </span>
        );
      })}
      {hiddenCount > 0 && (
        <span className="inline-flex items-center rounded-full border border-slate-700 bg-slate-950 px-2 py-0.5 text-[9px] font-bold text-slate-400">
          +{hiddenCount}
        </span>
      )}
      {person.supervisor && (
        <span className="inline-flex items-center gap-1 rounded-full border border-slate-400 bg-slate-200 px-2 py-0.5 text-[9px] font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-300">
          Supervisa: {person.supervisor}
        </span>
      )}
      {toggleControl}
    </div>
  );
}

function PersonCard({
  person,
  searchQuery,
  compact = false,
  dense = false,
  selected = false,
  connectionMode = false,
  readOnly = false,
  highlighted = false,
  badgesExpanded = false,
  managerName,
  onOpen,
  onConnect,
  onHover,
  onToggleBadges,
  onOpenSummary,
}: {
  person: Person;
  searchQuery: string;
  compact?: boolean;
  dense?: boolean;
  selected?: boolean;
  connectionMode?: boolean;
  readOnly?: boolean;
  highlighted?: boolean;
  badgesExpanded?: boolean;
  managerName?: string;
  onOpen: (person: Person) => void;
  onConnect: (person: Person) => void;
  onHover?: (personId: string | null) => void;
  onToggleBadges?: (personId: string) => void;
  onOpenSummary?: (personId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `person:${person.id}`,
    data: { type: 'person', personId: person.id },
    disabled: readOnly,
  });

  const style = transform ? { transform: CSS.Transform.toString(transform) } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-person-id={person.id}
      onClick={() => {
        if (connectionMode && !readOnly) {
          onConnect(person);
          return;
        }
        onOpen(person);
      }}
      onMouseEnter={() => onHover?.(person.id)}
      onMouseLeave={() => onHover?.(null)}
      className={`group rounded-xl border transition-all duration-200 ${dense ? 'p-2' : 'p-2.5'} ${
        selected
          ? 'border-amber-400 bg-amber-950/30 shadow-[0_0_16px_rgba(251,191,36,0.18)]'
          : highlighted
          ? 'border-cyan-400 bg-cyan-950/20 shadow-[0_0_18px_rgba(34,211,238,0.22)]'
          : connectionMode && !readOnly
          ? 'border-cyan-500/50 bg-slate-900/80 shadow-[0_0_12px_rgba(34,211,238,0.12)] hover:border-cyan-300'
          : 'border-slate-800 bg-slate-900/75 hover:border-slate-700 hover:bg-slate-900'
      } ${isDragging ? 'opacity-30' : 'opacity-100'} cursor-pointer`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className={`break-words font-display font-bold leading-tight text-slate-100 ${dense ? 'text-xs' : 'text-sm'}`}>
            <HighlightedText text={person.name} query={searchQuery} />
          </h4>
          <ManagerLine managerName={managerName} dense={dense || compact} />
          {!compact && <p className="mt-1 text-[11px] font-medium text-slate-500">{person.category}</p>}
        </div>
        {onOpenSummary && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenSummary(person.id);
            }}
            className="rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-slate-500 transition-colors hover:border-cyan-500/50 hover:text-cyan-300"
            title="Ver hoja de funciones consolidada"
          >
            <ClipboardList className="h-3.5 w-3.5" />
          </button>
        )}
        {!readOnly && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            onClick={(event) => event.stopPropagation()}
            className="rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-slate-500 transition-colors hover:border-slate-600 hover:text-slate-300 active:cursor-grabbing"
            title="Arrastrar persona"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        )}
        {!readOnly && connectionMode && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onConnect(person);
            }}
            className="rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-slate-400 transition-colors hover:border-amber-400/50 hover:text-amber-300"
            title="Crear conexión"
          >
            <Link2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {!compact && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <RoleBadge role={person.role} />
          <span className="rounded-md border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
            {person.id}
          </span>
        </div>
      )}
      {!compact && (
        <PersonBadges
          person={person}
          showToggle
          expanded={badgesExpanded}
          onToggleExpand={() => onToggleBadges?.(person.id)}
        />
      )}
    </div>
  );
}

function AssignmentCard({
  assignment,
  person,
  searchQuery,
  compact,
  dense = false,
  selected,
  connectionMode,
  readOnly = false,
  highlighted = false,
  canMoveUp,
  canMoveDown,
  badgesExpanded = false,
  managerName,
  onOpen,
  onConnect,
  onRemoveAssignment,
  onMoveAssignment,
  onHover,
  onToggleBadges,
  onOpenSummary,
}: {
  assignment: Assignment;
  person: Person;
  searchQuery: string;
  compact: boolean;
  dense?: boolean;
  selected: boolean;
  connectionMode: boolean;
  readOnly?: boolean;
  highlighted?: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  badgesExpanded?: boolean;
  managerName?: string;
  onOpen: (person: Person) => void;
  onConnect: (person: Person) => void;
  onRemoveAssignment: (assignmentId: string) => void;
  onMoveAssignment: (assignmentId: string, direction: 'up' | 'down') => void;
  onHover?: (personId: string | null) => void;
  onToggleBadges?: (personId: string) => void;
  onOpenSummary?: (personId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `assignment:${assignment.id}`,
    data: { type: 'assignment', personId: person.id, assignmentId: assignment.id, entityId: assignment.entityId },
    disabled: readOnly,
  });

  const style = transform ? { transform: CSS.Transform.toString(transform), transition } : { transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-person-id={person.id}
      onClick={() => {
        if (connectionMode && !readOnly) {
          onConnect(person);
          return;
        }
        onOpen(person);
      }}
      onMouseEnter={() => onHover?.(person.id)}
      onMouseLeave={() => onHover?.(null)}
      className={`group rounded-xl border transition-all duration-200 ${dense ? 'p-2' : 'p-2.5'} ${
        selected
          ? 'border-amber-400 bg-amber-950/30 shadow-[0_0_16px_rgba(251,191,36,0.18)]'
          : highlighted
          ? 'border-cyan-400 bg-cyan-950/20 shadow-[0_0_18px_rgba(34,211,238,0.22)]'
          : connectionMode && !readOnly
          ? 'border-cyan-500/50 bg-slate-900/80 shadow-[0_0_12px_rgba(34,211,238,0.12)] hover:border-cyan-300'
          : 'border-slate-800 bg-slate-900/70 hover:border-slate-700 hover:bg-slate-900'
      } ${isDragging ? 'opacity-30' : 'opacity-100'} cursor-pointer`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className={`break-words font-display font-bold leading-tight text-slate-100 ${dense ? 'text-xs' : 'text-sm'}`}>
            <HighlightedText text={person.name} query={searchQuery} />
          </h4>
          <ManagerLine managerName={managerName} dense={dense || compact} />
          {!compact && <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-400">{assignment.taskText || 'Sin función específica registrada.'}</p>}
        </div>
        {onOpenSummary && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenSummary(person.id);
            }}
            className="shrink-0 rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-slate-500 transition-colors hover:border-cyan-500/50 hover:text-cyan-300"
            title="Ver hoja de funciones consolidada"
          >
            <ClipboardList className="h-3.5 w-3.5" />
          </button>
        )}
        {!readOnly && (
          <div className="flex shrink-0 items-center gap-1">
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onMoveAssignment(assignment.id, 'up');
                }}
                disabled={!canMoveUp}
                className="rounded-md border border-slate-700 bg-slate-950 p-0.5 text-slate-500 transition-colors hover:border-slate-600 hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-30"
                title="Subir asignación"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onMoveAssignment(assignment.id, 'down');
                }}
                disabled={!canMoveDown}
                className="rounded-md border border-slate-700 bg-slate-950 p-0.5 text-slate-500 transition-colors hover:border-slate-600 hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-30"
                title="Bajar asignación"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onRemoveAssignment(assignment.id);
              }}
              className="rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-slate-500 opacity-70 transition-colors hover:border-red-400/50 hover:text-red-300 group-hover:opacity-100"
              title="Quitar de esta entidad"
            >
              <UserMinus className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              {...attributes}
              {...listeners}
              onClick={(event) => event.stopPropagation()}
              className="rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-slate-500 transition-colors hover:border-slate-600 hover:text-slate-300 active:cursor-grabbing"
              title="Arrastrar asignación"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        {!readOnly && connectionMode && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onConnect(person);
            }}
            className="rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-slate-400 transition-colors hover:border-amber-400/50 hover:text-amber-300"
            title="Crear conexión"
          >
            <Link2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {!compact && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <RoleBadge role={person.role} />
          <span className="rounded-md border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
            {person.category}
          </span>
        </div>
      )}
      {!compact && (
        <PersonBadges
          person={person}
          showToggle
          expanded={badgesExpanded}
          onToggleExpand={() => onToggleBadges?.(person.id)}
        />
      )}
    </div>
  );
}

function LicitationEntitySummary({ entity }: { entity: BoardEntity }) {
  if (entity.type !== 'licitacion') return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {entity.code && (
        <span className="rounded-md border border-white/25 bg-slate-950/40 px-2 py-0.5 text-[10px] font-extrabold text-white">
          ID {entity.code}
        </span>
      )}
      {entity.client && (
        <span className="rounded-md border border-white/25 bg-slate-950/40 px-2 py-0.5 text-[10px] font-extrabold text-white">
          {entity.client}
        </span>
      )}
      {entity.budgetUsd && (
        <span className="rounded-md border border-emerald-200/50 bg-emerald-950/45 px-2 py-0.5 text-[10px] font-extrabold text-emerald-100">
          {entity.budgetUsd}
        </span>
      )}
    </div>
  );
}

// A Puesto (Position) card: vacant positions get a dashed amber outline, a
// "VACANTE" badge and an inline occupy control (dropdown + FTE + button, plus a
// drop target for dragging a Person straight from the Bank). Occupied positions
// show the assigned person, their FTE% and a "Desasignar" action that frees the
// position without deleting it — the position is the SSoT, not the assignment.
function PositionCard({
  position,
  entityId,
  people,
  readOnly,
  onAssign,
  onUnassign,
  onEdit,
  onDelete,
  canMoveUp,
  canMoveDown,
  onMove,
  onAddTask,
  onToggleTask,
  onRemoveTask,
}: {
  position: Position;
  entityId: string;
  people: Person[];
  readOnly: boolean;
  onAssign: (entityId: string, positionId: string, personId: string, fte: number) => void;
  onUnassign: (entityId: string, positionId: string) => void;
  onEdit: (position: Position, entityId: string) => void;
  onDelete: (entityId: string, positionId: string) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMove: (positionId: string, direction: 'up' | 'down') => void;
  onAddTask: (entityId: string, positionId: string, taskText: string) => void;
  onToggleTask: (entityId: string, positionId: string, taskIndex: number) => void;
  onRemoveTask: (entityId: string, positionId: string, taskIndex: number) => void;
}) {
  const assignedPerson = position.assignedPersonId
    ? people.find((candidate) => candidate.id === position.assignedPersonId) || null
    : null;
  const isVacant = !assignedPerson;
  const tasks = position.tasks || [];

  const {
    attributes: positionAttributes,
    listeners: positionListeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({
    id: `position:${position.id}`,
    data: { type: 'position', entityId, positionId: position.id },
    disabled: readOnly,
  });
  const {
    attributes: personDragAttributes,
    listeners: personDragListeners,
    setNodeRef: setPersonDragRef,
    transform: personDragTransform,
    isDragging: isPersonDragging,
  } = useDraggable({
    id: `position-person:${position.id}`,
    data: {
      type: 'position-person',
      personId: assignedPerson?.id,
      entityId,
      positionId: position.id,
      fte: position.fte,
    },
    disabled: readOnly || !assignedPerson,
  });

  const [pickedPersonId, setPickedPersonId] = useState('');
  const [pickedFte, setPickedFte] = useState<number>(1);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [newTaskText, setNewTaskText] = useState('');
  const style = transform ? { transform: CSS.Transform.toString(transform), transition } : { transition };
  const personDragStyle = personDragTransform ? { transform: CSS.Transform.toString(personDragTransform) } : undefined;
  const assignedPersonId = assignedPerson?.id;
  const assignedManagerName = assignedPerson?.managerId
    ? people.find((candidate) => candidate.id === assignedPerson.managerId)?.name
    : undefined;

  const submitNewTask = () => {
    const cleanTask = newTaskText.trim();
    if (!cleanTask) return;
    onAddTask(entityId, position.id, cleanTask);
    setNewTaskText('');
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-person-id={assignedPersonId}
      className={`rounded-xl border p-2.5 transition-all ${
        isVacant
          ? `border-dashed ${isOver ? 'border-amber-300 bg-amber-950/25' : 'border-amber-500/60 bg-amber-950/10'}`
          : 'border-slate-800 bg-slate-900/70'
      } ${isDragging ? 'opacity-40' : 'opacity-100'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <h5 className="min-w-0 truncate font-display text-xs font-bold leading-tight text-slate-100">{position.title}</h5>
            {!isVacant && (
              <span className="shrink-0 rounded-full border border-cyan-700/60 bg-cyan-950/50 px-2 py-0.5 text-[9px] font-black text-cyan-200">
                {formatFte(position.fte)} FTE
              </span>
            )}
          </div>
          {position.department && <p className="mt-0.5 truncate text-[10px] font-medium text-slate-500">{position.department}</p>}
          {position.dueDate && (
            <div className="mt-1.5">
              <DueDateBadge dueDate={position.dueDate} commitmentStatus={position.commitmentStatus} />
            </div>
          )}
          {assignedPerson && (
            <div
              ref={setPersonDragRef}
              style={personDragStyle}
              {...personDragAttributes}
              {...personDragListeners}
              className={`mt-1.5 flex min-w-0 cursor-grab items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/45 px-2 py-1 active:cursor-grabbing ${
                isPersonDragging ? 'opacity-35' : 'opacity-100'
              }`}
              title="Arrastrar persona a otro puesto, entidad o Banco"
            >
              <GripVertical className="h-3 w-3 shrink-0 text-slate-500" />
              <p className="min-w-0 flex-1 truncate text-xs font-bold text-slate-100">{assignedPerson.name}</p>
              <RoleBadge role={assignedPerson.role} />
            </div>
          )}
          <ManagerLine managerName={assignedManagerName} dense />
          {(tasks.length > 0 || !readOnly) && (
            <div className="mt-1.5">
              <button
                type="button"
                onClick={() => setTasksOpen((prev) => !prev)}
                className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-950 px-2 py-0.5 text-[9px] font-bold text-slate-400 transition-colors hover:border-indigo-500/50 hover:text-indigo-300"
                title={tasksOpen ? 'Ocultar funciones' : 'Ver / editar funciones específicas de este puesto'}
              >
                <ClipboardList className="h-2.5 w-2.5" />
                {tasks.length > 0 ? `${tasks.length} función${tasks.length === 1 ? '' : 'es'}` : 'Sin funciones'}
                {tasksOpen ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
              </button>
              {!tasksOpen && tasks.length > 0 && (
                <p className="mt-1 truncate text-[9px] italic text-slate-500">
                  {tasks.slice(0, 2).map(taskLabel).join(' · ')}
                </p>
              )}
            </div>
          )}
        </div>
        {isVacant ? (
          <span className="shrink-0 rounded-full border border-amber-400/60 bg-amber-500/20 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-300">
            Vacante
          </span>
        ) : null}
      </div>

      {tasksOpen && (
        <div className="mt-2 space-y-1.5 rounded-lg border border-slate-800 bg-slate-950/60 p-2">
          {tasks.length === 0 ? (
            <p className="text-[10px] text-slate-500">Sin funciones específicas registradas todavía.</p>
          ) : (
            <ul className="space-y-1">
              {tasks.map((task, taskIndex) => (
                <li key={`${position.id}-task-${taskIndex}`} className="flex items-start gap-1.5">
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => onToggleTask(entityId, position.id, taskIndex)}
                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded border transition-colors ${
                      isTaskDone(task) ? 'border-emerald-500 bg-emerald-500/70' : 'border-slate-600 bg-transparent hover:border-slate-500'
                    } disabled:cursor-not-allowed`}
                    title={isTaskDone(task) ? 'Marcar como pendiente' : 'Marcar como completada'}
                  />
                  <span className={`min-w-0 flex-1 break-words text-[10.5px] leading-snug ${isTaskDone(task) ? 'text-slate-500 line-through' : 'text-slate-300'}`}>
                    {taskLabel(task)}
                  </span>
                  {!readOnly && (
                    <button
                      type="button"
                      onClick={() => onRemoveTask(entityId, position.id, taskIndex)}
                      className="shrink-0 text-slate-600 transition-colors hover:text-red-300"
                      title="Quitar función"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!readOnly && (
            <div className="flex gap-1 pt-1">
              <input
                value={newTaskText}
                onChange={(event) => setNewTaskText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    submitNewTask();
                  }
                }}
                placeholder="Nueva función…"
                className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-200 outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={submitNewTask}
                className="shrink-0 rounded-md border border-indigo-500/40 bg-indigo-950/30 px-2 text-[10px] font-bold text-indigo-300 transition-colors hover:bg-indigo-950/50"
                title="Agregar función"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
          )}
        </div>
      )}

      {assignedPerson ? (
        !readOnly && (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => onUnassign(entityId, position.id)}
              className="shrink-0 rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-slate-400 transition-colors hover:border-amber-400/50 hover:text-amber-300"
              title="Desasignar (el puesto sigue existiendo, vacante)"
            >
              <UserMinus className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      ) : (
        !readOnly && (
          <div className="mt-2 flex flex-col gap-1.5">
            <select
              value={pickedPersonId}
              onChange={(event) => setPickedPersonId(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px] font-semibold text-slate-200 outline-none focus:border-amber-500"
            >
              <option value="">Elegir persona…</option>
              {people.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>{candidate.name}</option>
              ))}
            </select>
            <div className="flex gap-1.5">
              <select
                value={pickedFte}
                onChange={(event) => setPickedFte(Number(event.target.value))}
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px] font-semibold text-slate-200 outline-none focus:border-amber-500"
              >
                {FTE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label} FTE</option>
                ))}
              </select>
              <button
                type="button"
                disabled={!pickedPersonId}
                onClick={() => {
                  onAssign(entityId, position.id, pickedPersonId, pickedFte);
                  setPickedPersonId('');
                  setPickedFte(1);
                }}
                className="shrink-0 rounded-lg border border-emerald-500/40 bg-emerald-950/30 px-2.5 py-1.5 text-[11px] font-bold text-emerald-300 transition-colors hover:bg-emerald-950/50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Asignar
              </button>
            </div>
            <p className="text-[9px] leading-relaxed text-slate-500">O arrastra una persona del Banco hasta aquí para ocupar el puesto.</p>
          </div>
        )
      )}

      {!readOnly && (
        <div className="mt-2 flex items-center justify-end gap-1.5 border-t border-slate-800/70 pt-2">
          <button
            type="button"
            onClick={() => onMove(position.id, 'up')}
            disabled={!canMoveUp}
            className="rounded-lg border border-slate-700 bg-slate-950 p-1 text-slate-500 transition-colors hover:border-slate-600 hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-30"
            title="Subir puesto"
          >
            <ChevronUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => onMove(position.id, 'down')}
            disabled={!canMoveDown}
            className="rounded-lg border border-slate-700 bg-slate-950 p-1 text-slate-500 transition-colors hover:border-slate-600 hover:text-slate-300 disabled:cursor-not-allowed disabled:opacity-30"
            title="Bajar puesto"
          >
            <ChevronDown className="h-3 w-3" />
          </button>
          <button
            type="button"
            {...positionAttributes}
            {...positionListeners}
            className="rounded-lg border border-slate-700 bg-slate-950 p-1 text-slate-500 transition-colors hover:border-slate-600 hover:text-slate-300 active:cursor-grabbing"
            title="Arrastrar puesto"
          >
            <GripVertical className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => onEdit(position, entityId)}
            className="rounded-lg border border-slate-700 bg-slate-950 p-1 text-slate-500 transition-colors hover:border-indigo-500/50 hover:text-indigo-300"
            title="Editar puesto"
          >
            <Edit2 className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(entityId, position.id)}
            className="rounded-lg border border-slate-700 bg-slate-950 p-1 text-slate-500 transition-colors hover:border-red-400/50 hover:text-red-300"
            title="Eliminar puesto"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  );
}

function EntityColumn({
  entity,
  assignments,
  people,
  searchQuery,
  compact,
  fitMode,
  selectedConnectionPersonId,
  hoveredPersonId,
  connectionMode,
  readOnly = false,
  canMoveLeft,
  canMoveRight,
  expandedPersonIds,
  onOpenPerson,
  onConnect,
  onHoverPerson,
  onEditEntity,
  onDeleteEntity,
  onRemoveAssignment,
  onReorderAssignment,
  onMoveEntity,
  onAddPosition,
  onEditPosition,
  onDeletePosition,
  onAssignPosition,
  onUnassignPosition,
  onReorderPosition,
  onAddPositionTask,
  onTogglePositionTask,
  onRemovePositionTask,
  onToggleBadges,
  onOpenSummary,
}: {
  entity: BoardEntity;
  assignments: Assignment[];
  people: Person[];
  searchQuery: string;
  compact: boolean;
  fitMode: boolean;
  selectedConnectionPersonId: string | null;
  hoveredPersonId: string | null;
  connectionMode: boolean;
  readOnly?: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  expandedPersonIds: Set<string>;
  onOpenPerson: (person: Person) => void;
  onConnect: (person: Person) => void;
  onHoverPerson: (personId: string | null) => void;
  onEditEntity: (entity: BoardEntity) => void;
  onDeleteEntity: (entity: BoardEntity) => void;
  onRemoveAssignment: (assignmentId: string) => void;
  onReorderAssignment: (entityId: string, activeAssignmentId: string, overAssignmentId: string) => void;
  onMoveEntity: (entityId: string, direction: 'left' | 'right') => void;
  onAddPosition: (entityId: string) => void;
  onEditPosition: (position: Position, entityId: string) => void;
  onDeletePosition: (entityId: string, positionId: string) => void;
  onAssignPosition: (entityId: string, positionId: string, personId: string, fte: number) => void;
  onUnassignPosition: (entityId: string, positionId: string) => void;
  onReorderPosition: (entityId: string, activePositionId: string, overPositionId: string) => void;
  onAddPositionTask: (entityId: string, positionId: string, taskText: string) => void;
  onTogglePositionTask: (entityId: string, positionId: string, taskIndex: number) => void;
  onRemovePositionTask: (entityId: string, positionId: string, taskIndex: number) => void;
  onToggleBadges: (personId: string) => void;
  onOpenSummary: (personId: string) => void;
}) {
  const positions = entity.positions || [];
  const positionedPersonIds = new Set(
    positions
      .map((position) => position.assignedPersonId)
      .filter((personId): personId is string => Boolean(personId))
  );
  const quickAssignments = assignments.filter((assignment) => !positionedPersonIds.has(assignment.personId));
  const participantCount = new Set([
    ...assignments.map((assignment) => assignment.personId),
    ...Array.from(positionedPersonIds),
  ]).size;
  const { setNodeRef, isOver } = useDroppable({ id: `entity:${entity.id}` });
  const {
    attributes: columnAttributes,
    listeners: columnListeners,
    setNodeRef: setColumnDragRef,
    transform: columnTransform,
    isDragging: isColumnDragging,
  } = useDraggable({
    id: `column:${entity.id}`,
    data: { type: 'entity', entityId: entity.id },
    disabled: readOnly,
  });
  const meta = ENTITY_META[entity.type];
  const Icon = meta.icon;
  const columnStyle = columnTransform ? { transform: CSS.Transform.toString(columnTransform) } : undefined;
  const moveAssignment = (assignmentId: string, direction: 'up' | 'down') => {
    const currentIndex = quickAssignments.findIndex((assignment) => assignment.id === assignmentId);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const targetAssignment = quickAssignments[targetIndex];
    if (currentIndex < 0 || !targetAssignment) return;
    onReorderAssignment(entity.id, assignmentId, targetAssignment.id);
  };
  const movePosition = (positionId: string, direction: 'up' | 'down') => {
    const currentIndex = positions.findIndex((position) => position.id === positionId);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    const targetPosition = positions[targetIndex];
    if (currentIndex < 0 || !targetPosition) return;
    onReorderPosition(entity.id, positionId, targetPosition.id);
  };

  return (
    <section
      ref={setNodeRef}
      style={columnStyle}
      className={`flex h-auto flex-col overflow-hidden rounded-2xl border-2 bg-slate-900/45 backdrop-blur-md transition-all ${
        fitMode ? 'w-full min-w-0' : 'w-[280px] min-w-[280px] shrink-0 snap-start'
      } ${isColumnDragging ? 'opacity-40' : 'opacity-100'} ${isOver ? 'border-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.22)]' : 'border-slate-800/80'}`}
    >
      <header className={`border-b bg-gradient-to-r ${meta.className} ${fitMode ? 'p-2.5' : 'p-3'}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-slate-950/35 font-bold uppercase tracking-wider text-white ${
                fitMode ? 'px-1.5 py-0.5 text-[9px]' : 'px-2 py-0.5 text-[10px]'
              }`}
            >
              <Icon className="h-3 w-3" />
              {meta.label}
            </span>
            <h3 className={`mt-2 break-words font-display font-extrabold leading-tight text-white ${fitMode ? 'text-sm' : 'text-lg'}`}>{entity.name}</h3>
            <LicitationEntitySummary entity={entity} />
            {entity.dueDate && (
              <div className="mt-1.5">
                <DueDateBadge dueDate={entity.dueDate} commitmentStatus={entity.commitmentStatus} />
              </div>
            )}
            {!fitMode && <p className="mt-1 line-clamp-2 min-h-[32px] text-xs leading-relaxed text-white/80">{entity.description}</p>}
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`rounded-full border border-white/20 bg-slate-950/35 font-bold text-white ${fitMode ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'}`}>{participantCount}</span>
            {!readOnly && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  ref={setColumnDragRef}
                  {...columnAttributes}
                  {...columnListeners}
                  className="rounded-lg border border-white/20 bg-slate-950/35 p-1.5 text-white/80 transition-colors hover:bg-slate-950/55 hover:text-white active:cursor-grabbing"
                  title="Arrastrar columna"
                >
                  <GripHorizontal className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onMoveEntity(entity.id, 'left')}
                  disabled={!canMoveLeft}
                  className="rounded-lg border border-white/20 bg-slate-950/35 p-1.5 text-white/80 transition-colors hover:bg-slate-950/55 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                  title="Mover columna a la izquierda"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onMoveEntity(entity.id, 'right')}
                  disabled={!canMoveRight}
                  className="rounded-lg border border-white/20 bg-slate-950/35 p-1.5 text-white/80 transition-colors hover:bg-slate-950/55 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
                  title="Mover columna a la derecha"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onEditEntity(entity)}
                  className="rounded-lg border border-white/20 bg-slate-950/35 p-1.5 text-white/80 transition-colors hover:bg-slate-950/55 hover:text-white"
                  title="Editar entidad"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteEntity(entity)}
                  className="rounded-lg border border-white/20 bg-slate-950/35 p-1.5 text-white/80 transition-colors hover:border-red-300/60 hover:bg-red-950/50 hover:text-red-200"
                  title="Eliminar entidad"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className={`overflow-visible ${fitMode ? 'space-y-1.5 p-2' : 'space-y-2 p-2.5'}`}>
        <div className={fitMode ? 'pb-1' : 'pb-1.5'}>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Puestos ({positions.length})</span>
            {!readOnly && (
              <button
                type="button"
                onClick={() => onAddPosition(entity.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] font-bold text-slate-300 transition-colors hover:border-emerald-500/50 hover:text-emerald-300"
                title="Crear puesto en esta entidad"
              >
                <Plus className="h-3 w-3" />
                Puesto
              </button>
            )}
          </div>
          {positions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-800 p-2 text-center text-[10px] text-slate-500">Sin puestos definidos todavía.</p>
          ) : (
            <SortableContext items={positions.map((position) => `position:${position.id}`)} strategy={verticalListSortingStrategy}>
              <div className="space-y-1.5">
                {positions.map((position, positionIndex) => (
                  <PositionCard
                    key={position.id}
                    position={position}
                    entityId={entity.id}
                    people={people}
                    readOnly={readOnly}
                    canMoveUp={positionIndex > 0}
                    canMoveDown={positionIndex < positions.length - 1}
                    onAssign={onAssignPosition}
                    onUnassign={onUnassignPosition}
                    onEdit={onEditPosition}
                    onDelete={onDeletePosition}
                    onMove={movePosition}
                    onAddTask={onAddPositionTask}
                    onToggleTask={onTogglePositionTask}
                    onRemoveTask={onRemovePositionTask}
                  />
                ))}
              </div>
            </SortableContext>
          )}
        </div>

        {quickAssignments.length > 0 && (
          <div className="border-t border-slate-800/70 pt-2">
            <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Participantes sin puesto ({quickAssignments.length})</span>
            <SortableContext items={quickAssignments.map((assignment) => `assignment:${assignment.id}`)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {quickAssignments.map((assignment, assignmentIndex) => {
                  const person = people.find((candidate) => candidate.id === assignment.personId);
                  if (!person) return null;
                  const managerName = person.managerId ? people.find((candidate) => candidate.id === person.managerId)?.name : undefined;

                  return (
                    <AssignmentCard
                      key={assignment.id}
                      assignment={assignment}
                      person={person}
                      searchQuery={searchQuery}
                      compact={compact}
                      dense={fitMode}
                      selected={selectedConnectionPersonId === person.id}
                      highlighted={hoveredPersonId === person.id}
                      connectionMode={connectionMode}
                      readOnly={readOnly}
                      canMoveUp={assignmentIndex > 0}
                      canMoveDown={assignmentIndex < quickAssignments.length - 1}
                      managerName={managerName}
                      badgesExpanded={expandedPersonIds.has(person.id)}
                      onOpen={onOpenPerson}
                      onConnect={onConnect}
                      onRemoveAssignment={onRemoveAssignment}
                      onMoveAssignment={moveAssignment}
                      onHover={onHoverPerson}
                      onToggleBadges={onToggleBadges}
                      onOpenSummary={onOpenSummary}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </div>
        )}
      </div>
    </section>
  );
}

function HoldingCard({
  member,
  icon: Icon,
  accent,
  readOnly = false,
  onEdit,
}: {
  member: HoldingMember;
  icon: React.ElementType;
  accent: 'amber' | 'cyan';
  readOnly?: boolean;
  onEdit: (member: HoldingMember) => void;
}) {
  const accentClasses =
    accent === 'amber'
      ? { border: 'border-amber-300/50', iconBg: 'bg-amber-400', label: 'text-amber-700 dark:text-amber-300', editBorder: 'border-amber-300/50 hover:bg-amber-400/20' }
      : { border: 'border-cyan-300/50', iconBg: 'bg-cyan-400', label: 'text-cyan-700 dark:text-cyan-300', editBorder: 'border-cyan-300/50 hover:bg-cyan-400/20' };

  return (
    <div className={`holding-card relative z-10 rounded-xl border ${accentClasses.border} bg-slate-900/80 p-3 shadow-lg`}>
      <div className="flex items-start gap-3">
        <div className={`rounded-xl ${accentClasses.iconBg} p-2 text-slate-950`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className={`text-[10px] font-extrabold uppercase tracking-wider ${accentClasses.label}`}>
              Nivel {member.level}
            </span>
            {!readOnly && (
              <button
                type="button"
                onClick={() => onEdit(member)}
                className={`rounded-lg border ${accentClasses.editBorder} bg-slate-950/10 p-1 text-slate-700 transition-colors dark:text-slate-200`}
                title="Editar miembro"
              >
                <Edit2 className="h-3 w-3" />
              </button>
            )}
          </div>
          <h4 className="mt-1 break-words font-display text-sm font-extrabold leading-tight text-slate-900 dark:text-white">{member.name}</h4>
          <p className="mt-0.5 text-xs font-bold text-slate-800 dark:text-slate-300">{member.role}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-700 dark:text-slate-400">{member.notes}</p>
        </div>
      </div>
    </div>
  );
}

function HoldingColumn({
  members,
  fitMode,
  readOnly = false,
  onEditMember,
}: {
  members: HoldingMember[];
  fitMode: boolean;
  readOnly?: boolean;
  onEditMember: (member: HoldingMember) => void;
}) {
  const level0 = members.find((member) => member.level === 0);
  const level1 = members.find((member) => member.level === 1);

  return (
    <section
      className={`holding-column z-30 flex h-auto shrink-0 flex-col overflow-hidden rounded-2xl border-2 border-amber-400/60 bg-slate-950/85 shadow-[0_0_24px_rgba(245,158,11,0.16)] backdrop-blur-md ${
        fitMode ? 'w-[260px] min-w-[260px]' : 'w-[280px] min-w-[280px] snap-start'
      }`}
    >
      <header className={`border-b border-amber-400/30 bg-gradient-to-r from-amber-500 to-yellow-500 ${fitMode ? 'p-2.5' : 'p-3'}`}>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-slate-950/35 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          <Crown className="h-3 w-3" />
          Directorio / Holding
        </span>
        <h3 className={`mt-2 font-display font-extrabold leading-tight text-white ${fitMode ? 'text-sm' : 'text-lg'}`}>Cúpula directiva</h3>
        {!fitMode && <p className="mt-1 text-xs leading-relaxed text-white/85">Referencia fija para decisiones, reportes y dirección del grupo.</p>}
      </header>

      <div className={`relative flex flex-col ${fitMode ? 'p-2' : 'p-3'}`}>
        <div className="absolute left-1/2 top-[88px] h-[110px] w-0.5 -translate-x-1/2 bg-amber-400/70" />

        {level0 && <HoldingCard member={level0} icon={Crown} accent="amber" readOnly={readOnly} onEdit={onEditMember} />}

        <div className="z-10 mx-auto my-3 rounded-full border border-amber-300/50 bg-slate-950 px-2 py-0.5 text-[10px] font-bold text-amber-300">
          reporta / asesora
        </div>

        {level1 && <HoldingCard member={level1} icon={User} accent="cyan" readOnly={readOnly} onEdit={onEditMember} />}

        <div className="mt-3 flex flex-col items-center justify-center rounded-xl border border-dashed border-cyan-400/40 bg-slate-900/45 p-3 text-center">
          <Network className="mb-2 h-5 w-5 text-cyan-700 dark:text-cyan-300" />
          <p className="text-xs font-bold text-slate-900 dark:text-slate-200">Las entidades del tablero reportan operativamente a Rafael.</p>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">La estructura sigue horizontal; esta columna solo fija la referencia de decisión.</p>
        </div>
      </div>
    </section>
  );
}

// A row inside the Bank drawer: the standard PersonCard plus direct edit/delete
// actions and a quick-assign selector, so assigning someone to an entity doesn't
// require dragging (impossible anyway while the drawer overlays the board).
function BankPersonEntry({
  person,
  searchQuery,
  connectionMode,
  selectedConnectionPersonId,
  hoveredPersonId,
  readOnly,
  allPeople,
  entities,
  assignedEntityIds,
  badgesExpanded,
  onOpenPerson,
  onConnect,
  onHoverPerson,
  onEditPerson,
  onDeletePerson,
  onAssign,
  onToggleBadges,
  onOpenSummary,
}: {
  person: Person;
  searchQuery: string;
  connectionMode: boolean;
  selectedConnectionPersonId: string | null;
  hoveredPersonId: string | null;
  readOnly: boolean;
  allPeople: Person[];
  entities: BoardEntity[];
  assignedEntityIds: Set<string>;
  badgesExpanded: boolean;
  onOpenPerson: (person: Person) => void;
  onConnect: (person: Person) => void;
  onHoverPerson: (personId: string | null) => void;
  onEditPerson: (person: Person) => void;
  onDeletePerson: (personId: string) => void;
  onAssign: (personId: string, entityId: string) => void;
  onToggleBadges: (personId: string) => void;
  onOpenSummary: (personId: string) => void;
}) {
  const assignableEntities = useMemo(
    () => entities.filter((entity) => !assignedEntityIds.has(entity.id)),
    [entities, assignedEntityIds]
  );
  const [selectedEntityId, setSelectedEntityId] = useState(assignableEntities[0]?.id || '');
  const managerName = person.managerId ? allPeople.find((candidate) => candidate.id === person.managerId)?.name : undefined;

  useEffect(() => {
    if (!assignableEntities.some((entity) => entity.id === selectedEntityId)) {
      setSelectedEntityId(assignableEntities[0]?.id || '');
    }
  }, [assignableEntities, selectedEntityId]);

  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/30 p-1.5">
      <PersonCard
        person={person}
        searchQuery={searchQuery}
        selected={selectedConnectionPersonId === person.id}
        highlighted={hoveredPersonId === person.id}
        connectionMode={connectionMode}
        readOnly={readOnly}
        managerName={managerName}
        badgesExpanded={badgesExpanded}
        onOpen={onOpenPerson}
        onConnect={onConnect}
        onHover={onHoverPerson}
        onToggleBadges={onToggleBadges}
        onOpenSummary={onOpenSummary}
      />
      {!readOnly && (
        <div className="mt-1.5 flex items-center gap-1.5 px-0.5">
          <button
            type="button"
            onClick={() => onEditPerson(person)}
            className="shrink-0 rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-slate-400 transition-colors hover:border-indigo-500/50 hover:text-indigo-300"
            title="Editar persona"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onDeletePerson(person.id)}
            className="shrink-0 rounded-lg border border-slate-700 bg-slate-950 p-1.5 text-slate-400 transition-colors hover:border-red-400/50 hover:text-red-300"
            title="Eliminar persona"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          {assignableEntities.length > 0 ? (
            <>
              <select
                value={selectedEntityId}
                onChange={(event) => setSelectedEntityId(event.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-[11px] font-semibold text-slate-200 outline-none focus:border-emerald-500"
              >
                {assignableEntities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.name} · {ENTITY_META[entity.type].label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => selectedEntityId && onAssign(person.id, selectedEntityId)}
                className="shrink-0 rounded-lg border border-emerald-500/40 bg-emerald-950/30 p-1.5 text-emerald-300 transition-colors hover:bg-emerald-950/50"
                title="Asignar a la entidad seleccionada"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </>
          ) : (
            <span className="flex-1 truncate text-[10px] text-slate-500">Ya participa en todas las entidades.</span>
          )}
        </div>
      )}
    </div>
  );
}

function BankDropButton({
  count,
  onClick,
  readOnly,
}: {
  count: number;
  onClick: () => void;
  readOnly: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'bank:header',
    data: { type: 'bank' },
    disabled: readOnly,
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold text-slate-200 shadow-md transition-colors ${
        isOver ? 'border-amber-300 bg-amber-500/20 text-amber-100' : 'border-slate-800 bg-slate-900 hover:border-slate-700'
      }`}
      title="Abrir el banco de personas o soltar aquí para liberar un puesto"
    >
      <Users className="h-3.5 w-3.5" />
      Banco de Personas
      <span className="rounded-full bg-indigo-500/20 px-1.5 py-0.5 text-[10px] font-extrabold text-indigo-300">{count}</span>
    </button>
  );
}

function BankDrawer({
  isOpen,
  onClose,
  people,
  allPeople,
  totalCount,
  searchQuery,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  categoryOptions,
  connectionMode,
  selectedConnectionPersonId,
  hoveredPersonId,
  readOnly,
  entities,
  assignments,
  expandedPersonIds,
  onOpenPerson,
  onConnect,
  onHoverPerson,
  onEditPerson,
  onDeletePerson,
  onAssignPerson,
  onOpenNewPerson,
  onToggleBadges,
  onOpenSummary,
}: {
  isOpen: boolean;
  onClose: () => void;
  people: Person[];
  allPeople: Person[];
  totalCount: number;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  roleFilter: 'Todos' | RoleType;
  onRoleFilterChange: (value: 'Todos' | RoleType) => void;
  categoryFilter: string;
  onCategoryFilterChange: (value: string) => void;
  categoryOptions: string[];
  connectionMode: boolean;
  selectedConnectionPersonId: string | null;
  hoveredPersonId: string | null;
  readOnly: boolean;
  entities: BoardEntity[];
  assignments: Assignment[];
  expandedPersonIds: Set<string>;
  onOpenPerson: (person: Person) => void;
  onConnect: (person: Person) => void;
  onHoverPerson: (personId: string | null) => void;
  onEditPerson: (person: Person) => void;
  onDeletePerson: (personId: string) => void;
  onAssignPerson: (personId: string, entityId: string) => void;
  onOpenNewPerson: () => void;
  onToggleBadges: (personId: string) => void;
  onOpenSummary: (personId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: 'bank:drawer',
    data: { type: 'bank' },
    disabled: readOnly,
  });

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-[75] bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <aside
        ref={setNodeRef}
        className={`fixed inset-y-0 left-0 z-[76] flex w-full max-w-md flex-col border-r bg-slate-950/95 shadow-2xl backdrop-blur-xl transition-colors ${
          isOver ? 'border-amber-300 ring-2 ring-amber-300/40' : 'border-slate-800'
        }`}
      >
        <header className="shrink-0 border-b border-slate-800 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <Users className="h-3 w-3" />
                Banco de Personas
              </span>
              <h2 className="mt-3 font-display text-xl font-extrabold leading-tight text-white">Equipo disponible</h2>
              <p className="mt-1 text-xs text-slate-500">{totalCount} personas registradas. Asígnalas directamente a cualquier entidad sin arrastrar.</p>
            </div>
            <button type="button" onClick={onClose} className="shrink-0 rounded-xl p-2 text-slate-400 hover:bg-slate-900 hover:text-white">
              <X className="h-5 w-5" />
            </button>
          </div>

          {!readOnly && (
            <button
              type="button"
              onClick={onOpenNewPerson}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-md transition-colors hover:bg-indigo-500"
            >
              <Plus className="h-3.5 w-3.5" />
              Agregar persona
            </button>
          )}

          <div className="mt-4 grid gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                value={searchQuery}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="Buscar por nombre, rol, categoría, nota o contacto..."
                className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-xs text-slate-200 outline-none transition focus:border-indigo-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 px-2.5 py-2">
                <Filter className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                <select
                  value={roleFilter}
                  onChange={(event) => onRoleFilterChange(event.target.value as 'Todos' | RoleType)}
                  className="w-full min-w-0 bg-transparent text-[11px] font-semibold text-slate-200 outline-none"
                >
                  <option value="Todos" className="bg-slate-950">Todos los roles</option>
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role} className="bg-slate-950">{role}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-950 px-2.5 py-2">
                <Filter className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                <select
                  value={categoryFilter}
                  onChange={(event) => onCategoryFilterChange(event.target.value)}
                  className="w-full min-w-0 bg-transparent text-[11px] font-semibold text-slate-200 outline-none"
                >
                  <option value="Todas" className="bg-slate-950">Todas las categorías</option>
                  {categoryOptions.map((category) => (
                    <option key={category} value={category} className="bg-slate-950">{category}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
          {people.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-xs text-slate-500">
              Ninguna persona coincide con la búsqueda o los filtros aplicados.
            </p>
          ) : (
            people.map((person) => {
              const assignedEntityIds = new Set(
                assignments.filter((assignment) => assignment.personId === person.id).map((assignment) => assignment.entityId)
              );

              return (
                <BankPersonEntry
                  key={person.id}
                  person={person}
                  searchQuery={searchQuery}
                  connectionMode={connectionMode}
                  selectedConnectionPersonId={selectedConnectionPersonId}
                  hoveredPersonId={hoveredPersonId}
                  readOnly={readOnly}
                  allPeople={allPeople}
                  entities={entities}
                  assignedEntityIds={assignedEntityIds}
                  badgesExpanded={expandedPersonIds.has(person.id)}
                  onOpenPerson={onOpenPerson}
                  onConnect={onConnect}
                  onHoverPerson={onHoverPerson}
                  onEditPerson={onEditPerson}
                  onDeletePerson={onDeletePerson}
                  onAssign={onAssignPerson}
                  onToggleBadges={onToggleBadges}
                  onOpenSummary={onOpenSummary}
                />
              );
            })
          )}
        </div>
      </aside>
    </>
  );
}

interface MindMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  holdingMembers: HoldingMember[];
  entitiesByLevel: Record<EntityType, BoardEntity[]>;
  assignments: Assignment[];
  people: Person[];
}

function MindMapModal({
  isOpen,
  onClose,
  holdingMembers,
  entitiesByLevel,
  assignments,
  people,
}: MindMapModalProps) {
  const [companyFilter, setCompanyFilter] = useState('all');
  const [personFilter, setPersonFilter] = useState('all');

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const owner = holdingMembers.find((member) => member.level === 0) || {
    id: 'holding-owner',
    level: 0,
    name: 'Damir Solar',
    role: 'Dueño',
    notes: 'Radicado en el extranjero (10 meses al año)',
  };

  const advisor = holdingMembers.find((member) => member.level === 1) || {
    id: 'holding-advisor',
    level: 1,
    name: 'Rafael Valenzuela Munita',
    role: 'Asesor Financiero y del Directorio',
    notes: 'Nexo principal para la toma de decisiones del Holding',
  };

  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);

  const assignmentsByEntity = useMemo(() => {
    const grouped = new Map<string, Assignment[]>();
    assignments.forEach((assignment) => {
      const entityAssignments = grouped.get(assignment.entityId) || [];
      entityAssignments.push(assignment);
      grouped.set(assignment.entityId, entityAssignments);
    });
    return grouped;
  }, [assignments]);

  const entityIdsByPerson = useMemo(() => {
    const grouped = new Map<string, Set<string>>();
    assignments.forEach((assignment) => {
      const personEntities = grouped.get(assignment.personId) || new Set<string>();
      personEntities.add(assignment.entityId);
      grouped.set(assignment.personId, personEntities);
    });
    return grouped;
  }, [assignments]);

  const selectedCompanyPersonIds = useMemo(() => {
    if (companyFilter === 'all') return null;
    return new Set((assignmentsByEntity.get(companyFilter) || []).map((assignment) => assignment.personId));
  }, [assignmentsByEntity, companyFilter]);

  const visibleEntityIdsByCompany = useMemo(() => {
    if (companyFilter === 'all' || !selectedCompanyPersonIds) return null;

    const entityIds = new Set<string>([companyFilter]);
    assignments.forEach((assignment) => {
      if (selectedCompanyPersonIds.has(assignment.personId)) {
        entityIds.add(assignment.entityId);
      }
    });
    return entityIds;
  }, [assignments, companyFilter, selectedCompanyPersonIds]);

  const selectedPersonEntityIds = useMemo(() => {
    if (personFilter === 'all') return null;
    return entityIdsByPerson.get(personFilter) || new Set<string>();
  }, [entityIdsByPerson, personFilter]);

  const visibleEntitiesByLevel = useMemo(() => {
    const grouped: Record<EntityType, BoardEntity[]> = { empresa: [], proyecto: [], licitacion: [], tarea: [] };
    LEVEL_ORDER.forEach((levelType) => {
      grouped[levelType] = entitiesByLevel[levelType].filter((entity) => !visibleEntityIdsByCompany || visibleEntityIdsByCompany.has(entity.id));
    });
    return grouped;
  }, [entitiesByLevel, visibleEntityIdsByCompany]);

  const selectedPerson = personFilter === 'all' ? null : peopleById.get(personFilter);

  const getAssignedPeople = (entityId: string) =>
    (assignmentsByEntity.get(entityId) || [])
      .map((assignment) => ({ assignment, person: peopleById.get(assignment.personId) }))
      .filter((entry): entry is { assignment: Assignment; person: Person } => Boolean(entry.person));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex h-full flex-col">
        <header className="shrink-0 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95">
          <div className="mx-auto flex max-w-[1800px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-500 p-2.5 shadow-lg shadow-cyan-500/10">
                <Network className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="font-display text-lg font-extrabold text-slate-950 dark:text-white">Vista Mapa Mental</h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Cúpula, entidades y personas conectadas desde las asignaciones reales del tablero.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                Empresa
                <select
                  value={companyFilter}
                  onChange={(event) => setCompanyFilter(event.target.value)}
                  className="min-w-[180px] bg-transparent text-xs font-semibold text-slate-900 outline-none dark:text-slate-100"
                >
                  <option value="all" className="bg-white dark:bg-slate-950">Todas</option>
                  {entitiesByLevel.empresa.map((entity) => (
                    <option key={entity.id} value={entity.id} className="bg-white dark:bg-slate-950">
                      {entity.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                Persona
                <select
                  value={personFilter}
                  onChange={(event) => setPersonFilter(event.target.value)}
                  className="min-w-[180px] bg-transparent text-xs font-semibold text-slate-900 outline-none dark:text-slate-100"
                >
                  <option value="all" className="bg-white dark:bg-slate-950">Todas</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id} className="bg-white dark:bg-slate-950">
                      {person.name}
                    </option>
                  ))}
                </select>
              </label>

              {(companyFilter !== 'all' || personFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setCompanyFilter('all');
                    setPersonFilter('all');
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-700"
                >
                  Limpiar filtros
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-white"
                aria-label="Cerrar mapa mental"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 lg:p-6">
          <div className="relative mx-auto min-h-[calc(100vh-9rem)] min-w-[1180px] max-w-[1800px] pb-8">
            <svg
              className="pointer-events-none absolute left-0 top-0 h-[520px] w-full text-slate-400 dark:text-cyan-300"
              viewBox="0 0 1200 520"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <marker id="mindmap-arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                </marker>
              </defs>
              <path d="M600 74 C600 105 600 120 600 150" fill="none" stroke="currentColor" strokeWidth="2.5" markerEnd="url(#mindmap-arrow)" />
              <path d="M600 220 C600 250 155 235 155 294" fill="none" stroke="currentColor" strokeWidth="2" markerEnd="url(#mindmap-arrow)" />
              <path d="M600 220 C600 255 450 245 450 294" fill="none" stroke="currentColor" strokeWidth="2" markerEnd="url(#mindmap-arrow)" />
              <path d="M600 220 C600 255 750 245 750 294" fill="none" stroke="currentColor" strokeWidth="2" markerEnd="url(#mindmap-arrow)" />
              <path d="M600 220 C600 250 1045 235 1045 294" fill="none" stroke="currentColor" strokeWidth="2" markerEnd="url(#mindmap-arrow)" />
            </svg>

            <div className="relative z-10 flex flex-col items-center gap-4 pt-2">
              <div className="w-[360px] rounded-xl border border-indigo-200 bg-white p-4 text-center shadow-lg dark:border-indigo-500/40 dark:bg-slate-900">
                <div className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-300">Nivel 0 · Dirección</div>
                <h3 className="mt-1 font-display text-base font-extrabold text-slate-950 dark:text-white">{owner.name}</h3>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{owner.role}</p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{owner.notes}</p>
              </div>

              <div className="w-[420px] rounded-xl border border-cyan-200 bg-white p-4 text-center shadow-lg dark:border-cyan-500/40 dark:bg-slate-900">
                <div className="text-[10px] font-black uppercase tracking-wider text-cyan-700 dark:text-cyan-300">Nivel 1 · Nexo del Holding</div>
                <h3 className="mt-1 font-display text-base font-extrabold text-slate-950 dark:text-white">{advisor.name}</h3>
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{advisor.role}</p>
                <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{advisor.notes}</p>
              </div>

              {selectedPerson && (
                <div className="rounded-full border border-amber-300 bg-amber-100 px-4 py-2 text-xs font-bold text-amber-900 shadow-sm dark:border-amber-500/50 dark:bg-amber-400/15 dark:text-amber-200">
                  Red destacada: {selectedPerson.name}
                </div>
              )}
            </div>

            <div className="relative z-10 mt-12 grid grid-cols-4 gap-4">
              {LEVEL_ORDER.map((levelType) => {
                const levelMeta = LEVEL_META[levelType];
                const LevelIcon = ENTITY_META[levelType].icon;
                const levelEntities = visibleEntitiesByLevel[levelType];

                return (
                  <section key={levelType} className={`rounded-xl border ${levelMeta.border} ${levelMeta.bg} p-3 shadow-sm`}>
                    <div className={`mb-3 flex items-center justify-between gap-2 rounded-lg border ${levelMeta.border} bg-white/70 px-3 py-2 dark:bg-slate-950/40`}>
                      <div className="flex min-w-0 items-center gap-2">
                        <LevelIcon className={`h-4 w-4 shrink-0 ${levelMeta.text}`} />
                        <h3 className={`truncate text-xs font-black uppercase tracking-wider ${levelMeta.text}`}>{levelMeta.title}</h3>
                      </div>
                      <span className={`rounded-full bg-white px-2 py-0.5 text-[10px] font-black ${levelMeta.text} dark:bg-slate-900`}>
                        {levelEntities.length}
                      </span>
                    </div>

                    <div className="space-y-3">
                      {levelEntities.length === 0 ? (
                        <p className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-4 text-center text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-500">
                          Sin nodos visibles.
                        </p>
                      ) : (
                        levelEntities.map((entity) => {
                          const EntityIcon = ENTITY_META[entity.type].icon;
                          const assignedPeople = getAssignedPeople(entity.id);
                          const isSelectedPersonEntity = selectedPersonEntityIds?.has(entity.id) ?? false;
                          const shouldDimEntity = Boolean(selectedPersonEntityIds) && !isSelectedPersonEntity;

                          return (
                            <article
                              key={entity.id}
                              className={`rounded-xl border bg-white p-3 shadow-sm transition dark:bg-slate-900 ${
                                isSelectedPersonEntity
                                  ? 'border-amber-400 ring-2 ring-amber-300/70 dark:ring-amber-300/30'
                                  : 'border-slate-200 dark:border-slate-800'
                              } ${shouldDimEntity ? 'opacity-45' : 'opacity-100'}`}
                            >
                              <div className="flex items-start gap-2">
                                <div className="rounded-lg bg-slate-100 p-2 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                                  <EntityIcon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    {entity.code && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-black text-slate-700 dark:bg-slate-800 dark:text-slate-200">{entity.code}</span>}
                                    <h4 className="truncate text-sm font-extrabold text-slate-950 dark:text-white">{entity.name}</h4>
                                  </div>
                                  {entity.client && <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{entity.client}</p>}
                                  {entity.budgetUsd && <p className="mt-1 text-xs font-black text-emerald-700 dark:text-emerald-300">USD {entity.budgetUsd}</p>}
                                  {entity.description && <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{entity.description}</p>}
                                </div>
                              </div>

                              <div className="mt-3 border-l-2 border-slate-200 pl-3 dark:border-slate-700">
                                {assignedPeople.length === 0 ? (
                                  <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">Sin personas asignadas.</p>
                                ) : (
                                  <div className="space-y-2">
                                    {assignedPeople.map(({ assignment, person }) => {
                                      const isSelectedPerson = personFilter !== 'all' && person.id === personFilter;
                                      const shouldDimPerson = personFilter !== 'all' && !isSelectedPerson;

                                      return (
                                        <button
                                          key={assignment.id}
                                          type="button"
                                          onClick={() => setPersonFilter(person.id)}
                                          className={`w-full rounded-lg border p-2 text-left transition hover:border-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950/30 ${
                                            isSelectedPerson
                                              ? 'border-amber-400 bg-amber-50 ring-1 ring-amber-300 dark:bg-amber-400/10 dark:ring-amber-300/30'
                                              : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/60'
                                          } ${shouldDimPerson ? 'opacity-45' : 'opacity-100'}`}
                                        >
                                          <div className="flex items-start justify-between gap-2">
                                            <span className="min-w-0 truncate text-xs font-extrabold text-slate-900 dark:text-slate-100">{person.name}</span>
                                            <RoleBadge role={person.role} />
                                          </div>
                                          <PersonBadges person={person} limit={2} />
                                          {assignment.taskText && (
                                            <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{assignment.taskText}</p>
                                          )}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </article>
                          );
                        })
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Small controlled input used inside PersonTaskSummaryModal to append a new task
// to a specific position without lifting per-position input state into the modal.
function PositionTaskQuickAdd({
  entityId,
  positionId,
  onAddTask,
}: {
  entityId: string;
  positionId: string;
  onAddTask: (entityId: string, positionId: string, taskText: string) => void;
}) {
  const [value, setValue] = useState('');

  const submit = () => {
    const cleanTask = value.trim();
    if (!cleanTask) return;
    onAddTask(entityId, positionId, cleanTask);
    setValue('');
  };

  return (
    <div className="mt-2 flex gap-1.5">
      <input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            submit();
          }
        }}
        placeholder="Nueva función…"
        className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[10px] text-slate-200 outline-none focus:border-indigo-500"
      />
      <button
        type="button"
        onClick={submit}
        className="shrink-0 rounded-md border border-indigo-500/40 bg-indigo-950/30 px-2 text-[10px] font-bold text-indigo-300 transition-colors hover:bg-indigo-950/50"
        title="Agregar función"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

interface PersonEntitySummary {
  entity: BoardEntity;
  positions: Position[];
  assignment: Assignment | null;
}

// "Hoja de Funciones" — consolidated pop-up for a single Person: every Position
// they occupy (with FTE% and its task checklist) plus their free-text function in
// every entity where they participate without a formal seat, across the Holding.
function PersonTaskSummaryModal({
  isOpen,
  onClose,
  person,
  entities,
  assignments,
  readOnly,
  onAddPositionTask,
  onTogglePositionTask,
  onRemovePositionTask,
  onUpdateAssignmentTask,
}: {
  isOpen: boolean;
  onClose: () => void;
  person: Person | null;
  entities: BoardEntity[];
  assignments: Assignment[];
  readOnly: boolean;
  onAddPositionTask: (entityId: string, positionId: string, taskText: string) => void;
  onTogglePositionTask: (entityId: string, positionId: string, taskIndex: number) => void;
  onRemovePositionTask: (entityId: string, positionId: string, taskIndex: number) => void;
  onUpdateAssignmentTask: (assignmentId: string, taskText: string) => void;
}) {
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen || !person) return null;

  const summaries: PersonEntitySummary[] = entities
    .map((entity) => {
      const positions = (entity.positions || []).filter((position) => position.assignedPersonId === person.id);
      const assignment = assignments.find((candidate) => candidate.entityId === entity.id && candidate.personId === person.id) || null;
      if (positions.length === 0 && !assignment) return null;
      return { entity, positions, assignment };
    })
    .filter((summary): summary is PersonEntitySummary => Boolean(summary));

  const totalFte = summaries.reduce(
    (sum, summary) => sum + summary.positions.reduce((positionSum, position) => positionSum + position.fte, 0),
    0
  );

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-800 p-5">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <ClipboardList className="h-3 w-3" />
              Hoja de Funciones y Tareas
            </span>
            <h2 className="mt-3 break-words font-display text-xl font-extrabold leading-tight text-white">{person.name}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <RoleBadge role={person.role} />
              <span className="rounded-md border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] font-semibold text-slate-400">{person.category}</span>
              <span
                className={`rounded-md border px-2 py-0.5 text-[10px] font-black ${
                  totalFte > 1
                    ? 'border-amber-400/60 bg-amber-500/10 text-amber-300'
                    : 'border-emerald-500/40 bg-emerald-950/30 text-emerald-300'
                }`}
                title="Suma del FTE de todos los puestos que ocupa en el Holding"
              >
                Carga total: {formatFte(totalFte)} FTE
              </span>
            </div>
            {person.customTags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {person.customTags.map((tag) => {
                  const colors = getTagColorStyle(tag.color);
                  return (
                    <span key={tag.id} className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-bold ${colors.bg} ${colors.border} ${colors.text}`}>
                      {tag.label}
                    </span>
                  );
                })}
              </div>
            )}
            {person.supervisor && (
              <p className="mt-2 text-[11px] font-semibold text-slate-500">
                Supervisor: <span className="text-slate-300">{person.supervisor}</span>
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {summaries.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">
              Esta persona todavía no participa en ninguna entidad del Holding.
            </p>
          ) : (
            summaries.map(({ entity, positions, assignment }) => {
              const meta = ENTITY_META[entity.type];
              return (
                <section key={entity.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    {meta.label}
                  </span>
                  <h3 className="mt-1 break-words font-display text-sm font-extrabold text-slate-100">{entity.name}</h3>

                  {positions.length > 0 && (
                    <div className="mt-2.5 space-y-2.5">
                      {positions.map((position) => (
                        <div key={position.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-bold text-slate-100">{position.title}</p>
                            <span className="rounded-full border border-cyan-700/60 bg-cyan-950/50 px-2 py-0.5 text-[9px] font-black text-cyan-200">
                              {formatFte(position.fte)} FTE
                            </span>
                          </div>
                          {position.department && <p className="mt-0.5 text-[10px] font-medium text-slate-500">{position.department}</p>}

                          <div className="mt-2 space-y-1">
                            {(position.tasks || []).length === 0 ? (
                              <p className="text-[10.5px] text-slate-500">Sin funciones específicas registradas.</p>
                            ) : (
                              position.tasks.map((task, taskIndex) => (
                                <div key={`${position.id}-${taskIndex}`} className="flex items-start gap-1.5">
                                  <button
                                    type="button"
                                    disabled={readOnly}
                                    onClick={() => onTogglePositionTask(entity.id, position.id, taskIndex)}
                                    className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded border transition-colors ${
                                      isTaskDone(task) ? 'border-emerald-500 bg-emerald-500/70' : 'border-slate-600 bg-transparent hover:border-slate-500'
                                    } disabled:cursor-not-allowed`}
                                    title={isTaskDone(task) ? 'Marcar como pendiente' : 'Marcar como completada'}
                                  />
                                  <span className={`min-w-0 flex-1 break-words text-[11px] leading-snug ${isTaskDone(task) ? 'text-slate-500 line-through' : 'text-slate-300'}`}>
                                    {taskLabel(task)}
                                  </span>
                                  {!readOnly && (
                                    <button
                                      type="button"
                                      onClick={() => onRemovePositionTask(entity.id, position.id, taskIndex)}
                                      className="shrink-0 text-slate-600 transition-colors hover:text-red-300"
                                      title="Quitar función"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              ))
                            )}
                          </div>

                          {!readOnly && <PositionTaskQuickAdd entityId={entity.id} positionId={position.id} onAddTask={onAddPositionTask} />}
                        </div>
                      ))}
                    </div>
                  )}

                  {assignment && (
                    <div className={positions.length > 0 ? 'mt-2.5 border-t border-slate-800/70 pt-2.5' : 'mt-2.5'}>
                      <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Función general en la entidad</p>
                      {readOnly ? (
                        <p className="rounded-lg border border-slate-800 bg-slate-900/60 p-2.5 text-xs leading-relaxed text-slate-300">
                          {assignment.taskText || 'Sin función específica registrada.'}
                        </p>
                      ) : (
                        <textarea
                          value={assignment.taskText}
                          onChange={(event) => onUpdateAssignmentTask(assignment.id, event.target.value)}
                          rows={2}
                          placeholder="Describe funciones, tareas o situación específica en esta entidad..."
                          className="w-full resize-none rounded-lg border border-slate-800 bg-slate-950 p-2.5 text-xs leading-relaxed text-slate-200 outline-none focus:border-indigo-500"
                        />
                      )}
                    </div>
                  )}
                </section>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// A single person's card inside the "Organigrama por Áreas" view. Isolated as
// its own component (rather than inlined in a `.map`) so it can hold its own
// `useMemo` for the Holding-distribution chips without violating Rules of Hooks.
function FunctionalOrgPersonCard({
  person,
  depth,
  entities,
  assignments,
  managerName,
  onOpenPerson,
}: {
  person: Person;
  depth: number;
  entities: BoardEntity[];
  assignments: Assignment[];
  managerName?: string;
  onOpenPerson: (personId: string) => void;
}) {
  const distribution = useMemo(
    () =>
      entities
        .map((entity) => {
          const positions = (entity.positions || []).filter((position) => position.assignedPersonId === person.id);
          const hasAssignment = assignments.some((assignment) => assignment.entityId === entity.id && assignment.personId === person.id);
          if (positions.length === 0 && !hasAssignment) return null;
          const fte = positions.reduce((sum, position) => sum + position.fte, 0);
          return { entity, fte, hasPosition: positions.length > 0 };
        })
        .filter((entry): entry is { entity: BoardEntity; fte: number; hasPosition: boolean } => Boolean(entry)),
    [assignments, entities, person.id]
  );

  return (
    <div
      style={{ marginLeft: depth * 16 }}
      className={depth > 0 ? 'border-l-2 border-slate-200 pl-3 dark:border-slate-700' : undefined}
    >
      <button
        type="button"
        onClick={() => onOpenPerson(person.id)}
        className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-cyan-400 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-cyan-500/60"
        title="Ver hoja de funciones y tareas"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h4 className="truncate text-sm font-extrabold text-slate-950 dark:text-white">{person.name}</h4>
            <p className="truncate text-[11px] font-bold text-slate-500 dark:text-slate-400">{person.category || person.role}</p>
          </div>
          <RoleBadge role={person.role} />
        </div>
        <ManagerLine managerName={managerName} dense />
        {distribution.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {distribution.map(({ entity, fte, hasPosition }) => (
              <span
                key={entity.id}
                className="inline-flex items-center rounded-full border border-cyan-300 bg-cyan-50 px-2 py-0.5 text-[9.5px] font-bold text-cyan-800 dark:border-cyan-700/60 dark:bg-cyan-950/40 dark:text-cyan-200"
              >
                {entity.name}
                {hasPosition ? ` (${formatFte(fte)} FTE)` : ''}
              </span>
            ))}
          </div>
        )}
      </button>
    </div>
  );
}

// Full-screen "Organigrama por Áreas": groups everyone in `board.people` into
// their functional area (see FUNCTIONAL_AREAS), shows the Cúpula & Dirección
// General column from `board.holdingMembers`, and renders "Reporta a" /
// Holding-distribution chips read live from managerId / positions / assignments.
function FunctionalOrgChartModal({
  isOpen,
  onClose,
  people,
  entities,
  assignments,
  holdingMembers,
  onOpenPerson,
}: {
  isOpen: boolean;
  onClose: () => void;
  people: Person[];
  entities: BoardEntity[];
  assignments: Assignment[];
  holdingMembers: HoldingMember[];
  onOpenPerson: (personId: string) => void;
}) {
  const [areaFilter, setAreaFilter] = useState<'all' | FunctionalAreaKey>('all');

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);

  const areaColumns = useMemo(
    () =>
      FUNCTIONAL_AREAS.map((area) => ({
        ...area,
        entries: buildAreaTree(people.filter((person) => area.roles.includes(person.role))),
      })),
    [people]
  );

  if (!isOpen) return null;

  const owner = holdingMembers.find((member) => member.level === 0) || {
    id: 'holding-owner',
    level: 0 as const,
    name: 'Damir Solar',
    role: 'Dueño',
    notes: 'Radicado en el extranjero (10 meses al año)',
  };

  const advisor = holdingMembers.find((member) => member.level === 1) || {
    id: 'holding-advisor',
    level: 1 as const,
    name: 'Rafael Valenzuela Munita',
    role: 'Asesor Financiero y del Directorio',
    notes: 'Nexo principal para la toma de decisiones del Holding',
  };

  const showDireccion = areaFilter === 'all';
  const visibleAreas = areaFilter === 'all' ? areaColumns : areaColumns.filter((area) => area.key === areaFilter);

  return (
    <div className="fixed inset-0 z-[100] bg-slate-100 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="flex h-full flex-col">
        <header className="shrink-0 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/95">
          <div className="mx-auto flex max-w-[1800px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-tr from-indigo-500 to-fuchsia-500 p-2.5 shadow-lg shadow-indigo-500/10">
                <Workflow className="h-5 w-5 text-white" />
              </div>
              <div>
                <h2 className="font-display text-lg font-extrabold text-slate-950 dark:text-white">Organigrama Funcional</h2>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Personal agrupado por área, con líneas de reporte y distribución % FTE en el Holding.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                Área
                <select
                  value={areaFilter}
                  onChange={(event) => setAreaFilter(event.target.value as 'all' | FunctionalAreaKey)}
                  className="min-w-[220px] bg-transparent text-xs font-semibold text-slate-900 outline-none dark:text-slate-100"
                >
                  <option value="all" className="bg-white dark:bg-slate-950">Todas las áreas</option>
                  {FUNCTIONAL_AREAS.map((area) => (
                    <option key={area.key} value={area.key} className="bg-white dark:bg-slate-950">
                      {area.title}
                    </option>
                  ))}
                </select>
              </label>

              {areaFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => setAreaFilter('all')}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                >
                  Limpiar filtro
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm hover:text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-white"
                aria-label="Cerrar organigrama por áreas"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 lg:p-6">
          <div className={`mx-auto grid max-w-[1800px] gap-4 ${areaFilter === 'all' ? 'lg:grid-cols-5' : 'lg:max-w-2xl'}`}>
            {showDireccion && (
              <section className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 shadow-sm dark:border-indigo-500/30 dark:bg-indigo-950/20">
                <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-indigo-200 bg-white/70 px-3 py-2 dark:border-indigo-500/30 dark:bg-slate-950/40">
                  <div className="flex min-w-0 items-center gap-2">
                    <Crown className="h-4 w-4 shrink-0 text-indigo-700 dark:text-indigo-300" />
                    <h3 className="truncate text-xs font-black uppercase tracking-wider text-indigo-700 dark:text-indigo-300">Cúpula &amp; Dirección General</h3>
                  </div>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-indigo-700 dark:bg-slate-900 dark:text-indigo-300">2</span>
                </div>

                <div className="space-y-3">
                  <div className="rounded-xl border border-indigo-200 bg-white p-3 shadow-sm dark:border-indigo-500/40 dark:bg-slate-900">
                    <h4 className="text-sm font-extrabold text-slate-950 dark:text-white">{owner.name}</h4>
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{owner.role}</p>
                    {owner.notes && <p className="mt-1 text-[10.5px] leading-relaxed text-slate-500 dark:text-slate-500">{owner.notes}</p>}
                  </div>
                  <div className="rounded-xl border border-indigo-200 bg-white p-3 shadow-sm dark:border-indigo-500/40 dark:bg-slate-900">
                    <h4 className="text-sm font-extrabold text-slate-950 dark:text-white">{advisor.name}</h4>
                    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{advisor.role}</p>
                    <ManagerLine managerName={owner.name} dense />
                    {advisor.notes && <p className="mt-1 text-[10.5px] leading-relaxed text-slate-500 dark:text-slate-500">{advisor.notes}</p>}
                  </div>
                </div>
              </section>
            )}

            {visibleAreas.map((area) => (
              <section key={area.key} className="rounded-xl border border-slate-200 bg-slate-50 p-3 shadow-sm dark:border-slate-800 dark:bg-slate-900/40">
                <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 dark:border-slate-800 dark:bg-slate-950/40">
                  <h3 className="truncate text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">{area.title}</h3>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-black text-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    {area.entries.length}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {area.entries.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-4 text-center text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-500">
                      Sin personas en esta área.
                    </p>
                  ) : (
                    area.entries.map(({ person, depth }) => {
                      const managerName = person.managerId ? peopleById.get(person.managerId)?.name : person.supervisor || undefined;
                      return (
                        <FunctionalOrgPersonCard
                          key={person.id}
                          person={person}
                          depth={depth}
                          entities={entities}
                          assignments={assignments}
                          managerName={managerName}
                          onOpenPerson={onOpenPerson}
                        />
                      );
                    })
                  )}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface CalendarEvent {
  id: string;
  date: string; // ISO YYYY-MM-DD
  title: string;
  entity: BoardEntity;
  personIds: string[];
  commitmentStatus?: CommitmentStatus;
  kind: 'entity' | 'position';
}

// Agenda/calendar view of every dated commitment on the board: entity-level
// dates (licitación cierres, project/task deliverables) plus per-position
// delivery dates, grouped by month and filterable by persona/entidad.
function CalendarModal({
  isOpen,
  onClose,
  entities,
  people,
  assignments,
}: {
  isOpen: boolean;
  onClose: () => void;
  entities: BoardEntity[];
  people: Person[];
  assignments: Assignment[];
}) {
  const [personFilter, setPersonFilter] = useState('todas');
  const [entityFilter, setEntityFilter] = useState('todas');

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const peopleById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);

  const events = useMemo(() => {
    const list: CalendarEvent[] = [];

    entities.forEach((entity) => {
      const positions = entity.positions || [];
      const entityPersonIds = new Set<string>([
        ...assignments.filter((assignment) => assignment.entityId === entity.id).map((assignment) => assignment.personId),
        ...positions.map((position) => position.assignedPersonId).filter((personId): personId is string => Boolean(personId)),
      ]);

      if (entity.dueDate) {
        list.push({
          id: `entity-${entity.id}`,
          date: entity.dueDate,
          title: entity.type === 'licitacion' ? `Cierre de licitación: ${entity.name}` : `Vencimiento: ${entity.name}`,
          entity,
          personIds: Array.from(entityPersonIds),
          commitmentStatus: entity.commitmentStatus,
          kind: 'entity',
        });
      }

      positions.forEach((position) => {
        if (!position.dueDate) return;
        list.push({
          id: `position-${position.id}`,
          date: position.dueDate,
          title: position.title,
          entity,
          personIds: position.assignedPersonId ? [position.assignedPersonId] : [],
          commitmentStatus: position.commitmentStatus,
          kind: 'position',
        });
      });
    });

    return list.sort((a, b) => a.date.localeCompare(b.date));
  }, [assignments, entities]);

  const filteredEvents = useMemo(
    () =>
      events.filter((event) => {
        const matchesPerson = personFilter === 'todas' || event.personIds.includes(personFilter);
        const matchesEntity = entityFilter === 'todas' || event.entity.id === entityFilter;
        return matchesPerson && matchesEntity;
      }),
    [entityFilter, events, personFilter]
  );

  const groupedByMonth = useMemo(() => {
    const groups = new Map<string, CalendarEvent[]>();
    filteredEvents.forEach((event) => {
      const monthKey = event.date.slice(0, 7); // YYYY-MM
      const bucket = groups.get(monthKey) || [];
      bucket.push(event);
      groups.set(monthKey, bucket);
    });
    return Array.from(groups.entries());
  }, [filteredEvents]);

  if (!isOpen) return null;

  const formatMonthLabel = (monthKey: string) => {
    const label = new Date(`${monthKey}-01T00:00:00`).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  };

  const formatEventDate = (dateIso: string) =>
    new Date(`${dateIso}T00:00:00`).toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short' });

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-800 p-5">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <Calendar className="h-3 w-3" />
              Calendario de Compromisos
            </span>
            <h2 className="mt-3 font-display text-xl font-extrabold leading-tight text-white">Cronograma de Vencimientos</h2>
            <p className="mt-1 text-xs text-slate-500">
              Cierres de licitaciones, entregas de proyectos y tareas comprometidas, ordenados cronológicamente.
            </p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex shrink-0 flex-wrap gap-2 border-b border-slate-800 p-4">
          <label className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-300">
            Persona
            <select
              value={personFilter}
              onChange={(event) => setPersonFilter(event.target.value)}
              className="min-w-[160px] bg-transparent text-xs font-semibold text-slate-100 outline-none"
            >
              <option value="todas" className="bg-slate-950">Todas</option>
              {people.map((person) => (
                <option key={person.id} value={person.id} className="bg-slate-950">{person.name}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-bold text-slate-300">
            Entidad
            <select
              value={entityFilter}
              onChange={(event) => setEntityFilter(event.target.value)}
              className="min-w-[160px] bg-transparent text-xs font-semibold text-slate-100 outline-none"
            >
              <option value="todas" className="bg-slate-950">Todas</option>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id} className="bg-slate-950">{entity.name}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {groupedByMonth.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">
              No hay fechas de vencimiento registradas para este filtro.
            </p>
          ) : (
            groupedByMonth.map(([monthKey, monthEvents]) => (
              <section key={monthKey}>
                <h3 className="mb-2 text-xs font-extrabold uppercase tracking-wider text-slate-500">{formatMonthLabel(monthKey)}</h3>
                <div className="space-y-2">
                  {monthEvents.map((event) => {
                    const urgency = getDueUrgency(event.date, event.commitmentStatus);
                    const meta = ENTITY_META[event.entity.type];
                    const relatedPeople = event.personIds
                      .map((personId) => peopleById.get(personId))
                      .filter((person): person is Person => Boolean(person));

                    return (
                      <div key={event.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="rounded-md border border-slate-800 bg-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            {formatEventDate(event.date)}
                          </span>
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${URGENCY_TONE_STYLES[urgency.tone]}`}>
                            {urgency.tone === 'red' && <AlertTriangle className="h-3 w-3" />}
                            {urgency.tone === 'orange' && <Clock className="h-3 w-3" />}
                            {urgency.tone === 'green' && <CheckCircle2 className="h-3 w-3" />}
                            {urgency.label}
                          </span>
                        </div>
                        <p className="mt-2 break-words text-sm font-bold text-slate-100">{event.title}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">{meta.label} · {event.entity.name}</p>
                        {relatedPeople.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {relatedPeople.map((person) => (
                              <span key={person.id} className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[9px] font-semibold text-slate-300">
                                {person.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// "Histórico de Procesos": save/restore point-in-time snapshots of the whole
// board. Restoring replaces the live board wholesale (with a confirm), so it's
// the same trust level as importing an exported JSON file.
function HistoryModal({
  isOpen,
  onClose,
  snapshots,
  onSave,
  onRestore,
  onDelete,
  onDownload,
}: {
  isOpen: boolean;
  onClose: () => void;
  snapshots: BoardSnapshot[];
  onSave: (name: string, notes: string) => void;
  onRestore: (snapshotId: string) => void;
  onDelete: (snapshotId: string) => void;
  onDownload: (snapshot: BoardSnapshot) => void;
}) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sortedSnapshots = [...snapshots].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const submitSave = (event: React.FormEvent) => {
    event.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;
    onSave(cleanName, notes.trim());
    setName('');
    setNotes('');
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-2xl flex-col rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-800 p-5">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-950 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              <History className="h-3 w-3" />
              Histórico de Procesos
            </span>
            <h2 className="mt-3 font-display text-xl font-extrabold leading-tight text-white">Guardar y Restaurar Versiones</h2>
            <p className="mt-1 text-xs text-slate-500">
              Guarda el estado completo del tablero como un punto en el tiempo — por ejemplo, tras una reunión — y vuelve a él cuando lo necesites.
            </p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submitSave} className="shrink-0 space-y-3 border-b border-slate-800 p-5">
          <label className="text-xs font-bold text-slate-400">
            Nombre del proceso / versión
            <input
              required
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder='Ej: "Acuerdos Reunión Delegación 11-Ago"'
              className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-indigo-500"
            />
          </label>
          <label className="text-xs font-bold text-slate-400">
            Notas de compromiso
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              placeholder="Acuerdos, pendientes o contexto de esta versión..."
              className="mt-1 w-full resize-none rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-indigo-500"
            />
          </label>
          <div className="flex justify-end">
            <button type="submit" className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500">
              <Save className="h-3.5 w-3.5" />
              Guardar versión actual
            </button>
          </div>
        </form>

        <div className="flex-1 space-y-2.5 overflow-y-auto p-5">
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">Versiones guardadas ({sortedSnapshots.length})</p>
          {sortedSnapshots.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">
              Todavía no hay versiones guardadas.
            </p>
          ) : (
            sortedSnapshots.map((snapshot) => (
              <div key={snapshot.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words text-sm font-bold text-slate-100">{snapshot.name}</p>
                    <p className="mt-0.5 text-[10px] font-semibold text-slate-500">
                      {new Date(snapshot.createdAt).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}
                      {' · '}
                      {snapshot.state.entities.length} entidades · {snapshot.state.people.length} personas
                    </p>
                    {snapshot.notes && <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{snapshot.notes}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onRestore(snapshot.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[10px] font-bold text-slate-300 transition-colors hover:border-indigo-500/50 hover:text-indigo-300"
                      title="Restaurar esta versión"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Restaurar
                    </button>
                    <button
                      type="button"
                      onClick={() => onDownload(snapshot)}
                      className="rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-slate-400 transition-colors hover:border-cyan-500/50 hover:text-cyan-300"
                      title="Descargar esta versión como JSON"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(snapshot.id)}
                      className="rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-slate-400 transition-colors hover:border-red-400/50 hover:text-red-300"
                      title="Eliminar esta versión"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [board, setBoard] = useState<BoardState>(loadState);
  const [theme, setTheme] = useState<ThemeMode>(loadTheme);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'Todos' | RoleType>('Todos');
  const [entityTypeFilter, setEntityTypeFilter] = useState<'todos' | EntityType>('todos');
  const [compactMode, setCompactMode] = useState(false);
  const [fitToScreen, setFitToScreen] = useState(false);
  const [isBankDrawerOpen, setIsBankDrawerOpen] = useState(false);
  const [bankCategoryFilter, setBankCategoryFilter] = useState('Todas');
  const [collapsedLevels, setCollapsedLevels] = useState<Record<EntityType, boolean>>({
    empresa: false,
    proyecto: false,
    licitacion: false,
    tarea: false,
  });
  const [connectionMode, setConnectionMode] = useState(false);
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [isMindMapOpen, setIsMindMapOpen] = useState(false);
  const [isFunctionalOrgChartOpen, setIsFunctionalOrgChartOpen] = useState(false);
  const [selectedConnectionPersonId, setSelectedConnectionPersonId] = useState<string | null>(null);
  const [hoveredPersonId, setHoveredPersonId] = useState<string | null>(null);
  const [hoveredConnectionId, setHoveredConnectionId] = useState<string | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [taskSummaryPersonId, setTaskSummaryPersonId] = useState<string | null>(null);
  const [activePersonId, setActivePersonId] = useState<string | null>(null);
  const [isPersonModalOpen, setIsPersonModalOpen] = useState(false);
  const [isEntityModalOpen, setIsEntityModalOpen] = useState(false);
  const [isHoldingModalOpen, setIsHoldingModalOpen] = useState(false);
  const [isPositionModalOpen, setIsPositionModalOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [snapshots, setSnapshots] = useState<BoardSnapshot[]>(loadSnapshots);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [editingEntityId, setEditingEntityId] = useState<string | null>(null);
  const [editingHoldingId, setEditingHoldingId] = useState<string | null>(null);
  const [editingPositionId, setEditingPositionId] = useState<string | null>(null);
  const [positionEntityId, setPositionEntityId] = useState('');
  const [manualAssignEntityId, setManualAssignEntityId] = useState('');
  // Cards render skills/tags/supervisor collapsed to a single primary badge by
  // default; a person's id lands here only while its card is individually or
  // globally expanded to the full list.
  const [expandedPersonIds, setExpandedPersonIds] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [connectionLines, setConnectionLines] = useState<ConnectionLine[]>([]);
  const [connectionCanvasSize, setConnectionCanvasSize] = useState({ width: 0, height: 0 });

  const boardContentRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const [personForm, setPersonForm] = useState({
    name: '',
    role: 'Operativo' as RoleType,
    category: '',
    email: '',
    phone: '',
    notes: '',
    skills: [] as string[],
    customTags: [] as CustomTag[],
    supervisor: '',
    managerId: '',
  });
  const [skillInput, setSkillInput] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tagColorInput, setTagColorInput] = useState<TagColorKey>('slate');

  const [entityForm, setEntityForm] = useState({
    name: '',
    type: 'empresa' as EntityType,
    description: '',
    startDate: '',
    dueDate: '',
    commitmentStatus: '' as CommitmentStatus | '',
  });

  const [holdingForm, setHoldingForm] = useState({
    name: '',
    role: '',
    notes: '',
  });

  const [positionForm, setPositionForm] = useState({
    title: '',
    department: '',
    fte: 1,
    assignedPersonId: '',
    tasks: [] as string[],
    startDate: '',
    dueDate: '',
    commitmentStatus: '' as CommitmentStatus | '',
  });
  const [positionTaskInput, setPositionTaskInput] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
  }, [board]);

  useEffect(() => {
    window.localStorage.setItem(SNAPSHOTS_STORAGE_KEY, JSON.stringify(snapshots));
  }, [snapshots]);

  useEffect(() => {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const selectedPerson = useMemo(
    () => board.people.find((person) => person.id === selectedPersonId) || null,
    [board.people, selectedPersonId]
  );

  const taskSummaryPerson = useMemo(
    () => board.people.find((person) => person.id === taskSummaryPersonId) || null,
    [board.people, taskSummaryPersonId]
  );

  const openTaskSummary = (personId: string) => setTaskSummaryPersonId(personId);

  const selectedConnectionPerson = useMemo(
    () => board.people.find((person) => person.id === selectedConnectionPersonId) || null,
    [board.people, selectedConnectionPersonId]
  );

  const activePerson = useMemo(
    () => board.people.find((person) => person.id === activePersonId) || null,
    [activePersonId, board.people]
  );

  const filteredPeople = useMemo(() => {
    const query = normalizeText(searchQuery);
    return board.people.filter((person) => {
      const matchesQuery =
        !query ||
        [person.name, person.role, person.category, person.email, person.phone, person.notes]
          .join(' ')
          .toLowerCase()
          .includes(query);
      const matchesRole = roleFilter === 'Todos' || person.role === roleFilter;

      return matchesQuery && matchesRole;
    });
  }, [board.people, roleFilter, searchQuery]);

  const orderedEntities = useMemo(() => {
    const entityById = new Map(board.entities.map((entity) => [entity.id, entity]));
    const ordered = board.entitiesOrder
      .map((entityId) => entityById.get(entityId))
      .filter((entity): entity is BoardEntity => Boolean(entity));
    const missing = board.entities.filter((entity) => !board.entitiesOrder.includes(entity.id));
    return [...ordered, ...missing];
  }, [board.entities, board.entitiesOrder]);

  const visibleEntities = useMemo(() => {
    return orderedEntities.filter((entity) => entityTypeFilter === 'todos' || entity.type === entityTypeFilter);
  }, [entityTypeFilter, orderedEntities]);

  // Groups the visible entities into their hierarchy swimlane, preserving the
  // per-type relative order stored in entitiesOrder.
  const entitiesByLevel = useMemo(() => {
    const grouped: Record<EntityType, BoardEntity[]> = { empresa: [], proyecto: [], licitacion: [], tarea: [] };
    visibleEntities.forEach((entity) => {
      grouped[entity.type].push(entity);
    });
    return grouped;
  }, [visibleEntities]);

  const filteredPersonIds = useMemo(() => new Set(filteredPeople.map((person) => person.id)), [filteredPeople]);

  // Categories are free text on each Person, so the drawer's filter options are
  // derived from whatever categories are actually in use.
  const bankCategoryOptions = useMemo(() => {
    const categories = new Set(board.people.map((person) => person.category).filter(Boolean));
    return Array.from(categories).sort((a, b) => a.localeCompare(b, 'es'));
  }, [board.people]);

  const bankDrawerPeople = useMemo(() => {
    if (bankCategoryFilter === 'Todas') return filteredPeople;
    return filteredPeople.filter((person) => person.category === bankCategoryFilter);
  }, [bankCategoryFilter, filteredPeople]);

  const stats = useMemo(() => {
    return {
      people: board.people.length,
      entities: board.entities.length,
      assignments: board.assignments.length,
      connections: board.connections.length,
    };
  }, [board]);

  const isAllBadgesExpanded = useMemo(
    () => board.people.length > 0 && board.people.every((person) => expandedPersonIds.has(person.id)),
    [board.people, expandedPersonIds]
  );

  const connectionColor = theme === 'light' ? '#0369a1' : '#38bdf8';
  const connectionActiveColor = theme === 'light' ? '#0f172a' : '#67e8f9';
  const connectionTextColor = theme === 'light' ? '#0c4a6e' : '#bae6fd';

  const showToast = (message: string, type: ToastMessage['type'] = 'success') => {
    const id = Date.now();
    setToasts((prev) => [...prev.slice(-2), { id, message, type }]);

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };

  const downloadBoardJson = (state: BoardState, filename: string) => {
    const dataStr = JSON.stringify(state, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportBoard = () => {
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadBoardJson(board, `tablero-organigrama-${timestamp}.json`);
    showToast('Tablero exportado como archivo JSON.', 'success');
  };

  const handleSaveSnapshot = (name: string, notes: string) => {
    const snapshot: BoardSnapshot = {
      id: createId('snapshot'),
      name,
      notes,
      createdAt: new Date().toISOString(),
      state: board,
    };
    setSnapshots((prev) => [...prev, snapshot]);
    showToast(`Versión "${name}" guardada en el histórico.`, 'success');
  };

  const handleRestoreSnapshot = (snapshotId: string) => {
    const snapshot = snapshots.find((candidate) => candidate.id === snapshotId);
    if (!snapshot) return;
    if (!window.confirm(`¿Restaurar la versión "${snapshot.name}"? Reemplazará todos los datos actuales del tablero.`)) return;

    setBoard(normalizeBoardState(snapshot.state));
    setSelectedPersonId(null);
    setSelectedConnectionPersonId(null);
    showToast(`Versión "${snapshot.name}" restaurada.`, 'success');
  };

  const handleDeleteSnapshot = (snapshotId: string) => {
    const snapshot = snapshots.find((candidate) => candidate.id === snapshotId);
    if (!snapshot) return;
    if (!window.confirm(`¿Eliminar definitivamente la versión "${snapshot.name}"?`)) return;

    setSnapshots((prev) => prev.filter((candidate) => candidate.id !== snapshotId));
    showToast(`Versión "${snapshot.name}" eliminada.`, 'warning');
  };

  const handleDownloadSnapshot = (snapshot: BoardSnapshot) => {
    const safeName = snapshot.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'version';
    downloadBoardJson(snapshot.state, `historico-${safeName}-${snapshot.createdAt.slice(0, 10)}.json`);
    showToast('Versión descargada como archivo JSON.', 'success');
  };

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleImportFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(reader.result));
      } catch {
        showToast('El archivo no contiene un JSON válido.', 'warning');
        return;
      }

      if (!isValidBoardState(parsed)) {
        showToast('El JSON no tiene la estructura esperada del tablero.', 'warning');
        return;
      }

      if (!window.confirm('Importar reemplazará todos los datos actuales del tablero. ¿Continuar?')) return;

      setBoard(normalizeBoardState(parsed));
      setSelectedPersonId(null);
      setSelectedConnectionPersonId(null);
      showToast('Tablero importado correctamente.', 'success');
    };
    reader.onerror = () => showToast('No se pudo leer el archivo seleccionado.', 'warning');
    reader.readAsText(file);
  };

  const refreshConnectionLines = useCallback(() => {
    const container = boardContentRef.current;
    if (!container) return;

    // Columns now grow freely with their content (no internal scroll), so the SVG
    // canvas must match the container's full rendered size — not just its visible
    // viewport — for arrows to keep pointing at the right cards as rows expand.
    setConnectionCanvasSize({ width: container.scrollWidth, height: container.scrollHeight });

    const containerRect = container.getBoundingClientRect();
    const nextLines = board.connections.flatMap((connection) => {
      const source = container.querySelector(`[data-person-id="${connection.sourcePersonId}"]`) as HTMLElement | null;
      const target = container.querySelector(`[data-person-id="${connection.targetPersonId}"]`) as HTMLElement | null;
      if (!source || !target) return [];

      const sourceRect = source.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const sourceCenterX = sourceRect.left - containerRect.left + sourceRect.width / 2;
      const targetCenterX = targetRect.left - containerRect.left + targetRect.width / 2;
      const sourceIsLeft = sourceCenterX <= targetCenterX;

      return [
        {
          id: connection.id,
          sourcePersonId: connection.sourcePersonId,
          targetPersonId: connection.targetPersonId,
          x1: (sourceIsLeft ? sourceRect.right : sourceRect.left) - containerRect.left,
          y1: sourceRect.top - containerRect.top + sourceRect.height / 2,
          x2: (sourceIsLeft ? targetRect.left : targetRect.right) - containerRect.left,
          y2: targetRect.top - containerRect.top + targetRect.height / 2,
          label: connection.label,
        },
      ];
    });

    setConnectionLines(nextLines);
  }, [board.connections]);

  useEffect(() => {
    const handleRefresh = () => window.requestAnimationFrame(refreshConnectionLines);
    handleRefresh();
    window.addEventListener('resize', handleRefresh);
    window.addEventListener('scroll', handleRefresh, true);

    const observer = new ResizeObserver(handleRefresh);
    if (boardContentRef.current) observer.observe(boardContentRef.current);

    return () => {
      window.removeEventListener('resize', handleRefresh);
      window.removeEventListener('scroll', handleRefresh, true);
      observer.disconnect();
    };
  }, [board.assignments, board.entities, collapsedLevels, expandedPersonIds, filteredPeople, fitToScreen, isBankDrawerOpen, refreshConnectionLines, visibleEntities]);

  // Lock background scroll while the Bank drawer is open, and recalculate the
  // connection SVG right after it opens/closes since that toggle can shift the
  // page's scrollbar and therefore the board's measured position.
  useEffect(() => {
    document.body.style.overflow = isBankDrawerOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isBankDrawerOpen]);

  const toggleLevelCollapsed = (type: EntityType) => {
    setCollapsedLevels((prev) => ({ ...prev, [type]: !prev[type] }));
  };

  // Expands/collapses a single person's badges, independent of every other card.
  const handleTogglePersonBadges = (personId: string) => {
    setExpandedPersonIds((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });
  };

  // Header switch: forces every card on the board to the same state at once.
  const handleToggleAllBadges = () => {
    if (isAllBadgesExpanded) {
      setExpandedPersonIds(new Set());
      showToast('Etiquetas colapsadas en todo el tablero.', 'info');
    } else {
      setExpandedPersonIds(new Set(board.people.map((person) => person.id)));
      showToast('Etiquetas expandidas en todo el tablero.', 'info');
    }
  };

  const openNewPersonModal = () => {
    setEditingPersonId(null);
    setPersonForm({ name: '', role: 'Operativo', category: '', email: '', phone: '', notes: '', skills: [], customTags: [], supervisor: '', managerId: '' });
    setSkillInput('');
    setTagInput('');
    setTagColorInput('slate');
    setIsPersonModalOpen(true);
  };

  const openEditPersonModal = (person: Person) => {
    setEditingPersonId(person.id);
    setPersonForm({
      name: person.name,
      role: person.role,
      category: person.category,
      email: person.email,
      phone: person.phone,
      notes: person.notes,
      skills: person.skills,
      customTags: person.customTags,
      supervisor: person.supervisor,
      managerId: person.managerId || '',
    });
    setSkillInput('');
    setTagInput('');
    setTagColorInput('slate');
    setIsPersonModalOpen(true);
  };

  const addSkillToForm = () => {
    const skill = skillInput.trim();
    if (!skill) return;
    if (personForm.skills.some((existing) => existing.toLowerCase() === skill.toLowerCase())) {
      setSkillInput('');
      return;
    }
    setPersonForm((prev) => ({ ...prev, skills: [...prev.skills, skill] }));
    setSkillInput('');
  };

  const removeSkillFromForm = (skill: string) => {
    setPersonForm((prev) => ({ ...prev, skills: prev.skills.filter((existing) => existing !== skill) }));
  };

  const addTagToForm = (label: string, color: TagColorKey = tagColorInput) => {
    const cleanLabel = label.trim();
    if (!cleanLabel) return;
    if (personForm.customTags.some((tag) => tag.label.toLowerCase() === cleanLabel.toLowerCase())) return;
    setPersonForm((prev) => ({ ...prev, customTags: [...prev.customTags, { id: createId('tag'), label: cleanLabel, color }] }));
  };

  const removeTagFromForm = (tagId: string) => {
    setPersonForm((prev) => ({ ...prev, customTags: prev.customTags.filter((tag) => tag.id !== tagId) }));
  };

  const handleSavePerson = (event: React.FormEvent) => {
    event.preventDefault();
    if (!personForm.name.trim()) return;

    const cleanPersonForm = {
      ...personForm,
      name: personForm.name.trim(),
      category: personForm.category.trim() || 'General',
      email: personForm.email.trim(),
      phone: personForm.phone.trim(),
      notes: personForm.notes.trim(),
      supervisor: personForm.supervisor.trim(),
      managerId: personForm.managerId && personForm.managerId !== editingPersonId ? personForm.managerId : '',
    };

    if (editingPersonId) {
      setBoard((prev) => ({
        ...prev,
        people: prev.people.map((person) =>
          person.id === editingPersonId ? { ...person, ...cleanPersonForm } : person
        ),
        connections: [
          ...prev.connections.filter((connection) => connection.sourcePersonId !== editingPersonId),
          ...(cleanPersonForm.managerId
            ? [{ id: createId('conn'), sourcePersonId: editingPersonId, targetPersonId: cleanPersonForm.managerId, label: 'Reporta a' }]
            : []),
        ],
      }));
      showToast('Persona actualizada.', 'success');
    } else {
      const person: Person = {
        id: createId('person'),
        ...cleanPersonForm,
      };
      setBoard((prev) => ({
        ...prev,
        people: [...prev.people, person],
        connections: cleanPersonForm.managerId
          ? [...prev.connections, { id: createId('conn'), sourcePersonId: person.id, targetPersonId: cleanPersonForm.managerId, label: 'Reporta a' }]
          : prev.connections,
      }));
      showToast(`${person.name} agregado al banco de personas.`, 'success');
    }

    setIsPersonModalOpen(false);
  };

  const openNewEntityModal = () => {
    setEditingEntityId(null);
    setEntityForm({ name: '', type: 'empresa', description: '', startDate: '', dueDate: '', commitmentStatus: '' });
    setIsEntityModalOpen(true);
  };

  const openEditEntityModal = (entity: BoardEntity) => {
    setEditingEntityId(entity.id);
    setEntityForm({
      name: entity.name,
      type: entity.type,
      description: entity.description,
      startDate: entity.startDate || '',
      dueDate: entity.dueDate || '',
      commitmentStatus: entity.commitmentStatus || '',
    });
    setIsEntityModalOpen(true);
  };

  const handleSaveEntity = (event: React.FormEvent) => {
    event.preventDefault();
    if (!entityForm.name.trim()) return;

    const dateFields = {
      startDate: entityForm.startDate || undefined,
      dueDate: entityForm.dueDate || undefined,
      commitmentStatus: entityForm.commitmentStatus || undefined,
    };

    if (editingEntityId) {
      setBoard((prev) => ({
        ...prev,
        entities: prev.entities.map((entity) =>
          entity.id === editingEntityId
            ? {
                ...entity,
                name: entityForm.name.trim(),
                type: entityForm.type,
                description: entityForm.description.trim() || 'Columna horizontal de trabajo.',
                ...dateFields,
              }
            : entity
        ),
      }));
      setEditingEntityId(null);
      setIsEntityModalOpen(false);
      showToast('Entidad actualizada.', 'success');
      return;
    }

    const entity: BoardEntity = {
      id: createId('entity'),
      name: entityForm.name.trim(),
      type: entityForm.type,
      description: entityForm.description.trim() || 'Columna horizontal de trabajo.',
      ...dateFields,
    };

    setBoard((prev) => ({ ...prev, entities: [...prev.entities, entity], entitiesOrder: [...prev.entitiesOrder, entity.id] }));
    setEntityForm({ name: '', type: 'empresa', description: '', startDate: '', dueDate: '', commitmentStatus: '' });
    setIsEntityModalOpen(false);
    showToast(`${entity.name} creado como ${ENTITY_META[entity.type].label}.`, 'success');
  };

  const handleDeletePerson = (personId: string) => {
    const person = board.people.find((candidate) => candidate.id === personId);
    if (!person) return false;

    if (!window.confirm(`¿Eliminar definitivamente a ${person.name}? Se quitará del banco de personas, del tablero y de sus conexiones.`)) return false;

    setBoard((prev) => ({
      ...prev,
      people: prev.people
        .filter((candidate) => candidate.id !== personId)
        .map((candidate) => candidate.managerId === personId ? { ...candidate, managerId: '' } : candidate),
      assignments: prev.assignments.filter((assignment) => assignment.personId !== personId),
      connections: prev.connections.filter(
        (connection) => connection.sourcePersonId !== personId && connection.targetPersonId !== personId
      ),
      // SSoT: deleting a Person frees any Position they held instead of deleting
      // the Position itself — the seat stays defined on the entity, now vacant.
      entities: prev.entities.map((entity) => ({
        ...entity,
        positions: (entity.positions || []).map((position) =>
          position.assignedPersonId === personId ? { ...position, assignedPersonId: null } : position
        ),
      })),
    }));
    setSelectedPersonId(null);
    showToast(`${person.name} eliminado definitivamente.`, 'warning');
    return true;
  };

  const handleDeleteEntity = (entityId: string) => {
    const entity = board.entities.find((candidate) => candidate.id === entityId);
    if (!entity) return;

    if (!window.confirm(`¿Eliminar definitivamente "${entity.name}"? Se quitarán sus asignaciones y puestos asociados.`)) return;

    setBoard((prev) => ({
      ...prev,
      entities: prev.entities.filter((candidate) => candidate.id !== entityId),
      entitiesOrder: prev.entitiesOrder.filter((candidateId) => candidateId !== entityId),
      assignments: prev.assignments.filter((assignment) => assignment.entityId !== entityId),
    }));
    showToast(`${entity.name} eliminado definitivamente.`, 'warning');
  };

  const findEntityByPositionId = (positionId: string) =>
    board.entities.find((entity) => (entity.positions || []).some((position) => position.id === positionId));

  const openNewPositionModal = (entityId: string) => {
    setEditingPositionId(null);
    setPositionEntityId(entityId);
    setPositionForm({ title: '', department: '', fte: 1, assignedPersonId: '', tasks: [], startDate: '', dueDate: '', commitmentStatus: '' });
    setPositionTaskInput('');
    setIsPositionModalOpen(true);
  };

  const openEditPositionModal = (position: Position, entityId: string) => {
    setEditingPositionId(position.id);
    setPositionEntityId(entityId);
    setPositionForm({
      title: position.title,
      department: position.department,
      fte: position.fte,
      assignedPersonId: position.assignedPersonId || '',
      tasks: position.tasks || [],
      startDate: position.startDate || '',
      dueDate: position.dueDate || '',
      commitmentStatus: position.commitmentStatus || '',
    });
    setPositionTaskInput('');
    setIsPositionModalOpen(true);
  };

  const addTaskToPositionForm = () => {
    const cleanTask = positionTaskInput.trim();
    if (!cleanTask) return;
    setPositionForm((prev) => ({ ...prev, tasks: [...prev.tasks, cleanTask] }));
    setPositionTaskInput('');
  };

  const removeTaskFromPositionForm = (taskIndex: number) => {
    setPositionForm((prev) => ({ ...prev, tasks: prev.tasks.filter((_, index) => index !== taskIndex) }));
  };

  const handleSavePosition = (event: React.FormEvent) => {
    event.preventDefault();
    if (!positionForm.title.trim() || !positionEntityId) return;

    const cleanTitle = positionForm.title.trim();
    const cleanDepartment = positionForm.department.trim();
    const dateFields = {
      startDate: positionForm.startDate || undefined,
      dueDate: positionForm.dueDate || undefined,
      commitmentStatus: positionForm.commitmentStatus || undefined,
    };

    if (editingPositionId) {
      setBoard((prev) => ({
        ...prev,
        entities: prev.entities.map((entity) =>
          entity.id === positionEntityId
            ? {
                ...entity,
                positions: (entity.positions || []).map((position) =>
                  position.id === editingPositionId
                    ? {
                        ...position,
                        title: cleanTitle,
                        department: cleanDepartment,
                        fte: positionForm.fte,
                        assignedPersonId: positionForm.assignedPersonId || null,
                        tasks: positionForm.tasks,
                        ...dateFields,
                      }
                    : position
                ),
              }
            : entity
        ),
      }));
      showToast('Puesto actualizado.', 'success');
    } else {
      const position: Position = {
        id: createId('position'),
        title: cleanTitle,
        department: cleanDepartment,
        fte: positionForm.fte,
        assignedPersonId: positionForm.assignedPersonId || null,
        tasks: positionForm.tasks,
        ...dateFields,
      };
      setBoard((prev) => ({
        ...prev,
        entities: prev.entities.map((entity) =>
          entity.id === positionEntityId ? { ...entity, positions: [...(entity.positions || []), position] } : entity
        ),
      }));
      const assignedPerson = board.people.find((person) => person.id === position.assignedPersonId);
      showToast(assignedPerson ? `Puesto "${position.title}" creado para ${assignedPerson.name}.` : `Puesto "${position.title}" creado (vacante).`, 'success');
    }

    setEditingPositionId(null);
    setIsPositionModalOpen(false);
  };

  const handleDeletePosition = (entityId: string, positionId: string) => {
    const entity = board.entities.find((candidate) => candidate.id === entityId);
    const position = entity?.positions?.find((candidate) => candidate.id === positionId);
    if (!position) return;

    if (!window.confirm(`¿Eliminar definitivamente el puesto "${position.title}"?`)) return;

    setBoard((prev) => ({
      ...prev,
      entities: prev.entities.map((candidate) =>
        candidate.id === entityId
          ? { ...candidate, positions: (candidate.positions || []).filter((p) => p.id !== positionId) }
          : candidate
      ),
    }));
    showToast(`Puesto "${position.title}" eliminado.`, 'warning');
  };

  const handleAssignPersonToPosition = (entityId: string, positionId: string, personId: string, fte: number) => {
    const entity = board.entities.find((candidate) => candidate.id === entityId);
    const position = entity?.positions?.find((candidate) => candidate.id === positionId);
    const person = board.people.find((candidate) => candidate.id === personId);
    if (!entity || !position || !person) return;

    if (position.assignedPersonId) {
      showToast(`"${position.title}" ya está ocupado. Desasígnalo primero.`, 'warning');
      return;
    }

    setBoard((prev) => ({
      ...prev,
      entities: prev.entities.map((candidate) =>
        candidate.id === entityId
          ? {
              ...candidate,
              positions: (candidate.positions || []).map((p) =>
                p.id === positionId ? { ...p, assignedPersonId: personId, fte } : p
              ),
            }
          : candidate
      ),
    }));
    showToast(`${person.name} asignado a "${position.title}" (${formatFte(fte)} FTE).`, 'success');
  };

  const handleUnassignPosition = (entityId: string, positionId: string) => {
    const entity = board.entities.find((candidate) => candidate.id === entityId);
    const position = entity?.positions?.find((candidate) => candidate.id === positionId);

    setBoard((prev) => ({
      ...prev,
      entities: prev.entities.map((candidate) =>
        candidate.id === entityId
          ? {
              ...candidate,
              positions: (candidate.positions || []).map((p) =>
                p.id === positionId ? { ...p, assignedPersonId: null } : p
              ),
            }
          : candidate
      ),
    }));
    showToast(position ? `"${position.title}" quedó vacante.` : 'Puesto liberado.', 'info');
  };

  const releasePersonFromPosition = (entityId: string, positionId: string, personId: string, removeEntityAssignment = false) => {
    const entity = board.entities.find((candidate) => candidate.id === entityId);
    const position = entity?.positions?.find((candidate) => candidate.id === positionId);
    const person = board.people.find((candidate) => candidate.id === personId);
    if (!entity || !position || !person || position.assignedPersonId !== personId) return false;

    setBoard((prev) => ({
      ...prev,
      assignments: removeEntityAssignment
        ? prev.assignments.filter((assignment) => !(assignment.entityId === entityId && assignment.personId === personId))
        : prev.assignments,
      entities: prev.entities.map((candidate) =>
        candidate.id === entityId
          ? {
              ...candidate,
              positions: (candidate.positions || []).map((p) =>
                p.id === positionId ? { ...p, assignedPersonId: null } : p
              ),
            }
          : candidate
      ),
    }));
    showToast(`${person.name} liberado de "${position.title}".`, 'info');
    return true;
  };

  const movePositionPersonToPosition = (
    sourceEntityId: string,
    sourcePositionId: string,
    targetEntityId: string,
    targetPositionId: string,
    personId: string,
    fte: number
  ) => {
    if (sourceEntityId === targetEntityId && sourcePositionId === targetPositionId) return false;

    const sourceEntity = board.entities.find((entity) => entity.id === sourceEntityId);
    const targetEntity = board.entities.find((entity) => entity.id === targetEntityId);
    const sourcePosition = sourceEntity?.positions?.find((position) => position.id === sourcePositionId);
    const targetPosition = targetEntity?.positions?.find((position) => position.id === targetPositionId);
    const person = board.people.find((candidate) => candidate.id === personId);
    if (!sourceEntity || !targetEntity || !sourcePosition || !targetPosition || !person) return false;

    if (sourcePosition.assignedPersonId !== personId) return false;
    if (targetPosition.assignedPersonId) {
      showToast(`"${targetPosition.title}" ya está ocupado.`, 'warning');
      return false;
    }

    setBoard((prev) => ({
      ...prev,
      assignments:
        sourceEntityId !== targetEntityId
          ? prev.assignments.filter((assignment) => !(assignment.entityId === sourceEntityId && assignment.personId === personId))
          : prev.assignments,
      entities: prev.entities.map((entity) => ({
        ...entity,
        positions: (entity.positions || []).map((position) => {
          if (entity.id === sourceEntityId && position.id === sourcePositionId) {
            return { ...position, assignedPersonId: null };
          }
          if (entity.id === targetEntityId && position.id === targetPositionId) {
            return { ...position, assignedPersonId: personId, fte };
          }
          return position;
        }),
      })),
    }));
    showToast(`${person.name} movido a "${targetPosition.title}" (${formatFte(fte)} FTE).`, 'success');
    return true;
  };

  const movePositionPersonToEntity = (sourceEntityId: string, sourcePositionId: string, targetEntityId: string, personId: string) => {
    const sourceEntity = board.entities.find((entity) => entity.id === sourceEntityId);
    const targetEntity = board.entities.find((entity) => entity.id === targetEntityId);
    const sourcePosition = sourceEntity?.positions?.find((position) => position.id === sourcePositionId);
    const person = board.people.find((candidate) => candidate.id === personId);
    if (!sourceEntity || !targetEntity || !sourcePosition || !person || sourcePosition.assignedPersonId !== personId) return false;

    setBoard((prev) => {
      const withoutSourceAssignment =
        sourceEntityId !== targetEntityId
          ? prev.assignments.filter((assignment) => !(assignment.entityId === sourceEntityId && assignment.personId === personId))
          : prev.assignments;
      const alreadyAssigned = withoutSourceAssignment.some(
        (assignment) => assignment.entityId === targetEntityId && assignment.personId === personId
      );

      return {
        ...prev,
        assignments: alreadyAssigned
          ? withoutSourceAssignment
          : [...withoutSourceAssignment, { id: createId('assign'), personId, entityId: targetEntityId, taskText: '' }],
        entities: prev.entities.map((entity) =>
          entity.id === sourceEntityId
            ? {
                ...entity,
                positions: (entity.positions || []).map((position) =>
                  position.id === sourcePositionId ? { ...position, assignedPersonId: null } : position
                ),
              }
            : entity
        ),
      };
    });
    showToast(`${person.name} movido a ${targetEntity.name} sin puesto específico.`, 'success');
    return true;
  };

  // SSoT for a Position's task checklist — every add/toggle/remove funnels through
  // here so PositionCard's inline panel and the person's "Hoja de Funciones"
  // modal stay in sync.
  const handleUpdatePositionTasks = (entityId: string, positionId: string, tasks: string[]) => {
    setBoard((prev) => ({
      ...prev,
      entities: prev.entities.map((entity) =>
        entity.id === entityId
          ? {
              ...entity,
              positions: (entity.positions || []).map((position) =>
                position.id === positionId ? { ...position, tasks } : position
              ),
            }
          : entity
      ),
    }));
  };

  const handleAddPositionTask = (entityId: string, positionId: string, taskText: string) => {
    const entity = board.entities.find((candidate) => candidate.id === entityId);
    const position = entity?.positions?.find((candidate) => candidate.id === positionId);
    const cleanTask = taskText.trim();
    if (!position || !cleanTask) return;
    handleUpdatePositionTasks(entityId, positionId, [...(position.tasks || []), cleanTask]);
  };

  const handleTogglePositionTask = (entityId: string, positionId: string, taskIndex: number) => {
    const entity = board.entities.find((candidate) => candidate.id === entityId);
    const position = entity?.positions?.find((candidate) => candidate.id === positionId);
    if (!position) return;
    const nextTasks = (position.tasks || []).map((task, index) => (index === taskIndex ? toggleTaskDoneMarker(task) : task));
    handleUpdatePositionTasks(entityId, positionId, nextTasks);
  };

  const handleRemovePositionTask = (entityId: string, positionId: string, taskIndex: number) => {
    const entity = board.entities.find((candidate) => candidate.id === entityId);
    const position = entity?.positions?.find((candidate) => candidate.id === positionId);
    if (!position) return;
    handleUpdatePositionTasks(entityId, positionId, (position.tasks || []).filter((_, index) => index !== taskIndex));
  };

  const openEditHoldingModal = (member: HoldingMember) => {
    setEditingHoldingId(member.id);
    setHoldingForm({ name: member.name, role: member.role, notes: member.notes });
    setIsHoldingModalOpen(true);
  };

  const handleSaveHolding = (event: React.FormEvent) => {
    event.preventDefault();
    if (!editingHoldingId || !holdingForm.name.trim()) return;

    setBoard((prev) => ({
      ...prev,
      holdingMembers: prev.holdingMembers.map((member) =>
        member.id === editingHoldingId
          ? { ...member, name: holdingForm.name.trim(), role: holdingForm.role.trim(), notes: holdingForm.notes.trim() }
          : member
      ),
    }));
    setIsHoldingModalOpen(false);
    setEditingHoldingId(null);
    showToast('Cúpula directiva actualizada.', 'success');
  };

  const handleAssignPersonToEntity = (personId: string, entityId: string) => {
    const entity = board.entities.find((candidate) => candidate.id === entityId);
    const person = board.people.find((candidate) => candidate.id === personId);
    if (!entity || !person) return false;

    const alreadyAssigned = board.assignments.some(
      (assignment) => assignment.personId === personId && assignment.entityId === entityId
    );

    if (alreadyAssigned) {
      showToast(`${person.name} ya participa en ${entity.name}.`, 'info');
      return false;
    }

    const assignment: Assignment = {
      id: createId('assign'),
      personId,
      entityId,
      taskText: '',
    };

    setBoard((prev) => ({ ...prev, assignments: [...prev.assignments, assignment] }));
    showToast(`${person.name} copiado a ${entity.name}.`, 'success');
    return true;
  };

  // Reordering only makes sense within the same hierarchy row (same entity type) —
  // a company card can't jump into the projects row by being dropped on it.
  const reorderEntity = (sourceEntityId: string, targetEntityId: string) => {
    if (sourceEntityId === targetEntityId) return false;

    const sourceEntity = board.entities.find((entity) => entity.id === sourceEntityId);
    const targetEntity = board.entities.find((entity) => entity.id === targetEntityId);
    if (!sourceEntity || !targetEntity || sourceEntity.type !== targetEntity.type) return false;

    const currentOrder = [
      ...board.entitiesOrder.filter((entityId) => board.entities.some((entity) => entity.id === entityId)),
      ...board.entities.map((entity) => entity.id).filter((entityId) => !board.entitiesOrder.includes(entityId)),
    ];
    const fromIndex = currentOrder.indexOf(sourceEntityId);
    const toIndex = currentOrder.indexOf(targetEntityId);
    if (fromIndex < 0 || toIndex < 0) return false;

    const nextOrder = [...currentOrder];
    const [moved] = nextOrder.splice(fromIndex, 1);
    nextOrder.splice(toIndex, 0, moved);
    setBoard((prev) => ({ ...prev, entitiesOrder: nextOrder }));
    return true;
  };

  const reorderAssignmentsInEntity = (entityId: string, activeAssignmentId: string, overAssignmentId: string) => {
    if (activeAssignmentId === overAssignmentId) return false;

    const currentAssignments = board.assignments.filter((assignment) => assignment.entityId === entityId);
    const fromIndex = currentAssignments.findIndex((assignment) => assignment.id === activeAssignmentId);
    const toIndex = currentAssignments.findIndex((assignment) => assignment.id === overAssignmentId);
    if (fromIndex < 0 || toIndex < 0) return false;

    setBoard((prev) => {
      const entityAssignments = prev.assignments.filter((assignment) => assignment.entityId === entityId);
      const currentIndex = entityAssignments.findIndex((assignment) => assignment.id === activeAssignmentId);
      const targetIndex = entityAssignments.findIndex((assignment) => assignment.id === overAssignmentId);
      if (currentIndex < 0 || targetIndex < 0) return prev;

      const reorderedAssignments = arrayMove(entityAssignments, currentIndex, targetIndex);
      let replacementIndex = 0;

      return {
        ...prev,
        assignments: prev.assignments.map((assignment) =>
          assignment.entityId === entityId ? reorderedAssignments[replacementIndex++] : assignment
        ),
      };
    });
    return true;
  };

  const reorderPositionsInEntity = (entityId: string, activePositionId: string, overPositionId: string) => {
    if (activePositionId === overPositionId) return false;

    const entity = board.entities.find((candidate) => candidate.id === entityId);
    const positions = entity?.positions || [];
    const fromIndex = positions.findIndex((position) => position.id === activePositionId);
    const toIndex = positions.findIndex((position) => position.id === overPositionId);
    if (fromIndex < 0 || toIndex < 0) return false;

    setBoard((prev) => ({
      ...prev,
      entities: prev.entities.map((candidate) => {
        if (candidate.id !== entityId) return candidate;

        const currentPositions = candidate.positions || [];
        const currentIndex = currentPositions.findIndex((position) => position.id === activePositionId);
        const targetIndex = currentPositions.findIndex((position) => position.id === overPositionId);
        if (currentIndex < 0 || targetIndex < 0) return candidate;

        return { ...candidate, positions: arrayMove(currentPositions, currentIndex, targetIndex) };
      }),
    }));
    return true;
  };

  const handleReorderAssignment = (entityId: string, activeAssignmentId: string, overAssignmentId: string) => {
    if (reorderAssignmentsInEntity(entityId, activeAssignmentId, overAssignmentId)) {
      showToast('Orden interno de asignaciones actualizado.', 'success');
    }
  };

  const handleReorderPosition = (entityId: string, activePositionId: string, overPositionId: string) => {
    if (reorderPositionsInEntity(entityId, activePositionId, overPositionId)) {
      showToast('Orden interno de puestos actualizado.', 'success');
    }
  };

  const handleMoveEntity = (entityId: string, direction: 'left' | 'right') => {
    const entity = board.entities.find((candidate) => candidate.id === entityId);
    if (!entity) return;

    // Move within the entities of the same row/type only, keeping other rows untouched.
    const sameLevelOrder = orderedEntities.filter((candidate) => candidate.type === entity.type).map((candidate) => candidate.id);
    const currentIndex = sameLevelOrder.indexOf(entityId);
    const targetIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= sameLevelOrder.length) return;

    const swapTargetId = sameLevelOrder[targetIndex];
    const globalOrder = [...board.entitiesOrder];
    const globalCurrentIndex = globalOrder.indexOf(entityId);
    const globalSwapIndex = globalOrder.indexOf(swapTargetId);
    if (globalCurrentIndex < 0 || globalSwapIndex < 0) return;

    [globalOrder[globalCurrentIndex], globalOrder[globalSwapIndex]] = [globalOrder[globalSwapIndex], globalOrder[globalCurrentIndex]];
    setBoard((prev) => ({ ...prev, entitiesOrder: globalOrder }));
    showToast('Orden de columnas actualizado.', 'success');
  };

  const handleDragStart = (event: DragStartEvent) => {
    const activeType = event.active.data.current?.type as string | undefined;
    const personId = activeType === 'entity' ? undefined : event.active.data.current?.personId as string | undefined;
    setActivePersonId(personId || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const activeType = event.active.data.current?.type as string | undefined;
    const personId = event.active.data.current?.personId as string | undefined;
    const activeEntityId = event.active.data.current?.entityId as string | undefined;
    const activePositionId = event.active.data.current?.positionId as string | undefined;
    const activeFte = event.active.data.current?.fte as number | undefined;
    const overType = event.over?.data.current?.type as string | undefined;
    const overEntityId = event.over?.data.current?.entityId as string | undefined;
    const overId = String(event.over?.id || '');
    setActivePersonId(null);

    if (activeType === 'entity') {
      const sourceEntityId = event.active.data.current?.entityId as string | undefined;
      const targetEntityId = overId.startsWith('entity:') ? overId.replace('entity:', '') : '';
      if (sourceEntityId && targetEntityId && reorderEntity(sourceEntityId, targetEntityId)) {
        showToast('Orden de columnas actualizado.', 'success');
      }
      return;
    }

    if (activeType === 'assignment' && overType === 'assignment') {
      const sourceAssignmentId = event.active.data.current?.assignmentId as string | undefined;
      const targetAssignmentId = event.over?.data.current?.assignmentId as string | undefined;
      if (
        activeEntityId &&
        overEntityId &&
        activeEntityId === overEntityId &&
        sourceAssignmentId &&
        targetAssignmentId &&
        reorderAssignmentsInEntity(activeEntityId, sourceAssignmentId, targetAssignmentId)
      ) {
        showToast('Orden interno de asignaciones actualizado.', 'success');
      } else if (personId && overEntityId && activeEntityId !== overEntityId) {
        handleAssignPersonToEntity(personId, overEntityId);
      }
      return;
    }

    if (activeType === 'position' && overType === 'position') {
      const sourcePositionId = event.active.data.current?.positionId as string | undefined;
      const targetPositionId = event.over?.data.current?.positionId as string | undefined;
      if (
        activeEntityId &&
        overEntityId &&
        activeEntityId === overEntityId &&
        sourcePositionId &&
        targetPositionId &&
        reorderPositionsInEntity(activeEntityId, sourcePositionId, targetPositionId)
      ) {
        showToast('Orden interno de puestos actualizado.', 'success');
      }
      return;
    }

    if (overType === 'bank' && personId) {
      if (activeType === 'position-person' && activeEntityId && activePositionId) {
        releasePersonFromPosition(activeEntityId, activePositionId, personId, true);
      } else if (activeType === 'assignment') {
        const sourceAssignmentId = event.active.data.current?.assignmentId as string | undefined;
        if (sourceAssignmentId) handleRemoveAssignment(sourceAssignmentId);
      }
      return;
    }

    if (activeType === 'position-person' && personId && activeEntityId && activePositionId) {
      const targetPositionId = overId.startsWith('position:') ? overId.replace('position:', '') : '';
      if (targetPositionId) {
        const targetEntity = findEntityByPositionId(targetPositionId);
        if (targetEntity) {
          movePositionPersonToPosition(activeEntityId, activePositionId, targetEntity.id, targetPositionId, personId, activeFte || 1);
        }
        return;
      }

      const targetEntityId = overId.startsWith('entity:') ? overId.replace('entity:', '') : overEntityId || '';
      if (targetEntityId) {
        movePositionPersonToEntity(activeEntityId, activePositionId, targetEntityId, personId);
      }
      return;
    }

    if (personId && overType === 'assignment' && overEntityId) {
      handleAssignPersonToEntity(personId, overEntityId);
      return;
    }

    // Dropping a person straight onto a vacant Position occupies it at 100% FTE
    // by default — the FTE can be fine-tuned afterwards from the position card.
    const targetPositionId = overId.startsWith('position:') ? overId.replace('position:', '') : '';
    if (personId && targetPositionId) {
      const targetEntity = findEntityByPositionId(targetPositionId);
      if (targetEntity) {
        handleAssignPersonToPosition(targetEntity.id, targetPositionId, personId, 1);
      }
      return;
    }

    const targetEntityId = overId.startsWith('entity:') ? overId.replace('entity:', '') : '';
    if (!personId || !targetEntityId) return;

    handleAssignPersonToEntity(personId, targetEntityId);
  };

  const handleConnectPerson = (person: Person) => {
    if (!connectionMode) return;

    if (!selectedConnectionPersonId) {
      setSelectedConnectionPersonId(person.id);
      showToast(`Origen seleccionado: ${person.name}. Elige a quién reporta.`, 'info');
      return;
    }

    if (selectedConnectionPersonId === person.id) {
      setSelectedConnectionPersonId(null);
      showToast('Selección de conexión cancelada.', 'info');
      return;
    }

    const source = board.people.find((candidate) => candidate.id === selectedConnectionPersonId);
    if (!source) return;

    const alreadyExists = board.connections.find(
      (connection) => connection.sourcePersonId === source.id && connection.targetPersonId === person.id
    );

    if (alreadyExists) {
      setBoard((prev) => ({
        ...prev,
        people: prev.people.map((candidate) =>
          candidate.id === source.id && candidate.managerId === person.id ? { ...candidate, managerId: '' } : candidate
        ),
        connections: prev.connections.filter((connection) => connection.id !== alreadyExists.id),
      }));
      setSelectedConnectionPersonId(null);
      showToast(`Conexión removida: ${source.name} → ${person.name}.`, 'warning');
      return;
    }

    setBoard((prev) => ({
      ...prev,
      people: prev.people.map((candidate) =>
        candidate.id === source.id ? { ...candidate, managerId: person.id } : candidate
      ),
      connections: [
        ...prev.connections.filter((connection) => connection.sourcePersonId !== source.id),
        { id: createId('conn'), sourcePersonId: source.id, targetPersonId: person.id, label: 'Reporta a' },
      ],
    }));
    setSelectedConnectionPersonId(null);
    showToast(`Conexión creada: ${source.name} → ${person.name}.`, 'success');
  };

  const handleUpdateAssignmentTask = (assignmentId: string, taskText: string) => {
    setBoard((prev) => ({
      ...prev,
      assignments: prev.assignments.map((assignment) =>
        assignment.id === assignmentId ? { ...assignment, taskText } : assignment
      ),
    }));
  };

  const handleRemoveAssignment = (assignmentId: string) => {
    setBoard((prev) => ({ ...prev, assignments: prev.assignments.filter((assignment) => assignment.id !== assignmentId) }));
    showToast('Asignación quitada de la columna.', 'warning');
  };

  const handleRemoveConnection = (connectionId: string) => {
    setBoard((prev) => {
      const removedConnection = prev.connections.find((connection) => connection.id === connectionId);
      return {
        ...prev,
        people: removedConnection
          ? prev.people.map((person) =>
              person.id === removedConnection.sourcePersonId && person.managerId === removedConnection.targetPersonId
                ? { ...person, managerId: '' }
                : person
            )
          : prev.people,
        connections: prev.connections.filter((connection) => connection.id !== connectionId),
      };
    });
    showToast('Conexión eliminada.', 'warning');
  };

  const getPersonName = (personId: string) => board.people.find((person) => person.id === personId)?.name || 'Persona eliminada';
  const getEntityName = (entityId: string) => board.entities.find((entity) => entity.id === entityId)?.name || 'Entidad eliminada';

  const selectedAssignments = useMemo(
    () =>
      selectedPerson
        ? board.assignments.filter((assignment) => assignment.personId === selectedPerson.id)
        : [],
    [board.assignments, selectedPerson]
  );
  const manualAssignableEntities = useMemo(
    () =>
      selectedPerson
        ? board.entities.filter(
            (entity) => !selectedAssignments.some((assignment) => assignment.entityId === entity.id)
          )
        : [],
    [board.entities, selectedAssignments, selectedPerson]
  );
  const outgoingConnections = useMemo(
    () =>
      selectedPerson
        ? board.connections.filter((connection) => connection.sourcePersonId === selectedPerson.id)
        : [],
    [board.connections, selectedPerson]
  );
  const incomingConnections = useMemo(
    () =>
      selectedPerson
        ? board.connections.filter((connection) => connection.targetPersonId === selectedPerson.id)
        : [],
    [board.connections, selectedPerson]
  );

  useEffect(() => {
    if (!selectedPerson) {
      setManualAssignEntityId('');
      return;
    }

    const stillAvailable = manualAssignableEntities.some((entity) => entity.id === manualAssignEntityId);
    if (!stillAvailable) {
      setManualAssignEntityId(manualAssignableEntities[0]?.id || '');
    }
  }, [manualAssignableEntities, manualAssignEntityId, selectedPerson]);

  return (
    <div className={`theme-${theme} min-h-screen overflow-hidden text-slate-100 transition-colors duration-300`}>
      {toasts.length > 0 && (
        <div className="fixed right-4 top-4 z-[90] flex w-[min(calc(100vw-2rem),380px)] flex-col gap-2">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`rounded-xl border px-4 py-3 text-xs font-semibold shadow-2xl backdrop-blur-md ${
                toast.type === 'warning'
                  ? 'border-amber-500/30 bg-amber-950/85 text-amber-100'
                  : toast.type === 'info'
                  ? 'border-sky-500/30 bg-sky-950/85 text-sky-100'
                  : 'border-emerald-500/30 bg-emerald-950/85 text-emerald-100'
              }`}
            >
              {toast.message}
            </div>
          ))}
        </div>
      )}

      <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-4 px-4 py-4 lg:px-6">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-500 p-2.5 shadow-lg shadow-cyan-500/10">
                <Network className="h-5 w-5 text-white" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-xl font-extrabold tracking-tight text-white">Tablero Horizontal de Equipos</h1>
                  {isPresentationMode && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-400/40 bg-indigo-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-300">
                      <Presentation className="h-3 w-3" />
                      Modo Presentación Activo
                    </span>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-400">Empresas, proyectos, licitaciones y tareas en una sola vista plana y conectable.</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <BankDropButton
                count={board.people.length}
                onClick={() => setIsBankDrawerOpen(true)}
                readOnly={isPresentationMode}
              />
              {!isPresentationMode && (
                <button
                  type="button"
                  onClick={openNewPersonModal}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-md transition-colors hover:bg-indigo-500"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Persona
                </button>
              )}
              {!isPresentationMode && (
                <button
                  type="button"
                  onClick={openNewEntityModal}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-md transition-colors hover:bg-emerald-500"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Entidad
                </button>
              )}
              {!isPresentationMode && (
                <button
                  type="button"
                  onClick={() => {
                    setConnectionMode((prev) => !prev);
                    setSelectedConnectionPersonId(null);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors ${
                    connectionMode
                      ? 'border-amber-400 bg-amber-400 text-slate-950'
                      : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <Link2 className="h-3.5 w-3.5" />
                  Modo conexión
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setIsPresentationMode((prev) => !prev);
                  setConnectionMode(false);
                  setSelectedConnectionPersonId(null);
                }}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors ${
                  isPresentationMode
                    ? 'border-indigo-400 bg-indigo-400 text-slate-950'
                    : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                }`}
                title={isPresentationMode ? 'Salir del modo presentación' : 'Ocultar controles de edición para presentar'}
              >
                <Presentation className="h-3.5 w-3.5" />
                Modo Presentación
              </button>
              <button
                type="button"
                onClick={() => setIsMindMapOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs font-bold text-slate-300 transition-colors hover:border-slate-700"
                title="Abrir vista alternativa de mapa mental"
              >
                <Network className="h-3.5 w-3.5" />
                Mapa Mental
              </button>
              <button
                type="button"
                onClick={() => setIsFunctionalOrgChartOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs font-bold text-slate-300 transition-colors hover:border-slate-700"
                title="Ver organigrama por áreas funcionales y distribución % FTE en el Holding"
              >
                <Workflow className="h-3.5 w-3.5" />
                Organigrama por Áreas
              </button>
              <button
                type="button"
                onClick={() => setCompactMode((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs font-bold text-slate-300 transition-colors hover:border-slate-700"
              >
                <Layers3 className="h-3.5 w-3.5" />
                {compactMode ? 'Expandida' : 'Compacta'}
              </button>
              <button
                type="button"
                onClick={handleToggleAllBadges}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors ${
                  isAllBadgesExpanded
                    ? 'border-indigo-400 bg-indigo-400 text-slate-950'
                    : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                }`}
                title="Expandir o colapsar las etiquetas de todas las tarjetas del tablero"
              >
                <Tags className="h-3.5 w-3.5" />
                Etiquetas: {isAllBadgesExpanded ? 'Mostrar Todas' : '1 Principal'}
              </button>
              <button
                type="button"
                onClick={() => setFitToScreen((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors ${
                  fitToScreen
                    ? 'border-cyan-400 bg-cyan-400 text-slate-950'
                    : 'border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700'
                }`}
                title={fitToScreen ? 'Volver al desplazamiento horizontal' : 'Ajustar todas las columnas al ancho de pantalla'}
              >
                {fitToScreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                Ajustar Pantalla
              </button>
              <button
                type="button"
                onClick={() => setIsCalendarModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs font-bold text-slate-300 transition-colors hover:border-slate-700"
                title="Ver calendario de vencimientos y compromisos"
              >
                <Calendar className="h-3.5 w-3.5" />
                Calendario
              </button>
              <button
                type="button"
                onClick={() => setIsHistoryModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs font-bold text-slate-300 transition-colors hover:border-slate-700"
                title="Guardar o restaurar versiones del tablero (histórico de procesos)"
              >
                <History className="h-3.5 w-3.5" />
                Guardar Histórico
              </button>
              <button
                type="button"
                onClick={handleExportBoard}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs font-bold text-slate-300 transition-colors hover:border-slate-700"
                title="Descargar el tablero completo como archivo JSON"
              >
                <Download className="h-3.5 w-3.5" />
                Exportar JSON
              </button>
              <button
                type="button"
                onClick={handleImportClick}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs font-bold text-slate-300 transition-colors hover:border-slate-700"
                title="Cargar un archivo JSON exportado previamente"
              >
                <Upload className="h-3.5 w-3.5" />
                Importar JSON
              </button>
              <button
                type="button"
                onClick={() => setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'))}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs font-bold text-slate-300 transition-colors hover:border-slate-700"
                title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              >
                {theme === 'dark' ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                {theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                onChange={handleImportFileChange}
                className="hidden"
              />
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-[1fr_auto] xl:items-center">
            <div className="grid gap-3 md:grid-cols-[minmax(220px,420px)_auto_auto]">
              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Buscar por nombre, rol, categoría, nota o contacto..."
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 py-2 pl-10 pr-9 text-xs text-slate-200 outline-none transition focus:border-indigo-500"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
                <Filter className="h-3.5 w-3.5 text-slate-500" />
                <select
                  value={roleFilter}
                  onChange={(event) => setRoleFilter(event.target.value as 'Todos' | RoleType)}
                  className="bg-transparent text-xs font-semibold text-slate-200 outline-none"
                >
                  <option value="Todos" className="bg-slate-950">Todos los roles</option>
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role} className="bg-slate-950">{role}</option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2">
                <Building2 className="h-3.5 w-3.5 text-slate-500" />
                <select
                  value={entityTypeFilter}
                  onChange={(event) => setEntityTypeFilter(event.target.value as 'todos' | EntityType)}
                  className="bg-transparent text-xs font-semibold text-slate-200 outline-none"
                >
                  <option value="todos" className="bg-slate-950">Todas las entidades</option>
                  <option value="empresa" className="bg-slate-950">Empresas</option>
                  <option value="proyecto" className="bg-slate-950">Proyectos</option>
                  <option value="licitacion" className="bg-slate-950">Licitaciones</option>
                  <option value="tarea" className="bg-slate-950">Tareas</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 text-xs">
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2">
                <span className="block text-[10px] font-bold text-slate-500">PERSONAS</span>
                <strong>{stats.people}</strong>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2">
                <span className="block text-[10px] font-bold text-slate-500">COLUMNAS</span>
                <strong>{stats.entities}</strong>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2">
                <span className="block text-[10px] font-bold text-slate-500">ASIGNACIONES</span>
                <strong>{stats.assignments}</strong>
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2">
                <span className="block text-[10px] font-bold text-slate-500">CONEXIONES</span>
                <strong>{stats.connections}</strong>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className={fitToScreen ? 'w-full px-3 py-5' : 'mx-auto max-w-[1800px] px-4 py-5 lg:px-6'}>
        <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-900/45 p-4 text-xs leading-relaxed text-slate-400">
          <strong className="text-slate-200">Estructura jerárquica:</strong> la Cúpula Directiva queda fija arriba; debajo, cada nivel (Empresas → Proyectos → Licitaciones → Tareas) tiene su propia fila a todo el ancho. Abre "Banco de Personas" en el header para buscar, editar o asignar directamente a cualquier entidad, reordena columnas dentro de su fila y colapsa niveles con la flecha para enfocar la vista.
        </div>

        {connectionMode && (
          <div className="mb-4 rounded-2xl border border-cyan-400/50 bg-cyan-950/30 p-3 text-xs font-semibold text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.16)]">
            {selectedConnectionPerson
              ? `Selecciona a quien reporta ${selectedConnectionPerson.name}. Haz clic en la misma persona para cancelar.`
              : 'Modo Conexion activo: haz clic en una tarjeta para elegir el origen de la relacion.'}
          </div>
        )}

          <div ref={boardContentRef} className="relative flex flex-col gap-5 pb-5">
            <svg
              className="pointer-events-none absolute inset-0 z-20 overflow-visible"
              style={{ width: connectionCanvasSize.width || '100%', height: connectionCanvasSize.height || '100%' }}
            >
              <defs>
                <marker id="arrow-head" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
                  <path d="M 0 0 L 8 4 L 0 8 z" fill={connectionColor} />
                </marker>
                <marker id="arrow-head-active" markerHeight="9" markerWidth="9" orient="auto" refX="8" refY="4.5">
                  <path d="M 0 0 L 9 4.5 L 0 9 z" fill={connectionActiveColor} />
                </marker>
              </defs>
              {connectionLines.map((line) => {
                const midX = (line.x1 + line.x2) / 2;
                const midY = (line.y1 + line.y2) / 2;
                const curve = Math.max(80, Math.abs(line.x2 - line.x1) / 2);
                const pathD = `M ${line.x1} ${line.y1} C ${line.x1 + curve} ${line.y1}, ${line.x2 - curve} ${line.y2}, ${line.x2} ${line.y2}`;
                const isActive =
                  hoveredConnectionId === line.id ||
                  hoveredPersonId === line.sourcePersonId ||
                  hoveredPersonId === line.targetPersonId ||
                  selectedConnectionPersonId === line.sourcePersonId ||
                  selectedConnectionPersonId === line.targetPersonId;

                return (
                  <g
                    key={line.id}
                    className={connectionMode ? 'pointer-events-auto cursor-pointer' : 'pointer-events-auto'}
                    onMouseEnter={() => setHoveredConnectionId(line.id)}
                    onMouseLeave={() => setHoveredConnectionId(null)}
                    onClick={(event) => {
                      if (!connectionMode || isPresentationMode) return;
                      event.stopPropagation();
                      handleRemoveConnection(line.id);
                    }}
                  >
                    <path
                      d={pathD}
                      fill="none"
                      stroke="transparent"
                      strokeLinecap="round"
                      strokeWidth="18"
                    />
                    <path
                      d={pathD}
                      fill="none"
                      markerEnd={isActive ? 'url(#arrow-head-active)' : 'url(#arrow-head)'}
                      stroke={isActive ? connectionActiveColor : connectionColor}
                      strokeDasharray={isActive ? '0' : '7 7'}
                      strokeLinecap="round"
                      strokeWidth={isActive ? '4' : '2.5'}
                    />
                    <text x={midX} y={midY - 8} fill={isActive ? connectionActiveColor : connectionTextColor} fontSize="11" fontWeight="700" textAnchor="middle">
                      {line.label}
                    </text>
                  </g>
                );
              })}
            </svg>

            {/* Fila fija superior: Cúpula Directiva (el Banco de Personas vive en su panel desplegable) */}
            <div className="relative z-30 flex gap-4">
              <HoldingColumn members={board.holdingMembers} fitMode={fitToScreen} readOnly={isPresentationMode} onEditMember={openEditHoldingModal} />
            </div>

            {/* Niveles jerárquicos: Empresas -> Proyectos -> Licitaciones -> Tareas */}
            {LEVEL_ORDER.filter((levelType) => entityTypeFilter === 'todos' || entityTypeFilter === levelType).map((levelType) => {
              const levelEntities = entitiesByLevel[levelType];
              const levelMeta = LEVEL_META[levelType];
              const LevelIcon = ENTITY_META[levelType].icon;
              const isCollapsed = collapsedLevels[levelType];

              return (
                <section key={levelType} className="relative z-30 rounded-2xl border border-slate-800/70 bg-slate-900/25 p-3">
                  <header className="mb-3 flex items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wider ${levelMeta.bg} ${levelMeta.border} ${levelMeta.text}`}>
                        <LevelIcon className="h-3.5 w-3.5" />
                        {levelMeta.title}
                      </span>
                      <span className="rounded-full border border-slate-700 bg-slate-950 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                        {levelEntities.length}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleLevelCollapsed(levelType)}
                      className="shrink-0 rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200"
                      title={isCollapsed ? `Expandir ${levelMeta.noun}` : `Colapsar ${levelMeta.noun}`}
                    >
                      {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                    </button>
                  </header>

                  {!isCollapsed && (
                    levelEntities.length === 0 ? (
                      <div className="flex h-20 items-center justify-center rounded-xl border border-dashed border-slate-800 text-xs text-slate-500">
                        Sin {levelMeta.noun} registradas todavía.
                      </div>
                    ) : (
                      <div className={fitToScreen ? 'overflow-x-hidden' : 'overflow-x-auto pb-1'}>
                        <div className={`flex gap-4 ${fitToScreen ? 'w-full' : 'min-w-max snap-x'}`}>
                          {levelEntities.map((entity, entityIndex) => {
                            const assignments = board.assignments.filter(
                              (assignment) => assignment.entityId === entity.id && filteredPersonIds.has(assignment.personId)
                            );

                            return (
                              <div key={entity.id} className={fitToScreen ? 'min-w-0 flex-1' : ''}>
                                <EntityColumn
                                  entity={entity}
                                  assignments={assignments}
                                  people={board.people}
                                  searchQuery={searchQuery}
                                  compact={compactMode}
                                  fitMode={fitToScreen}
                                  selectedConnectionPersonId={selectedConnectionPersonId}
                                  hoveredPersonId={hoveredPersonId}
                                  connectionMode={connectionMode}
                                  readOnly={isPresentationMode}
                                  canMoveLeft={entityIndex > 0}
                                  canMoveRight={entityIndex < levelEntities.length - 1}
                                  expandedPersonIds={expandedPersonIds}
                                  onOpenPerson={(person) => setSelectedPersonId(person.id)}
                                  onConnect={handleConnectPerson}
                                  onHoverPerson={setHoveredPersonId}
                                  onEditEntity={openEditEntityModal}
                                  onDeleteEntity={(entityToDelete) => handleDeleteEntity(entityToDelete.id)}
                                  onRemoveAssignment={handleRemoveAssignment}
                                  onReorderAssignment={handleReorderAssignment}
                                  onMoveEntity={handleMoveEntity}
                                  onAddPosition={openNewPositionModal}
                                  onEditPosition={openEditPositionModal}
                                  onDeletePosition={handleDeletePosition}
                                  onAssignPosition={handleAssignPersonToPosition}
                                  onUnassignPosition={handleUnassignPosition}
                                  onReorderPosition={handleReorderPosition}
                                  onAddPositionTask={handleAddPositionTask}
                                  onTogglePositionTask={handleTogglePositionTask}
                                  onRemovePositionTask={handleRemovePositionTask}
                                  onToggleBadges={handleTogglePersonBadges}
                                  onOpenSummary={openTaskSummary}
                                />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )
                  )}
                </section>
              );
            })}
          </div>

          <DragOverlay dropAnimation={null}>
            {activePerson ? (
              <div className="w-[280px] rotate-2 rounded-xl border border-indigo-400 bg-slate-900 p-3 shadow-2xl ring-2 ring-indigo-400/30">
                <h4 className="font-display text-sm font-bold text-white">{activePerson.name}</h4>
                <div className="mt-2">
                  <RoleBadge role={activePerson.role} />
                </div>
              </div>
            ) : null}
          </DragOverlay>
      </main>

      <BankDrawer
        isOpen={isBankDrawerOpen}
        onClose={() => setIsBankDrawerOpen(false)}
        people={bankDrawerPeople}
        allPeople={board.people}
        totalCount={board.people.length}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        roleFilter={roleFilter}
        onRoleFilterChange={setRoleFilter}
        categoryFilter={bankCategoryFilter}
        onCategoryFilterChange={setBankCategoryFilter}
        categoryOptions={bankCategoryOptions}
        connectionMode={connectionMode}
        selectedConnectionPersonId={selectedConnectionPersonId}
        hoveredPersonId={hoveredPersonId}
        readOnly={isPresentationMode}
        entities={orderedEntities}
        assignments={board.assignments}
        expandedPersonIds={expandedPersonIds}
        onOpenPerson={(person) => setSelectedPersonId(person.id)}
        onConnect={handleConnectPerson}
        onHoverPerson={setHoveredPersonId}
        onEditPerson={openEditPersonModal}
        onDeletePerson={handleDeletePerson}
        onAssignPerson={handleAssignPersonToEntity}
        onOpenNewPerson={openNewPersonModal}
        onToggleBadges={handleTogglePersonBadges}
        onOpenSummary={openTaskSummary}
      />

      </DndContext>

      <MindMapModal
        isOpen={isMindMapOpen}
        onClose={() => setIsMindMapOpen(false)}
        holdingMembers={board.holdingMembers}
        entitiesByLevel={entitiesByLevel}
        assignments={board.assignments}
        people={board.people}
      />

      <FunctionalOrgChartModal
        isOpen={isFunctionalOrgChartOpen}
        onClose={() => setIsFunctionalOrgChartOpen(false)}
        people={board.people}
        entities={orderedEntities}
        assignments={board.assignments}
        holdingMembers={board.holdingMembers}
        onOpenPerson={openTaskSummary}
      />

      <PersonTaskSummaryModal
        isOpen={Boolean(taskSummaryPerson)}
        onClose={() => setTaskSummaryPersonId(null)}
        person={taskSummaryPerson}
        entities={orderedEntities}
        assignments={board.assignments}
        readOnly={isPresentationMode}
        onAddPositionTask={handleAddPositionTask}
        onTogglePositionTask={handleTogglePositionTask}
        onRemovePositionTask={handleRemovePositionTask}
        onUpdateAssignmentTask={handleUpdateAssignmentTask}
      />

      <CalendarModal
        isOpen={isCalendarModalOpen}
        onClose={() => setIsCalendarModalOpen(false)}
        entities={orderedEntities}
        people={board.people}
        assignments={board.assignments}
      />

      <HistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        snapshots={snapshots}
        onSave={handleSaveSnapshot}
        onRestore={handleRestoreSnapshot}
        onDelete={handleDeleteSnapshot}
        onDownload={handleDownloadSnapshot}
      />

      {selectedPerson && (
        <aside className="fixed inset-y-0 right-0 z-[80] flex w-full max-w-xl flex-col border-l border-slate-800 bg-slate-950/95 shadow-2xl backdrop-blur-xl">
          <div className="border-b border-slate-800 p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <User className="h-3 w-3" />
                  Detalle de persona
                </span>
                <h2 className="mt-3 font-display text-xl font-extrabold leading-tight text-white">{selectedPerson.name}</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  <RoleBadge role={selectedPerson.role} />
                  <span className="rounded-md border border-slate-800 bg-slate-900 px-2 py-0.5 text-[10px] font-semibold text-slate-400">{selectedPerson.category}</span>
                </div>
                <PersonBadges person={selectedPerson} />
              </div>
              <button type="button" onClick={() => setSelectedPersonId(null)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-900 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-4">
              <button
                type="button"
                onClick={() => openTaskSummary(selectedPerson.id)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/40 bg-cyan-950/30 px-3 py-2 text-xs font-bold text-cyan-300 transition-colors hover:bg-cyan-950/50"
                title="Ver el resumen consolidado de puestos y funciones de esta persona en todo el Holding"
              >
                <ClipboardList className="h-3.5 w-3.5" />
                Hoja de funciones
              </button>
            </div>
            {!isPresentationMode && (
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => openEditPersonModal(selectedPerson)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => handleDeletePerson(selectedPerson.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-950/50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar definitivamente
                </button>
              </div>
            )}
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            {!isPresentationMode && (
              <section>
                <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-slate-500">Copiar a otra entidad</h3>
                <div className="rounded-xl border border-slate-800 bg-slate-900/55 p-3">
                  {manualAssignableEntities.length === 0 ? (
                    <p className="text-xs text-slate-500">Esta persona ya participa en todas las entidades disponibles.</p>
                  ) : (
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <select
                        value={manualAssignEntityId}
                        onChange={(event) => setManualAssignEntityId(event.target.value)}
                        className="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-semibold text-slate-200 outline-none focus:border-indigo-500"
                      >
                        {manualAssignableEntities.map((entity) => (
                          <option key={entity.id} value={entity.id}>
                            {entity.name} · {ENTITY_META[entity.type].label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          if (!manualAssignEntityId) return;
                          handleAssignPersonToEntity(selectedPerson.id, manualAssignEntityId);
                        }}
                        className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-emerald-500"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Copiar
                      </button>
                    </div>
                  )}
                </div>
              </section>
            )}
            <section>
              <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-slate-500">Participación y funciones por entidad</h3>
              <div className="space-y-3">
                {selectedAssignments.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-slate-800 p-4 text-sm text-slate-500">Esta persona todavía no participa en ninguna columna.</p>
                ) : (
                  selectedAssignments.map((assignment) => (
                    <div key={assignment.id} className="rounded-xl border border-slate-800 bg-slate-900/55 p-3">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <strong className="text-sm text-slate-200">{getEntityName(assignment.entityId)}</strong>
                        {!isPresentationMode && (
                          <button
                            type="button"
                            onClick={() => handleRemoveAssignment(assignment.id)}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-red-950/40 hover:text-red-300"
                            title="Quitar asignación"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      {isPresentationMode ? (
                        <p className="w-full rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs leading-relaxed text-slate-300">
                          {assignment.taskText || 'Sin función específica registrada.'}
                        </p>
                      ) : (
                        <textarea
                          value={assignment.taskText}
                          onChange={(event) => handleUpdateAssignmentTask(assignment.id, event.target.value)}
                          rows={3}
                          placeholder="Describe funciones, tareas o situación específica en esta entidad..."
                          className="w-full resize-none rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs leading-relaxed text-slate-200 outline-none focus:border-indigo-500"
                        />
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>

            <section>
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">Conexiones activas</h3>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                En Modo Conexion tambien puedes hacer clic sobre una linea del tablero para eliminarla.
              </p>
            </section>

            <section>
              <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-slate-500">Reporta a</h3>
              <div className="space-y-2">
                {outgoingConnections.length === 0 ? (
                  <p className="text-xs text-slate-500">Sin conexiones de reporte salientes.</p>
                ) : (
                  outgoingConnections.map((connection) => (
                    <div key={connection.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/55 p-3 text-xs">
                      <span><strong className="text-slate-200">{getPersonName(connection.targetPersonId)}</strong> · {connection.label}</span>
                      {!isPresentationMode && (
                        <button type="button" onClick={() => handleRemoveConnection(connection.id)} className="text-slate-500 hover:text-red-300">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>

            <section>
              <h3 className="mb-3 text-xs font-extrabold uppercase tracking-wider text-slate-500">Le reportan</h3>
              <div className="space-y-2">
                {incomingConnections.length === 0 ? (
                  <p className="text-xs text-slate-500">Sin conexiones entrantes.</p>
                ) : (
                  incomingConnections.map((connection) => (
                    <div key={connection.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/55 p-3 text-xs">
                      <span><strong className="text-slate-200">{getPersonName(connection.sourcePersonId)}</strong> · {connection.label}</span>
                      {!isPresentationMode && (
                        <button type="button" onClick={() => handleRemoveConnection(connection.id)} className="text-slate-500 hover:text-red-300">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </aside>
      )}

      {isPersonModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <form onSubmit={handleSavePerson} className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-5 flex shrink-0 items-center justify-between">
              <h2 className="font-display text-lg font-extrabold text-white">{editingPersonId ? 'Editar persona' : 'Agregar persona'}</h2>
              <button type="button" onClick={() => setIsPersonModalOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 overflow-y-auto pr-1">
              <label className="text-xs font-bold text-slate-400">
                Nombre
                <input required value={personForm.name} onChange={(event) => setPersonForm({ ...personForm, name: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-indigo-500" />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-400">
                  Rol
                  <select value={personForm.role} onChange={(event) => setPersonForm({ ...personForm, role: event.target.value as RoleType })} className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-indigo-500">
                    {ROLE_OPTIONS.map((role) => <option key={role} value={role}>{role}</option>)}
                  </select>
                </label>
                <label className="text-xs font-bold text-slate-400">
                  Categoría
                  <input value={personForm.category} onChange={(event) => setPersonForm({ ...personForm, category: event.target.value })} placeholder="Ej: Producto, RRHH, ITO" className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-indigo-500" />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-xs font-bold text-slate-400">
                  Email
                  <input value={personForm.email} onChange={(event) => setPersonForm({ ...personForm, email: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-indigo-500" />
                </label>
                <label className="text-xs font-bold text-slate-400">
                  Teléfono
                  <input value={personForm.phone} onChange={(event) => setPersonForm({ ...personForm, phone: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-indigo-500" />
                </label>
              </div>

              <label className="text-xs font-bold text-slate-400">
                Coordinador / Supervisor
                <input
                  value={personForm.supervisor}
                  onChange={(event) => setPersonForm({ ...personForm, supervisor: event.target.value })}
                  placeholder="Ej: Coordinado por Christian"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-indigo-500"
                />
              </label>

              <label className="text-xs font-bold text-slate-400">
                Supervisor Directo / Reporta a
                <select
                  value={personForm.managerId}
                  onChange={(event) => setPersonForm({ ...personForm, managerId: event.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-indigo-500"
                >
                  <option value="">Sin supervisor</option>
                  {board.people
                    .filter((person) => person.id !== editingPersonId)
                    .map((person) => (
                      <option key={person.id} value={person.id}>{person.name}</option>
                    ))}
                </select>
              </label>

              <div>
                <span className="text-xs font-bold text-slate-400">Habilidades clave</span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {personForm.skills.length === 0 ? (
                    <p className="text-[11px] text-slate-500">Sin habilidades agregadas todavía.</p>
                  ) : (
                    personForm.skills.map((skill) => (
                      <span
                        key={skill}
                        className="inline-flex items-center gap-1.5 rounded-full border border-indigo-300 bg-indigo-100 px-2.5 py-1 text-[11px] font-semibold text-indigo-800 dark:border-indigo-700 dark:bg-indigo-900/80 dark:text-indigo-200"
                      >
                        {skill}
                        <button type="button" onClick={() => removeSkillFromForm(skill)} className="opacity-70 hover:opacity-100">
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={skillInput}
                    onChange={(event) => setSkillInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addSkillToForm();
                      }
                    }}
                    placeholder="Ej: Negociación, Gestión de Personas..."
                    className="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500"
                  />
                  <button type="button" onClick={addSkillToForm} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500">
                    <Plus className="h-3.5 w-3.5" />
                    Agregar
                  </button>
                </div>
              </div>

              <div>
                <span className="text-xs font-bold text-slate-400">Etiquetas personalizadas</span>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {personForm.customTags.length === 0 ? (
                    <p className="text-[11px] text-slate-500">Sin etiquetas agregadas todavía.</p>
                  ) : (
                    personForm.customTags.map((tag) => {
                      const colors = getTagColorStyle(tag.color);
                      return (
                        <span key={tag.id} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${colors.bg} ${colors.border} ${colors.text}`}>
                          {tag.label}
                          <button type="button" onClick={() => removeTagFromForm(tag.id)} className="opacity-70 hover:opacity-100">
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      );
                    })
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {SUGGESTED_TAGS.map((label) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => addTagToForm(label)}
                      className="rounded-full border border-slate-700 bg-slate-950 px-2.5 py-1 text-[10px] font-semibold text-slate-300 transition-colors hover:border-indigo-500 hover:text-indigo-300"
                    >
                      + {label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={tagInput}
                    onChange={(event) => setTagInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addTagToForm(tagInput);
                        setTagInput('');
                      }
                    }}
                    placeholder="Nombre de etiqueta personalizada"
                    className="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500"
                  />
                  <select
                    value={tagColorInput}
                    onChange={(event) => setTagColorInput(event.target.value as TagColorKey)}
                    className="shrink-0 rounded-xl border border-slate-800 bg-slate-950 px-2 py-2 text-xs font-semibold text-slate-200 outline-none focus:border-indigo-500"
                  >
                    {TAG_COLOR_OPTIONS.map((colorKey) => (
                      <option key={colorKey} value={colorKey} className="bg-slate-950">{colorKey}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      addTagToForm(tagInput);
                      setTagInput('');
                    }}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Agregar
                  </button>
                </div>
              </div>

              <label className="text-xs font-bold text-slate-400">
                Notas
                <textarea value={personForm.notes} onChange={(event) => setPersonForm({ ...personForm, notes: event.target.value })} rows={3} placeholder="Perfil, rol general o historial breve de la persona..." className="mt-1 w-full resize-none rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-indigo-500" />
              </label>
            </div>

            <div className="mt-5 flex shrink-0 items-center justify-between gap-2">
              {editingPersonId ? (
                <button
                  type="button"
                  onClick={() => {
                    if (handleDeletePerson(editingPersonId)) setIsPersonModalOpen(false);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-950/50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Eliminar
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => setIsPersonModalOpen(false)} className="rounded-xl border border-slate-800 px-4 py-2 text-xs font-bold text-slate-400 hover:bg-slate-800 hover:text-white">Cancelar</button>
                <button type="submit" className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500">Guardar</button>
              </div>
            </div>
          </form>
        </div>
      )}

      {isEntityModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <form onSubmit={handleSaveEntity} className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-lg font-extrabold text-white">{editingEntityId ? 'Editar entidad horizontal' : 'Agregar entidad horizontal'}</h2>
              <button
                type="button"
                onClick={() => {
                  setEditingEntityId(null);
                  setIsEntityModalOpen(false);
                }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4">
              <label className="text-xs font-bold text-slate-400">
                Nombre
                <input required value={entityForm.name} onChange={(event) => setEntityForm({ ...entityForm, name: event.target.value })} placeholder="Ej: Proyecto Beta" className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-emerald-500" />
              </label>
              <label className="text-xs font-bold text-slate-400">
                Tipo
                <select value={entityForm.type} onChange={(event) => setEntityForm({ ...entityForm, type: event.target.value as EntityType })} className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-emerald-500">
                  <option value="empresa">Empresa</option>
                  <option value="proyecto">Proyecto</option>
                  <option value="licitacion">Licitación</option>
                  <option value="tarea">Tarea</option>
                </select>
              </label>
              <label className="text-xs font-bold text-slate-400">
                Descripción
                <textarea value={entityForm.description} onChange={(event) => setEntityForm({ ...entityForm, description: event.target.value })} rows={3} className="mt-1 w-full resize-none rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-emerald-500" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-bold text-slate-400">
                  Fecha de inicio
                  <input
                    type="date"
                    value={entityForm.startDate}
                    onChange={(event) => setEntityForm({ ...entityForm, startDate: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-emerald-500"
                  />
                </label>
                <label className="text-xs font-bold text-slate-400">
                  Fecha de término / vencimiento
                  <input
                    type="date"
                    value={entityForm.dueDate}
                    onChange={(event) => setEntityForm({ ...entityForm, dueDate: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-emerald-500"
                  />
                </label>
              </div>
              <label className="text-xs font-bold text-slate-400">
                Estado del compromiso
                <select
                  value={entityForm.commitmentStatus}
                  onChange={(event) => setEntityForm({ ...entityForm, commitmentStatus: event.target.value as CommitmentStatus | '' })}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-emerald-500"
                >
                  <option value="">Sin definir</option>
                  {COMMITMENT_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingEntityId(null);
                  setIsEntityModalOpen(false);
                }}
                className="rounded-xl border border-slate-800 px-4 py-2 text-xs font-bold text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                Cancelar
              </button>
              <button type="submit" className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500">
                {editingEntityId ? 'Guardar cambios' : 'Crear entidad'}
              </button>
            </div>
          </form>
        </div>
      )}

      {isHoldingModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <form onSubmit={handleSaveHolding} className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-lg font-extrabold text-white">Editar miembro de la cúpula directiva</h2>
              <button
                type="button"
                onClick={() => {
                  setEditingHoldingId(null);
                  setIsHoldingModalOpen(false);
                }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4">
              <label className="text-xs font-bold text-slate-400">
                Nombre
                <input required value={holdingForm.name} onChange={(event) => setHoldingForm({ ...holdingForm, name: event.target.value })} className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-amber-500" />
              </label>
              <label className="text-xs font-bold text-slate-400">
                Rol / Cargo
                <input value={holdingForm.role} onChange={(event) => setHoldingForm({ ...holdingForm, role: event.target.value })} placeholder="Ej: Dueño, Asesor Financiero y del Directorio" className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-amber-500" />
              </label>
              <label className="text-xs font-bold text-slate-400">
                Descripción / Notas
                <textarea value={holdingForm.notes} onChange={(event) => setHoldingForm({ ...holdingForm, notes: event.target.value })} rows={3} placeholder="Ej: Radicado en el extranjero..." className="mt-1 w-full resize-none rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-amber-500" />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingHoldingId(null);
                  setIsHoldingModalOpen(false);
                }}
                className="rounded-xl border border-slate-800 px-4 py-2 text-xs font-bold text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                Cancelar
              </button>
              <button type="submit" className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400">
                Guardar cambios
              </button>
            </div>
          </form>
        </div>
      )}

      {isPositionModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
          <form onSubmit={handleSavePosition} className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-5 flex shrink-0 items-center justify-between">
              <h2 className="font-display text-lg font-extrabold text-white">{editingPositionId ? 'Editar puesto' : 'Crear puesto'}</h2>
              <button
                type="button"
                onClick={() => {
                  setEditingPositionId(null);
                  setIsPositionModalOpen(false);
                }}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="mb-4 shrink-0 text-xs text-slate-500">
              Entidad: <strong className="text-slate-300">{getEntityName(positionEntityId)}</strong>. Puedes dejarlo vacante o asignar
              una persona directamente al guardar.
            </p>

            <div className="grid gap-4 overflow-y-auto pr-1">
              <label className="text-xs font-bold text-slate-400">
                Título del puesto
                <input
                  required
                  value={positionForm.title}
                  onChange={(event) => setPositionForm({ ...positionForm, title: event.target.value })}
                  placeholder="Ej: Jefe de Proyecto"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-amber-500"
                />
              </label>
              <label className="text-xs font-bold text-slate-400">
                Departamento
                <input
                  value={positionForm.department}
                  onChange={(event) => setPositionForm({ ...positionForm, department: event.target.value })}
                  placeholder="Ej: Dirección, Operaciones, Legal"
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-amber-500"
                />
              </label>
              <label className="text-xs font-bold text-slate-400">
                Dedicación (FTE)
                <select
                  value={positionForm.fte}
                  onChange={(event) => setPositionForm({ ...positionForm, fte: Number(event.target.value) })}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-amber-500"
                >
                  {FTE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-bold text-slate-400">
                Persona asignada
                <select
                  value={positionForm.assignedPersonId}
                  onChange={(event) => setPositionForm({ ...positionForm, assignedPersonId: event.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-amber-500"
                >
                  <option value="">-- Vacante (Asignar después) --</option>
                  {board.people.map((person) => (
                    <option key={person.id} value={person.id}>{person.name}</option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs font-bold text-slate-400">
                  Fecha de inicio
                  <input
                    type="date"
                    value={positionForm.startDate}
                    onChange={(event) => setPositionForm({ ...positionForm, startDate: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-amber-500"
                  />
                </label>
                <label className="text-xs font-bold text-slate-400">
                  Fecha de entrega
                  <input
                    type="date"
                    value={positionForm.dueDate}
                    onChange={(event) => setPositionForm({ ...positionForm, dueDate: event.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-amber-500"
                  />
                </label>
              </div>
              <label className="text-xs font-bold text-slate-400">
                Estado del compromiso
                <select
                  value={positionForm.commitmentStatus}
                  onChange={(event) => setPositionForm({ ...positionForm, commitmentStatus: event.target.value as CommitmentStatus | '' })}
                  className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-amber-500"
                >
                  <option value="">Sin definir</option>
                  {COMMITMENT_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </label>

              <div>
                <span className="text-xs font-bold text-slate-400">Funciones clave de este puesto</span>
                <div className="mt-2 flex flex-col gap-1.5">
                  {positionForm.tasks.length === 0 ? (
                    <p className="text-[11px] text-slate-500">Sin funciones agregadas todavía.</p>
                  ) : (
                    positionForm.tasks.map((task, taskIndex) => (
                      <div
                        key={`${task}-${taskIndex}`}
                        className="flex items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5"
                      >
                        <span className="min-w-0 flex-1 break-words text-xs text-slate-200">{task}</span>
                        <button
                          type="button"
                          onClick={() => removeTaskFromPositionForm(taskIndex)}
                          className="shrink-0 text-slate-500 opacity-70 hover:text-red-300 hover:opacity-100"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={positionTaskInput}
                    onChange={(event) => setPositionTaskInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        addTaskToPositionForm();
                      }
                    }}
                    placeholder="Ej: Cotizar seguros, Supervisar avance en terreno..."
                    className="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-amber-500"
                  />
                  <button
                    type="button"
                    onClick={addTaskToPositionForm}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-amber-500 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Agregar
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-5 flex shrink-0 justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditingPositionId(null);
                  setIsPositionModalOpen(false);
                }}
                className="rounded-xl border border-slate-800 px-4 py-2 text-xs font-bold text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                Cancelar
              </button>
              <button type="submit" className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400">
                {editingPositionId ? 'Guardar cambios' : 'Crear puesto'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
