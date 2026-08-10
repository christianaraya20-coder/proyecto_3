import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  Building2,
  BriefcaseBusiness,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Crown,
  Download,
  Edit2,
  Filter,
  Gavel,
  GripHorizontal,
  GripVertical,
  Layers3,
  Link2,
  Maximize2,
  Minimize2,
  Moon,
  Network,
  Plus,
  Presentation,
  Search,
  Sun,
  Trash2,
  Upload,
  User,
  UserMinus,
  Users,
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
}

interface BoardEntity {
  id: string;
  type: EntityType;
  name: string;
  description: string;
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
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
}

const STORAGE_KEY = 'horizontal-board-state-v1';
const LEGACY_STORAGE_KEY = 'holding-organigrama-employees-v1';
const THEME_STORAGE_KEY = 'theme';

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

const SUGGESTED_TAGS = ['RRHH', 'Licitaciones', 'ITO', 'Dirección', 'Legal', 'Finanzas', 'Tecnología', 'Logística'];

function getTagColorStyle(color: TagColorKey) {
  return TAG_COLOR_STYLES[color] || TAG_COLOR_STYLES.slate;
}

const INITIAL_STATE: BoardState = {
  entities: [
    { id: 'entity-cramick', type: 'empresa', name: 'Cramick S.A.', description: 'Licitaciones de defensa y logística militar.' },
    { id: 'entity-centurion', type: 'empresa', name: 'Centurion Armors SpA', description: 'Equipamiento táctico, blindaje y seguridad avanzada.' },
    { id: 'entity-bedrock', type: 'empresa', name: 'Bedrock S.A.', description: 'Servicios gastronómicos y operaciones de restauración.' },
    { id: 'entity-alpha', type: 'proyecto', name: 'Proyecto Alpha', description: 'Mesa horizontal para coordinación transversal.' },
    { id: 'entity-ejercito', type: 'licitacion', name: 'Licitación Ejército', description: 'Seguimiento de requerimientos, responsables y reportes.' },
    { id: 'entity-nomina', type: 'tarea', name: 'Cierre de Nómina', description: 'Situaciones, notas y pendientes operativos.' },
  ],
  entitiesOrder: ['entity-cramick', 'entity-centurion', 'entity-bedrock', 'entity-alpha', 'entity-ejercito', 'entity-nomina'],
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

// `skills` / `customTags` / `supervisor` were introduced after boards were already
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
  };
}

// `holdingMembers`, `entitiesOrder` and the extended Person fields were introduced
// after boards were already saved/exported. Backfill them so older stored/imported
// states keep working without losing data.
function normalizeBoardState(state: BoardState): BoardState {
  const persistedOrder = Array.isArray(state.entitiesOrder) ? state.entitiesOrder : [];
  const existingEntityIds = new Set(state.entities.map((entity) => entity.id));
  const normalizedOrder = [
    ...persistedOrder.filter((entityId) => existingEntityIds.has(entityId)),
    ...state.entities.map((entity) => entity.id).filter((entityId) => !persistedOrder.includes(entityId)),
  ];

  return {
    ...state,
    entitiesOrder: normalizedOrder,
    people: state.people.map(normalizePerson),
    holdingMembers: Array.isArray(state.holdingMembers) && state.holdingMembers.length > 0
      ? state.holdingMembers
      : INITIAL_STATE.holdingMembers,
  };
}

function loadState(): BoardState {
  if (typeof window === 'undefined') return INITIAL_STATE;

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
    return INITIAL_STATE;
  }

  return INITIAL_STATE;
}

function loadTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark';
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  return storedTheme === 'light' || storedTheme === 'dark' ? storedTheme : 'dark';
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

