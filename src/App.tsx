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
  GripVertical,
  Layers3,
  Link2,
  Maximize2,
  Minimize2,
  Moon,
  Network,
  Plus,
  Search,
  Sun,
  Trash2,
  Upload,
  User,
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

interface Person {
  id: string;
  name: string;
  role: RoleType;
  category: string;
  email: string;
  phone: string;
  notes: string;
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

interface BoardState {
  people: Person[];
  entities: BoardEntity[];
  assignments: Assignment[];
  connections: ReportConnection[];
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

const INITIAL_STATE: BoardState = {
  entities: [
    { id: 'entity-cramick', type: 'empresa', name: 'Cramick S.A.', description: 'Licitaciones de defensa y logística militar.' },
    { id: 'entity-centurion', type: 'empresa', name: 'Centurion Armors SpA', description: 'Equipamiento táctico, blindaje y seguridad avanzada.' },
    { id: 'entity-bedrock', type: 'empresa', name: 'Bedrock S.A.', description: 'Servicios gastronómicos y operaciones de restauración.' },
    { id: 'entity-alpha', type: 'proyecto', name: 'Proyecto Alpha', description: 'Mesa horizontal para coordinación transversal.' },
    { id: 'entity-ejercito', type: 'licitacion', name: 'Licitación Ejército', description: 'Seguimiento de requerimientos, responsables y reportes.' },
    { id: 'entity-nomina', type: 'tarea', name: 'Cierre de Nómina', description: 'Situaciones, notas y pendientes operativos.' },
  ],
  people: [
    { id: 'person-1', name: 'Javier Alonso Farfán Santibáñez', role: 'Arquitectura', category: 'ITO', email: 'j.farfan@cramick.cl', phone: '+56 9 8765 4321', notes: 'Asesor externo para proyectos de diseño.' },
    { id: 'person-2', name: 'Carlos Amunátegui Bustos', role: 'Management', category: 'Producto', email: 'c.amunategui@cramick.cl', phone: '+56 9 1234 5678', notes: 'Lidera desarrollo de productos tácticos.' },
    { id: 'person-3', name: 'Christian Alberto Araya Cheuquepil', role: 'Administrativo', category: 'Administración', email: 'c.araya@cramick.cl', phone: '+56 9 2233 4455', notes: 'Soporte ejecutivo y coordinación administrativa.' },
    { id: 'person-4', name: 'Aleksandar Plazinic Plazinic', role: 'Asesor', category: 'Defensa', email: 'a.plazinic@cramick.cl', phone: '+56 9 5566 7788', notes: 'Certificaciones y estándares de defensa.' },
    { id: 'person-5', name: 'Eloin Rojas Carrasco', role: 'Logística', category: 'Inventario', email: 'e.rojas@cramick.cl', phone: '+56 9 9988 7766', notes: 'Control de vestuario y equipo militar.' },
    { id: 'person-6', name: 'María Victoria Valderas Sánchez', role: 'RRHH', category: 'Coordinación', email: 'mv.valderas@cramick.cl', phone: '+56 9 3344 5566', notes: 'Agenda comercial y adquisiciones.' },
    { id: 'person-7', name: 'Santiago Hernandes Barbara', role: 'Ventas', category: 'Licitaciones', email: 's.hernandes@centurion.cl', phone: '+56 9 4433 2211', notes: 'Licitaciones de blindaje corporal.' },
    { id: 'person-8', name: 'Marko Jovovic Jovovic', role: 'Management', category: 'Compras', email: 'm.jovovic@centurion.cl', phone: '+56 9 7766 5544', notes: 'Adquisiciones internacionales y contratos.' },
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

function loadState(): BoardState {
  if (typeof window === 'undefined') return INITIAL_STATE;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (isValidBoardState(parsed)) {
        return parsed;
      }
    }

    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const legacyEmployees = JSON.parse(legacy) as Array<{ id: string; name: string; role: RoleType; companyId: string; email?: string; phone?: string; notes?: string }>;
      if (Array.isArray(legacyEmployees)) {
        const entities = INITIAL_STATE.entities;
        const people = legacyEmployees.map((employee) => ({
          id: employee.id.replace('emp', 'person'),
          name: employee.name,
          role: ROLE_OPTIONS.includes(employee.role) ? employee.role : 'Operativo',
          category: 'Migrado',
          email: employee.email || '',
          phone: employee.phone || '',
          notes: employee.notes || '',
        }));
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

        return { people, entities, assignments, connections: [] };
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

function PersonCard({
  person,
  searchQuery,
  compact = false,
  dense = false,
  selected = false,
  connectionMode = false,
  onOpen,
  onConnect,
}: {
  person: Person;
  searchQuery: string;
  compact?: boolean;
  dense?: boolean;
  selected?: boolean;
  connectionMode?: boolean;
  onOpen: (person: Person) => void;
  onConnect: (person: Person) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `person:${person.id}`,
    data: { personId: person.id },
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
        {connectionMode && (
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
  onOpen,
  onConnect,
}: {
  assignment: Assignment;
  person: Person;
  searchQuery: string;
  compact: boolean;
  dense?: boolean;
  selected: boolean;
  connectionMode: boolean;
  onOpen: (person: Person) => void;
  onConnect: (person: Person) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `assignment:${assignment.id}`,
    data: { personId: person.id },
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
        {connectionMode && (
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
  onOpenPerson,
  onConnect,
  onEditEntity,
}: {
  entity: BoardEntity;
  assignments: Assignment[];
  people: Person[];
  searchQuery: string;
  compact: boolean;
  fitMode: boolean;
  selectedConnectionPersonId: string | null;
  connectionMode: boolean;
  onOpenPerson: (person: Person) => void;
  onConnect: (person: Person) => void;
  onEditEntity: (entity: BoardEntity) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `entity:${entity.id}` });
  const meta = ENTITY_META[entity.type];
  const Icon = meta.icon;

  return (
    <section
      ref={setNodeRef}
      className={`flex h-[620px] flex-col overflow-hidden rounded-2xl border-2 bg-slate-900/45 backdrop-blur-md transition-all ${
        fitMode ? 'w-full min-w-0' : 'w-[340px] min-w-[340px] snap-start'
      } ${isOver ? 'border-emerald-400 shadow-[0_0_24px_rgba(52,211,153,0.22)]' : 'border-slate-800/80'}`}
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
            <button
              type="button"
              onClick={() => onEditEntity(entity)}
              className="rounded-lg border border-white/20 bg-slate-950/35 p-1.5 text-white/80 transition-colors hover:bg-slate-950/55 hover:text-white"
              title="Editar entidad"
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
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
                onOpen={onOpenPerson}
                onConnect={onConnect}
              />
            );
          })
        )}
      </div>
    </section>
  );
}

function HoldingColumn({ fitMode }: { fitMode: boolean }) {
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

        <div className="holding-card relative z-10 rounded-xl border border-amber-300/50 bg-slate-900/80 p-3 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-amber-400 p-2 text-slate-950">
              <Crown className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-300">Nivel 0</span>
              <h4 className="mt-1 font-display text-sm font-extrabold leading-tight text-slate-900 dark:text-white">Damir Solar - Dueño</h4>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-700 dark:text-slate-400">Radicado en el extranjero (10 meses al año).</p>
            </div>
          </div>
        </div>

        <div className="z-10 mx-auto my-3 rounded-full border border-amber-300/50 bg-slate-950 px-2 py-0.5 text-[10px] font-bold text-amber-300">
          reporta / asesora
        </div>

        <div className="holding-card relative z-10 rounded-xl border border-cyan-300/50 bg-slate-900/80 p-3 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-cyan-400 p-2 text-slate-950">
              <User className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-cyan-700 dark:text-cyan-300">Nivel 1</span>
              <h4 className="mt-1 font-display text-sm font-extrabold leading-tight text-slate-900 dark:text-white">Rafael Valenzuela Munita - Asesor Financiero y del Directorio</h4>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-700 dark:text-slate-400">Nexo principal para la toma de decisiones del Holding.</p>
            </div>
          </div>
        </div>

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
  const [selectedConnectionPersonId, setSelectedConnectionPersonId] = useState<string | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [activePersonId, setActivePersonId] = useState<string | null>(null);
  const [isPersonModalOpen, setIsPersonModalOpen] = useState(false);
  const [isEntityModalOpen, setIsEntityModalOpen] = useState(false);
  const [editingPersonId, setEditingPersonId] = useState<string | null>(null);
  const [editingEntityId, setEditingEntityId] = useState<string | null>(null);
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
  });

