import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { listAllCourses, type AdminCourse, type AdminSchedule } from "../../lib/adminData";
import { dateLocale, useLanguage, useT } from "../../lib/i18n";
import { Feedback, dayLabel, errorText } from "./shared";

type Entry = AdminSchedule & { courseName: string; courseId: string };
type Scope = "upcoming" | "past" | "all";

export default function AdminCalendar() {
  const language = useLanguage();
  const locale = dateLocale[language];
  const t = useT({
    fr: { title: "Calendrier des sessions", intro: "Toutes les sessions de toutes les formations, regroupées par mois. Pour ajouter ou modifier une session, ouvrez la formation.", loading: "Chargement du calendrier…", empty: "Aucune session dans cette période.", upcoming: "À venir", past: "Passées", all: "Toutes", scheduled: "Planifiée", published: "Publiée", cancelled: "Annulée", edit: "Gérer la formation", sessions: "sessions" },
    en: { title: "Session calendar", intro: "Every session of every course, grouped by month. To add or edit a session, open the course.", loading: "Loading the calendar…", empty: "No session in this period.", upcoming: "Upcoming", past: "Past", all: "All", scheduled: "Scheduled", published: "Published", cancelled: "Cancelled", edit: "Manage course", sessions: "sessions" },
    pt: { title: "Calendário das sessões", intro: "Todas as sessões de todos os cursos, agrupadas por mês. Para adicionar ou alterar uma sessão, abra o curso.", loading: "A carregar o calendário…", empty: "Nenhuma sessão neste período.", upcoming: "Próximas", past: "Passadas", all: "Todas", scheduled: "Planeada", published: "Publicada", cancelled: "Cancelada", edit: "Gerir o curso", sessions: "sessões" },
    es: { title: "Calendario de sesiones", intro: "Todas las sesiones de todos los cursos, agrupadas por mes. Para añadir o editar una sesión, abre el curso.", loading: "Cargando el calendario…", empty: "Ninguna sesión en este periodo.", upcoming: "Próximas", past: "Pasadas", all: "Todas", scheduled: "Planificada", published: "Publicada", cancelled: "Cancelada", edit: "Gestionar el curso", sessions: "sesiones" },
  });
  const [courses, setCourses] = useState<AdminCourse[] | null>(null);
  const [error, setError] = useState("");
  const [scope, setScope] = useState<Scope>("upcoming");

  useEffect(() => {
    let active = true;
    listAllCourses().then((rows) => { if (active) setCourses(rows); }).catch((cause) => { if (active) { setError(errorText(cause)); setCourses([]); } });
    return () => { active = false; };
  }, []);

  const statusLabel = { scheduled: t.scheduled, published: t.published, cancelled: t.cancelled } as const;
  const entries = useMemo<Entry[]>(() => (courses ?? []).flatMap((course) =>
    course.course_schedules.map((item) => ({ ...item, courseName: course.name, courseId: course.id }))
  ).sort((a, b) => a.start_date.localeCompare(b.start_date)), [courses]);

  const today = new Date().toISOString().slice(0, 10);
  const visible = entries.filter((item) => scope === "all" || (scope === "upcoming" ? item.end_date.slice(0, 10) >= today : item.end_date.slice(0, 10) < today));
  const ordered = scope === "past" ? [...visible].reverse() : visible;

  const monthFormat = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const groups: { key: string; label: string; items: Entry[] }[] = [];
  for (const item of ordered) {
    const key = item.start_date.slice(0, 7);
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) { group = { key, label: monthFormat.format(new Date(key + "-01T00:00:00Z")), items: [] }; groups.push(group); }
    group.items.push(item);
  }

  return (
    <div>
      <h2>{t.title}</h2>
      <p className="muted">{t.intro}</p>
      <Feedback error={error} />
      <div className="row" role="group" aria-label={t.title}>
        {(["upcoming", "past", "all"] as const).map((value) => (
          <button key={value} type="button" className={scope === value ? "btn small primary" : "btn small"} aria-pressed={scope === value} onClick={() => setScope(value)}>{t[value]}</button>
        ))}
      </div>
      {courses === null && <p className="muted" role="status">{t.loading}</p>}
      {courses !== null && visible.length === 0 && !error && <p className="notice">{t.empty}</p>}
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label}>
          <h3 style={{ textTransform: "capitalize" }}>{group.label} <span className="muted small-text">· {group.items.length} {t.sessions}</span></h3>
          <ul className="stack">
            {group.items.map((item) => (
              <li key={item.id} className="panel">
                <div className="row between">
                  <span><strong>{item.courseName}</strong><br /><span className="muted small-text">{dayLabel(item.start_date, locale)} → {dayLabel(item.end_date, locale)}</span></span>
                  <span className="row">
                    <span className={`pill ${item.status === "published" ? "ongoing" : "past"}`}>{statusLabel[item.status]}</span>
                    <Link to="/admin/formations">{t.edit}</Link>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