function PersonBadges({ person, limit }: { person: Person; limit?: number }) {
  const skills = person.skills || [];
  const tags = person.customTags || [];
  const totalBadges = skills.length + tags.length;

  if (totalBadges === 0 && !person.supervisor) return null;

  const visibleSkillCount = limit === undefined ? skills.length : Math.min(skills.length, limit);
  const visibleTagCount = limit === undefined ? tags.length : Math.max(0, Math.min(tags.length, limit - visibleSkillCount));
  const visibleSkills = skills.slice(0, visibleSkillCount);
  const visibleTags = tags.slice(0, visibleTagCount);
  const hiddenCount = totalBadges - visibleSkills.length - visibleTags.length;

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
  onOpen,
  onConnect,
}: {
  person: Person;
  searchQuery: string;
  compact?: boolean;
  dense?: boolean;
  selected?: boolean;
  connectionMode?: boolean;
  readOnly?: boolean;
  onOpen: (person: Person) => void;
  onConnect: (person: Person) => void;
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
      onClick={() => onOpen(person)}
      className={`group rounded-xl border transition-all duration-200 ${dense ? 'p-2' : 'p-3'} ${
        selected
          ? 'border-amber-400 bg-amber-950/30 shadow-[0_0_16px_rgba(251,191,36,0.18)]'
          : 'border-slate-800 bg-slate-900/75 hover:border-slate-700 hover:bg-slate-900'
      } ${isDragging ? 'opacity-30' : 'opacity-100'} cursor-pointer`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className={`break-words font-display font-bold leading-tight text-slate-100 ${dense ? 'text-xs' : 'text-sm'}`}>
            <HighlightedText text={person.name} query={searchQuery} />
          </h4>
          {!compact && <p className="mt-1 text-[11px] font-medium text-slate-500">{person.category}</p>}
        </div>
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
      <PersonBadges person={person} limit={compact || dense ? 2 : undefined} />
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
  onOpen,
  onConnect,
  onRemoveAssignment,
}: {
  assignment: Assignment;
  person: Person;
  searchQuery: string;
  compact: boolean;
  dense?: boolean;
  selected: boolean;
  connectionMode: boolean;
  readOnly?: boolean;
  onOpen: (person: Person) => void;
  onConnect: (person: Person) => void;
  onRemoveAssignment: (assignmentId: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `assignment:${assignment.id}`,
    data: { type: 'assignment', personId: person.id, assignmentId: assignment.id },
    disabled: readOnly,
  });

  const style = transform ? { transform: CSS.Transform.toString(transform) } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-person-id={person.id}
      onClick={() => onOpen(person)}
      className={`group rounded-xl border transition-all duration-200 ${dense ? 'p-2' : 'p-3'} ${
        selected
          ? 'border-amber-400 bg-amber-950/30 shadow-[0_0_16px_rgba(251,191,36,0.18)]'
          : 'border-slate-800 bg-slate-900/70 hover:border-slate-700 hover:bg-slate-900'
      } ${isDragging ? 'opacity-30' : 'opacity-100'} cursor-pointer`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className={`break-words font-display font-bold leading-tight text-slate-100 ${dense ? 'text-xs' : 'text-sm'}`}>
            <HighlightedText text={person.name} query={searchQuery} />
          </h4>
          {!compact && <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-400">{assignment.taskText || 'Sin función específica registrada.'}</p>}
        </div>
        {!readOnly && (
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
        )}
        {!readOnly && (
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
      <PersonBadges person={person} limit={compact || dense ? 2 : undefined} />
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
  connectionMode,
  readOnly = false,
  canMoveLeft,
  canMoveRight,
  onOpenPerson,
  onConnect,
  onEditEntity,
  onDeleteEntity,
  onRemoveAssignment,
  onMoveEntity,
}: {
  entity: BoardEntity;
  assignments: Assignment[];
  people: Person[];
  searchQuery: string;
  compact: boolean;
  fitMode: boolean;
  selectedConnectionPersonId: string | null;
  connectionMode: boolean;
  readOnly?: boolean;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  onOpenPerson: (person: Person) => void;
  onConnect: (person: Person) => void;
  onEditEntity: (entity: BoardEntity) => void;
  onDeleteEntity: (entity: BoardEntity) => void;
  onRemoveAssignment: (assignmentId: string) => void;
  onMoveEntity: (entityId: string, direction: 'left' | 'right') => void;
}) {
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

  return (
    <section
      ref={setNodeRef}
      style={columnStyle}
      className={`flex h-[620px] flex-col overflow-hidden rounded-2xl border-2 bg-slate-900/45 backdrop-blur-md transition-all ${
        fitMode ? 'w-full min-w-0' : 'w-[340px] min-w-[340px] snap-start'
      } ${isColumnDragging ? 'opacity-40' : 'opacity-100'} ${isOver ? 'border-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.22)]' : 'border-slate-800/80'}`}
    >
      <header className={`border-b bg-gradient-to-r ${meta.className} ${fitMode ? 'p-2.5' : 'p-4'}`}>
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
            {!fitMode && <p className="mt-1 line-clamp-2 min-h-[32px] text-xs leading-relaxed text-white/80">{entity.description}</p>}
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`rounded-full border border-white/20 bg-slate-950/35 font-bold text-white ${fitMode ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'}`}>{assignments.length}</span>
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

      <div className={`flex-1 overflow-y-auto ${fitMode ? 'space-y-1.5 p-2' : 'space-y-2.5 p-3'}`}>
        {assignments.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 p-6 text-center text-slate-500">
            <Users className="mb-2 h-8 w-8 opacity-25" />
            <p className="text-xs font-semibold">Arrastra personas aquí</p>
            <p className="mt-1 text-[10px] leading-relaxed">Se copian a esta columna sin salir de su origen.</p>
          </div>
        ) : (
          assignments.map((assignment) => {
            const person = people.find((candidate) => candidate.id === assignment.personId);
            if (!person) return null;

            return (
              <AssignmentCard
                key={assignment.id}
                assignment={assignment}
                person={person}
                searchQuery={searchQuery}
                compact={compact}
                dense={fitMode}
                selected={selectedConnectionPersonId === person.id}
                connectionMode={connectionMode}
                readOnly={readOnly}
                onOpen={onOpenPerson}
                onConnect={onConnect}
                onRemoveAssignment={onRemoveAssignment}
              />
            );
          })
        )}
      </div>
    </section>
  );
}

function BankColumn({
  people,
  searchQuery,
  compact,
  dense,
  collapsed,
  readOnly,
  selectedConnectionPersonId,
  connectionMode,
  onToggleCollapsed,
  onOpenPerson,
  onConnect,
}: {
  people: Person[];
  searchQuery: string;
  compact: boolean;
  dense: boolean;
  collapsed: boolean;
  readOnly: boolean;
  selectedConnectionPersonId: string | null;
  connectionMode: boolean;
  onToggleCollapsed: () => void;
  onOpenPerson: (person: Person) => void;
  onConnect: (person: Person) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'bank' });

  return (
    <section
      ref={setNodeRef}
      className={`z-30 flex h-[620px] shrink-0 flex-col overflow-hidden rounded-2xl border-2 bg-slate-950/80 backdrop-blur-md transition-all ${
        collapsed ? 'w-[56px] min-w-[56px]' : `min-w-[300px] w-[300px] ${dense ? '' : 'snap-start'}`
      } ${isOver ? 'border-red-400 shadow-[0_0_24px_rgba(248,113,113,0.24)]' : 'border-slate-800'}`}
    >
      <header className={`flex items-start justify-between gap-2 border-b border-slate-800 ${collapsed ? 'p-2' : 'p-4'}`}>
        {!collapsed && (
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-300">
              <Users className="h-3 w-3" />
              Banco
            </span>
            <h3 className="mt-2 font-display text-lg font-extrabold text-white">Personas disponibles</h3>
            <p className="mt-1 text-xs text-slate-500">
              Arrastra a cualquier columna. Suelta aquÃ­ una asignaciÃ³n para quitarla de su entidad.
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="shrink-0 rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200"
          title={collapsed ? 'Expandir banco de personas' : 'Colapsar banco de personas'}
        >
          {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
        </button>
      </header>
      {!collapsed && (
        <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
          {people.map((person) => (
            <PersonCard
              key={person.id}
              person={person}
              searchQuery={searchQuery}
              compact={compact}
              dense={dense}
              selected={selectedConnectionPersonId === person.id}
              connectionMode={connectionMode}
              readOnly={readOnly}
              onOpen={onOpenPerson}
              onConnect={onConnect}
            />
          ))}
        </div>
      )}
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
      className={`holding-column z-30 flex h-[620px] shrink-0 flex-col overflow-hidden rounded-2xl border-2 border-amber-400/60 bg-slate-950/85 shadow-[0_0_24px_rgba(245,158,11,0.16)] backdrop-blur-md ${
        fitMode ? 'w-[260px] min-w-[260px]' : 'w-[320px] min-w-[320px] snap-start'
      }`}
    >
      <header className={`border-b border-amber-400/30 bg-gradient-to-r from-amber-500 to-yellow-500 ${fitMode ? 'p-2.5' : 'p-4'}`}>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-slate-950/35 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
          <Crown className="h-3 w-3" />
          Directorio / Holding
        </span>
        <h3 className={`mt-2 font-display font-extrabold leading-tight text-white ${fitMode ? 'text-sm' : 'text-lg'}`}>Cúpula directiva</h3>
        {!fitMode && <p className="mt-1 text-xs leading-relaxed text-white/85">Referencia fija para decisiones, reportes y dirección del grupo.</p>}
      </header>

      <div className={`relative flex flex-1 flex-col ${fitMode ? 'p-2' : 'p-4'}`}>
        <div className="absolute left-1/2 top-[96px] h-[118px] w-0.5 -translate-x-1/2 bg-amber-400/70" />

        {level0 && <HoldingCard member={level0} icon={Crown} accent="amber" readOnly={readOnly} onEdit={onEditMember} />}

        <div className="z-10 mx-auto my-3 rounded-full border border-amber-300/50 bg-slate-950 px-2 py-0.5 text-[10px] font-bold text-amber-300">
          reporta / asesora
        </div>

        {level1 && <HoldingCard member={level1} icon={User} accent="cyan" readOnly={readOnly} onEdit={onEditMember} />}

        <div className="mt-4 flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-cyan-400/40 bg-slate-900/45 p-3 text-center">
          <Network className="mb-2 h-5 w-5 text-cyan-700 dark:text-cyan-300" />
          <p className="text-xs font-bold text-slate-900 dark:text-slate-200">Las entidades del tablero reportan operativamente a Rafael.</p>
          <p className="mt-1 text-[10px] leading-relaxed text-slate-500">La estructura sigue horizontal; esta columna solo fija la referencia de decisión.</p>
        </div>
      </div>
    </section>
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
  const [bankCollapsed, setBankCollapsed] = useState(false);
  const [connectionMode, setConnectionMode] = useState(false);
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [selectedConnectionPersonId, setSelectedConnectionPersonId] = useState<string | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [activePersonId, setActivePersonId] = useState<string | null>(null);
  const [isPersonModalOpen, setIsPersonModalOpen] = useState(false);
  const [isEntityModalOpen, setIsEntityModalOpen] = useState(false);
  const [isHoldingModalOpen, setIsHoldingModalOpen] = useState(false);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [editingEntityId, setEditingEntityId] = useState<string | null>(null);
  const [editingHoldingId, setEditingHoldingId] = useState<string | null>(null);
  const [manualAssignEntityId, setManualAssignEntityId] = useState('');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [connectionLines, setConnectionLines] = useState<ConnectionLine[]>([]);

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
  });
  const [skillInput, setSkillInput] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [tagColorInput, setTagColorInput] = useState<TagColorKey>('slate');

  const [entityForm, setEntityForm] = useState({
    name: '',
    type: 'empresa' as EntityType,
    description: '',
  });

  const [holdingForm, setHoldingForm] = useState({
    name: '',
    role: '',
    notes: '',
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } })
  );

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
  }, [board]);

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

  const filteredPersonIds = useMemo(() => new Set(filteredPeople.map((person) => person.id)), [filteredPeople]);

  const stats = useMemo(() => {
    return {
      people: board.people.length,
      entities: board.entities.length,
      assignments: board.assignments.length,
      connections: board.connections.length,
    };
  }, [board]);

  const connectionColor = theme === 'light' ? '#0369a1' : '#38bdf8';
  const connectionTextColor = theme === 'light' ? '#0c4a6e' : '#bae6fd';

  const showToast = (message: string, type: ToastMessage['type'] = 'success') => {
    const id = Date.now();
    setToasts((prev) => [...prev.slice(-2), { id, message, type }]);

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 3000);
  };

  const handleExportBoard = () => {
    const dataStr = JSON.stringify(board, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const timestamp = new Date().toISOString().slice(0, 10);
    const link = document.createElement('a');
    link.href = url;
    link.download = `tablero-organigrama-${timestamp}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast('Tablero exportado como archivo JSON.', 'success');
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

    const containerRect = container.getBoundingClientRect();
    const nextLines = board.connections.flatMap((connection) => {
      const source = container.querySelector(`[data-person-id="${connection.sourcePersonId}"]`) as HTMLElement | null;
      const target = container.querySelector(`[data-person-id="${connection.targetPersonId}"]`) as HTMLElement | null;
      if (!source || !target) return [];

      const sourceRect = source.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();

      return [
        {
          id: connection.id,
          x1: sourceRect.right - containerRect.left,
          y1: sourceRect.top - containerRect.top + sourceRect.height / 2,
          x2: targetRect.left - containerRect.left,
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
  }, [bankCollapsed, board.assignments, filteredPeople, fitToScreen, refreshConnectionLines, visibleEntities]);

  const openNewPersonModal = () => {
    setEditingPersonId(null);
    setPersonForm({ name: '', role: 'Operativo', category: '', email: '', phone: '', notes: '', skills: [], customTags: [], supervisor: '' });
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
    };

    if (editingPersonId) {
      setBoard((prev) => ({
        ...prev,
        people: prev.people.map((person) =>
          person.id === editingPersonId ? { ...person, ...cleanPersonForm } : person
        ),
      }));
      showToast('Persona actualizada.', 'success');
    } else {
      const person: Person = {
        id: createId('person'),
        ...cleanPersonForm,
      };
      setBoard((prev) => ({ ...prev, people: [...prev.people, person] }));
      showToast(`${person.name} agregado al banco de personas.`, 'success');
    }

    setIsPersonModalOpen(false);
  };

  const openNewEntityModal = () => {
    setEditingEntityId(null);
    setEntityForm({ name: '', type: 'empresa', description: '' });
    setIsEntityModalOpen(true);
  };

  const openEditEntityModal = (entity: BoardEntity) => {
    setEditingEntityId(entity.id);
    setEntityForm({
      name: entity.name,
      type: entity.type,
      description: entity.description,
    });
    setIsEntityModalOpen(true);
  };

  const handleSaveEntity = (event: React.FormEvent) => {
    event.preventDefault();
    if (!entityForm.name.trim()) return;

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
    };

    setBoard((prev) => ({ ...prev, entities: [...prev.entities, entity], entitiesOrder: [...prev.entitiesOrder, entity.id] }));
    setEntityForm({ name: '', type: 'empresa', description: '' });
    setIsEntityModalOpen(false);
    showToast(`${entity.name} creado como ${ENTITY_META[entity.type].label}.`, 'success');
  };

  const handleDeletePerson = (personId: string) => {
    const person = board.people.find((candidate) => candidate.id === personId);
    if (!person) return false;

    if (!window.confirm(`¿Eliminar definitivamente a ${person.name}? Se quitará del banco de personas, del tablero y de sus conexiones.`)) return false;

    setBoard((prev) => ({
      ...prev,
      people: prev.people.filter((candidate) => candidate.id !== personId),
      assignments: prev.assignments.filter((assignment) => assignment.personId !== personId),
      connections: prev.connections.filter(
        (connection) => connection.sourcePersonId !== personId && connection.targetPersonId !== personId
      ),
    }));
    setSelectedPersonId(null);
    showToast(`${person.name} eliminado definitivamente.`, 'warning');
    return true;
  };

  const handleDeleteEntity = (entityId: string) => {
    const entity = board.entities.find((candidate) => candidate.id === entityId);
    if (!entity) return;

    if (!window.confirm(`¿Eliminar definitivamente "${entity.name}"? Se quitarán sus asignaciones asociadas.`)) return;

    setBoard((prev) => ({
      ...prev,
      entities: prev.entities.filter((candidate) => candidate.id !== entityId),
      entitiesOrder: prev.entitiesOrder.filter((candidateId) => candidateId !== entityId),
      assignments: prev.assignments.filter((assignment) => assignment.entityId !== entityId),
    }));
    showToast(`${entity.name} eliminado definitivamente.`, 'warning');
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

  const reorderEntity = (sourceEntityId: string, targetEntityId: string) => {
    if (sourceEntityId === targetEntityId) return false;

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

  const handleMoveEntity = (entityId: string, direction: 'left' | 'right') => {
    const currentOrder = orderedEntities.map((entity) => entity.id);
    const currentIndex = currentOrder.indexOf(entityId);
    const targetIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;
    if (currentIndex < 0 || targetIndex < 0 || targetIndex >= currentOrder.length) return;

    const nextOrder = [...currentOrder];
    [nextOrder[currentIndex], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[currentIndex]];
    setBoard((prev) => ({ ...prev, entitiesOrder: nextOrder }));
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
    const assignmentId = event.active.data.current?.assignmentId as string | undefined;
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

    if (activeType === 'assignment' && assignmentId && overId === 'bank') {
      handleRemoveAssignment(assignmentId);
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

    const label = window.prompt(`Describe la relación entre ${source.name} y ${person.name}:`, 'Reporta avances');
    if (!label) return;

    const alreadyExists = board.connections.some(
      (connection) => connection.sourcePersonId === source.id && connection.targetPersonId === person.id
    );

    if (alreadyExists) {
      showToast('Esa conexión ya existe.', 'info');
      setSelectedConnectionPersonId(null);
      return;
    }

    setBoard((prev) => ({
      ...prev,
      connections: [
        ...prev.connections,
        { id: createId('conn'), sourcePersonId: source.id, targetPersonId: person.id, label: label.trim() },
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
    setBoard((prev) => ({ ...prev, connections: prev.connections.filter((connection) => connection.id !== connectionId) }));
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
                onClick={() => setCompactMode((prev) => !prev)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2 text-xs font-bold text-slate-300 transition-colors hover:border-slate-700"
              >
                <Layers3 className="h-3.5 w-3.5" />
                {compactMode ? 'Expandida' : 'Compacta'}
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
          <strong className="text-slate-200">Estructura horizontal:</strong> las columnas viven en el mismo nivel. Arrastra personas desde el banco o desde otra columna para copiarlas, agrega tareas por contexto y usa el modo conexión para dibujar quién reporta a quién.
        </div>

        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className={fitToScreen ? 'overflow-x-hidden pb-5' : 'overflow-x-auto pb-5'}>
            <div
              ref={boardContentRef}
              className={`relative flex gap-4 pb-3 ${fitToScreen ? 'w-full' : 'min-w-max snap-x'}`}
            >
              <svg className="pointer-events-none absolute inset-0 z-20 h-full w-full overflow-visible">
                <defs>
                  <marker id="arrow-head" markerHeight="8" markerWidth="8" orient="auto" refX="7" refY="4">
                    <path d="M 0 0 L 8 4 L 0 8 z" fill={connectionColor} />
                  </marker>
                </defs>
                {connectionLines.map((line) => {
                  const midX = (line.x1 + line.x2) / 2;
                  const midY = (line.y1 + line.y2) / 2;
                  const curve = Math.max(80, Math.abs(line.x2 - line.x1) / 2);

                  return (
                    <g key={line.id}>
                      <path
                        d={`M ${line.x1} ${line.y1} C ${line.x1 + curve} ${line.y1}, ${line.x2 - curve} ${line.y2}, ${line.x2} ${line.y2}`}
                        fill="none"
                        markerEnd="url(#arrow-head)"
                        stroke={connectionColor}
                        strokeDasharray="7 7"
                        strokeLinecap="round"
                        strokeWidth="2"
                      />
                      <text x={midX} y={midY - 8} fill={connectionTextColor} fontSize="11" fontWeight="700" textAnchor="middle">
                        {line.label}
                      </text>
                    </g>
                  );
                })}
              </svg>

              <HoldingColumn members={board.holdingMembers} fitMode={fitToScreen} readOnly={isPresentationMode} onEditMember={openEditHoldingModal} />

              <BankColumn
                people={filteredPeople}
                searchQuery={searchQuery}
                compact={compactMode}
                dense={fitToScreen}
                collapsed={bankCollapsed}
                readOnly={isPresentationMode}
                selectedConnectionPersonId={selectedConnectionPersonId}
                connectionMode={connectionMode}
                onToggleCollapsed={() => setBankCollapsed((prev) => !prev)}
                onOpenPerson={(nextPerson) => setSelectedPersonId(nextPerson.id)}
                onConnect={handleConnectPerson}
              />

              {visibleEntities.map((entity, entityIndex) => {
                const assignments = board.assignments.filter(
                  (assignment) => assignment.entityId === entity.id && filteredPersonIds.has(assignment.personId)
                );

                return (
                  <div key={entity.id} className={fitToScreen ? 'z-30 min-w-0 flex-1' : 'z-30'}>
                    <EntityColumn
                      entity={entity}
                      assignments={assignments}
                      people={board.people}
                      searchQuery={searchQuery}
                      compact={compactMode}
                      fitMode={fitToScreen}
                      selectedConnectionPersonId={selectedConnectionPersonId}
                      connectionMode={connectionMode}
                      readOnly={isPresentationMode}
                      canMoveLeft={entityIndex > 0}
                      canMoveRight={entityIndex < visibleEntities.length - 1}
                      onOpenPerson={(person) => setSelectedPersonId(person.id)}
                      onConnect={handleConnectPerson}
                      onEditEntity={openEditEntityModal}
                      onDeleteEntity={(entityToDelete) => handleDeleteEntity(entityToDelete.id)}
                      onRemoveAssignment={handleRemoveAssignment}
                      onMoveEntity={handleMoveEntity}
                    />
                  </div>
                );
              })}
            </div>
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
        </DndContext>
      </main>

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
    </div>
  );
}