  const [entityForm, setEntityForm] = useState({
    name: '',
    type: 'empresa' as EntityType,
    description: '',
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

  const visibleEntities = useMemo(() => {
    return board.entities.filter((entity) => entityTypeFilter === 'todos' || entity.type === entityTypeFilter);
  }, [board.entities, entityTypeFilter]);

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

      setBoard(parsed);
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
    setPersonForm({ name: '', role: 'Operativo', category: '', email: '', phone: '', notes: '' });
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
    });
    setIsPersonModalOpen(true);
  };

  const handleSavePerson = (event: React.FormEvent) => {
    event.preventDefault();
    if (!personForm.name.trim()) return;

    if (editingPersonId) {
      setBoard((prev) => ({
        ...prev,
        people: prev.people.map((person) =>
          person.id === editingPersonId
            ? { ...person, ...personForm, name: personForm.name.trim(), category: personForm.category.trim() || 'General' }
            : person
        ),
      }));
      showToast('Persona actualizada.', 'success');
    } else {
      const person: Person = {
        id: createId('person'),
        name: personForm.name.trim(),
        role: personForm.role,
        category: personForm.category.trim() || 'General',
        email: personForm.email.trim(),
        phone: personForm.phone.trim(),
        notes: personForm.notes.trim(),
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

    setBoard((prev) => ({ ...prev, entities: [...prev.entities, entity] }));
    setEntityForm({ name: '', type: 'empresa', description: '' });
    setIsEntityModalOpen(false);
    showToast(`${entity.name} creado como ${ENTITY_META[entity.type].label}.`, 'success');
  };

  const handleDeletePerson = (personId: string) => {
    const person = board.people.find((candidate) => candidate.id === personId);
    if (!person) return;

    if (!window.confirm(`¿Eliminar definitivamente a ${person.name}? Se quitarán sus asignaciones, tareas y conexiones.`)) return;

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

  const handleDragStart = (event: DragStartEvent) => {
    const personId = event.active.data.current?.personId as string | undefined;
    setActivePersonId(personId || null);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const personId = event.active.data.current?.personId as string | undefined;
    const targetEntityId = String(event.over?.id || '').replace('entity:', '');
    setActivePersonId(null);

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
                <h1 className="font-display text-xl font-extrabold tracking-tight text-white">Tablero Horizontal de Equipos</h1>
                <p className="mt-1 text-xs text-slate-400">Empresas, proyectos, licitaciones y tareas en una sola vista plana y conectable.</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={openNewPersonModal}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-md transition-colors hover:bg-indigo-500"
              >
                <Plus className="h-3.5 w-3.5" />
                Persona
              </button>
              <button
                type="button"
                onClick={openNewEntityModal}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-md transition-colors hover:bg-emerald-500"
              >
                <Plus className="h-3.5 w-3.5" />
                Entidad
              </button>
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

              <HoldingColumn fitMode={fitToScreen} />

              <section
                className={`z-30 flex h-[620px] shrink-0 flex-col overflow-hidden rounded-2xl border-2 border-slate-800 bg-slate-950/80 backdrop-blur-md transition-all ${
                  bankCollapsed ? 'w-[56px] min-w-[56px]' : `min-w-[300px] w-[300px] ${fitToScreen ? '' : 'snap-start'}`
                }`}
              >
                <header className={`flex items-start justify-between gap-2 border-b border-slate-800 ${bankCollapsed ? 'p-2' : 'p-4'}`}>
                  {!bankCollapsed && (
                    <div className="min-w-0">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-300">
                        <Users className="h-3 w-3" />
                        Banco
                      </span>
                      <h3 className="mt-2 font-display text-lg font-extrabold text-white">Personas disponibles</h3>
                      <p className="mt-1 text-xs text-slate-500">Arrastra a cualquier columna. No se mueven: se copian.</p>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setBankCollapsed((prev) => !prev)}
                    className="shrink-0 rounded-lg border border-slate-700 bg-slate-900 p-1.5 text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200"
                    title={bankCollapsed ? 'Expandir banco de personas' : 'Colapsar banco de personas'}
                  >
                    {bankCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
                  </button>
                </header>
                {!bankCollapsed && (
                  <div className="flex-1 space-y-2.5 overflow-y-auto p-3">
                    {filteredPeople.map((person) => (
                      <PersonCard
                        key={person.id}
                        person={person}
                        searchQuery={searchQuery}
                        compact={compactMode}
                        dense={fitToScreen}
                        selected={selectedConnectionPersonId === person.id}
                        connectionMode={connectionMode}
                        onOpen={(nextPerson) => setSelectedPersonId(nextPerson.id)}
                        onConnect={handleConnectPerson}
                      />
                    ))}
                  </div>
                )}
              </section>

              {visibleEntities.map((entity) => {
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
                      onOpenPerson={(person) => setSelectedPersonId(person.id)}
                      onConnect={handleConnectPerson}
                      onEditEntity={openEditEntityModal}
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
              </div>
              <button type="button" onClick={() => setSelectedPersonId(null)} className="rounded-xl p-2 text-slate-400 hover:bg-slate-900 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
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
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-5">
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
                        <button
                          type="button"
                          onClick={() => handleRemoveAssignment(assignment.id)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-red-950/40 hover:text-red-300"
                          title="Quitar asignación"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <textarea
                        value={assignment.taskText}
                        onChange={(event) => handleUpdateAssignmentTask(assignment.id, event.target.value)}
                        rows={3}
                        placeholder="Describe funciones, tareas o situación específica en esta entidad..."
                        className="w-full resize-none rounded-xl border border-slate-800 bg-slate-950 p-3 text-xs leading-relaxed text-slate-200 outline-none focus:border-indigo-500"
                      />
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
                      <button type="button" onClick={() => handleRemoveConnection(connection.id)} className="text-slate-500 hover:text-red-300">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
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
                      <button type="button" onClick={() => handleRemoveConnection(connection.id)} className="text-slate-500 hover:text-red-300">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
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
          <form onSubmit={handleSavePerson} className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-2xl">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-lg font-extrabold text-white">{editingPersonId ? 'Editar persona' : 'Agregar persona'}</h2>
              <button type="button" onClick={() => setIsPersonModalOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4">
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
                Notas
                <textarea value={personForm.notes} onChange={(event) => setPersonForm({ ...personForm, notes: event.target.value })} rows={3} className="mt-1 w-full resize-none rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-slate-200 outline-none focus:border-indigo-500" />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setIsPersonModalOpen(false)} className="rounded-xl border border-slate-800 px-4 py-2 text-xs font-bold text-slate-400 hover:bg-slate-800 hover:text-white">Cancelar</button>
              <button type="submit" className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-500">Guardar</button>
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
    </div>
  );
}
